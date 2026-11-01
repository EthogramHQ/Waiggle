// Tests du récap de la semaine (tranche 6c). Scénario : docs/scenarios/phase-1.md, « Précisions
// (tranche 6c) », « Le récap » ; règles détaillées : plan 6c, « Les tâches », et les relectures du
// plan (sécurité S-B1, S-B2 ; juridique R1, R3, R4, R5).
//
// Le récap est une fonction ordinaire, weeklyRecap({ db, mailer, appUrl, apiUrl, secret }, now) :
// l'ordonnanceur (pg-boss) l'appelle le lundi à 9 h, les tests l'appellent eux-mêmes, à l'heure
// qu'ils choisissent, et lisent la fausse boîte d'envoi (ctx.mailer.sent). Les gestes des membres
// passent par l'API, comme dans l'appli.
//
// Quatre membres : Inès (qui reçoit le récap), Malik, Zoé et Sam (qui commentent, répondent,
// mentionnent, réagissent et suivent). La fausse horloge part d'un lundi fixe, loin d'aujourd'hui.
import { appName } from '@ruche/brand'
import { NotificationPage } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mailer } from '../email/mailer'
import type { Email } from '../email/templates'
import { createUnsubscribeToken, readUnsubscribeToken } from '../email/unsubscribe-token'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { mentionEmails } from './mention-emails'
import { weeklyRecap } from './weekly-recap'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let sam: string
let inesId: string
let zoeId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const START = new Date('2026-06-15T08:00:00.000Z') // un lundi, 10 h à Paris

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' }
const samAccount = { name: 'Sam', email: 'sam@example.com', password: 'sam-long-password' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  sam = await ctx.verifiedMember(samAccount)
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Ce que reçoit la tâche : la base, la boîte d'envoi, les adresses des liens, la clé des jetons. */
const depsWith = (mailer: Mailer = ctx.mailer) => ({
  db: ctx.db,
  mailer,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})

/** Lance le récap à l'heure de la fausse horloge (comme pg-boss le lundi à 9 h). */
const runRecap = (mailer?: Mailer) => weeklyRecap(depsWith(mailer), new Date())

const recapSubjects = [fill(fr.recap.subject), fill(en.recap.subject)]
/** Les récaps reçus par une adresse, dans l'ordre d'envoi (sans les e-mails de compte). */
const recapsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && recapSubjects.includes(email.subject))

/** Le seul récap reçu par une adresse. */
const onlyRecapTo = (address: string) => {
  const recaps = recapsTo(address)
  expect(recaps).toHaveLength(1)
  return recaps[0] as Email
}

type LineKind = 'comment' | 'reply' | 'mention'
/** Une ligne du récap, comme l'écrit le modèle : « Malik (@malik) a commenté « Météo » ». */
const line = (
  kind: LineKind,
  title: string,
  name = 'Malik',
  handle = 'malik',
  t: { recap: Record<LineKind, string> } = fr,
) => fill(t.recap[kind], { name, handle, title })

/** Le nombre de fois où `part` apparaît dans `text`. */
const occurrences = (text: string, part: string) => text.split(part).length - 1

/** Toutes les adresses des liens (href) d'un e-mail HTML. */
const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Espionne les journaux de l'API, sans rien afficher. */
const spyOnLogs = () =>
  (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )

describe('the content of the recap', () => {
  it('lists comments, replies and mentions, five at most, then « and N more », and the counts', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    const own = await act.comment(meteo.id, ines, 'Vos retours sont les bienvenus.')
    later()
    const jardin = await act.publish(sam, 'Jardin')
    const bodies = [
      'Super idée, je teste ce soir.',
      'Et pour la grêle ?',
      'Ça marche à Lyon aussi.',
      'Moi aussi je veux des retours !',
      'Qu’en dit @ines_morel ?',
      '@ines_morel regarde ça.',
      'Très joli.',
    ]
    later()
    await act.comment(meteo.id, malik, bodies[0] as string)
    later()
    await act.comment(meteo.id, malik, bodies[1] as string)
    later()
    await act.comment(meteo.id, malik, bodies[2] as string)
    later()
    await act.comment(meteo.id, zoe, bodies[3] as string, own.id)
    later()
    await act.comment(jardin.id, sam, bodies[4] as string)
    later()
    await act.comment(jardin.id, malik, bodies[5] as string)
    later()
    await act.comment(meteo.id, zoe, bodies[6] as string)
    for (const [cookie, kind] of [
      [malik, 'bravo'],
      [zoe, 'useful'],
      [sam, 'funny'],
    ] as const) {
      later()
      await act.react(meteo.id, kind, cookie)
    }
    later()
    await act.followMember(inesId, malik)
    later()
    await act.followMember(inesId, zoe)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.subject).toBe(fill(fr.recap.subject))
    expect(recap.text).toContain(fill(fr.recap.intro))
    // Sept éléments : cinq lignes, puis « Et 2 autres ».
    const lines = [
      line('comment', 'Météo'),
      line('reply', 'Météo', 'Zoé', 'zoe'),
      line('mention', 'Jardin', 'Sam', 'sam'),
      line('mention', 'Jardin'),
      line('comment', 'Météo', 'Zoé', 'zoe'),
    ]
    const shown = lines.reduce((sum, expected) => sum + occurrences(recap.text, expected), 0)
    expect(shown).toBe(5)
    expect(recap.text).toContain(fill(fr.recap.more_other, { count: '2' }))
    // Puis les nombres : trois réactions, deux nouveaux abonnements, sans aucun nom.
    expect(recap.text).toContain(fill(fr.recap.reactions_other, { count: '3' }))
    expect(recap.text).toContain(fill(fr.recap.follows_other, { count: '2' }))
    // Le bouton mène à ses notifications, dans l'appli.
    expect(recap.text).toContain(fr.recap.button)
    expect(recap.text).toContain(`${TEST_APP_URL}/notifications`)
    expect(hrefsOf(recap.html)).toContain(`${TEST_APP_URL}/notifications`)
    // Pas d'extrait dans le récap (relecture juridique R5) : le texte des autres n'y est jamais.
    for (const body of bodies) {
      expect(recap.text).not.toContain(body.slice(0, 12))
      expect(recap.html).not.toContain(body.slice(0, 12))
    }
  })

  it('contains nothing but the notifications of the member: no news, no suggestion', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    later()
    await act.react(meteo.id, 'bravo', malik)
    later()
    await act.followMember(inesId, malik)
    later(HOUR)

    await runRecap()

    // On retire du texte tout ce qui est prévu (les textes du récap, du pied, la salutation, les
    // liens) : il ne doit rester que de la ponctuation. Un mot de plus serait un ajout, par exemple
    // promotionnel, que le récap ne doit pas contenir (relecture juridique R1).
    const recap = onlyRecapTo(inesAccount.email)
    const expected = [
      fill(fr.recap.intro),
      fill(fr.recap.first),
      line('comment', 'Météo'),
      fr.recap.alsoLabel,
      fill(fr.recap.reactions_one, { count: '1' }),
      fill(fr.recap.follows_one, { count: '1' }),
      fill(fr.recap.button),
      fill(fr.recap.reason),
      fr.recap.unsubscribe,
      fr.manage,
      fill(fr.footer),
      fill(fr.greeting, { name: inesAccount.name }),
      appName,
    ].sort((a, b) => b.length - a.length) // les plus longs d'abord : l'un peut contenir l'autre
    let rest = recap.text.replace(/https?:\/\/\S+/g, ' ')
    for (const part of expected) rest = rest.replaceAll(part, ' ')

    expect(rest).toMatch(/^[\s\p{P}\p{S}]*$/u)
  })

  it('sends nothing when there is nothing new', async () => {
    await act.publish(ines, 'Météo')
    const recettes = await act.publish(malik, 'Recettes')
    later()
    // Témoin : Malik, lui, a du nouveau.
    await act.comment(recettes.id, zoe, 'Miam.')
    later(HOUR)

    await runRecap()

    expect(recapsTo(inesAccount.email)).toEqual([])
    expect(recapsTo(malikAccount.email)).toHaveLength(1)
  })

  it('sends nothing for what the member already saw in the app, and only what came after', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const jardin = await act.publish(sam, 'Jardin')
    later()
    await act.comment(meteo.id, malik, 'Vu avant.')
    later()
    await act.comment(jardin.id, malik, 'Vu par Sam.')
    later()
    await act.openNotifications(ines)
    await act.openNotifications(sam)
    later()
    await act.comment(meteo.id, zoe, 'Arrivé après.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    expect(recap.text).not.toContain(line('comment', 'Météo'))
    // Sam a tout vu : rien ne part.
    expect(recapsTo(samAccount.email)).toEqual([])
  })

  it('leaves out what is older than a week', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Il y a longtemps.')
    later(WEEK + HOUR)
    const zoeAgain = await act.signInAgain(zoeAccount)
    await act.comment(meteo.id, zoeAgain, 'Cette semaine.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    expect(recap.text).not.toContain(line('comment', 'Météo'))
  })

  it('leaves out a private project, a hidden comment and a deleted one', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const jardin = await act.publish(sam, 'Jardin')
    const recettes = await act.publish(zoe, 'Recettes')
    const velo = await act.publish(zoe, 'Vélo')
    later()
    await act.comment(jardin.id, malik, '@ines_morel regarde.')
    later()
    await act.setVisibility(jardin.id, sam, 'private')
    later()
    const hidden = await act.comment(recettes.id, malik, '@ines_morel regarde.')
    later()
    await act.hide(recettes.id, hidden.id, zoe)
    later()
    const deleted = await act.comment(meteo.id, malik, 'Bientôt effacé.')
    later()
    await act.deleteComment(meteo.id, deleted.id, malik)
    later()
    // Témoin : la mention sur Vélo reste.
    await act.comment(velo.id, malik, '@ines_morel regarde.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(line('mention', 'Vélo'))
    for (const title of ['Jardin', 'Recettes', 'Météo']) {
      expect(recap.text).not.toContain(title)
      expect(recap.html).not.toContain(title)
    }
  })

  it('never repeats what the mention e-mail already sent', async () => {
    await act.setPreferences(ines, { mentionEmails: true })
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Et @ines_morel, la neige ?')
    later(16 * MINUTE)
    await mentionEmails(depsWith(), new Date())
    expect(ctx.mailer.sent.filter((email) => email.to === inesAccount.email).length).toBe(2)
    later(MINUTE)
    await act.comment(meteo.id, zoe, 'Joli projet.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    expect(recap.text).not.toContain(line('mention', 'Météo'))
  })

  it('is written in the language of the member', async () => {
    await act.updateProfile(ines, { language: 'en' })
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Nice.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.subject).toBe(fill(en.recap.subject))
    expect(recap.text).toContain(fill(en.recap.intro))
    expect(recap.text).toContain(line('comment', 'Météo', 'Malik', 'malik', en))
    expect(recap.text).toContain(en.recap.unsubscribe)
    expect(recap.html).toContain('<html lang="en"')
  })
})

describe('the links of the recap', () => {
  const recapWithAComment = async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    later(HOUR)
    await runRecap()
    return onlyRecapTo(inesAccount.email)
  }

  it('carries the one-click unsubscribe headers, whose link turns off the recap only', async () => {
    await act.setPreferences(ines, { mentionEmails: true })

    const recap = await recapWithAComment()

    expect(recap.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const header = recap.headers?.['List-Unsubscribe'] ?? ''
    expect(header).toMatch(/^<.+>$/)
    const url = new URL(header.slice(1, -1))
    expect(url.origin + url.pathname).toBe(`${TEST_API_URL}/v1/email/unsubscribe`)
    const token = url.searchParams.get('token') ?? ''
    expect(readUnsubscribeToken(TEST_AUTH_SECRET, token)).toEqual({
      userId: inesId,
      kind: 'recap',
    })
    // Le pied de l'e-mail porte le même lien signé, et le lien vers les réglages.
    expect(recap.text).toContain(token)
    expect(recap.text).toContain(fr.recap.unsubscribe)
    // R2 (jur-B5) : « Gérer mes e-mails » mène à la rubrique Notifications des réglages.
    expect(recap.text).toContain(`${TEST_APP_URL}/settings/notifications`)

    // Le bouton « Se désabonner » de la messagerie : un POST sans cookie ni Origin.
    const res = await ctx.app.request(`${url.pathname}${url.search}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })
    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: true })
  })

  it('has only links to the app or the API, no image, and the language of the page', async () => {
    const recap = await recapWithAComment()

    const hrefs = hrefsOf(recap.html)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(
        href?.startsWith(`${TEST_APP_URL}/`) || href?.startsWith(`${TEST_API_URL}/`),
        href,
      ).toBe(true)
    }
    expect(recap.html).not.toMatch(/<img/i)
    expect(recap.html).toContain('<html lang="fr"')
  })

  it('shows no address written by a member: in a name or a title, it becomes « [lien] »', async () => {
    await act.updateProfile(malik, { name: 'support.example.com' })
    const meteo = await act.publish(ines, 'Météo sur www.evil.example')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    for (const part of [recap.subject, recap.text, recap.html]) {
      expect(part).not.toContain('support.example.com')
      expect(part).not.toContain('evil.example')
    }
    expect(recap.text).toContain('[lien]')
    // Le nom est suivi du pseudo, comme dans l'appli : on sait qui a écrit.
    expect(recap.text).toContain('(@malik)')
  })

  it('escapes the HTML hidden in a name', async () => {
    await act.updateProfile(malik, { name: '<b onclick=alert(1)>Malik</b>' })
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.html).not.toContain('<b onclick')
    expect(recap.html).toContain('&lt;b onclick')
  })
})

describe('the rhythm of the recap', () => {
  it('waits 6 days between two recaps, then sends only what came after the first', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Premier.')
    later(HOUR)
    await runRecap()
    const firstAt = Date.now()
    later(HOUR)
    await act.comment(meteo.id, zoe, 'Second.')

    vi.setSystemTime(firstAt + 6 * DAY - MINUTE)
    await runRecap()
    expect(recapsTo(inesAccount.email)).toHaveLength(1)

    vi.setSystemTime(firstAt + 6 * DAY + MINUTE)
    await runRecap()
    const recaps = recapsTo(inesAccount.email)
    expect(recaps).toHaveLength(2)
    expect(recaps[1]?.text).toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    expect(recaps[1]?.text).not.toContain(line('comment', 'Météo'))
  })

  // Ajouté avec les suites de la relecture de sécurité de e414e88 (A5) : un commentaire écrit
  // pendant le passage du récap (après son `now`, avant la lecture du membre) partait dans ce récap,
  // puis revenait dans le suivant, puisqu'il est daté après la date notée.
  it('sends a comment written while the recap runs once, in the next recap', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Premier.')
    later(HOUR)
    const now = new Date()
    later() // now + 1 s
    await act.comment(meteo.id, zoe, 'Second.')

    await weeklyRecap(depsWith(), now)
    const first = onlyRecapTo(inesAccount.email)
    expect(first.text).toContain(line('comment', 'Météo'))
    expect(first.text).not.toContain(line('comment', 'Météo', 'Zoé', 'zoe'))

    vi.setSystemTime(now.getTime() + 6 * DAY + MINUTE)
    await runRecap()
    const recaps = recapsTo(inesAccount.email)
    expect(recaps).toHaveLength(2)
    expect(recaps[1]?.text).toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    expect(recaps[1]?.text).not.toContain(line('comment', 'Météo'))
  })

  it('explains the first recap, once', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Premier.')
    later(HOUR)
    await runRecap()
    later(WEEK)
    const malikAgain = await act.signInAgain(malikAccount)
    await act.comment(meteo.id, malikAgain, 'Second.')
    later(HOUR)

    await runRecap()

    const recaps = recapsTo(inesAccount.email)
    expect(recaps).toHaveLength(2)
    expect(recaps[0]?.text).toContain(fill(fr.recap.first))
    expect(recaps[1]?.text).not.toContain(fill(fr.recap.first))
  })

  it('stops after 3 recaps without a visit, says it in the third, and starts again after a visit', async () => {
    // Inès publie au début (sa session sert) : le premier récap suit une visite. Puis elle ne
    // revient plus ; Malik commente chaque semaine, et le récap part chaque lundi.
    const meteo = await act.publish(ines, 'Météo')
    const week = async (n: number) => {
      vi.setSystemTime(START.getTime() + n * WEEK - HOUR)
      const malikAgain = await act.signInAgain(malikAccount)
      await act.comment(meteo.id, malikAgain, `Semaine ${n}.`)
      vi.setSystemTime(START.getTime() + n * WEEK)
      await runRecap()
      return recapsTo(inesAccount.email)
    }
    const last = fill(fr.recap.last)

    expect(await week(1)).toHaveLength(1) // après une visite
    expect(await week(2)).toHaveLength(2) // 1er sans visite
    expect(await week(3)).toHaveLength(3) // 2e sans visite
    const recaps = await week(4) // 3e sans visite : il le dit
    expect(recaps).toHaveLength(4)
    expect(recaps.map((recap) => recap.text.includes(last))).toEqual([false, false, false, true])
    // Le suivant ne part pas.
    expect(await week(5)).toHaveLength(4)

    // Inès revient (elle se connecte) : le récap reprend, sans la phrase de la fin.
    vi.setSystemTime(START.getTime() + 5 * WEEK + DAY)
    await act.signInAgain(inesAccount)
    const after = await week(6)
    expect(after).toHaveLength(5)
    expect(after[4]?.text).not.toContain(last)
  })
})

describe('who receives the recap', () => {
  /** Malik commente le projet d'Inès et celui de Zoé : toutes deux ont du nouveau. */
  const activityForInesAndZoe = async () => {
    const meteo = await act.publish(ines, 'Météo')
    const velo = await act.publish(zoe, 'Vélo')
    later()
    await act.comment(meteo.id, malik, 'Pour Inès.')
    later()
    await act.comment(velo.id, malik, 'Pour Zoé.')
    later(HOUR)
  }

  it('sends nothing to a member who turned the recap off', async () => {
    await act.setPreferences(ines, { weeklyRecap: false })
    await activityForInesAndZoe()

    await runRecap()

    expect(recapsTo(inesAccount.email)).toEqual([])
    expect(recapsTo(zoeAccount.email)).toHaveLength(1)
  })

  it('sends nothing to an account that is not verified', async () => {
    await activityForInesAndZoe()
    await ctx.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, inesId))

    await runRecap()

    expect(recapsTo(inesAccount.email)).toEqual([])
    expect(recapsTo(zoeAccount.email)).toHaveLength(1)
  })

  it('sends one recap only when it runs twice at the same time', async () => {
    await activityForInesAndZoe()
    const now = new Date()

    await weeklyRecap(depsWith(), now)
    await weeklyRecap(depsWith(), now)
    // Deux exécutions simultanées (une tâche relancée par pg-boss pendant que la première tourne).
    // PGlite n'a qu'une connexion : elles passent l'une après l'autre ; c'est la prise atomique de
    // la date d'envoi qui doit décider, pas l'ordre.
    await Promise.all([weeklyRecap(depsWith(), now), weeklyRecap(depsWith(), now)])

    expect(recapsTo(inesAccount.email)).toHaveLength(1)
    expect(recapsTo(zoeAccount.email)).toHaveLength(1)
  })

  it('sends nothing to a member who unsubscribes while the recaps go out', async () => {
    await activityForInesAndZoe()
    const ids = new Map([
      [inesAccount.email, inesId],
      [zoeAccount.email, zoeId],
    ])
    // Au premier envoi, l'autre membre touche « Confirmer » sur la page de désinscription.
    let unsubscribed = false
    const mailer: Mailer = {
      async send(email) {
        if (!unsubscribed) {
          unsubscribed = true
          const other = [...ids].find(([address]) => address !== email.to)?.[1] ?? ''
          const token = createUnsubscribeToken(TEST_AUTH_SECRET, other, 'recap')
          const res = await ctx.request(`/v1/email/unsubscribe?${new URLSearchParams({ token })}`, {
            method: 'POST',
          })
          expect(res.status).toBe(204)
        }
        await ctx.mailer.send(email)
      },
    }

    await runRecap(mailer)

    expect([...recapsTo(inesAccount.email), ...recapsTo(zoeAccount.email)]).toHaveLength(1)
  })

  it('sends nothing to a member whose account is deleted while the recaps go out', async () => {
    await activityForInesAndZoe()
    const ids = new Map([
      [inesAccount.email, inesId],
      [zoeAccount.email, zoeId],
    ])
    const logs = spyOnLogs()
    let deletedId: string | null = null
    const mailer: Mailer = {
      async send(email) {
        if (deletedId === null) {
          deletedId = [...ids].find(([address]) => address !== email.to)?.[1] ?? ''
          await ctx.db.delete(schema.user).where(eq(schema.user.id, deletedId))
        }
        await ctx.mailer.send(email)
      },
    }

    await runRecap(mailer)

    expect([...recapsTo(inesAccount.email), ...recapsTo(zoeAccount.email)]).toHaveLength(1)
    // Aucune ligne de réglages recréée pour le compte effacé, et aucune erreur de clé étrangère.
    expect(
      await rows(sql`select user_id from email_preference where user_id = ${deletedId}`),
    ).toEqual([])
    expect(JSON.stringify(logs.map((spy) => spy.mock.calls))).not.toContain('23503')
  })

  it('goes on with the other members when one of them fails, and logs it without the address', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const recettes = await act.publish(malik, 'Recettes')
    later()
    await act.comment(meteo.id, zoe, 'Pour Inès.')
    later()
    await act.comment(recettes.id, zoe, 'Pour Malik.')
    later(HOUR)
    const logs = spyOnLogs()
    // Le prestataire refuse l'e-mail de Malik, avec un message qui contient son adresse.
    const mailer: Mailer = {
      async send(email) {
        if (email.to === malikAccount.email) throw new Error(`refused: ${email.to}`)
        await ctx.mailer.send(email)
      },
    }

    // La tâche se termine normalement : l'échec d'un membre ne la fait pas échouer.
    await runRecap(mailer)

    expect(recapsTo(inesAccount.email)).toHaveLength(1)
    const written = JSON.stringify(logs.map((spy) => spy.mock.calls))
    expect(logs.some((spy) => spy.mock.calls.length > 0)).toBe(true)
    expect(written).not.toContain(malikAccount.email)
  })
})

// Ajouté avec le backend (précision de la session du 21/10/2026) : les « nouveaux abonnements » du
// récap comptent les abonnés au compte du membre ET à ses projets.
describe('the new follows of the recap', () => {
  it('counts the follows of the account and of the projects of the member', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    // Malik et Sam suivent le projet Météo ; Zoé suit le compte d'Inès.
    for (const cookie of [malik, sam]) {
      const res = await act.send('POST', `/v1/projects/${meteo.id}/follow`, cookie)
      expect(res.status).toBe(204)
      later()
    }
    await act.followMember(inesId, zoe)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(fill(fr.recap.follows_other, { count: '3' }))
  })

  it('leaves out the follows of a project that became private', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const jardin = await act.publish(ines, 'Jardin')
    later()
    for (const project of [meteo, jardin]) {
      const res = await act.send('POST', `/v1/projects/${project.id}/follow`, malik)
      expect(res.status).toBe(204)
      later()
    }
    await act.setVisibility(jardin.id, ines, 'private')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(fill(fr.recap.follows_one, { count: '1' }))
  })
})

// Ajouté avec les corrections de la relecture de sécurité (A7) : le lundi à 9 h, le récap et
// l'e-mail de mentions tournent en même temps. Chacun lit la date d'envoi de l'autre au début de son
// lot ; si l'autre envoie entre-temps, la même mention partirait deux fois.
describe('the recap and the mention e-mail at the same time', () => {
  it('never sends a mention twice when the mention e-mail goes out during the recap', async () => {
    await act.setPreferences(ines, { mentionEmails: true })
    await act.setPreferences(zoe, { mentionEmails: true })
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const now = new Date()
    // Au premier récap envoyé, l'e-mail de mentions passe (même heure) : il sert l'autre membre,
    // que le récap n'a pas encore traité, mais dont il a déjà lu la date d'envoi des mentions.
    let ran = false
    const mailer: Mailer = {
      async send(email) {
        if (!ran) {
          ran = true
          await mentionEmails(depsWith(), now)
        }
        await ctx.mailer.send(email)
      },
    }

    await weeklyRecap(depsWith(mailer), now)

    const notificationSubjects = [...recapSubjects, fill(fr.mentions.subject)]
    for (const address of [inesAccount.email, zoeAccount.email]) {
      const withTheMention = ctx.mailer.sent.filter(
        (email) =>
          email.to === address &&
          notificationSubjects.includes(email.subject) &&
          email.text.includes('Météo'),
      )
      expect(withTheMention, address).toHaveLength(1)
    }
  })
})

// Tranche 7a, règle 31 du plan : le récap du lundi ignore les deux notifications de la modération
// (« removed » pour l'auteur, « report_handled » pour qui a signalé) ; elles restent dans l'appli.
describe('the notifications of the moderation', () => {
  it('are left out of the recap', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const recettes = await act.publish(malik, 'Recettes')
    await act.makeAdmin((await act.me(sam)).id)
    later()
    await act.report(malik, { kind: 'project', id: meteo.id }, 'scam_spam')
    later()
    await act.decide(sam, {
      action: 'remove',
      target: { kind: 'project', id: meteo.id },
      ground: 'rules',
      explanation: 'Publicité déguisée.',
    })
    later()
    // Témoin : Malik a aussi du nouveau, un commentaire de Zoé.
    await act.comment(recettes.id, zoe, 'Miam.')
    later(HOUR)
    // Témoin : les deux notifications sont bien dans l'appli.
    const kinds = async (cookie: string) =>
      NotificationPage.parse(
        await (await act.send('GET', '/v1/notifications', cookie)).json(),
      ).items.map((n) => n.kind)
    expect(await kinds(ines)).toContain('removed')
    expect(await kinds(malik)).toContain('report_handled')

    await runRecap()

    // Inès n'a rien d'autre de neuf : aucun récap.
    expect(recapsTo(inesAccount.email)).toEqual([])
    const recap = onlyRecapTo(malikAccount.email)
    expect(recap.text).toContain(line('comment', 'Recettes', 'Zoé', 'zoe'))
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain('Météo')
      expect(part).not.toContain('signalement')
      expect(part).not.toContain('modération')
    }
  })
})

// ─── Bloquer (tranche 7b) ────────────────────────────────────────────────────────────────────────

// Scénario « Tranche 7b — Bloquer » : ce qui vient de l'autre (commentaire, réponse, mention,
// réaction, abonnement) disparaît aussi du récap du lundi, dans les deux sens du blocage. Le récap
// lit le même filtre que la liste des notifications (plan 7b, « Ce qu'un blocage cache »).
describe('the recap and blocks', () => {
  it.each([
    ['Inès blocked Malik', 'ines'],
    ['Malik blocked Inès', 'malik'],
  ])('leaves out everything coming from Malik when %s', async (_, who) => {
    const malikId = (await act.me(malik)).id
    const meteo = await act.publish(ines, 'Météo')
    const jardin = await act.publish(sam, 'Jardin')
    later()
    await act.comment(meteo.id, malik, 'Un commentaire de Malik')
    later()
    await act.comment(jardin.id, malik, '@ines_morel regarde ça.')
    later()
    await act.react(meteo.id, 'bravo', malik)
    later()
    await act.comment(meteo.id, zoe, 'Un commentaire de Zoé')
    later()
    if (who === 'ines') await act.block(malikId, ines)
    else await act.block(inesId, malik)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    expect(recap.text).not.toContain(line('comment', 'Météo'))
    expect(recap.text).not.toContain(line('mention', 'Jardin'))
    expect(recap.text).not.toContain('Malik')
    expect(recap.html).not.toContain('Malik')
  })
})
