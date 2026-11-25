// Tests d'intégration des avis du jeu dans l'Activité (R19) : un niveau passé, un sceau gagné, le
// défi d'une ruche réussi, du miel offert. Scénario : docs/scenarios/refonte.md, « R19 », « Ce qui
// fait revenir, sans insister » ; plan R19, choix 10 et 11, relectures du plan (juridique B1 et J2,
// sécurité S3).
//
// Les avis sont des lignes gardées (`game_notice`), lues comme une source de plus de l'Activité :
// comptés dans la cloche, coupés par le réglage « Ma récolte » (on n'en écrit plus, et la lecture
// les filtre), jamais envoyés par e-mail. L'avis de miel offert se cache dès que l'un a bloqué
// l'autre et part avec le compte de qui l'a offert ; celui d'un défi de ruche disparaît pour qui
// a quitté la ruche.
//
// Les membres : Inès (qui reçoit les avis), Malik (qui lui offre du miel), Zoé et Sam (de sa ruche
// « Famille »). La fausse horloge part d'un lundi, 10 h à Paris.
import { REACTION_KINDS, weekOf } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { instantEmails } from './jobs/instant-emails'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'
import { firstWeekWhere, HOUR, harvestGestures, hiveCodeOn, SECOND } from './testing/harvest-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof harvestGestures>
let hives: ReturnType<typeof hiveGestures>
let ines: TestMember
let malik: TestMember
let zoe: TestMember
let sam: TestMember

const START = new Date('2026-06-15T08:00:00.000Z') // un lundi, 10 h à Paris

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = harvestGestures(act)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.21')
  malik = await signedUpMember(ctx, act, 'Malik', '203.0.113.22')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.23')
  sam = await signedUpMember(ctx, act, 'Sam', '203.0.113.24')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Publie un projet public (50 pollen à son auteur, et le sceau « Premier envol » la 1re fois). */
const publish = async (member: TestMember, title: string) => {
  later()
  return (await act.publish(member.cookie, title, { visibility: 'public' })).id
}

/**
 * Les avis du jeu de l'Activité de ce membre (les autres notifications retirées), sans l'avis
 * d'introduction que tout compte reçoit à sa création : il a son propre test plus bas.
 */
const gameNotices = async (member: TestMember) =>
  (await game.notifications(member.cookie)).filter(
    (item) => item.kind.startsWith('game_') && item.kind !== 'game_intro',
  )

/**
 * Les seuls avis de miel offert : Inès publie pour recevoir le miel, ce qui lui donne aussi le
 * sceau « Premier envol », que ces tests ne regardent pas.
 */
const giftNotices = async (member: TestMember) =>
  (await gameNotices(member)).filter((item) => item.kind === 'game_honey_gift')

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: ReturnType<typeof sql>) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/**
 * Malik gagne les 5 miel d'une semaine butinée (un commentaire sur le projet d'Inès), puis les
 * offre à ce projet. Rend l'identifiant du projet.
 */
const malikOffersHoney = async () => {
  const meteo = await publish(ines, 'Météo')
  later()
  await act.comment(meteo, malik.cookie, 'Super idée.')
  later()
  await game.offerHoney(meteo, malik.cookie)
  later()
  return meteo
}

describe('the introduction notice', () => {
  it('writes the intro notice once when an account is created', async () => {
    // Un compte créé après le déploiement : la migration du rattrapage ne l'a jamais vu.
    const intros = await rows<{ member_id: string }>(
      sql`select member_id from game_notice where kind = 'intro' order by member_id`,
    )

    expect(intros.map((row) => row.member_id).sort()).toEqual(
      [ines.id, malik.id, zoe.id, sam.id].sort(),
    )
  })
})

describe('the notices of the level and of the seals', () => {
  it('tells a level passed and a seal earned in the activity, counted as unread', async () => {
    const before = await game.unread(ines.cookie)

    await publish(ines, 'Météo')
    await publish(ines, 'Jardin')

    // 100 pollen : niveau 2 ; la première publication : le sceau « Premier envol ».
    const notices = await gameNotices(ines)
    expect(notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'game_level', level: 2, isNew: true }),
        expect.objectContaining({ kind: 'game_seal', code: 'first_project', isNew: true }),
      ]),
    )
    expect(notices).toHaveLength(2)
    expect(await game.unread(ines.cookie)).toBe(before + 2)
    // Un avis de jeu ne va qu'au membre concerné.
    expect(await gameNotices(malik)).toEqual([])
  })

  it('writes no notice while harvest notices are off, and hides the earlier ones', async () => {
    await publish(ines, 'Météo')
    expect(await gameNotices(ines)).toHaveLength(1) // témoin : le sceau

    // Coupé : l'avis déjà écrit se cache, et le niveau passé ensuite n'en écrit pas.
    await game.setGame(ines.cookie, { harvestNotices: false })
    await publish(ines, 'Jardin')
    expect(await gameNotices(ines)).toEqual([])

    // Rallumé : l'ancien revient, celui du niveau 2 n'a jamais été écrit.
    await game.setGame(ines.cookie, { harvestNotices: true })
    const back = await gameNotices(ines)
    expect(back.map((notice) => notice.kind)).toEqual(['game_seal'])
    const [rowCount] = await rows<{ count: number }>(
      sql`select count(*)::int as count from game_notice where member_id = ${ines.id} and kind <> 'intro'`,
    )
    expect(rowCount?.count).toBe(1)
  })

  it('never sends an e-mail for a notice of the game', async () => {
    const before = ctx.mailer.sent.length
    await publish(ines, 'Météo')
    await publish(ines, 'Jardin')
    expect(await gameNotices(ines)).toHaveLength(2) // témoin : les avis existent
    later(HOUR)

    await instantEmails(
      {
        db: ctx.db,
        mailer: ctx.mailer,
        storage: ctx.storage,
        appUrl: TEST_APP_URL,
        apiUrl: TEST_API_URL,
        secret: TEST_AUTH_SECRET,
      },
      new Date(),
    )

    expect(ctx.mailer.sent.slice(before).filter((email) => email.to === ines.email)).toEqual([])
  })
})

describe('the notice of a honey gift', () => {
  it('tells the author who offered honey to which project', async () => {
    const meteo = await malikOffersHoney()

    const notices = await giftNotices(ines)
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'game_honey_gift',
        isNew: true,
        actor: expect.objectContaining({ id: malik.id, name: 'Malik' }),
        project: expect.objectContaining({ id: meteo, title: 'Météo' }),
      }),
    ])
    // Qui offre n'a pas d'avis : seul l'auteur est prévenu.
    expect(await gameNotices(malik)).toEqual([])
  })

  it('hides a honey gift notice once the receiver blocks the giver', async () => {
    await malikOffersHoney()
    expect(await giftNotices(ines)).toHaveLength(1) // témoin

    await act.block(malik.id, ines.cookie)

    expect(await giftNotices(ines)).toEqual([])
  })

  it('hides a honey gift notice once either member blocked the other', async () => {
    await malikOffersHoney()
    expect(await giftNotices(ines)).toHaveLength(1) // témoin

    // C'est Malik, qui a offert, qui bloque Inès : la ligne se cache aussi chez elle.
    await act.block(ines.id, malik.cookie)

    expect(await giftNotices(ines)).toEqual([])
  })

  it('removes the honey gift notice when the giver deletes the account', async () => {
    await malikOffersHoney()
    expect(await giftNotices(ines)).toHaveLength(1) // témoin

    await act.deleteAccount(malik.cookie, malik.password)

    expect(await giftNotices(ines)).toEqual([])
  })

  it('drops a honey gift notice when the giver deletes the account', async () => {
    await malikOffersHoney()
    const count = async () =>
      (
        await rows<{ count: number }>(
          sql`select count(*)::int as count from game_notice
              where member_id = ${ines.id} and kind = 'honey_gift'`,
        )
      )[0]?.count
    expect(await count()).toBe(1) // témoin : la ligne gardée

    await act.deleteAccount(malik.cookie, malik.password)

    // La ligne elle-même part (clé étrangère en cascade), pas seulement sa lecture.
    expect(await count()).toBe(0)
  })
})

describe('the notice of a hive challenge', () => {
  /**
   * La ruche « Famille » d'Inès, avec Malik, Zoé et Sam. Puis l'horloge avance jusqu'à la première
   * semaine où son défi est « 5 commentaires entre vous » ou « 10 réactions entre vous » (deux
   * défis faciles à faire entre deux membres), et la page de la ruche, lue, tire ce défi.
   */
  const familleWithChallenge = async () => {
    const famille = await hives.create(ines.cookie, 'Famille')
    for (const member of [malik, zoe, sam]) {
      later()
      await hives.join(famille.id, ines.cookie, member)
    }
    vi.setSystemTime(
      firstWeekWhere(new Date(Date.now() + HOUR), (week) =>
        ['comments_5', 'reactions_10'].includes(hiveCodeOn(famille.id, week) ?? ''),
      ),
    )
    await hives.signInAgain(ines, malik, zoe, sam)
    later()
    // Lue par un membre, la page de la ruche (4 membres) tire le défi de la semaine.
    await hives.page(famille.id, ines.cookie)
    const code = hiveCodeOn(famille.id, weekOf(new Date())) as string
    return { hiveId: famille.id, code }
  }

  /** Inès et Zoé font le défi entre elles, sur leurs projets ; Malik et Sam ne font rien. */
  const inesAndZoeComplete = async (code: string) => {
    const meteo = await publish(ines, 'Météo')
    const potager = await publish(zoe, 'Potager')
    if (code === 'comments_5') {
      for (const n of [1, 2, 3]) {
        later()
        await act.comment(potager, ines.cookie, `Bravo ${n}`)
      }
      for (const n of [1, 2]) {
        later()
        await act.comment(meteo, zoe.cookie, `Merci ${n}`)
      }
    } else {
      for (const kind of REACTION_KINDS) {
        later()
        await act.react(potager, kind, ines.cookie)
        later()
        await act.react(meteo, kind, zoe.cookie)
      }
    }
    later()
  }

  it('tells every member of the hive, with 10 honey for those who took part only', async () => {
    const { hiveId, code } = await familleWithChallenge()
    await inesAndZoeComplete(code)

    const challengeOf = async (member: TestMember) =>
      (await gameNotices(member)).filter((notice) => notice.kind === 'game_hive_challenge')
    for (const [member, honey] of [
      [ines, 10],
      [zoe, 10],
      [malik, 0],
      [sam, 0],
    ] as const) {
      expect(await challengeOf(member), member.email).toEqual([
        expect.objectContaining({
          kind: 'game_hive_challenge',
          code,
          honey,
          hive: expect.objectContaining({ id: hiveId, name: 'Famille' }),
        }),
      ])
    }
  })

  it('hides the notice of a hive challenge from a member who left the hive', async () => {
    const { hiveId, code } = await familleWithChallenge()
    await inesAndZoeComplete(code)
    const challengeOf = async (member: TestMember) =>
      (await gameNotices(member)).filter((notice) => notice.kind === 'game_hive_challenge')
    expect(await challengeOf(sam)).toHaveLength(1) // témoin

    await hives.removeMember(hiveId, sam.cookie, sam.id)

    expect(await challengeOf(sam)).toEqual([])
    expect(await challengeOf(malik)).toHaveLength(1) // les autres la gardent
  })
})
