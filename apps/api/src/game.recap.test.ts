// Tests du récap du dimanche pour le jeu (R19) : le bloc « Ta semaine » (le pollen de la semaine,
// « défi réussi », « Nouveaux défis lundi », « Voir ma récolte »), le défi de chaque ruche dans
// « Dans tes ruches », la ligne « Nouveau : ta récolte » une seule fois, et le réglage « Ma
// récolte » qui coupe tout cela. Scénario : docs/scenarios/refonte.md, « R19 », « Ce qui fait
// revenir, sans insister » ; plan R19, choix 16, relecture juridique du plan (B2, J1).
//
// Une semaine qui a rapporté du pollen suffit à envoyer le récap (Q8, « inciter un peu ») ; les
// autres conditions d'envoi restent (compte vérifié, récap activé, 6 jours entre deux récaps, moins
// de 3 récaps sans visite). Jamais « 0 pollen ».
//
// Le récap est une fonction ordinaire, weeklyRecap(deps, now) (jobs/weekly-recap.ts) : les tests
// l'appellent le dimanche à 10 h, heure de Paris, et lisent la fausse boîte d'envoi.
//
// Les membres : Inès (qui reçoit le récap), Malik, Zoé et Sam. La fausse horloge part d'un lundi.
import { appName } from '@ruche/brand'
import { weekOf } from '@ruche/contracts'
import { fill, resources } from '@ruche/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Email } from './email/templates'
import { weeklyRecap } from './jobs/weekly-recap'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'
import {
  DAY,
  firstWeekWhere,
  HOUR,
  harvestGestures,
  hiveCodeOn,
  offeredOn,
  SECOND,
  WEEK,
} from './testing/harvest-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof harvestGestures>
let hives: ReturnType<typeof hiveGestures>
let ines: TestMember
let malik: TestMember
let zoe: TestMember
let sam: TestMember

const START = new Date('2026-06-15T08:00:00.000Z') // un lundi, 10 h à Paris (semaine W)
const SUNDAY = new Date('2026-06-21T08:00:00.000Z') // le dimanche de W, 10 h à Paris

const fr = resources.fr.translation.email
const g = resources.fr.translation.game.recap
const gEn = resources.en.translation.game.recap

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = harvestGestures(act)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.41')
  malik = await signedUpMember(ctx, act, 'Malik', '203.0.113.42')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.43')
  sam = await signedUpMember(ctx, act, 'Sam', '203.0.113.44')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Lance le récap à l'heure de la fausse horloge (comme pg-boss le dimanche à 10 h). */
const runRecap = () =>
  weeklyRecap(
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

const recapSubjects = [fill(fr.recap.subject), fill(resources.en.translation.email.recap.subject)]
const recapsTo = (member: TestMember) =>
  ctx.mailer.sent.filter(
    (email) => email.to === member.email && recapSubjects.includes(email.subject),
  )
const onlyRecapTo = (member: TestMember) => {
  const recaps = recapsTo(member)
  expect(recaps).toHaveLength(1)
  return recaps[0] as Email
}
const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

/** « +10 pollen. », comme l'écrit le récap. */
const pollenLine = (amount: number) => fill(g.pollen, { amount: String(amount) })

/** Reconnecte ces membres : une session dure 7 jours. */
const signInAgain = async (...members: TestMember[]) => {
  for (const member of members) member.cookie = await act.signInAgain(member)
}

const publish = async (member: TestMember, title: string) => {
  later()
  return (await act.publish(member.cookie, title, { visibility: 'public' })).id
}

/** Malik publie « Recettes », Inès le commente : 10 pollen pour elle, un geste qui aide. */
const inesComments = async (text = 'Super idée.') => {
  const recettes = await publish(malik, 'Recettes')
  later()
  await act.comment(recettes, ines.cookie, text)
  return recettes
}

/**
 * Le cadre de tout récap (comme `frameOf` de weekly-recap.test.ts) et les textes fixes du bloc :
 * le test « rien d'autre » les retire, puis ce qu'il attend ; il ne doit rester que de la
 * ponctuation.
 */
const frameOf = (name: string) => [
  fill(fr.recap.heading, { name }),
  fill(fr.recap.intro),
  fill(fr.recap.first),
  fill(fr.recap.button),
  fill(fr.recap.reason),
  fr.recap.unsubscribe,
  fr.changePreferences,
  fr.manage,
  fill(fr.footer),
  fill(fr.privacy, { url: '' }),
  fill(fr.greeting, { name }),
  appName,
  fill(g.news),
  fill(g.reason),
]
const expectOnly = (text: string, expected: string[]) => {
  let rest = text.replace(/https?:\/\/\S+/g, ' ')
  for (const part of [...expected].sort((a, b) => b.length - a.length)) {
    rest = rest.replaceAll(part, ' ')
  }
  expect(rest).toMatch(/^[\s\p{P}\p{S}]*$/u)
}

describe('« Ta semaine » in the recap', () => {
  it('sends a recap for a week of pollen alone, with « Ta semaine », the new challenges and a link to the harvest', async () => {
    await inesComments()
    vi.setSystemTime(SUNDAY)

    await runRecap()

    const recap = onlyRecapTo(ines)
    for (const part of [recap.text, recap.html]) {
      expect(part).toContain(fill(g.lead))
      expect(part).toContain(pollenLine(10))
      expect(part).toContain(fill(g.newChallenges))
      expect(part).toContain(fill(g.button))
    }
    // « Voir ma récolte » mène à la page de l'appli, une adresse fabriquée par le serveur.
    expect(hrefsOf(recap.html).some((href) => href?.startsWith(`${TEST_APP_URL}/harvest`))).toBe(
      true,
    )
    // Rien d'autre que le bloc (relecture juridique R1 du récap).
    expectOnly(recap.text, [
      ...frameOf('Inès'),
      fill(g.lead),
      pollenLine(10),
      fill(g.newChallenges),
      fill(g.button),
    ])
  })

  it('counts the pollen of the week of the recap only', async () => {
    const recettes = await inesComments()
    vi.setSystemTime(SUNDAY)
    await runRecap()
    expect(onlyRecapTo(ines).text).toContain(pollenLine(10))

    // La semaine suivante : deux réactions (4 pollen), rien de la semaine d'avant.
    vi.setSystemTime(START.getTime() + WEEK + 2 * DAY)
    await signInAgain(ines)
    await act.react(recettes, 'bravo', ines.cookie)
    later()
    await act.react(recettes, 'useful', ines.cookie)
    vi.setSystemTime(SUNDAY.getTime() + WEEK)
    await runRecap()

    const recaps = recapsTo(ines)
    expect(recaps).toHaveLength(2)
    expect(recaps[1]?.text).toContain(pollenLine(4))
    expect(recaps[1]?.text).not.toContain(pollenLine(14))
  })

  it('says « défi réussi » when the personal challenge of the week is done', async () => {
    // Une semaine où « Publie une mise à jour » est proposé à Inès.
    vi.setSystemTime(firstWeekWhere(START, (week) => offeredOn(ines.id, week).includes('update')))
    await signInAgain(ines)
    const monday = new Date(`${weekOf(new Date())}T09:00:00.000Z`).getTime()
    const meteo = await publish(ines, 'Météo')
    await game.harvest(ines.cookie)
    await game.setGame(ines.cookie, { personalChallenge: 'update' })
    later()
    await game.postUpdate(meteo, ines.cookie)
    vi.setSystemTime(monday + 6 * DAY)

    await runRecap()

    // Publier (50), la mise à jour (20), le défi réussi (20).
    const recap = onlyRecapTo(ines)
    expect(recap.text).toContain(fill(g.pollenDone, { amount: '90' }))
    expect(recap.text).not.toContain(pollenLine(90))
  })

  it('writes « 0 pollen » nowhere, and no « Ta semaine » for a week without pollen', async () => {
    // Semaine W : Inès suit Zoé (3 pollen), et reçoit son récap.
    later()
    await act.followMember(zoe.id, ines.cookie)
    vi.setSystemTime(SUNDAY)
    await runRecap()
    expect(onlyRecapTo(ines).text).toContain(pollenLine(3))

    // Semaine W+1 : rien gagné, mais un nouveau projet de Zoé.
    vi.setSystemTime(START.getTime() + WEEK + DAY)
    await signInAgain(ines, zoe)
    await publish(zoe, 'Potager')
    vi.setSystemTime(SUNDAY.getTime() + WEEK)
    await runRecap()

    const second = recapsTo(ines)[1] as Email
    expect(second.text).toContain('Potager') // témoin : le récap est parti
    for (const part of [second.text, second.html]) {
      expect(part).not.toContain(fill(g.lead))
      expect(part).not.toContain(pollenLine(0))
      expect(part).not.toMatch(/\b0\s?pollen/)
    }
  })

  it('tells « Nouveau : ta récolte » once, in the first recap with « Ta semaine »', async () => {
    const recettes = await inesComments()
    vi.setSystemTime(SUNDAY)
    await runRecap()

    vi.setSystemTime(START.getTime() + WEEK + DAY)
    await signInAgain(ines)
    await act.comment(recettes, ines.cookie, 'Et la suite ?')
    vi.setSystemTime(SUNDAY.getTime() + WEEK)
    await runRecap()

    const recaps = recapsTo(ines)
    expect(recaps).toHaveLength(2)
    expect(recaps.map((recap) => recap.text.includes(fill(g.news)))).toEqual([true, false])
    expect(recaps.map((recap) => recap.text.includes(fill(g.lead)))).toEqual([true, true])
  })

  it('writes « Ta semaine » in the language of the member', async () => {
    await act.updateProfile(ines.cookie, { language: 'en' })
    await inesComments()
    vi.setSystemTime(SUNDAY)

    await runRecap()

    const recap = onlyRecapTo(ines)
    expect(recap.text).toContain(fill(gEn.lead))
    expect(recap.text).toContain(fill(gEn.pollen, { amount: '10' }))
    expect(recap.text).toContain(fill(gEn.newChallenges))
    expect(recap.text).not.toContain(fill(g.lead))
  })
})

describe('the hive challenges in the recap', () => {
  it('tells the progress of the hive challenge in « Dans tes ruches »', async () => {
    // La ruche « Famille » (4 membres), puis une semaine où son défi se fait en commentaires ou en
    // réactions ; la page lue tire le défi.
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
    await signInAgain(ines, zoe)
    const week = weekOf(new Date())
    const code = hiveCodeOn(famille.id, week) as 'comments_5' | 'reactions_10'
    await hives.page(famille.id, ines.cookie)
    // Un geste entre deux membres : 1 sur 5, ou 1 sur 10.
    const potager = await publish(zoe, 'Potager')
    later()
    if (code === 'comments_5') await act.comment(potager, ines.cookie, 'Bravo !')
    else await act.react(potager, 'bravo', ines.cookie)
    vi.setSystemTime(new Date(`${week}T09:00:00.000Z`).getTime() + 6 * DAY)

    await runRecap()

    const recap = onlyRecapTo(ines)
    const line = fill(g.hive, {
      challenge: resources.fr.translation.game.challenges.hive[code],
      progress: '1',
      target: code === 'comments_5' ? '5' : '10',
    })
    const hivesAt = recap.text.indexOf(fr.recap.hivesTitle)
    expect(hivesAt).toBeGreaterThanOrEqual(0)
    expect(recap.text.indexOf(line)).toBeGreaterThan(hivesAt)
    expect(recap.html).toContain(line)
  })
})

describe('the harvest notices setting and the recap', () => {
  it('sends no recap for pollen alone when harvest notices are off', async () => {
    await game.setGame(ines.cookie, { harvestNotices: false })
    await inesComments()
    vi.setSystemTime(SUNDAY)

    await runRecap()

    expect(recapsTo(ines)).toEqual([])
    // Témoin : Malik, qui a reçu le commentaire, a son récap.
    expect(onlyRecapTo(malik).text).toContain('Recettes')
  })

  it('leaves « Ta semaine » out of a recap sent for other news when harvest notices are off', async () => {
    await game.setGame(ines.cookie, { harvestNotices: false })
    const meteo = await publish(ines, 'Météo')
    later()
    await act.comment(meteo, malik.cookie, 'Super idée.')
    vi.setSystemTime(SUNDAY)

    await runRecap()

    const recap = onlyRecapTo(ines)
    expect(recap.text).toContain('Météo') // témoin : « Tes projets »
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain(fill(g.lead))
      expect(part).not.toContain(fill(g.newChallenges))
      expect(part).not.toContain(fill(g.button))
      expect(part).not.toContain(fill(g.news))
    }
    // Témoin : Malik, aux réglages par défaut, a le bloc (son commentaire, 10 pollen).
    expect(onlyRecapTo(malik).text).toContain(fill(g.lead))
  })
})
