// Tests de l'e-mail « tout de suite » (R8), qui remplace l'e-mail de mentions et de réponses de 6c.
// Scénario : docs/scenarios/refonte.md, « R8 — Les notifications », « Les e-mails tout de suite » ;
// relecture du plan : sec-A1 (la copie de `mention_sent_at`), sec-A3 et jur (désinscription en un
// clic), et ce qu'elle ajoute à l'e-mail (textes désarmés, objet sans retour du coin).
//
// Rien ne part « tout de suite » sans l'avoir demandé : chaque type est « Dans le récap » par défaut.
// Un membre peut régler sur « Tout de suite » les commentaires sur ses projets, les réponses et
// mentions, et le coin des testeurs (appels, retours, réponses, « Réglé »). La tâche,
// instantEmails({ db, mailer, appUrl, apiUrl, secret }, now), passe toutes les 5 minutes, comme
// l'ancienne : elle envoie ce qui attend depuis 15 minutes au moins, tous ces types regroupés en un
// seul e-mail, une fois par heure au plus. Ce qui part se calcule au moment de l'envoi. Les tests
// l'appellent eux-mêmes, à l'heure qu'ils choisissent (fausse horloge).
//
// Trois membres : Inès (qui reçoit), Malik et Zoé (qui commentent, répondent, testent). Inès publie
// « Météo », Zoé « Vélo » ; les deux projets sont « Testable », pour le coin des testeurs.
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq, sql } from 'drizzle-orm'
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
import { instantEmails } from './instant-emails'
import { weeklyRecap } from './weekly-recap'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let inesId: string
let zoeId: string
let velo: { id: string } // le projet de Zoé
let meteo: { id: string } // le projet d'Inès

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email
const typeNames = resources.fr.translation.notificationSettings.types

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }
const FEEDBACK_TEXT = 'Le score repart à zéro au niveau 3.'
const CALL_TEXT = 'Essayez le niveau 3 ce week-end, surtout sur téléphone.'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
  velo = await act.publish(zoe, 'Vélo', TESTABLE)
  meteo = await act.publish(ines, 'Météo', TESTABLE)
  later(MINUTE)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Règle des types sur « Tout de suite » (un PATCH par type : le contrat n'en prend qu'un). */
const instantFor = async (cookie: string, ...types: ('comments' | 'replies' | 'testers')[]) => {
  for (const type of types) await act.setPreferences(cookie, { [type]: 'now' })
}

const depsWith = (mailer: Mailer = ctx.mailer) => ({
  db: ctx.db,
  mailer,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})

/** Lance la tâche à l'heure de la fausse horloge (comme pg-boss, toutes les 5 minutes). */
const runInstant = (mailer?: Mailer) => instantEmails(depsWith(mailer), new Date())

/** L'adresse du lien de désinscription en un clic d'un e-mail, ou null. */
const oneClickUrl = (email: Email) => {
  const header = email.headers?.['List-Unsubscribe'] ?? ''
  const inside = header.slice(1, -1)
  return header.startsWith('<') && URL.canParse(inside) ? new URL(inside) : null
}

/**
 * L'objet de l'e-mail « tout de suite » change avec son contenu : on le reconnaît à son lien de
 * désinscription en un clic, signé pour la sorte `instant`.
 */
const isInstant = (email: Email) =>
  readUnsubscribeToken(TEST_AUTH_SECRET, oneClickUrl(email)?.searchParams.get('token') ?? '')
    ?.kind === 'instant'

/** Les e-mails « tout de suite » reçus par une adresse, dans l'ordre d'envoi. */
const instantTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && isInstant(email))

const onlyInstantTo = (address: string) => {
  const sent = instantTo(address)
  expect(sent).toHaveLength(1)
  return sent[0] as Email
}

type LineKind =
  | 'comment'
  | 'reply'
  | 'mention'
  | 'testerCall'
  | 'testerFeedback'
  | 'testerReplyToTester'
  | 'feedbackSettled'

/** La phrase d'une ligne : « Malik (@malik) a commenté « Météo » : ». */
const line = (
  kind: LineKind,
  title: string,
  name = 'Malik',
  handle = 'malik',
  t: { instant: Record<LineKind, string> } = fr,
) => fill(t.instant[kind], { name, handle, title })

/**
 * « Tu reçois cet e-mail parce que {{types}} est réglé… » : les deux morceaux autour de la liste des
 * types (que l'API écrit elle-même, guillemets compris), et le nom de chaque type.
 */
const expectReason = (text: string, types: (keyof typeof typeNames)[]) => {
  const template = types.length === 1 ? fr.instant.reason_one : fr.instant.reason_other
  for (const part of fill(template, { types: '{{types}}' }).split('{{types}}')) {
    expect(text).toContain(part.trim())
  }
  for (const type of types) expect(text).toContain(typeNames[type])
}

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

const spyOnLogs = () =>
  (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )

// --- Le coin des testeurs (les routes de R7a et R7b, testées ailleurs : ici, elles montent la scène) ---

const projectPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`

/** Rejoindre les testeurs d'un projet. */
const join = async (projectId: string, cookie: string) => {
  later()
  expect((await act.send('POST', `${projectPath(projectId)}/testers`, cookie)).status).toBe(204)
}

/** Un retour du testeur dans son fil ; rend l'identifiant du message. */
const sendFeedback = async (projectId: string, testerId: string, cookie: string) => {
  later()
  const res = await act.send(
    'POST',
    `${projectPath(projectId)}/threads/${encodeURIComponent(testerId)}/messages`,
    cookie,
    { kind: 'feedback', outcome: 'partly', device: 'phone', text: FEEDBACK_TEXT, captureId: null },
  )
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** L'auteur lance un appel à tester. */
const launchCall = async (projectId: string, cookie: string) => {
  later()
  const res = await act.send('POST', `${projectPath(projectId)}/calls`, cookie, {
    text: CALL_TEXT,
    photoId: null,
    photoDescription: null,
  })
  expect(res.status).toBe(201)
}

/** L'auteur règle un retour à la main. */
const settle = async (projectId: string, messageId: string, cookie: string) => {
  later()
  const res = await act.send(
    'POST',
    `${projectPath(projectId)}/messages/${encodeURIComponent(messageId)}/settled`,
    cookie,
  )
  expect(res.status).toBe(204)
}

/** Les deux dates d'envoi d'Inès, lues en base : la nouvelle et sa copie pour un retour à 380d1ca. */
const sentDates = async (userId: string) => {
  const [row] = await ctx.db
    .select({
      instant: schema.emailPreference.instantSentAt,
      mention: schema.emailPreference.mentionSentAt,
    })
    .from(schema.emailPreference)
    .where(eq(schema.emailPreference.userId, userId))
  return row
}

describe('when the e-mail goes out', () => {
  it('waits 15 minutes after a comment on her project, then sends it with its excerpt', async () => {
    await instantFor(ines, 'comments')
    const comment = await act.comment(meteo.id, malik, 'Super idée, la carte des nuages !')

    later(14 * MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toEqual([])

    later(2 * MINUTE)
    await runInstant()
    const email = onlyInstantTo(inesAccount.email)
    expect(email.subject).toBe(fill(fr.instant.subjectComment, { name: 'Malik', title: 'Météo' }))
    expect(email.text).toContain(line('comment', 'Météo'))
    expect(email.text).toContain('Super idée, la carte des nuages !')
    // La ligne mène au commentaire, en contexte, dans l'appli.
    expect(email.text).toContain(`${TEST_APP_URL}/projects/${meteo.id}?comment=${comment.id}`)
    // Il dit pourquoi on le reçoit, et comment l'arrêter.
    expectReason(email.text, ['comments'])
    expect(email.text).toContain(fr.instant.unsubscribe)
    expect(email.text).toContain(`${TEST_APP_URL}/settings/notifications`)
  })

  it('gathers in one e-mail every type set to « now », whatever arrived in the meantime', async () => {
    await instantFor(ines, 'comments', 'replies', 'testers')
    await join(meteo.id, zoe)
    const own = await act.comment(velo.id, ines, 'Je propose une carte.')
    later()
    await act.comment(meteo.id, malik, 'Bravo pour la météo.')
    later(5 * MINUTE)
    await act.comment(velo.id, zoe, 'Bonne idée, la carte.', own.id)
    later(5 * MINUTE)
    await act.comment(velo.id, malik, 'Et ici, @ines_morel ?')
    later()
    await sendFeedback(meteo.id, zoeId, zoe)
    later(6 * MINUTE)

    // Le premier commentaire a 16 minutes : tout ce qui attend part avec lui, même le dernier.
    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain(line('comment', 'Météo'))
    expect(email.text).toContain(line('reply', 'Vélo', 'Zoé', 'zoe'))
    expect(email.text).toContain(line('mention', 'Vélo'))
    expect(email.text).toContain(line('testerFeedback', 'Météo', 'Zoé', 'zoe'))
    expect(email.text).toContain('Bonne idée, la carte.')
    expectReason(email.text, ['comments', 'replies', 'testers'])
  })

  it('sends one e-mail an hour at most, then only what is new', async () => {
    await instantFor(ines, 'replies')
    await act.comment(velo.id, malik, '@ines_morel premier message.')
    later(16 * MINUTE)
    await runInstant()
    const firstAt = Date.now()
    later(4 * MINUTE)
    await act.comment(velo.id, zoe, '@ines_morel second message.')

    vi.setSystemTime(firstAt + 20 * MINUTE)
    await runInstant()
    vi.setSystemTime(firstAt + HOUR - MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toHaveLength(1)

    vi.setSystemTime(firstAt + HOUR + MINUTE)
    await runInstant()
    const sent = instantTo(inesAccount.email)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain('second message')
    expect(sent[1]?.text).not.toContain('premier message')
  })

  it('counts the minutes in UTC, whatever the time zone of the database', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'À l’heure de Paris.')
    // Le fuseau de la connexion change : une date mal comparée (timestamptz contre timestamp) se
    // décalerait de deux heures (Paris est à UTC+2 en juin), et l'e-mail partirait trop tôt.
    await ctx.db.execute(sql`set time zone 'Europe/Paris'`)

    later(14 * MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toEqual([])

    later(2 * MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toHaveLength(1)
  })

  it('notes the time of the send, and copies it for the version before R8', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Une date à noter.')
    later(16 * MINUTE)
    const now = new Date()

    await instantEmails(depsWith(), now)

    expect(instantTo(inesAccount.email)).toHaveLength(1)
    // `mention_sent_at` suit `instant_sent_at` jusqu'à R9 (sec-A1) : après un retour à la version
    // d'avant, l'ancienne tâche ne renvoie pas ce qui vient de partir.
    expect(await sentDates(inesId)).toEqual({ instant: now, mention: now })
  })
})

describe('when nothing goes out', () => {
  it('is off by default: every type waits for the recap', async () => {
    await instantFor(ines, 'replies')
    await act.comment(velo.id, malik, '@ines_morel et @zoe, regardez.')
    later()
    await act.comment(velo.id, malik, 'Un commentaire chez Zoé.')
    later(16 * MINUTE)

    await runInstant()

    expect(await act.preferences(zoe)).toEqual({
      weeklyRecap: true,
      reactions: 'digest',
      comments: 'digest',
      replies: 'digest',
      follows: 'digest',
      updates: 'digest',
      testers: 'digest',
    })
    expect(instantTo(zoeAccount.email)).toEqual([])
    // Témoin : Inès, qui l'a demandé pour les réponses et mentions, le reçoit.
    expect(instantTo(inesAccount.email)).toHaveLength(1)
  })

  it('sends only the types set to « now »', async () => {
    // Inès : le coin des testeurs « Tout de suite » ; les commentaires et les mentions au récap.
    await instantFor(ines, 'testers')
    await act.comment(meteo.id, malik, 'Un commentaire sur Météo.')
    later()
    await act.comment(velo.id, malik, '@ines_morel une mention.')
    later(16 * MINUTE)

    await runInstant()

    expect(instantTo(inesAccount.email)).toEqual([])
  })

  it('sends nothing for what the member already saw in the app', async () => {
    await instantFor(ines, 'replies')
    await instantFor(zoe, 'comments')
    await act.comment(velo.id, malik, '@ines_morel regarde.')
    later(5 * MINUTE)
    await act.openNotifications(ines)
    later(11 * MINUTE)

    await runInstant()

    expect(instantTo(inesAccount.email)).toEqual([])
    // Témoin : Zoé, dont c'est le projet, n'a pas ouvert son Activité.
    expect(instantTo(zoeAccount.email)).toHaveLength(1)
  })

  it('sends nothing beyond 24 hours: an old comment never comes back', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Ancien message.')
    later(24 * HOUR + MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toEqual([])

    await act.comment(meteo.id, malik, 'Nouveau message.')
    later(16 * MINUTE)
    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain('Nouveau message')
    expect(email.text).not.toContain('Ancien message')
  })

  it('sends nothing for a comment that disappeared: deleted, hidden or on a private project', async () => {
    await instantFor(ines, 'replies')
    const recettes = await act.publish(zoe, 'Recettes')
    const jardin = await act.publish(zoe, 'Jardin')
    const potager = await act.publish(malik, 'Potager')
    later()
    const deleted = await act.comment(velo.id, malik, '@ines_morel effacé.')
    later()
    await act.deleteComment(velo.id, deleted.id, malik)
    later()
    const hidden = await act.comment(recettes.id, malik, '@ines_morel masqué.')
    later()
    await act.hide(recettes.id, hidden.id, zoe)
    later()
    await act.comment(jardin.id, malik, '@ines_morel devenu privé.')
    later()
    await act.setVisibility(jardin.id, zoe, 'private')
    later()
    // Témoin : la mention sur Potager reste.
    await act.comment(potager.id, malik, '@ines_morel toujours là.')
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain('toujours là')
    for (const gone of ['effacé', 'masqué', 'devenu privé', 'Vélo', 'Recettes', 'Jardin']) {
      expect(email.text).not.toContain(gone)
      expect(email.html).not.toContain(gone)
    }
  })

  it('sends nothing when the type left « now » before the send', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Bravo pour la météo.')
    later(5 * MINUTE)
    // Inès repasse les commentaires « Dans le récap » pendant l'attente.
    await act.setPreferences(ines, { comments: 'digest' })
    later(11 * MINUTE)

    await runInstant()

    expect(instantTo(inesAccount.email)).toEqual([])
  })
})

describe('the testers corner', () => {
  it('gives no text of a feedback or a call, only who and on which project', async () => {
    await instantFor(ines, 'testers')
    await join(meteo.id, zoe)
    await join(velo.id, ines)
    await sendFeedback(meteo.id, zoeId, zoe)
    await launchCall(velo.id, zoe)
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain(line('testerFeedback', 'Météo', 'Zoé', 'zoe'))
    expect(email.text).toContain(line('testerCall', 'Vélo', 'Zoé', 'zoe'))
    // Le fil est privé, et une messagerie le garderait : le texte reste dans l'appli.
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain('Le score repart')
      expect(part).not.toContain('niveau 3')
    }
    expect(email.text).toContain(fr.instant.private)
  })

  it('tells the tester his feedback was settled', async () => {
    await instantFor(ines, 'testers')
    await join(velo.id, ines)
    const message = await sendFeedback(velo.id, inesId, ines)
    await settle(velo.id, message, zoe)
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain(line('feedbackSettled', 'Vélo', 'Zoé', 'zoe'))
    expect(email.text).not.toContain('Le score repart')
  })

  it('never names a message of the corner in the subject', async () => {
    await instantFor(ines, 'comments', 'testers')
    await join(meteo.id, zoe)
    await sendFeedback(meteo.id, zoeId, zoe)
    later(16 * MINUTE)

    await runInstant()

    // Un retour seul : l'objet ne dit ni qui, ni sur quel projet.
    const alone = onlyInstantTo(inesAccount.email)
    expect(alone.subject).toBe(fill(fr.instant.subjectNews_one))
    expect(alone.subject).not.toContain('Zoé')
    expect(alone.subject).not.toContain('Météo')

    // Un retour, puis un commentaire, dans le même e-mail : l'objet ne nomme jamais Zoé.
    later(HOUR)
    await sendFeedback(meteo.id, zoeId, zoe)
    later()
    await act.comment(meteo.id, malik, 'Bravo pour la météo.')
    later(16 * MINUTE)
    await runInstant()

    const sent = instantTo(inesAccount.email)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain(line('comment', 'Météo'))
    expect(sent[1]?.subject).not.toContain('Zoé')
    expect(sent[1]?.subject).not.toContain('Le score')
  })
})

describe('only once', () => {
  it('sends one e-mail only when the task runs twice at the same time', async () => {
    await instantFor(ines, 'replies')
    await act.comment(velo.id, malik, '@ines_morel une fois.')
    later(16 * MINUTE)
    const now = new Date()

    await instantEmails(depsWith(), now)
    await instantEmails(depsWith(), now)
    // PGlite n'a qu'une connexion : les deux passent l'une après l'autre ; c'est la prise atomique
    // de la date d'envoi qui doit décider.
    await Promise.all([instantEmails(depsWith(), now), instantEmails(depsWith(), now)])

    expect(instantTo(inesAccount.email)).toHaveLength(1)
  })

  it('sends nothing to a member who unsubscribes while the e-mails go out', async () => {
    await instantFor(ines, 'replies')
    await instantFor(zoe, 'replies')
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const ids = new Map([
      [inesAccount.email, inesId],
      [zoeAccount.email, zoeId],
    ])
    let unsubscribed = false
    const mailer: Mailer = {
      async send(email) {
        if (!unsubscribed) {
          unsubscribed = true
          const other = [...ids].find(([address]) => address !== email.to)?.[1] ?? ''
          const token = createUnsubscribeToken(TEST_AUTH_SECRET, other, 'instant')
          const res = await ctx.request(`/v1/email/unsubscribe?${new URLSearchParams({ token })}`, {
            method: 'POST',
          })
          expect(res.status).toBe(204)
        }
        await ctx.mailer.send(email)
      },
    }

    await runInstant(mailer)

    expect([...instantTo(inesAccount.email), ...instantTo(zoeAccount.email)]).toHaveLength(1)
  })

  it('goes on with the other members when one of them fails, and logs it without the address', async () => {
    await instantFor(ines, 'replies')
    await instantFor(zoe, 'replies')
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const logs = spyOnLogs()
    const mailer: Mailer = {
      async send(email) {
        if (email.to === zoeAccount.email) throw new Error(`refused: ${email.to}`)
        await ctx.mailer.send(email)
      },
    }

    await runInstant(mailer)

    expect(instantTo(inesAccount.email)).toHaveLength(1)
    expect(logs.some((spy) => spy.mock.calls.length > 0)).toBe(true)
    expect(JSON.stringify(logs.map((spy) => spy.mock.calls))).not.toContain(zoeAccount.email)
  })

  it('sends nothing to an account that is not verified', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Regarde.')
    later(16 * MINUTE)
    await ctx.db.execute(sql`update "user" set email_verified = false where id = ${inesId}`)

    await runInstant()

    expect(instantTo(inesAccount.email)).toEqual([])
    expect(await ctx.db.select().from(schema.user)).toHaveLength(3)
  })

  // Repris de 6c (relecture de sécurité, A7) : le récap peut passer pendant la tâche. Un même
  // événement ne part jamais deux fois par e-mail, tout de suite puis dans le récap.
  it('never sends an event twice when the recap goes out while the e-mails go out', async () => {
    await instantFor(ines, 'replies')
    await instantFor(zoe, 'replies')
    const potager = await act.publish(malik, 'Potager')
    later()
    await act.comment(potager.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const now = new Date()
    // Au premier e-mail « tout de suite » envoyé, le récap passe (même heure) : il sert l'autre
    // membre, que la tâche n'a pas encore traité.
    let ran = false
    const mailer: Mailer = {
      async send(email) {
        if (!ran) {
          ran = true
          await weeklyRecap(depsWith(), now)
        }
        await ctx.mailer.send(email)
      },
    }

    await instantEmails(depsWith(mailer), now)

    for (const address of [inesAccount.email, zoeAccount.email]) {
      const withTheMention = ctx.mailer.sent.filter(
        (email) => email.to === address && `${email.text}${email.html}`.includes('Potager'),
      )
      expect(withTheMention, address).toHaveLength(1)
    }
  })

  it('never puts in the recap what already went out at once', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Bravo pour la météo.')
    later(16 * MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toHaveLength(1)
    later(HOUR)

    await weeklyRecap(depsWith(), new Date())

    const withTheComment = ctx.mailer.sent.filter(
      (email) =>
        email.to === inesAccount.email &&
        (email.text.includes('Bravo pour la météo') || email.text.includes('Malik')),
    )
    expect(withTheComment).toHaveLength(1)
  })

  // Repris de 6c (relecture de sécurité de e414e88, A5) : ce qui est écrit pendant la tâche est daté
  // après le `now` noté comme date d'envoi : il part au passage suivant, une seule fois.
  it('sends a comment written while the task runs once, at the next run', async () => {
    await instantFor(ines, 'replies')
    await act.comment(velo.id, malik, '@ines_morel premier message.')
    later(16 * MINUTE)
    const now = new Date()
    later() // now + 1 s : la tâche lancée à `now` n'a pas encore lu Inès
    await act.comment(velo.id, zoe, '@ines_morel écrit pendant la tâche.')

    await instantEmails(depsWith(), now)
    const first = onlyInstantTo(inesAccount.email)
    expect(first.text).toContain('premier message')
    expect(first.text).not.toContain('pendant la tâche')

    vi.setSystemTime(now.getTime() + HOUR + MINUTE)
    await runInstant()
    const sent = instantTo(inesAccount.email)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain('pendant la tâche')
    expect(sent[1]?.text).not.toContain('premier message')

    // Et plus jamais ensuite.
    vi.setSystemTime(now.getTime() + 2 * HOUR + 2 * MINUTE)
    await runInstant()
    expect(instantTo(inesAccount.email)).toHaveLength(2)
  })
})

describe('what the e-mail shows', () => {
  it('carries the one-click unsubscribe headers of an instant link', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Regarde.')
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const url = oneClickUrl(email)
    expect(url && url.origin + url.pathname).toBe(`${TEST_API_URL}/v1/email/unsubscribe`)
    const token = url?.searchParams.get('token') ?? ''
    expect(readUnsubscribeToken(TEST_AUTH_SECRET, token)).toEqual({
      userId: inesId,
      kind: 'instant',
    })
    // Le bouton de la messagerie ne choisit rien : l'adresse ne porte pas de `choice`.
    expect(url?.searchParams.has('choice')).toBe(false)
    expect(email.text).toContain(token)
  })

  it('moves every "now" type to digest on a one-click POST from the List-Unsubscribe header', async () => {
    await instantFor(ines, 'comments', 'replies')
    await act.setPreferences(ines, { testers: 'never' })
    await act.comment(meteo.id, malik, 'Regarde.')
    later(16 * MINUTE)
    await runInstant()
    const url = oneClickUrl(onlyInstantTo(inesAccount.email))

    // Le POST de la messagerie (RFC 8058) : l'adresse de l'en-tête, telle quelle, sans cookie.
    const res = await ctx.app.request(`${url?.pathname}${url?.search}`, {
      method: 'POST',
      headers: {
        'x-real-ip': '198.51.100.20',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toMatchObject({
      weeklyRecap: true,
      comments: 'digest',
      replies: 'digest',
      // Jamais un « Jamais » relevé.
      testers: 'never',
    })
  })

  it('has only links to the app or the API, no image, and the language of the page', async () => {
    await instantFor(ines, 'comments')
    await act.comment(meteo.id, malik, 'Regarde.')
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    const hrefs = hrefsOf(email.html)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(
        href?.startsWith(`${TEST_APP_URL}/`) || href?.startsWith(`${TEST_API_URL}/`),
        href,
      ).toBe(true)
    }
    expect(email.html).not.toMatch(/<img/i)
    expect(email.html).toContain('<html lang="fr"')
  })

  it('shows no address written by a member: in the excerpt, the name, the title or the subject', async () => {
    await instantFor(ines, 'replies')
    await act.updateProfile(malik, { name: 'support.example.com' })
    const promo = await act.publish(zoe, 'Promo shop.example.net')
    later()
    await act.comment(
      promo.id,
      malik,
      '@ines_morel ton compte sera fermé : reconnecte-toi sur https://evil.example/login ou waiggle-login.com',
    )
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    for (const part of [email.subject, email.text, email.html]) {
      for (const address of [
        'evil.example',
        'waiggle-login.com',
        'support.example.com',
        'shop.example.net',
      ]) {
        expect(part).not.toContain(address)
      }
    }
    expect(email.text).toContain('[lien]')
    expect(email.text).toContain('(@malik)')
  })

  it('cuts the excerpt of a long comment', async () => {
    await instantFor(ines, 'comments')
    const start = 'Le début du commentaire se lit dans l’e-mail'
    await act.comment(meteo.id, malik, `${start}${' encore'.repeat(15)} FINCACHEE`)
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain(start)
    expect(email.text).not.toContain('FINCACHEE')
    expect(email.html).not.toContain('FINCACHEE')
  })

  it('escapes the HTML hidden in an excerpt', async () => {
    await instantFor(ines, 'replies')
    await act.comment(velo.id, malik, '@ines_morel <img src=x onerror=alert(1)>')
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.html).not.toMatch(/<img/i)
    expect(email.html).toContain('&lt;img')
  })

  it('is written in the language of the member', async () => {
    await instantFor(ines, 'comments')
    await act.updateProfile(ines, { language: 'en' })
    await act.comment(meteo.id, malik, 'Look.')
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.subject).toBe(fill(en.instant.subjectComment, { name: 'Malik', title: 'Météo' }))
    expect(email.text).toContain(line('comment', 'Météo', 'Malik', 'malik', en))
    expect(email.text).toContain(en.instant.unsubscribe)
    expect(email.html).toContain('<html lang="en"')
  })
})

// ─── Bloquer (tranche 7b) ────────────────────────────────────────────────────────────────────────

// Scénario « Tranche 7b — Bloquer » : une mention venant d'un membre bloqué, dans un sens ou dans
// l'autre, ne part pas par e-mail ; l'e-mail se calcule au moment de l'envoi, donc un blocage posé
// pendant les 15 minutes d'attente suffit. Une mention d'un autre membre part toujours.
describe('the instant e-mail and blocks', () => {
  it.each([
    ['Inès blocked Malik', 'ines'],
    ['Malik blocked Inès', 'malik'],
  ])('does not send the mention of Malik when %s', async (_, who) => {
    await instantFor(ines, 'replies', 'comments')
    const malikId = (await act.me(malik)).id
    await act.comment(velo.id, malik, '@ines_morel tu as vu la pluie de demain ?')
    later()
    await act.comment(meteo.id, malik, 'Un commentaire de Malik sur Météo.')
    later()
    await act.comment(velo.id, zoe, '@ines_morel et la grêle ?')
    later()
    if (who === 'ines') await act.block(malikId, ines)
    else await act.block(inesId, malik)

    later(16 * MINUTE)
    await runInstant()

    const email = onlyInstantTo(inesAccount.email)
    expect(email.text).toContain(line('mention', 'Vélo', 'Zoé', 'zoe'))
    expect(email.text).not.toContain('Malik')
    expect(email.text).not.toContain('la pluie de demain')
  })

  it('sends nothing when the only mention comes from a blocked member', async () => {
    await instantFor(ines, 'replies')
    await act.comment(velo.id, malik, '@ines_morel tu as vu la pluie de demain ?')
    await act.block((await act.me(malik)).id, ines)

    later(16 * MINUTE)
    await runInstant()

    expect(instantTo(inesAccount.email)).toEqual([])
  })
})
