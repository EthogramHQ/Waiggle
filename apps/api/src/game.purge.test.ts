// Tests de la purge de nuit pour le jeu (R19) : ce qui s'efface, et quand. Plan R19, relecture
// juridique du plan, J2 et J3 : les avis du jeu à 90 jours ; les défis (perso et de ruche) d'une
// semaine passée, une fois la semaine suivante finie, sans toucher au miel qu'ils ont rapporté ;
// le lien avec l'autre membre d'un geste (`pollen_entry.counterpart_id`) remis à nul au même
// moment, la ligne du geste restant (elle empêche de le compter deux fois).
//
// La purge est une fonction ordinaire, nightlyPurge(db, now, storage) : l'ordonnanceur l'appelle
// chaque nuit, les tests l'appellent à l'heure qu'ils choisissent, puis lisent les tables en SQL
// brut (les colonnes nommées au plan R19, choix 1, 7 et 10).
//
// Les membres : Inès, Malik et Zoé. La fausse horloge part d'un lundi, 10 h à Paris (semaine W).
import { weekOf } from '@ruche/contracts'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nightlyPurge } from './jobs/nightly-purge'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, firstWeekWhere, harvestGestures, offeredOn, SECOND } from './testing/harvest-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof harvestGestures>
let hives: ReturnType<typeof hiveGestures>
let ines: TestMember
let malik: TestMember
let zoe: TestMember

const START = new Date('2026-06-15T08:00:00.000Z') // un lundi, 10 h à Paris

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = harvestGestures(act)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.31')
  malik = await signedUpMember(ctx, act, 'Malik', '203.0.113.32')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.33')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Passe la purge de nuit à l'heure de la fausse horloge. */
const purge = () => nightlyPurge(ctx.db, new Date(), ctx.storage)

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows
const countOf = async (query: SQL) => (await rows<{ count: number }>(query))[0]?.count

const publish = async (member: TestMember, title: string) => {
  later()
  return (await act.publish(member.cookie, title, { visibility: 'public' })).id
}

/** Reconnecte ces membres : une session dure 7 jours. */
const signInAgain = async (...members: TestMember[]) => {
  for (const member of members) member.cookie = await act.signInAgain(member)
}

describe('the nightly purge of the game', () => {
  it('purges game notices older than 90 days at night', async () => {
    // Jour 0 : le sceau « Premier envol ». Jour 60 : le niveau 2.
    await publish(ines, 'Météo')
    later(60 * DAY)
    await signInAgain(ines)
    await publish(ines, 'Jardin')
    // Sans l'avis d'introduction (R19 : tout compte le reçoit à sa création) : ce test suit les
    // avis du sceau et du niveau.
    const notices = () =>
      rows<{ kind: string }>(
        sql`select kind from game_notice where member_id = ${ines.id} and kind <> 'intro' order by created_at`,
      )
    expect((await notices()).map((row) => row.kind)).toEqual(['seal', 'level'])

    // Jour 89 : rien ne part encore.
    vi.setSystemTime(START.getTime() + 89 * DAY)
    await purge()
    expect(await notices()).toHaveLength(2)

    // Jour 91 : l'avis du sceau a plus de 90 jours, celui du niveau en a 31.
    vi.setSystemTime(START.getTime() + 91 * DAY)
    await purge()
    expect((await notices()).map((row) => row.kind)).toEqual(['level'])
  })

  it('purges challenges of past weeks at night and keeps their honey', async () => {
    // Une semaine où « Publie une mise à jour » est proposé à Inès.
    vi.setSystemTime(firstWeekWhere(START, (week) => offeredOn(ines.id, week).includes('update')))
    await signInAgain(ines, malik, zoe)
    const week = weekOf(new Date())
    const monday = new Date(`${week}T09:00:00.000Z`).getTime()

    // Son défi : tiré à la lecture, choisi, réussi (5 miel de la semaine butinée, 10 du défi).
    const meteo = await publish(ines, 'Météo')
    await game.harvest(ines.cookie)
    await game.setGame(ines.cookie, { personalChallenge: 'update' })
    later()
    await game.postUpdate(meteo, ines.cookie)
    const done = await game.harvest(ines.cookie)
    expect(done.personalChallenge).toEqual({ state: 'done', code: 'update' })
    expect(done.honey).toBe(15)

    // Le défi de sa ruche de 3 membres, tiré à la lecture de la page.
    const famille = await hives.create(ines.cookie, 'Famille')
    for (const member of [malik, zoe]) {
      later()
      await hives.join(famille.id, ines.cookie, member)
    }
    await hives.page(famille.id, ines.cookie)

    const personal = () =>
      countOf(sql`select count(*)::int as count from personal_challenge
                  where member_id = ${ines.id} and week = ${week}::date`)
    const ofHive = () =>
      countOf(sql`select count(*)::int as count from hive_challenge
                  where hive_id = ${famille.id} and week = ${week}::date`)
    expect([await personal(), await ofHive()]).toEqual([1, 1])

    // Le mercredi de la semaine suivante : rien ne part encore.
    vi.setSystemTime(monday + 9 * DAY)
    await purge()
    expect([await personal(), await ofHive()]).toEqual([1, 1])

    // Le mardi d'après : la semaine suivante est finie, les deux défis partent.
    vi.setSystemTime(monday + 15 * DAY)
    await purge()
    expect([await personal(), await ofHive()]).toEqual([0, 0])

    // Le miel reste : 15, comme avant la purge.
    await signInAgain(ines)
    expect((await game.harvest(ines.cookie)).honey).toBe(15)
  })

  it('clears the counterpart of ledger entries once the following week is over', async () => {
    // Semaine W : Inès réagit au projet de Malik. Deux entrées : sa réaction (l'autre : Malik) et
    // la réaction reçue par Malik (l'autre : Inès).
    const recettes = await publish(malik, 'Recettes')
    later()
    await act.react(recettes, 'bravo', ines.cookie)
    const counterparts = (gesture: string) =>
      rows<{ member_id: string; counterpart_id: string | null; week: string }>(
        sql`select member_id, counterpart_id, to_char(week, 'YYYY-MM-DD') as week
            from pollen_entry where gesture = ${gesture} order by created_at`,
      )
    expect(await counterparts('reaction')).toEqual([
      { member_id: ines.id, counterpart_id: malik.id, week: weekOf(START) },
    ])
    expect(await counterparts('receive_reaction')).toEqual([
      { member_id: malik.id, counterpart_id: ines.id, week: weekOf(START) },
    ])

    // Semaine W+1 : une autre réaction, témoin de ce qui doit rester.
    vi.setSystemTime(START.getTime() + 9 * DAY)
    await signInAgain(ines)
    await act.react(recettes, 'useful', ines.cookie)
    await purge()
    expect((await counterparts('reaction')).map((row) => row.counterpart_id)).toEqual([
      malik.id,
      malik.id,
    ])

    // Le mardi de W+2 : les entrées de W perdent l'autre membre, pas leur ligne ; celles de W+1
    // le gardent jusqu'à la fin de W+2.
    vi.setSystemTime(START.getTime() + 15 * DAY)
    await purge()
    expect((await counterparts('reaction')).map((row) => row.counterpart_id)).toEqual([
      null,
      malik.id,
    ])
    expect((await counterparts('receive_reaction')).map((row) => row.counterpart_id)).toEqual([
      null,
      ines.id,
    ])
  })
})
