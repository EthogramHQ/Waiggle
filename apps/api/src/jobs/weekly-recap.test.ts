// Tests du récap de la semaine (tranche 6c ; ses parties de R7a et R7b à la fin). Scénario : docs/scenarios/phase-1.md, « Précisions
// (tranche 6c) », « Le récap » ; règles détaillées : plan 6c, « Les tâches », et les relectures du
// plan (sécurité S-B1, S-B2 ; juridique R1, R3, R4, R5).
//
// R8 (planche R8-Recap) : le récap habillé du dimanche, ses parties « Tes projets » (des nombres en
// pastilles), « Nouveaux projets de tes proches » et « Ils cherchent des testeurs », ses vignettes
// jointes, et les choix d'e-mail par type (seuls les types « Dans le récap », et ce qui n'est pas déjà
// parti « tout de suite »). Les tests de R8 sont à la fin du fichier.
//
// Le récap est une fonction ordinaire, weeklyRecap({ db, mailer, storage, appUrl, apiUrl, secret },
// now) : l'ordonnanceur (pg-boss) l'appelle le dimanche à 10 h, les tests l'appellent eux-mêmes, à l'heure
// qu'ils choisissent, et lisent la fausse boîte d'envoi (ctx.mailer.sent). Les gestes des membres
// passent par l'API, comme dans l'appli.
//
// Quatre membres : Inès (qui reçoit le récap), Malik, Zoé et Sam (qui commentent, répondent,
// mentionnent, réagissent et suivent). La fausse horloge part d'un dimanche fixe, loin d'aujourd'hui.
import { randomUUID } from 'node:crypto'
import { appName } from '@ruche/brand'
import {
  DEFAULT_EMAIL_PREFERENCES,
  NotificationPage,
  Project,
  RECAP_FRIEND_PROJECTS_MAX,
  RECAP_IMAGES_MAX,
  TesterCall,
  TesterMessage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mailer } from '../email/mailer'
import { categoryTile } from '../email/recap-images'
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
import { photoWithGps, visualForm } from '../testing/images'
import { instantEmails } from './instant-emails'
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
const START = new Date('2026-06-14T08:00:00.000Z') // un dimanche, 10 h à Paris

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

/**
 * Ce que reçoit la tâche : la base, la boîte d'envoi, le stockage (R8 : les photos des vignettes),
 * les adresses des liens, la clé des jetons.
 */
const depsWith = (mailer: Mailer = ctx.mailer) => ({
  db: ctx.db,
  mailer,
  storage: ctx.storage,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})

/** Lance le récap à l'heure de la fausse horloge (comme pg-boss le dimanche à 10 h). */
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

type PillKey = 'pillReactions' | 'pillComments' | 'pillFollows'
/** R8 : une pastille d'un projet du membre, « 4 commentaires », « 1 réaction ». */
const pill = (
  key: PillKey,
  count: number,
  t: { recap: Record<`${PillKey}_${'one' | 'other'}`, string> } = fr,
) => fill(count === 1 ? t.recap[`${key}_one`] : t.recap[`${key}_other`], { count: String(count) })

/** Les nouveaux abonnés au compte du membre (ceux d'un projet sont dans sa pastille). */
const accountFollows = (count: number) =>
  fill(count === 1 ? fr.recap.follows_one : fr.recap.follows_other, { count: String(count) })

/**
 * Ce que tout récap peut contenir autour de ses parties : le bandeau, l'introduction, l'explication
 * du premier récap, le pied et ses liens. Les tests « rien d'autre » (relecture juridique R1)
 * retirent ces textes, puis ce qu'ils attendent ; il ne doit rester que de la ponctuation.
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
  fill(fr.greeting, { name }),
  appName,
]
const expectOnly = (text: string, expected: string[]) => {
  let rest = text.replace(/https?:\/\/\S+/g, ' ')
  for (const part of [...expected].sort((a, b) => b.length - a.length)) {
    rest = rest.replaceAll(part, ' ')
  }
  expect(rest).toMatch(/^[\s\p{P}\p{S}]*$/u)
}

/** Les sources des images du HTML (src="…"), et leur nombre de balises <img>. */
const imageSources = (html: string) => {
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1] ?? '')
  expect(html.match(/<img\b/gi)?.length ?? 0).toBe(sources.length)
  return sources
}

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Espionne les journaux de l'API, sans rien afficher. */
const spyOnLogs = () =>
  (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )

describe('the content of the recap', () => {
  // R8 : les commentaires, réactions et abonnés d'un projet deviennent ses pastilles ; les réponses
  // et mentions restent des lignes qui nomment qui a écrit, cinq au plus, puis « Et N autres ».
  it('lists my projects with their numbers as pills, then replies and mentions, five at most, then « and N more »', async () => {
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
      '@ines_morel encore toi.',
      '@ines_morel et la neige ?',
      '@ines_morel une dernière.',
    ]
    // Quatre commentaires sur Météo (trois de Malik, un de Zoé).
    for (const [cookie, body] of [
      [malik, bodies[0]],
      [malik, bodies[1]],
      [malik, bodies[2]],
      [zoe, bodies[6]],
    ] as const) {
      later()
      await act.comment(meteo.id, cookie, body as string)
    }
    // Sept lignes : une réponse de Zoé, six mentions sur le Jardin de Sam.
    later()
    await act.comment(meteo.id, zoe, bodies[3] as string, own.id)
    for (const [cookie, body] of [
      [sam, bodies[4]],
      [malik, bodies[5]],
      [malik, bodies[7]],
      [sam, bodies[8]],
      [malik, bodies[9]],
      [sam, bodies[4]],
    ] as const) {
      later()
      await act.comment(jardin.id, cookie, body as string)
    }
    for (const [cookie, kind] of [
      [malik, 'bravo'],
      [zoe, 'useful'],
      [sam, 'funny'],
    ] as const) {
      later()
      await act.react(meteo.id, kind, cookie)
    }
    // Deux abonnés au projet, un au compte.
    for (const cookie of [malik, sam]) {
      later()
      expect((await act.send('POST', `/v1/projects/${meteo.id}/follow`, cookie)).status).toBe(204)
    }
    later()
    await act.followMember(inesId, zoe)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.subject).toBe(fill(fr.recap.subject))
    for (const part of [recap.text, recap.html]) {
      expect(part).toContain(fill(fr.recap.heading, { name: inesAccount.name }))
      expect(part).toContain(fill(fr.recap.intro))
      expect(part).toContain(fr.recap.yourProjects)
      // Les pastilles de Météo, sans aucun nom.
      expect(part).toContain(pill('pillComments', 4))
      expect(part).toContain(pill('pillReactions', 3))
      expect(part).toContain(pill('pillFollows', 2))
      expect(part).toContain(fr.recap.readComments)
    }
    expect(recap.text).toContain(accountFollows(1))
    // « Lire les commentaires » mène à la page du projet, dans l'appli.
    expect(
      hrefsOf(recap.html).some((href) => href?.startsWith(`${TEST_APP_URL}/projects/${meteo.id}`)),
    ).toBe(true)
    // Un commentaire sur son projet ne fait plus de ligne : il est compté.
    expect(recap.text).not.toContain(line('comment', 'Météo'))
    expect(recap.text).not.toContain(line('comment', 'Météo', 'Zoé', 'zoe'))
    // Sept lignes : cinq montrées, puis « Et 2 autres ».
    const lines = [
      line('reply', 'Météo', 'Zoé', 'zoe'),
      line('mention', 'Jardin', 'Sam', 'sam'),
      line('mention', 'Jardin'),
    ]
    const shown = lines.reduce((sum, expected) => sum + occurrences(recap.text, expected), 0)
    expect(shown).toBe(5)
    expect(recap.text).toContain(fill(fr.recap.more_other, { count: '2' }))
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
    // R8 : le bandeau, « Tes projets », le titre de Météo et ses pastilles, l'abonné au compte.
    expectOnly(recap.text, [
      ...frameOf(inesAccount.name),
      fr.recap.yourProjects,
      'Météo',
      pill('pillComments', 1),
      pill('pillReactions', 1),
      accountFollows(1),
      fr.recap.readComments,
    ])
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
    // Seul le commentaire de Zoé compte.
    expect(recap.text).toContain(pill('pillComments', 1))
    expect(recap.text).not.toContain(pill('pillComments', 2))
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
    expect(recap.text).toContain(pill('pillComments', 1))
    expect(recap.text).not.toContain(pill('pillComments', 2))
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

  // R8 : le récap n'écarte que ce qui est déjà parti « tout de suite » (le type relu à la prise, une
  // date au plus celle du dernier e-mail « tout de suite ») ; une mention pas encore partie y reste.
  it('never repeats what the instant e-mail already sent, and keeps what has not gone out yet', async () => {
    await act.setPreferences(ines, { replies: 'now' })
    const jardin = await act.publish(sam, 'Jardin')
    later()
    await act.comment(jardin.id, malik, 'Et @ines_morel, la neige ?')
    later(16 * MINUTE)
    const before = ctx.mailer.sent.length
    await instantEmails(depsWith(), new Date())
    expect(
      ctx.mailer.sent.slice(before).filter((email) => email.to === inesAccount.email),
    ).toHaveLength(1)
    later(MINUTE)
    await act.comment(jardin.id, zoe, '@ines_morel et la grêle ?')
    // Cinq minutes plus tard : l'e-mail « tout de suite » attend 15 minutes, rien n'est parti.
    later(5 * MINUTE)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(line('mention', 'Jardin', 'Zoé', 'zoe'))
    expect(recap.text).not.toContain(line('mention', 'Jardin'))
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
    expect(recap.text).toContain(fill(en.recap.heading, { name: inesAccount.name }))
    expect(recap.text).toContain(fill(en.recap.intro))
    expect(recap.text).toContain(en.recap.yourProjects)
    expect(recap.text).toContain(pill('pillComments', 1, en))
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
    await act.setPreferences(ines, { replies: 'now' })

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
    expect(await act.preferences(ines)).toEqual({
      ...DEFAULT_EMAIL_PREFERENCES,
      weeklyRecap: false,
      replies: 'now',
    })
  })

  // R8 (A5) : des vignettes jointes, jamais chargées à distance.
  it('has only links to the app or the API, images joined to the e-mail only, and the language of the page', async () => {
    const recap = await recapWithAComment()

    const hrefs = hrefsOf(recap.html)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(
        href?.startsWith(`${TEST_APP_URL}/`) || href?.startsWith(`${TEST_API_URL}/`),
        href,
      ).toBe(true)
    }
    const cids = (recap.attachments ?? []).map((attachment) => attachment.cid)
    for (const src of imageSources(recap.html)) {
      expect(src).toMatch(/^cid:/)
      expect(cids).toContain(src.slice('cid:'.length))
    }
    expect(recap.html).toContain('<html lang="fr"')
  })

  it('shows no address written by a member: in a name or a title, it becomes « [lien] »', async () => {
    await act.updateProfile(malik, { name: 'support.example.com' })
    const meteo = await act.publish(ines, 'Météo sur www.evil.example')
    const jardin = await act.publish(sam, 'Jardin sur jardin-pirate.example')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    later()
    await act.comment(jardin.id, malik, '@ines_morel regarde.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    for (const part of [recap.subject, recap.text, recap.html]) {
      expect(part).not.toContain('support.example.com')
      expect(part).not.toContain('evil.example')
      expect(part).not.toContain('jardin-pirate.example')
    }
    expect(recap.text).toContain('[lien]')
    // Le nom est suivi du pseudo, comme dans l'appli : on sait qui a écrit.
    expect(recap.text).toContain('(@malik)')
  })

  it('escapes the HTML hidden in a name', async () => {
    await act.updateProfile(malik, { name: '<b onclick=alert(1)>Malik</b>' })
    const jardin = await act.publish(sam, 'Jardin')
    later()
    await act.comment(jardin.id, malik, '@ines_morel regarde.')
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
    expect(recaps[1]?.text).toContain(pill('pillComments', 1))
    expect(recaps[1]?.text).not.toContain(pill('pillComments', 2))
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
    expect(first.text).toContain(pill('pillComments', 1))
    expect(first.text).not.toContain(pill('pillComments', 2))

    vi.setSystemTime(now.getTime() + 6 * DAY + MINUTE)
    await runRecap()
    const recaps = recapsTo(inesAccount.email)
    expect(recaps).toHaveLength(2)
    expect(recaps[1]?.text).toContain(pill('pillComments', 1))
    expect(recaps[1]?.text).not.toContain(pill('pillComments', 2))
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
    // revient plus ; Malik commente chaque semaine, et le récap part chaque dimanche.
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

// Ajouté avec le backend (précision du 21/10/2026) : les « nouveaux abonnements » du
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

    // R8 : les deux abonnés du projet dans sa pastille, l'abonnée au compte à part.
    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(pill('pillFollows', 2))
    expect(recap.text).toContain(accountFollows(1))
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
    expect(recap.text).toContain(pill('pillFollows', 1))
    expect(recap.text).not.toContain('Jardin')
  })
})

// Ajouté avec les corrections de la relecture de sécurité (A7) : le récap et l'e-mail « tout de
// suite » (R8 ; avant, celui des mentions) peuvent tourner en même temps. Chacun lit la date d'envoi
// de l'autre au début de son lot ; si l'autre envoie entre-temps, la même mention partirait deux fois.
describe('the recap and the instant e-mail at the same time', () => {
  it('never sends a mention twice when the instant e-mail goes out during the recap', async () => {
    await act.setPreferences(ines, { replies: 'now' })
    await act.setPreferences(zoe, { replies: 'now' })
    const meteo = await act.publish(sam, 'Météo')
    later()
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const now = new Date()
    const before = ctx.mailer.sent.length
    // Au premier récap envoyé, l'e-mail de mentions passe (même heure) : il sert l'autre membre,
    // que le récap n'a pas encore traité, mais dont il a déjà lu la date d'envoi des mentions.
    let ran = false
    const mailer: Mailer = {
      async send(email) {
        if (!ran) {
          ran = true
          await instantEmails(depsWith(), now)
        }
        await ctx.mailer.send(email)
      },
    }

    await weeklyRecap(depsWith(mailer), now)

    for (const address of [inesAccount.email, zoeAccount.email]) {
      const withTheMention = ctx.mailer.sent
        .slice(before)
        .filter((email) => email.to === address && email.text.includes('Météo'))
      expect(withTheMention, address).toHaveLength(1)
    }
  })
})

// Tranche 7a, règle 31 du plan : le récap du dimanche ignore les deux notifications de la modération
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
    expect(recap.text).toContain('Recettes')
    expect(recap.text).toContain(pill('pillComments', 1))
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain('Météo')
      expect(part).not.toContain('signalement')
      expect(part).not.toContain('modération')
    }
  })
})

// ─── Bloquer (tranche 7b) ────────────────────────────────────────────────────────────────────────

// Scénario « Tranche 7b — Bloquer » : ce qui vient de l'autre (commentaire, réponse, mention,
// réaction, abonnement) disparaît aussi du récap du dimanche, dans les deux sens du blocage. Le récap
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
    // Seul le commentaire de Zoé : ni celui de Malik, ni sa réaction, ni sa mention.
    expect(recap.text).toContain(pill('pillComments', 1))
    expect(recap.text).not.toContain(pill('pillComments', 2))
    expect(recap.text).not.toContain(pill('pillReactions', 1))
    expect(recap.text).not.toContain(line('mention', 'Jardin'))
    expect(recap.text).not.toContain('Malik')
    expect(recap.html).not.toContain('Malik')
  })
})

// ─── Tranche R7a : « Les projets que tu suis ou que tu testes » ──────────────────────────────────
// Scénario : docs/scenarios/refonte.md, « R7a », « Les notifications » : le récap du dimanche ajoute
// chaque projet suivi ou testé mis à jour dans la semaine, son nombre de mises à jour et un lien
// vers sa frise ; jamais le texte d'une mise à jour (relecture de sécurité A9, juridique P4). Les
// 5 projets et « Et N autres projets » se comptent après le filtre de visibilité, relu à l'envoi.
//
// Ici Malik reçoit le récap : il suit des projets d'Inès, et fait partie des testeurs du Jardin de
// Sam. Les testeurs s'inscrivent par une route écrite à part : l'inscription est posée en base
// (table project_tester), la date en texte ISO, que PostgreSQL lit selon le type de la colonne.
describe('the followed or tested projects of the recap (R7a)', () => {
  let malikId: string

  beforeEach(async () => {
    malikId = (await act.me(malik)).id
  })

  const followProject = async (projectId: string, cookie: string) => {
    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/follow`, cookie)
    expect(res.status).toBe(204)
  }

  const joinTesters = async (projectId: string, memberId: string) => {
    later()
    await ctx.db.execute(sql`
      insert into project_tester (member_id, project_id, created_at)
      values (${memberId}, ${projectId}, ${new Date().toISOString()})`)
  }

  /** Publie une mise à jour (une ligne par défaut), une seconde après ce qui précède. */
  const postUpdate = async (
    projectId: string,
    cookie: string,
    body: { title?: string | null; version?: string | null; lines?: object[] } = {},
  ) => {
    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Une nouveauté' }],
      photos: [],
      beforeAfter: false,
      ...body,
    })
    expect(res.status).toBe(201)
  }

  /** La ligne d'un projet dans la partie : « « Météo » : 2 mises à jour ». */
  const updatesLine = (
    title: string,
    count: number,
    t: { recap: { updates_one: string; updates_other: string } } = fr,
  ) =>
    fill(count === 1 ? t.recap.updates_one : t.recap.updates_other, {
      title,
      count: String(count),
    })
  const updatesUrl = (projectId: string) => `${TEST_APP_URL}/projects/${projectId}/updates`

  it('lists the projects I follow or test, with their number of updates and a link', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const jardin = await act.publish(sam, 'Jardin')
    await followProject(meteo.id, malik)
    await joinTesters(jardin.id, malikId)
    await postUpdate(meteo.id, ines)
    await postUpdate(meteo.id, ines)
    await postUpdate(jardin.id, sam)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    for (const part of [recap.text, recap.html]) {
      expect(part).toContain(fill(fr.recap.updatesTitle))
      expect(part).toContain(updatesLine('Météo', 2))
      expect(part).toContain(updatesLine('Jardin', 1))
    }
    // Chaque projet mène à sa frise, une adresse fabriquée par le serveur.
    expect(hrefsOf(recap.html)).toEqual(
      expect.arrayContaining([updatesUrl(meteo.id), updatesUrl(jardin.id)]),
    )
    // Rien d'autre que ce qui est prévu (comme le test R1 plus haut) : la partie, la salutation,
    // les textes du récap et du pied. C'est son premier récap : il est expliqué.
    expectOnly(recap.text, [
      ...frameOf(malikAccount.name),
      fill(fr.recap.updatesTitle),
      updatesLine('Météo', 2),
      updatesLine('Jardin', 1),
    ])
  })

  it('shows five updated projects at most, then « and N more projects »', async () => {
    const titles = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept'].map(
      (n) => `Projet ${n}`,
    )
    const projects = []
    for (const title of titles) projects.push(await act.publish(ines, title))
    for (const project of projects) await followProject(project.id, malik)
    for (const project of projects) await postUpdate(project.id, ines)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    const shown = titles.filter((title) => recap.text.includes(updatesLine(title, 1)))
    expect(shown).toHaveLength(5)
    // Le plus récent en tête de la partie, comme les autres lignes du récap.
    expect(shown).toContain('Projet Sept')
    expect(recap.text).toContain(fill(fr.recap.updatesMore_other, { count: '2' }))
  })

  // Relecture de sécurité du plan, A9.
  it('never puts the text of an update in the recap', async () => {
    const meteo = await act.publish(ines, 'Météo')
    await followProject(meteo.id, malik)
    await postUpdate(meteo.id, ines, {
      title: 'ZZTITRE',
      version: 'ZZVER',
      lines: [{ family: 'new', text: 'ZZLIGNE' }],
    })
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    expect(recap.text).toContain(updatesLine('Météo', 1)) // témoin : la partie est là
    for (const part of [recap.subject, recap.text, recap.html]) {
      for (const secret of ['ZZTITRE', 'ZZVER', 'ZZLIGNE']) {
        expect(part, secret).not.toContain(secret)
      }
    }
  })

  // Relecture juridique du plan, P4 : la même règle, pour un membre qui lit l'anglais et teste le
  // projet sans le suivre.
  it('never puts an update’s title, version or lines in the recap', async () => {
    await act.updateProfile(malik, { language: 'en' })
    const jardin = await act.publish(sam, 'Garden')
    await joinTesters(jardin.id, malikId)
    await postUpdate(jardin.id, sam, {
      title: 'Le titre caché',
      version: 'v9.9.9',
      lines: [
        { family: 'new', text: 'Une première ligne cachée' },
        { family: 'fixed', text: 'Une seconde ligne cachée' },
      ],
    })
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    expect(recap.text).toContain(fill(en.recap.updatesTitle))
    expect(recap.text).toContain(updatesLine('Garden', 1, en))
    for (const part of [recap.subject, recap.text, recap.html]) {
      for (const secret of ['titre caché', 'v9.9.9', 'ligne cachée']) {
        expect(part, secret).not.toContain(secret)
      }
    }
  })

  // Relecture de sécurité du plan, A9 : compté après le filtre, relu à l'envoi.
  it('leaves out of the recap a project that became private before the sending', async () => {
    const titles = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq'].map((n) => `Projet ${n}`)
    const projects = []
    for (const title of titles) projects.push(await act.publish(ines, title))
    const secret = await act.publish(ines, 'Projet secret')
    for (const project of [...projects, secret]) await followProject(project.id, malik)
    for (const project of [...projects, secret]) await postUpdate(project.id, ines)
    later()
    await act.setVisibility(secret.id, ines, 'private')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    // Les cinq projets visibles, et rien de plus : ni le titre du projet devenu privé, ni
    // « Et 1 autre projet ».
    expect(titles.filter((title) => recap.text.includes(updatesLine(title, 1)))).toHaveLength(5)
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain('Projet secret')
      expect(part).not.toContain(secret.id)
      expect(part).not.toContain(fill(fr.recap.updatesMore_one, { count: '1' }))
    }
  })
})

// ─── R7a, relecture de sécurité B1 : un ancien signalement de note ───────────────────────────────
// Les notes du Journal sont effacées avec R7a, mais leurs signalements restent en base
// (target_kind = 'note'), en lecture seule. Le récap lit les notifications du membre : un tel
// signalement ne doit pas faire échouer le sien. La ligne est posée en base, comme l'aurait
// laissée la tranche 7a.
describe('an old report on a journal note (R7a, security B1)', () => {
  it('sends the weekly recap of a member who once reported a journal note', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    await ctx.db.insert(schema.contentReport).values({
      id: randomUUID(),
      reporterId: inesId,
      targetKind: 'note',
      targetId: randomUUID(),
      projectId: randomUUID(),
      targetAuthorId: null,
      reason: 'other',
      details: null,
      snapshot: [{ field: 'body', value: 'Une note du Journal' }],
      status: 'removed',
      createdAt: new Date(Date.now() - 2 * DAY),
      decidedAt: new Date(Date.now() - DAY), // hier
      decisionId: null,
    })
    later(HOUR)
    const logs = spyOnLogs()

    await runRecap()

    // Son récap part (le commentaire de Malik), et aucune erreur n'est notée.
    expect(onlyRecapTo(inesAccount.email).text).toContain(pill('pillComments', 1))
    const [, , warn, error] = logs
    expect(error?.mock.calls).toEqual([])
    expect(warn?.mock.calls).toEqual([])
  })
})

// ─── Tranche R7b : « Le coin des testeurs » ──────────────────────────────────────────────────────
// Scénario : docs/scenarios/refonte.md, section R7b, « Les notifications » ; plan R7b, « API »,
// partie « Notifications » ; relecture juridique J12 et de sécurité du plan. Le récap du dimanche
// ajoute une partie « Le coin des testeurs » : par projet, le nombre de nouveautés du coin (appels,
// messages de l'autre personne d'un fil, retours réglés) et un lien vers le coin
// (/projects/<id>/testers), 5 projets au plus puis « Et N autres projets ». Jamais de texte : ni
// celui d'un appel, ni celui d'un message (le fil est privé). Les nouveautés se comptent après les
// règles de la source des notifications (coin fermé, blocage, départ…), relues à l'envoi.
//
// Ici, Inès est l'autrice des projets et Malik leur testeur ; Zoé et Sam montrent ce que voient
// les autres. Les gestes passent par les routes du coin (testées dans tester-*.test.ts).
describe('the testers corner of the recap (R7b)', () => {
  let malikId: string

  beforeEach(async () => {
    malikId = (await act.me(malik)).id
  })

  const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }
  const projectPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`

  const publishTestable = (title: string, cookie = ines) => act.publish(cookie, title, TESTABLE)

  const join = async (projectId: string, cookie = malik) => {
    later()
    const res = await act.send('POST', `${projectPath(projectId)}/testers`, cookie)
    expect(res.status).toBe(204)
  }

  /** Lance un appel, une seconde plus tard. */
  const postCall = async (projectId: string, text = 'Essayez le niveau 3 ce soir') => {
    later()
    const res = await act.send('POST', `${projectPath(projectId)}/calls`, ines, {
      text,
      photoId: null,
      photoDescription: null,
    })
    expect(res.status).toBe(201)
    return TesterCall.parse(await res.json())
  }

  /** Envoie un message dans le fil de Malik, une seconde plus tard ; rend son identifiant. */
  const postMessage = async (projectId: string, cookie: string, body: object) => {
    later()
    const res = await act.send(
      'POST',
      `${projectPath(projectId)}/threads/${encodeURIComponent(malikId)}/messages`,
      cookie,
      body,
    )
    expect(res.status).toBe(201)
    return TesterMessage.parse(await res.json()).id
  }
  const feedback = (text = 'Le score repart à zéro au niveau 3.') => ({
    kind: 'feedback',
    outcome: 'partly',
    device: 'phone',
    text,
    captureId: null,
  })
  const reply = (text = 'Merci, je regarde ça ce soir.') => ({ kind: 'reply', text })

  const settle = async (projectId: string, messageId: string) => {
    later()
    const res = await act.send(
      'POST',
      `${projectPath(projectId)}/messages/${messageId}/settled`,
      ines,
    )
    expect(res.status).toBe(204)
  }

  /** La ligne d'un projet dans la partie : « « Météo » : 3 nouveautés dans le coin des testeurs ». */
  const testersLine = (
    title: string,
    count: number,
    t: { recap: { testers_one: string; testers_other: string } } = fr,
  ) =>
    fill(count === 1 ? t.recap.testers_one : t.recap.testers_other, {
      title,
      count: String(count),
    })
  const cornerUrl = (projectId: string) => `${TEST_APP_URL}/projects/${projectId}/testers`

  /** Retire du texte tout ce qui est prévu ; il ne doit rester que de la ponctuation (test R1). */
  const onlyExpected = expectOnly
  const frame = frameOf

  it('counts the news of the corner by project, for the tester and for the author, with a link', async () => {
    const meteo = await publishTestable('Météo')
    await join(meteo.id)
    // Pour Malik : l'appel, la réponse d'Inès et le retour réglé. Pour Inès : le retour de Malik.
    await postCall(meteo.id)
    const sent = await postMessage(meteo.id, malik, feedback())
    await postMessage(meteo.id, ines, reply())
    await settle(meteo.id, sent)
    later(HOUR)

    await runRecap()

    const forMalik = onlyRecapTo(malikAccount.email)
    const forInes = onlyRecapTo(inesAccount.email)
    for (const part of [forMalik.text, forMalik.html]) {
      expect(part).toContain(fill(fr.recap.testersTitle))
      expect(part).toContain(testersLine('Météo', 3))
    }
    for (const part of [forInes.text, forInes.html]) {
      expect(part).toContain(fill(fr.recap.testersTitle))
      expect(part).toContain(testersLine('Météo', 1))
    }
    // Le projet mène à son coin, une adresse fabriquée par le serveur.
    expect(hrefsOf(forMalik.html)).toContain(cornerUrl(meteo.id))
    expect(hrefsOf(forInes.html)).toContain(cornerUrl(meteo.id))
    // Rien d'autre que ce qui est prévu (comme le test R1 plus haut).
    onlyExpected(forMalik.text, [
      ...frame(malikAccount.name),
      fill(fr.recap.testersTitle),
      testersLine('Météo', 3),
    ])
    onlyExpected(forInes.text, [
      ...frame(inesAccount.name),
      fill(fr.recap.testersTitle),
      testersLine('Météo', 1),
    ])
    // Zoé et Sam n'ont rien de neuf : aucun récap.
    expect(recapsTo(zoeAccount.email)).toEqual([])
    expect(recapsTo(samAccount.email)).toEqual([])
  })

  // Relecture juridique J12 et de sécurité du plan : jamais de texte du coin dans le récap.
  it('never puts the text of a call or a message in the recap', async () => {
    const meteo = await publishTestable('Météo')
    await join(meteo.id)
    await postCall(meteo.id, 'ZZAPPEL caché')
    const sent = await postMessage(meteo.id, malik, feedback('ZZRETOUR caché'))
    await postMessage(meteo.id, ines, reply('ZZREPONSE cachée'))
    await postMessage(meteo.id, malik, reply('ZZRELANCE cachée'))
    await settle(meteo.id, sent)
    later(HOUR)

    await runRecap()

    for (const recap of [onlyRecapTo(malikAccount.email), onlyRecapTo(inesAccount.email)]) {
      expect(recap.text).toContain(fill(fr.recap.testersTitle)) // témoin : la partie est là
      for (const part of [recap.subject, recap.text, recap.html]) {
        for (const secret of ['ZZAPPEL', 'ZZRETOUR', 'ZZREPONSE', 'ZZRELANCE']) {
          expect(part, secret).not.toContain(secret)
        }
      }
    }
  })

  it('shows five projects of the corner at most, then « and N more projects »', async () => {
    const titles = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept'].map(
      (n) => `Projet ${n}`,
    )
    const projects = []
    for (const title of titles) projects.push(await publishTestable(title))
    for (const project of projects) await join(project.id)
    for (const project of projects) await postCall(project.id)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    const shown = titles.filter((title) => recap.text.includes(testersLine(title, 1)))
    expect(shown).toHaveLength(5)
    // Le plus récent en tête de la partie, comme les autres lignes du récap.
    expect(shown).toContain('Projet Sept')
    expect(recap.text).toContain(fill(fr.recap.testersMore_other, { count: '2' }))
  })

  // Choix de la session et décision 1 de Louis : un coin fermé ne prévient plus ses testeurs ;
  // compté après ce filtre, relu à l'envoi (comme la partie de R7a).
  it('leaves out a corner closed before the sending', async () => {
    const meteo = await publishTestable('Météo')
    const secret = await publishTestable('Projet secret')
    await join(meteo.id)
    await join(secret.id)
    await postCall(meteo.id)
    await postCall(secret.id)
    later()
    await act.setVisibility(secret.id, ines, 'private')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    expect(recap.text).toContain(testersLine('Météo', 1)) // témoin
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain('Projet secret')
      expect(part).not.toContain(secret.id)
      expect(part).not.toContain(fill(fr.recap.testersMore_one, { count: '1' }))
    }
  })

  it('writes the testers part in the language of the member', async () => {
    await act.updateProfile(malik, { language: 'en' })
    const garden = await publishTestable('Garden')
    await join(garden.id)
    await postCall(garden.id)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(malikAccount.email)
    expect(recap.text).toContain(fill(en.recap.testersTitle))
    expect(recap.text).toContain(testersLine('Garden', 1, en))
    expect(recap.text).not.toContain(fill(fr.recap.testersTitle))
  })

  // Les notifications de la modération restent dans l'appli (plus haut) : le retrait d'un appel
  // ou d'un message n'est pas une nouveauté du coin.
  it('counts no moderation notice of a call or a message as news of the corner', async () => {
    const meteo = await publishTestable('Météo')
    const jardin = await publishTestable('Jardin')
    await join(meteo.id)
    await join(jardin.id)
    const call = await postCall(meteo.id, 'Un appel publicitaire')
    await postCall(jardin.id)
    later()
    const decisionId = randomUUID()
    await ctx.db.insert(schema.moderationDecision).values({
      id: decisionId,
      targetKind: 'call',
      targetId: call.id,
      action: 'remove',
      ground: 'rules',
      explanation: 'Publicité déguisée.',
      adminId: zoeId,
      createdAt: new Date(),
      targetMemberId: inesId,
    })
    await ctx.db
      .update(schema.testerCall)
      .set({ removedAt: new Date(), removalId: decisionId })
      .where(eq(schema.testerCall.id, call.id))
    later()
    // Témoin : Inès a aussi du nouveau, un commentaire de Zoé.
    await act.comment(meteo.id, zoe, 'Bravo pour le niveau 3.')
    later(HOUR)

    await runRecap()

    // L'appel de Météo est retiré : rien du coin pour Inès, et pour Malik seulement Jardin.
    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(pill('pillComments', 1))
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain(fill(fr.recap.testersTitle))
    }
    const forMalik = onlyRecapTo(malikAccount.email)
    expect(forMalik.text).toContain(testersLine('Jardin', 1)) // témoin : la partie est là
    expect(forMalik.text).not.toContain('Météo')
  })
})

// ─── Tranche R8 : le récap habillé du dimanche ──────────────────────────────────────────────────
// Scénario : docs/scenarios/refonte.md, « R8 », « Le récap de la semaine, habillé » ; plan R8, « Le
// récap habillé (BE-D) », « Ce qui change au plan » (BE-D) et les tests demandés par les relecteurs
// (noms repris mot pour mot). Les deux parties neuves se calculent à l'envoi, depuis les projets
// visibles du membre (listedVerifiedProjectFor) : jamais un projet privé, retiré, d'un membre bloqué
// dans un sens ou dans l'autre, ni d'un membre suspendu. Titre et nom seuls, jamais l'accroche
// (décision de Louis du 12/11/2026) ; « Tester la démo » mène à la page du projet, jamais à la démo.
//
// Ici Inès reçoit le récap ; elle suit Malik (et parfois Zoé, Sam, Hugo), qui publient.
describe('the dressed recap (R8)', () => {
  let malikId: string
  let samId: string

  beforeEach(async () => {
    malikId = (await act.me(malik)).id
    samId = (await act.me(sam)).id
  })

  const TESTABLE = { status: 'testable', demoUrl: 'https://papillon-demo.example.com/app?niveau=3' }

  /** Publie un projet une seconde plus tard (deux projets n'ont jamais la même date). */
  const publish = async (cookie: string, title: string, body: object = {}) => {
    later()
    return act.publish(cookie, title, body)
  }

  const follow = async (memberId: string, cookie = ines) => {
    later()
    await act.followMember(memberId, cookie)
  }

  /** Ajoute une photo à la galerie du projet (une vraie photo de téléphone, avec sa position). */
  const addPhoto = async (projectId: string, cookie: string) => {
    later()
    const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
      method: 'POST',
      headers: { cookie },
      body: visualForm(await photoWithGps()),
    })
    expect(res.status).toBe(201)
    return Project.parse(await res.json())
  }

  /** Le texte d'une partie : de son titre jusqu'au pied de l'e-mail. */
  const partOf = (text: string, title: string) => {
    const start = text.indexOf(title)
    expect(start, title).toBeGreaterThanOrEqual(0)
    return text.slice(start, text.indexOf(fill(fr.recap.reason)))
  }
  /** La partie « Nouveaux projets de tes proches », sans celle des testeurs qui peut la suivre. */
  const friendsPartOf = (text: string) => {
    const part = partOf(text, fr.recap.friendsTitle)
    const testers = part.indexOf(fr.recap.testersWanted)
    return testers < 0 ? part : part.slice(0, testers)
  }

  const projectUrl = (id: string) => `${TEST_APP_URL}/projects/${id}`
  const JPEG = [0xff, 0xd8, 0xff]
  const isJpeg = (bytes: Uint8Array) => JPEG.every((byte, i) => bytes[i] === byte)
  const sameBytes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b))

  // ─── Les types réglés un par un ───

  it('leaves out of the recap a type set to never, and sends nothing when only that type has news', async () => {
    await act.setPreferences(ines, { comments: 'never' })
    await act.setPreferences(sam, { comments: 'never' })
    const meteo = await publish(ines, 'Météo')
    const jardin = await publish(sam, 'Jardin')
    later()
    await act.comment(meteo.id, malik, 'Super idée.')
    later()
    await act.react(meteo.id, 'bravo', zoe)
    later()
    await act.comment(jardin.id, malik, 'Joli jardin.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(pill('pillReactions', 1)) // témoin : la réaction part
    expect(recap.text).not.toContain(pill('pillComments', 1))
    expect(recap.text).not.toContain(fr.recap.readComments)
    // Sam n'a que des commentaires, réglés sur « Jamais » : aucun récap.
    expect(recapsTo(samAccount.email)).toEqual([])
  })

  // ─── « Nouveaux projets de tes proches » ───

  it('shows the new projects of the members I follow, three at most, with their title and author and a link', async () => {
    await follow(malikId)
    await follow(zoeId)
    const titles = ['Décollage !', 'Mon agent de recettes', 'Quel papillon ?', 'Le ciel de ce soir']
    const projects = [
      await publish(malik, titles[0] as string),
      await publish(zoe, titles[1] as string),
      await publish(malik, titles[2] as string),
      await publish(zoe, titles[3] as string),
    ]
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    const part = friendsPartOf(recap.text)
    // Les trois plus récents, et pas le quatrième.
    expect(RECAP_FRIEND_PROJECTS_MAX).toBe(3)
    expect(titles.filter((title) => part.includes(title))).toEqual(titles.slice(1))
    expect(part).toContain(malikAccount.name)
    expect(part).toContain(zoeAccount.name)
    expect(part).toContain(fr.recap.viewProject)
    // Chaque projet montré mène à sa page, une adresse fabriquée par le serveur.
    const hrefs = hrefsOf(recap.html)
    for (const project of projects.slice(1)) {
      expect(hrefs.some((href) => href?.startsWith(projectUrl(project.id)))).toBe(true)
    }
    expect(hrefs.some((href) => href?.startsWith(projectUrl(projects[0]?.id ?? '')))).toBe(false)
  })

  // Choix 7 du scénario : du nouveau dans une partie, quelle qu'elle soit, fait partir le récap.
  it('sends a recap when the only news is a new project of a member I follow', async () => {
    await follow(malikId)
    later(DAY)
    await publish(malik, 'Décollage !')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(fr.recap.friendsTitle)
    expect(recap.text).toContain('Décollage !')
    // Rien d'autre que ce qui est prévu : la partie, le titre, le nom, le lien (relecture R1).
    expectOnly(recap.text, [
      ...frameOf(inesAccount.name),
      fr.recap.friendsTitle,
      'Décollage !',
      malikAccount.name,
      fr.recap.viewProject,
    ])
  })

  it('sends no recap when nothing in it is new this week', async () => {
    await follow(malikId)
    await follow(samId, zoe)
    await publish(malik, 'Décollage !')
    await publish(malik, 'Quel papillon ?', TESTABLE)
    // Huit jours plus tard : les projets de Malik sont plus vieux que la fenêtre du récap.
    later(8 * DAY)
    const samAgain = await act.signInAgain(samAccount)
    // Témoin : Zoé suit Sam, qui publie cette semaine.
    await publish(samAgain, 'Jardin')
    later(HOUR)

    await runRecap()

    expect(recapsTo(inesAccount.email)).toEqual([])
    expect(onlyRecapTo(zoeAccount.email).text).toContain('Jardin')
  })

  // ─── « Ils cherchent des testeurs » ───

  it('offers the most recent testable project of a member I follow, unless I wrote it or test it, and leads to its page', async () => {
    await follow(malikId)
    await follow(zoeId)
    await publish(malik, 'Fusée', TESTABLE)
    const papillon = await publish(zoe, 'Papillon', TESTABLE)
    const tested = await publish(malik, 'Le plus récent', TESTABLE)
    // Inès est déjà testeuse du plus récent : il ne lui est pas proposé.
    later()
    expect((await act.send('POST', `/v1/projects/${tested.id}/testers`, ines)).status).toBe(204)
    // Son propre projet testable non plus.
    await publish(ines, 'Mon projet à tester', TESTABLE)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    const part = partOf(recap.text, fr.recap.testersWanted)
    expect(part).toContain('Papillon')
    expect(part).toContain(zoeAccount.name)
    expect(part).toContain(fr.recap.tryDemo)
    // Un seul projet proposé.
    for (const title of ['Fusée', 'Le plus récent', 'Mon projet à tester']) {
      expect(part, title).not.toContain(title)
    }
    // « Tester la démo » mène à la page du projet, jamais à la démo ni à la page de sortie.
    const at = recap.html.indexOf(`>${fr.recap.tryDemo}</a>`)
    const anchor = recap.html.slice(recap.html.lastIndexOf('<a', at), at)
    expect(/href="([^"]*)"/.exec(anchor)?.[1]?.startsWith(projectUrl(papillon.id))).toBe(true)
  })

  it('never offers in "they look for testers" a project whose author removed the recipient', async () => {
    await follow(malikId)
    await publish(malik, 'Fusée', TESTABLE)
    const papillon = await publish(malik, 'Papillon', TESTABLE)
    // Malik a retiré Inès des testeurs du Papillon (posé en base, comme l'écrit la route du coin).
    await ctx.db.insert(schema.projectTesterRemoval).values({
      projectId: papillon.id,
      memberId: inesId,
      createdAt: new Date(),
    })
    later(HOUR)

    await runRecap()

    const part = partOf(onlyRecapTo(inesAccount.email).text, fr.recap.testersWanted)
    expect(part).toContain('Fusée') // témoin : l'autre projet testable de Malik est proposé
    expect(part).not.toContain('Papillon')
  })

  it('leaves out a testable project older than the recap window', async () => {
    await follow(malikId)
    await publish(malik, 'Vieux papillon', TESTABLE)
    const meteo = await publish(ines, 'Météo')
    later(8 * DAY)
    // Témoin : un commentaire de cette semaine fait partir le récap.
    const zoeAgain = await act.signInAgain(zoeAccount)
    await act.comment(meteo.id, zoeAgain, 'Joli.')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(pill('pillComments', 1))
    for (const part of [recap.text, recap.html]) {
      expect(part).not.toContain(fr.recap.testersWanted)
      expect(part).not.toContain('Vieux papillon')
    }
  })

  it('never puts a demo address in the recap, even encoded in a link', async () => {
    await follow(malikId)
    await publish(malik, 'Papillon', TESTABLE)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain(fr.recap.tryDemo) // témoin : la partie est là
    const encoded = encodeURIComponent('https://papillon-demo.example')
    for (const part of [recap.subject, recap.text, recap.html]) {
      expect(part).not.toContain('papillon-demo')
      expect(part).not.toContain(encoded)
      expect(part).not.toContain(encodeURIComponent(encoded))
    }
    for (const href of hrefsOf(recap.html)) {
      expect(
        href?.startsWith(`${TEST_APP_URL}/`) || href?.startsWith(`${TEST_API_URL}/`),
        href,
      ).toBe(true)
      expect(href, href).not.toMatch(/\/out\b/)
    }
  })

  // ─── Ce qui ne sort jamais ───

  it('leaves out of both parts a project blocked either way, suspended, made private or removed before the send', async () => {
    const hugo = await ctx.verifiedMember({
      name: 'Hugo',
      email: 'hugo@example.com',
      password: 'hugo-long-password',
    })
    const hugoId = (await act.me(hugo)).id
    for (const id of [malikId, zoeId, samId, hugoId]) await follow(id)
    // Le témoin d'abord (le plus ancien) : seul projet permis, il est aussi le seul à tester.
    await publish(hugo, 'Témoin', TESTABLE)
    await publish(malik, 'Bloqué par Inès', TESTABLE)
    await publish(zoe, 'Bloque Inès', TESTABLE)
    await publish(sam, 'Suspendu', TESTABLE)
    const hidden = await publish(hugo, 'Devenu privé', TESTABLE)
    const removed = await publish(hugo, 'Retiré', TESTABLE)
    later()
    await act.block(malikId, ines)
    later()
    await act.block(inesId, zoe)
    // Un blocage efface les abonnements ; on les remet en base (un état qu'aucune route ne permet) :
    // sans eux, le test passerait sans le filtre des blocages.
    for (const memberId of [malikId, zoeId]) {
      await ctx.db
        .insert(schema.memberFollow)
        .values({ followerId: inesId, memberId, createdAt: new Date() })
        .onConflictDoNothing()
    }
    // Sam est suspendu, posé en base comme le ferait la modération.
    await ctx.db.insert(schema.accountSuspension).values({
      id: randomUUID(),
      userId: samId,
      decisionId: null,
      startsAt: new Date(),
      endsAt: null,
    })
    later()
    await act.setVisibility(hidden.id, hugo, 'private')
    // « Retiré » par la modération, posé en base (la décision, puis le projet).
    const decisionId = randomUUID()
    await ctx.db.insert(schema.moderationDecision).values({
      id: decisionId,
      targetKind: 'project',
      targetId: removed.id,
      action: 'remove',
      ground: 'rules',
      explanation: 'Publicité déguisée.',
      adminId: inesId,
      createdAt: new Date(),
      targetMemberId: hugoId,
    })
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date(), removalId: decisionId })
      .where(eq(schema.project.id, removed.id))
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(friendsPartOf(recap.text)).toContain('Témoin')
    expect(partOf(recap.text, fr.recap.testersWanted)).toContain('Témoin')
    for (const part of [recap.text, recap.html]) {
      for (const title of [
        'Bloqué par Inès',
        'Bloque Inès',
        'Suspendu',
        'Devenu privé',
        'Retiré',
      ]) {
        expect(part, title).not.toContain(title)
      }
    }
  })

  it('turns a domain in a tagline, a name and an alt text into [lien]', async () => {
    await follow(malikId)
    await act.updateProfile(malik, { name: 'Malik de malik-site.example' })
    const papillon = await publish(malik, 'Papillon sur papillon-titre.example', {
      ...TESTABLE,
      pitch: 'Mon accroche sur accroche-pirate.example',
    })
    await addPhoto(papillon.id, malik)
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    for (const part of [recap.subject, recap.text, recap.html]) {
      for (const domain of ['malik-site.example', 'papillon-titre.example', 'accroche-pirate']) {
        expect(part, domain).not.toContain(domain)
      }
      // L'accroche n'est pas dans le récap du tout (décision 1 de Louis).
      expect(part).not.toContain('Mon accroche')
    }
    expect(recap.text).toContain('[lien]')
    // Le texte de remplacement de la vignette est le titre, désarmé lui aussi.
    const alts = [...recap.html.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)].map((m) => m[1] ?? '')
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.some((alt) => alt.includes('[lien]'))).toBe(true)
  })

  it("never puts the pitch of another member's project in the recap", async () => {
    await follow(malikId)
    await publish(malik, 'Décollage !', { pitch: 'ZZACCROCHE un quiz sur l’espace' })
    await publish(malik, 'Papillon', { ...TESTABLE, pitch: 'ZZACCROCHE tu photographies' })
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain('Décollage !') // témoin : les parties sont là
    expect(recap.text).toContain(fr.recap.testersWanted)
    for (const part of [recap.subject, recap.text, recap.html]) {
      expect(part).not.toContain('ZZACCROCHE')
    }
  })

  // ─── La note unique ───

  it('tells once a member who got recaps before R8 what the recap now shows', async () => {
    // Inès recevait le récap avant R8 : sa date de récap est posée, pas celle du premier de R8.
    await ctx.db
      .insert(schema.emailPreference)
      .values({ userId: inesId, recapSentAt: new Date(Date.now() - 8 * DAY) })
    const meteo = await publish(ines, 'Météo')
    const velo = await publish(zoe, 'Vélo')
    later()
    await act.comment(meteo.id, malik, 'Super.')
    later()
    await act.comment(velo.id, malik, 'Joli vélo.')
    later(HOUR)

    await runRecap()

    const first = onlyRecapTo(inesAccount.email)
    expect(first.text).toContain(fill(fr.recap.news))
    expect(first.text).not.toContain(fill(fr.recap.first))
    // Zoé, nouvelle, a l'explication du premier récap, qui dit la même chose : une seule phrase.
    const forZoe = onlyRecapTo(zoeAccount.email)
    expect(forZoe.text).toContain(fill(fr.recap.first))
    expect(forZoe.text).not.toContain(fill(fr.recap.news))
    const [row] = await rows<{ recap_v2_at: unknown }>(
      sql`select recap_v2_at from email_preference where user_id = ${inesId}`,
    )
    expect(row?.recap_v2_at).not.toBeNull()

    // La semaine suivante : plus de note.
    later(WEEK)
    const malikAgain = await act.signInAgain(malikAccount)
    await act.comment(meteo.id, malikAgain, 'Encore.')
    later(HOUR)
    await runRecap()
    const recaps = recapsTo(inesAccount.email)
    expect(recaps).toHaveLength(2)
    expect(recaps[1]?.text).not.toContain(fill(fr.recap.news))
  })

  // ─── Les vignettes ───

  it('joins four images at most: two for my projects, one for the people I follow, one for testers', async () => {
    await follow(malikId)
    const own = [
      await publish(ines, 'Météo'),
      await publish(ines, 'Jardin', { primaryCategory: 'animals' }),
      await publish(ines, 'Vélo'),
    ]
    await addPhoto(own[0]?.id ?? '', ines)
    // Le plus récent en tête de « Tes projets » : Météo, puis Jardin, puis Vélo.
    for (const project of [...own].reverse()) {
      later()
      await act.comment(project.id, zoe, 'Bravo.')
    }
    // Papillon d'abord : le proche le plus récent (Fusée) prend la vignette des proches.
    await publish(malik, 'Papillon', TESTABLE)
    await publish(malik, 'Décollage !')
    await publish(malik, 'Fusée')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    const attachments = recap.attachments ?? []
    expect(attachments).toHaveLength(RECAP_IMAGES_MAX)
    // Des noms fabriqués, uniques : rien d'un texte de membre.
    expect(new Set(attachments.map((a) => a.cid)).size).toBe(attachments.length)
    for (const attachment of attachments) {
      expect(attachment.cid).toMatch(/^[a-z]+-\d+$/)
      expect(attachment.filename).toMatch(/^[a-z]+-\d+\.(jpg|png)$/)
      expect(['image/jpeg', 'image/png']).toContain(attachment.contentType)
    }
    // Chaque image est montrée une fois, par son cid, avec le titre du projet pour texte.
    const tags = [...recap.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    expect(tags).toHaveLength(RECAP_IMAGES_MAX)
    const imageOf = (title: string) => {
      const tag = tags.find((t) => t.includes(`alt="${title}"`))
      const cid = /src="cid:([^"]*)"/.exec(tag ?? '')?.[1]
      return attachments.find((a) => a.cid === cid)
    }
    // La photo de Météo, réduite en JPEG ; Jardin, sans photo, prend la tuile de sa catégorie.
    const meteo = imageOf('Météo')
    expect(meteo?.contentType).toBe('image/jpeg')
    expect(isJpeg(meteo?.content ?? new Uint8Array())).toBe(true)
    expect(meteo?.content.byteLength ?? 0).toBeLessThan(30_000)
    const jardin = imageOf('Jardin')
    expect(jardin?.contentType).toBe('image/png')
    expect(sameBytes(jardin?.content ?? new Uint8Array(), categoryTile('animals').content)).toBe(
      true,
    )
    // Le troisième projet n'a pas de vignette (deux pour « Tes projets ») ; un proche, un à tester.
    expect(imageOf('Vélo')).toBeUndefined()
    expect(imageOf('Papillon')).toBeDefined()
    expect(['Décollage !', 'Fusée'].filter((title) => imageOf(title) !== undefined)).toHaveLength(1)
  })

  it('uses the category tile instead of the photo of a project with an open report', async () => {
    await follow(malikId)
    await follow(zoeId)
    // Le Papillon de Zoé (avec photo) cherche des testeurs : sa photo est le témoin.
    const papillon = await publish(zoe, 'Papillon', TESTABLE)
    await addPhoto(papillon.id, zoe)
    // Le projet de Malik, le plus récent des proches, a une photo et un signalement ouvert.
    const signale = await publish(malik, 'Signalé', { primaryCategory: 'animals' })
    await addPhoto(signale.id, malik)
    later()
    await act.report(sam, { kind: 'project', id: signale.id }, 'scam_spam')
    later(HOUR)

    await runRecap()

    const recap = onlyRecapTo(inesAccount.email)
    const attachments = recap.attachments ?? []
    // La tuile « Animaux » pour le projet signalé ; une seule photo, celle du Papillon.
    expect(attachments.some((a) => sameBytes(a.content, categoryTile('animals').content))).toBe(
      true,
    )
    expect(attachments.filter((a) => a.contentType === 'image/jpeg')).toHaveLength(1)
  })

  // Relecture du plan (sécurité, écarté autrement) : un transport qui ne sait pas joindre d'images
  // refuse l'e-mail ; le récap part alors sans vignettes plutôt que pas du tout.
  it('sends the recap without images when the transport refuses attachments', async () => {
    const meteo = await publish(ines, 'Météo')
    await addPhoto(meteo.id, ines)
    later()
    await act.comment(meteo.id, malik, 'Super.')
    later(HOUR)
    // Le transport refuse tout e-mail qui porte des pièces jointes, et compte ses refus.
    let refused = 0
    const mailer: Mailer = {
      async send(email) {
        if ((email.attachments ?? []).length > 0) {
          refused++
          throw new Error('attachments are not supported')
        }
        await ctx.mailer.send(email)
      },
    }
    spyOnLogs()

    await runRecap(mailer)

    // Témoin : le récap a d'abord essayé avec sa vignette (une fois), puis il est parti sans.
    expect(refused).toBe(1)
    const recap = onlyRecapTo(inesAccount.email)
    expect(recap.text).toContain('Météo')
    expect(recap.attachments ?? []).toEqual([])
    expect(recap.html).not.toMatch(/<img/i)
  })
})
