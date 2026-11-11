// Tests d'intégration de la tranche R7b : les fils de retours, un fil privé entre chaque testeur et
// l'auteur (GET /v1/projects/{id}/threads, GET et POST …/threads/{testerId}/messages, POST
// …/threads/{testerId}/read, DELETE …/messages/{messageId}, POST et DELETE
// …/messages/{messageId}/settled, GET …/feedback/open). Scénario : docs/scenarios/refonte.md,
// section R7b, « Les retours » et « Réglé dans la v1.3 » ; décisions de Louis du 11/11/2026 (3 : les
// filtres « À traiter » / « Réglés » ; 4 : « Remettre à traiter » ; 6 et 2 : un blocage vaut un
// départ, l'ancien testeur garde son fil en lecture seule) ; relecture de sécurité du plan : B1 et A8
// (les quotas avant tout examen), A7 (régler pendant une suspension : 409), A9 (les messages retirés
// ignorés par la liste), A10 (« Réglé » sans la mise à jour retirée), A11 (ni pseudo ni photo à
// travers un blocage), A14 (l'auteur ne répond que dans un fil où le testeur a écrit) ; relecture
// juridique J11 (jamais d'accusé de lecture).
// Les mises à jour qui règlent des retours sont testées par updates.test.ts, les captures et leur
// service par tester-media.test.ts, les notifications par notifications.test.ts, les signalements
// par reports.test.ts.
//
// Six membres : Papi Jean (l'auteur), Inès et Malik (ses testeurs ; Malik a aussi son propre
// projet), Sami (ni l'un ni l'autre), Louis (l'administrateur). Un retrait par la modération est
// posé en base, comme le ferait la décision : la route de la modération est testée ailleurs, et ces
// tests ne doivent dépendre que des routes des fils.
import {
  ErrorResponse,
  MESSAGE_TEXT_MAX,
  MESSAGES_PAGE_SIZE,
  OPEN_FEEDBACK_MAX,
  OpenFeedbackList,
  ProjectUpdate,
  TESTER_MESSAGES_PER_DAY,
  TESTER_SETTLES_PER_HOUR,
  TesterMedia,
  TesterMessage,
  TesterMessagePage,
  TesterThreadPage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let ines: string
let malik: string
let sami: string
let louis: string
let jeanId: string
let inesId: string
let malikId: string
let louisId: string

const START = Date.parse('2026-11-02T08:00:00.000Z')
const MINUTE = 60 * 1000
const DAY = 24 * 60

// Les caractères invisibles, fabriqués par leur numéro : écrits tels quels, on ne les relirait pas.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  jean = await ctx.verifiedMember({
    name: 'Papi Jean',
    email: 'jean@example.com',
    password: 'jean-long-password',
  })
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  sami = await ctx.verifiedMember({
    name: 'Sami',
    email: 'sami@example.com',
    password: 'sami-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  jeanId = (await act.me(jean)).id
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

/** Un identifiant bien formé, qui ne désigne rien. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

const publishProject = (cookie = jean, title = 'Décollage !') =>
  act.publish(cookie, title, { pitch: 'Un quiz de l’espace pour les petits.', ...TESTABLE })

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

// --- Les adresses ---

const projectPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`
const threadPath = (projectId: string, testerId: string) =>
  `${projectPath(projectId)}/threads/${encodeURIComponent(testerId)}`
const messagePath = (projectId: string, messageId: string) =>
  `${projectPath(projectId)}/messages/${encodeURIComponent(messageId)}`

// --- Rejoindre, quitter, retirer (R7a et le coin, testés ailleurs : ici, ils montent la scène) ---

/** Rejoindre les testeurs, une minute après ce qui précède ; rend la date d'inscription. */
const join = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('POST', `${projectPath(projectId)}/testers`, cookie))
  return new Date().toISOString()
}

const quit = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('DELETE', `${projectPath(projectId)}/testers`, cookie))
}

/** L'auteur retire un membre de ses testeurs. */
const removeTester = async (projectId: string, memberId: string) => {
  later()
  await expectDone(
    await act.send(
      'DELETE',
      `${projectPath(projectId)}/testers/${encodeURIComponent(memberId)}`,
      jean,
    ),
  )
}

// --- Les messages ---

/** Un retour « En partie », sur téléphone, sans capture. */
const feedback = (changes: object = {}) => ({
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  text: 'Le score repart à zéro au niveau 3.',
  captureId: null,
  ...changes,
})

const reply = (text = 'Merci Inès, je regarde ça ce soir.') => ({ kind: 'reply', text })

/** Envoie un message dans le fil de ce testeur, une minute après ce qui précède ; réponse brute. */
const post = (projectId: string, testerId: string, cookie: string | null, body: unknown) => {
  later()
  return act.send('POST', `${threadPath(projectId, testerId)}/messages`, cookie, body)
}

/** Envoie un message qui doit être accepté, et le rend. */
const sent = async (projectId: string, testerId: string, cookie: string, body: object) => {
  const res = await post(projectId, testerId, cookie, body)
  expect(res.status).toBe(201)
  return TesterMessage.parse(await res.json())
}

/** Lit un fil ; réponse brute. */
const readThread = (projectId: string, testerId: string, cookie: string | null, cursor?: string) =>
  act.send(
    'GET',
    `${threadPath(projectId, testerId)}/messages${
      cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
    }`,
    cookie,
  )

/** Lit un fil et vérifie qu'il s'ouvre. */
const thread = async (projectId: string, testerId: string, cookie: string, cursor?: string) => {
  const res = await readThread(projectId, testerId, cookie, cursor)
  expect(res.status).toBe(200)
  return TesterMessagePage.parse(await res.json())
}

/** Les identifiants d'une page de fil, du plus récent au plus ancien. */
const idsOf = (page: TesterMessagePage) => page.items.map((message) => message.id)

/** La liste des fils de l'auteur ; réponse brute. `query` : « ?state=settled », par exemple. */
const listThreads = (projectId: string, cookie: string | null, query = '') =>
  act.send('GET', `${projectPath(projectId)}/threads${query}`, cookie)

const threads = async (projectId: string, cookie = jean, query = '') => {
  const res = await listThreads(projectId, cookie, query)
  expect(res.status).toBe(200)
  return TesterThreadPage.parse(await res.json())
}

const deleteMessage = (projectId: string, messageId: string, cookie: string | null) => {
  later()
  return act.send('DELETE', messagePath(projectId, messageId), cookie)
}

/** « Marquer comme réglé » (POST) ou « Remettre à traiter » (DELETE) ; réponse brute. */
const settle = (projectId: string, messageId: string, cookie: string | null = jean) => {
  later()
  return act.send('POST', `${messagePath(projectId, messageId)}/settled`, cookie)
}
const unsettle = (projectId: string, messageId: string, cookie: string | null = jean) => {
  later()
  return act.send('DELETE', `${messagePath(projectId, messageId)}/settled`, cookie)
}

/** Marque un fil comme lu ; réponse brute. */
const markRead = (projectId: string, testerId: string, cookie: string | null) => {
  later()
  return act.send('POST', `${threadPath(projectId, testerId)}/read`, cookie)
}

const readOpenFeedback = (projectId: string, cookie: string | null) =>
  act.send('GET', `${projectPath(projectId)}/feedback/open`, cookie)

const openFeedback = async (projectId: string, cookie = jean) => {
  const res = await readOpenFeedback(projectId, cookie)
  expect(res.status).toBe(200)
  return OpenFeedbackList.parse(await res.json())
}

/** Envoie une capture d'écran (POST …/testers/media, `kind=capture`) : elle reste en attente. */
const uploadCapture = async (projectId: string, cookie: string) => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'capture.jpg', { type: 'image/jpeg' }),
  )
  form.append('kind', 'capture')
  const res = await ctx.request(`${projectPath(projectId)}/testers/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  expect(res.status).toBe(201)
  return TesterMedia.parse(await res.json())
}

/** Les fichiers du coin dans le stockage du test (photos d'appel et captures). */
const testerFiles = () => [...ctx.storage.files.keys()].filter((key) => key.startsWith('testers/'))

// --- La modération et la suspension ---

const REMOVAL_TEXT = 'Ce message enfreint les règles de la communauté.'

/**
 * La modération retire un message : la décision et le retrait, écrits en base comme
 * reports/decide.ts le fait (la route de la modération est testée par reports.test.ts).
 */
const removeMessage = async (messageId: string, senderId: string) => {
  later()
  const decisionId = crypto.randomUUID()
  const at = new Date()
  await ctx.db.insert(schema.moderationDecision).values({
    id: decisionId,
    targetKind: 'message',
    targetId: messageId,
    action: 'remove',
    ground: 'rules',
    explanation: REMOVAL_TEXT,
    adminId: louisId,
    createdAt: at,
    targetMemberId: senderId,
  })
  await ctx.db
    .update(schema.testerMessage)
    .set({ removedAt: at, removalId: decisionId })
    .where(eq(schema.testerMessage.id, messageId))
  return at.toISOString()
}

/** La modération retire un projet entier (écrit en base, comme dans testers.test.ts). */
const removeProject = (projectId: string) =>
  ctx.db
    .update(schema.project)
    .set({ removedAt: new Date() })
    .where(eq(schema.project.id, projectId))

/** Louis suspend Papi Jean pour 7 jours. */
const suspendJean = async () => {
  later()
  await act.decide(louis, {
    action: 'suspend',
    memberId: jeanId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages répétés malgré les avertissements.',
  })
}

/** Range directement un compteur d'un membre, comme s'il avait déjà fait `count` demandes. */
const alreadyUsed = (key: string, count: number) =>
  ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

/** Le corps d'un 404 sur un projet inconnu : la référence de « comme un projet inconnu ». */
const unknownThreadBody = async (cookie: string) => {
  const res = await readThread(UNKNOWN, inesId, cookie)
  expect(res.status).toBe(404)
  return res.json()
}

describe('sending feedback', () => {
  it('lets a tester send feedback in his thread, read by him and by the author', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    const message = await sent(project.id, inesId, ines, feedback())
    const at = new Date().toISOString()

    expect(message).toEqual({
      id: expect.any(String),
      kind: 'feedback',
      sender: 'tester',
      outcome: 'partly',
      device: 'phone',
      text: 'Le score repart à zéro au niveau 3.',
      capture: null,
      createdAt: at,
      settled: null,
      removal: null,
      mine: true,
    })
    expect(await thread(project.id, inesId, ines)).toEqual({ items: [message], nextCursor: null })
    // L'auteur lit le même message, qui n'est pas le sien.
    expect(await thread(project.id, inesId, jean)).toEqual({
      items: [{ ...message, mine: false }],
      nextCursor: null,
    })
  })

  it('requires an outcome, the device and the text being optional', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    for (const body of [
      feedback({ outcome: undefined }),
      feedback({ outcome: null }),
      feedback({ outcome: 'maybe' }),
      feedback({ device: 'watch' }),
    ]) {
      await expectError(await post(project.id, inesId, ines, body), 400, 'validation')
    }
    expect((await thread(project.id, inesId, ines)).items).toEqual([])

    // « Ça a marché ? Oui » suffit : ni appareil, ni texte.
    const bare = await sent(
      project.id,
      inesId,
      ines,
      feedback({ outcome: 'yes', device: null, text: null }),
    )
    expect(bare).toMatchObject({ outcome: 'yes', device: null, text: null })
  })

  it('keeps line breaks, trims the text, takes 1 000 characters and refuses more', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    const trimmed = await sent(
      project.id,
      inesId,
      ines,
      feedback({ text: '  Le score repart à zéro.\nAu niveau 3.  ' }),
    )
    expect(trimmed.text).toBe('Le score repart à zéro.\nAu niveau 3.')
    const longest = await sent(
      project.id,
      inesId,
      ines,
      feedback({ text: 'é'.repeat(MESSAGE_TEXT_MAX) }),
    )
    expect(longest.text).toHaveLength(MESSAGE_TEXT_MAX)

    await expectError(
      await post(project.id, inesId, ines, feedback({ text: 'é'.repeat(MESSAGE_TEXT_MAX + 1) })),
      400,
      'validation',
    )
    await expectError(
      await post(project.id, inesId, ines, reply('é'.repeat(MESSAGE_TEXT_MAX + 1))),
      400,
      'validation',
    )
    expect((await thread(project.id, inesId, ines)).items).toHaveLength(2)
  })

  it('refuses an empty reply, one made of invisible characters, and unknown fields', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    for (const body of [
      reply(''),
      reply('   '),
      reply(ZERO_WIDTH_SPACE.repeat(3)),
      { kind: 'reply' },
      { ...reply(), outcome: 'yes' },
      feedback({ pinned: true }),
      { ...feedback(), kind: 'note' },
    ]) {
      await expectError(await post(project.id, inesId, ines, body), 400, 'validation')
    }
    expect((await thread(project.id, inesId, ines)).items).toEqual([])
  })

  it('refuses feedback from the author, who only replies', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())

    const res = await post(project.id, inesId, jean, feedback({ text: 'Un retour de l’auteur.' }))

    expect([400, 403]).toContain(res.status)
    expect((await thread(project.id, inesId, jean)).items).toHaveLength(1)
  })
})

describe('one thread per tester', () => {
  it('keeps one thread per tester, each tester reading only his own', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const fromInes = await sent(project.id, inesId, ines, feedback())
    const fromMalik = await sent(project.id, malikId, malik, feedback({ outcome: 'no' }))

    expect(idsOf(await thread(project.id, inesId, ines))).toEqual([fromInes.id])
    expect(idsOf(await thread(project.id, malikId, malik))).toEqual([fromMalik.id])

    // Malik ne lit pas le fil d'Inès, ni n'y écrit : comme un projet inconnu.
    const expected = await unknownThreadBody(malik)
    const other = await readThread(project.id, inesId, malik)
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(expected)
    expect((await post(project.id, inesId, malik, reply('Moi aussi !'))).status).toBe(404)
    expect((await post(project.id, inesId, malik, feedback())).status).toBe(404)
    expect(idsOf(await thread(project.id, inesId, ines))).toEqual([fromInes.id])

    // L'auteur voit les deux fils.
    const list = await threads(project.id)
    expect(list.items.map((item) => item.tester.id).sort()).toEqual([inesId, malikId].sort())
  })

  it('refuses another member and a visitor, and shows the feedback nowhere else', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sent(project.id, inesId, ines, feedback({ text: 'Le niveau xylophone plante.' }))
    const expected = await unknownThreadBody(sami)

    const other = await readThread(project.id, inesId, sami)
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(expected)
    expect((await post(project.id, inesId, sami, reply('Bonjour'))).status).toBe(404)
    await expectError(await readThread(project.id, inesId, null), 401, 'unauthorized')
    await expectError(await post(project.id, inesId, null, feedback()), 401, 'unauthorized')

    // Ni la page du projet, ni le fil, ni la recherche, ni Activité ne montrent le retour, à un
    // autre membre comme à un autre testeur.
    expect((await act.send('POST', `${projectPath(project.id)}/follow`, sami)).status).toBe(204)
    for (const cookie of [sami, malik]) {
      for (const path of [
        projectPath(project.id),
        '/v1/feed/following',
        '/v1/search?q=xylophone',
        '/v1/notifications',
      ]) {
        const res = await act.send('GET', path, cookie)
        expect(res.status, path).toBe(200)
        expect(await res.text(), path).not.toContain('xylophone')
      }
    }
  })

  it('answers « not found » for an unknown or malformed project or tester', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    expect((await thread(project.id, inesId, ines)).items).toEqual([]) // témoin

    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await readThread(id, inesId, ines), 404, 'not_found')
      await expectError(await post(id, inesId, ines, feedback()), 404, 'not_found')
    }
    for (const testerId of ['inconnu', "x' or '1'='1"]) {
      await expectError(await readThread(project.id, testerId, jean), 404, 'not_found')
    }
  })

  it('refuses a tester and another member the thread list and the open feedback', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())

    expect([403, 404]).toContain((await listThreads(project.id, ines)).status)
    expect([403, 404]).toContain((await readOpenFeedback(project.id, ines)).status)
    await expectError(await listThreads(project.id, sami), 404, 'not_found')
    await expectError(await readOpenFeedback(project.id, sami), 404, 'not_found')
    await expectError(await listThreads(project.id, null), 401, 'unauthorized')
    await expectError(await readOpenFeedback(project.id, null), 401, 'unauthorized')
    expect((await threads(project.id)).items).toHaveLength(1) // témoin
  })

  it('reads a thread 30 by 30, from the most recent message, the next page from the cursor', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const written: string[] = []
    for (let i = 0; i < MESSAGES_PAGE_SIZE; i++) {
      written.push(
        (await sent(project.id, inesId, ines, feedback({ text: `Retour ${i + 1}.` }))).id,
      )
    }
    written.push((await sent(project.id, inesId, jean, reply())).id)
    const newestFirst = [...written].reverse()

    const page = await thread(project.id, inesId, ines)
    expect(idsOf(page)).toEqual(newestFirst.slice(0, MESSAGES_PAGE_SIZE))
    expect(page.nextCursor).not.toBeNull()
    const next = await thread(project.id, inesId, ines, page.nextCursor ?? '')
    expect(idsOf(next)).toEqual(newestFirst.slice(MESSAGES_PAGE_SIZE))
    expect(next.nextCursor).toBeNull()
  })
})

describe('replying', () => {
  it('lets the author reply, and the tester reply in turn', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const first = await sent(project.id, inesId, ines, feedback())

    const answer = await sent(project.id, inesId, jean, reply())
    expect(answer).toEqual({
      id: expect.any(String),
      kind: 'reply',
      sender: 'author',
      outcome: null,
      device: null,
      text: 'Merci Inès, je regarde ça ce soir.',
      capture: null,
      createdAt: new Date().toISOString(),
      settled: null,
      removal: null,
      mine: true,
    })
    const back = await sent(project.id, inesId, ines, reply('Super, merci Papi Jean !'))
    expect(back).toMatchObject({ kind: 'reply', sender: 'tester', mine: true })

    // Le plus récent en tête ; « mine » suit le lecteur, « sender » l'expéditeur.
    const forInes = await thread(project.id, inesId, ines)
    expect(forInes.items.map((m) => [m.id, m.sender, m.mine])).toEqual([
      [back.id, 'tester', true],
      [answer.id, 'author', false],
      [first.id, 'tester', true],
    ])
    const forJean = await thread(project.id, inesId, jean)
    expect(forJean.items.map((m) => [m.id, m.sender, m.mine])).toEqual([
      [back.id, 'tester', false],
      [answer.id, 'author', true],
      [first.id, 'tester', false],
    ])
  })

  it('refuses an author reply to a tester who never wrote', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    await expectError(await post(project.id, inesId, jean, reply()), 409, 'thread_closed')

    expect((await thread(project.id, inesId, ines)).items).toEqual([])
    // Témoin : dès qu'Inès a écrit, l'auteur lui répond.
    await sent(project.id, inesId, ines, feedback())
    await sent(project.id, inesId, jean, reply())
  })

  it('refuses an author reply to a member who does not test the project', async () => {
    const project = await publishProject()

    await expectError(await post(project.id, malikId, jean, reply()), 409, 'thread_closed')
    expect((await threads(project.id)).items).toEqual([])
  })
})

describe('a former tester', () => {
  it('keeps the thread readable to the author, without replies, after the tester quits', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    await quit(project.id, ines)

    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([message.id])
    await expectError(await post(project.id, inesId, jean, reply()), 409, 'thread_closed')
    const [row] = (await threads(project.id)).items
    expect(row?.tester).toMatchObject({ id: inesId, current: false, since: null })
  })

  it('lets a former tester list and delete the feedback they sent, the author replies included', async () => {
    // Le nom du plan disait « without the author replies » : la décision 2 de Louis (11/11/2026)
    // veut le fil entier, réponses de l'auteur comprises.
    const project = await publishProject()
    await join(project.id, ines)
    const mine = await sent(project.id, inesId, ines, feedback())
    const answer = await sent(project.id, inesId, jean, reply())
    await quit(project.id, ines)

    expect(idsOf(await thread(project.id, inesId, ines))).toEqual([answer.id, mine.id])
    // Lecture seule : ni retour, ni réponse.
    expect([404, 409]).toContain((await post(project.id, inesId, ines, feedback())).status)
    expect([404, 409]).toContain((await post(project.id, inesId, ines, reply('Encore moi'))).status)
    // Elle supprime le sien, jamais celui de l'auteur.
    expect([403, 404]).toContain((await deleteMessage(project.id, answer.id, ines)).status)
    await expectDone(await deleteMessage(project.id, mine.id, ines))

    expect(idsOf(await thread(project.id, inesId, ines))).toEqual([answer.id])
    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([answer.id])
  })

  it('lets a removed tester delete their own feedback, still readable by the author', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const kept = await sent(project.id, inesId, ines, feedback({ text: 'Un retour gardé.' }))
    const erased = await sent(project.id, inesId, ines, feedback({ text: 'Un retour effacé.' }))
    await removeTester(project.id, inesId)

    // Ses retours restent lisibles par l'auteur…
    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([erased.id, kept.id])
    // … jusqu'à ce qu'elle en supprime un.
    await expectDone(await deleteMessage(project.id, erased.id, ines))
    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([kept.id])
    expect(idsOf(await thread(project.id, inesId, ines))).toEqual([kept.id])
  })

  it('lets a removed tester delete his own feedback and its capture', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const capture = await uploadCapture(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback({ captureId: capture.id }))
    expect(testerFiles()).toHaveLength(1)
    await removeTester(project.id, inesId)

    await expectDone(await deleteMessage(project.id, message.id, ines))

    expect(testerFiles()).toEqual([])
    expect((await thread(project.id, inesId, jean)).items).toEqual([])
  })

  it('treats a block like a departure, in both directions', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const fromInes = await sent(project.id, inesId, ines, feedback())
    const fromMalik = await sent(project.id, malikId, malik, feedback())

    later()
    await act.block(jeanId, ines) // Inès bloque l'auteur
    later()
    await act.block(malikId, jean) // l'auteur bloque Malik

    for (const [cookie, testerId, message] of [
      [ines, inesId, fromInes],
      [malik, malikId, fromMalik],
    ] as const) {
      // L'auteur lit, sans répondre.
      expect(idsOf(await thread(project.id, testerId, jean))).toEqual([message.id])
      await expectError(await post(project.id, testerId, jean, reply()), 409, 'thread_closed')
      // Le testeur relit son fil, sans écrire (décision 2).
      expect(idsOf(await thread(project.id, testerId, cookie))).toEqual([message.id])
      expect([404, 409]).toContain((await post(project.id, testerId, cookie, feedback())).status)
    }
    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([fromInes.id])
  })

  it('gives the thread back to a tester who joins again, after quitting or after an unblock', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const oldInes = await sent(project.id, inesId, ines, feedback())
    const oldMalik = await sent(project.id, malikId, malik, feedback())
    await quit(project.id, ines)
    later()
    await act.block(jeanId, malik)
    later()
    await act.unblock(jeanId, malik)

    await join(project.id, ines)
    await join(project.id, malik)

    for (const [cookie, testerId, old] of [
      [ines, inesId, oldInes],
      [malik, malikId, oldMalik],
    ] as const) {
      const again = await sent(project.id, testerId, cookie, feedback({ outcome: 'yes' }))
      const answer = await sent(project.id, testerId, jean, reply('Content de te revoir !'))
      expect(idsOf(await thread(project.id, testerId, cookie))).toEqual([
        answer.id,
        again.id,
        old.id,
      ])
    }
  })
})

describe('deleting a message', () => {
  it('lets each one delete his own messages only', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const mine = await sent(project.id, inesId, ines, feedback())
    const answer = await sent(project.id, inesId, jean, reply())

    // L'auteur ne supprime pas le retour d'Inès, ni Inès la réponse de l'auteur.
    expect([403, 404]).toContain((await deleteMessage(project.id, mine.id, jean)).status)
    expect([403, 404]).toContain((await deleteMessage(project.id, answer.id, ines)).status)
    // Un autre testeur, un autre membre : comme un message inconnu.
    for (const cookie of [malik, sami]) {
      await expectError(await deleteMessage(project.id, mine.id, cookie), 404, 'not_found')
    }
    await expectError(await deleteMessage(project.id, mine.id, null), 401, 'unauthorized')
    for (const id of [UNKNOWN, 'pas-un-identifiant']) {
      await expectError(await deleteMessage(project.id, id, ines), 404, 'not_found')
    }
    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([answer.id, mine.id])

    // Chacun supprime le sien.
    await expectDone(await deleteMessage(project.id, answer.id, jean))
    await expectDone(await deleteMessage(project.id, mine.id, ines))
    expect((await thread(project.id, inesId, jean)).items).toEqual([])
  })

  it('refuses a message of another project cited under this one', async () => {
    const project = await publishProject()
    const other = await publishProject(jean, 'Le carnet de jardin')
    await join(project.id, ines)
    await join(other.id, ines)
    const elsewhere = await sent(other.id, inesId, ines, feedback())

    await expectError(await deleteMessage(project.id, elsewhere.id, ines), 404, 'not_found')
    await expectError(await settle(project.id, elsewhere.id), 404, 'not_found')

    expect(idsOf(await thread(other.id, inesId, ines))).toEqual([elsewhere.id])
  })

  it('erases the capture file with the message', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const capture = await uploadCapture(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback({ captureId: capture.id }))
    expect(message.capture?.id).toBe(capture.id)
    expect(testerFiles()).toHaveLength(1)

    await expectDone(await deleteMessage(project.id, message.id, ines))

    expect(testerFiles()).toEqual([])
  })
})

describe('the captures of a feedback', () => {
  it('attaches a pending capture of the tester, without a description', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const capture = await uploadCapture(project.id, ines)

    const message = await sent(project.id, inesId, ines, feedback({ captureId: capture.id }))

    expect(message.capture).toEqual({ ...capture, description: null })
    expect((await thread(project.id, inesId, jean)).items[0]?.capture?.id).toBe(capture.id)
  })

  it('never attaches one pending capture to two messages', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const capture = await uploadCapture(project.id, ines)
    await sent(project.id, inesId, ines, feedback({ captureId: capture.id }))

    const res = await post(project.id, inesId, ines, feedback({ captureId: capture.id }))

    await expectError(res, 400, 'invalid_photo')
    expect((await thread(project.id, inesId, ines)).items).toHaveLength(1)
  })

  it('refuses a capture of another tester, of another project, a call photo, or an unknown one', async () => {
    const project = await publishProject()
    const garden = await publishProject(jean, 'Le carnet de jardin')
    await join(project.id, ines)
    await join(project.id, malik)
    await join(garden.id, ines)
    const ofMalik = await uploadCapture(project.id, malik)
    const ofGarden = await uploadCapture(garden.id, ines)
    later()
    const form = new FormData()
    form.append(
      'file',
      new File([new Uint8Array(await jpegImage(400, 300))], 'p.jpg', { type: 'image/jpeg' }),
    )
    form.append('kind', 'call')
    const photoRes = await ctx.request(`${projectPath(project.id)}/testers/media`, {
      method: 'POST',
      headers: { cookie: jean },
      body: form,
    })
    expect(photoRes.status).toBe(201)
    const callPhoto = TesterMedia.parse(await photoRes.json())

    for (const [what, captureId] of [
      ['another tester', ofMalik.id],
      ['another project', ofGarden.id],
      ['a call photo', callPhoto.id],
      ['unknown', UNKNOWN],
    ] as const) {
      const res = await post(project.id, inesId, ines, feedback({ captureId }))
      expect(res.status, what).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code, what).toBe('invalid_photo')
    }
    expect((await thread(project.id, inesId, ines)).items).toEqual([])
    // Témoin : la capture de l'autre projet sert à un retour de ce projet-là.
    await sent(garden.id, inesId, ines, feedback({ captureId: ofGarden.id }))
  })
})

describe('unread threads', () => {
  it('marks a thread unread for the author until he reads it', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    expect((await threads(project.id)).items[0]?.unread).toBe(true)

    await expectDone(await markRead(project.id, inesId, jean))
    expect((await threads(project.id)).items[0]?.unread).toBe(false)

    // La réponse de l'auteur ne rend rien « non lu » ; un nouveau message du testeur, si.
    await sent(project.id, inesId, jean, reply())
    expect((await threads(project.id)).items[0]?.unread).toBe(false)
    await sent(project.id, inesId, ines, reply('Ça marche maintenant !'))
    expect((await threads(project.id)).items[0]?.unread).toBe(true)
  })

  it('lets the tester mark his own thread as read, and nobody else', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sent(project.id, inesId, ines, feedback())

    await expectDone(await markRead(project.id, inesId, ines))
    for (const cookie of [malik, sami]) {
      await expectError(await markRead(project.id, inesId, cookie), 404, 'not_found')
    }
    await expectError(await markRead(project.id, inesId, null), 401, 'unauthorized')
    // Ce qu'Inès a lu ne dit rien à l'auteur : son fil reste « non lu » pour lui.
    expect((await threads(project.id)).items[0]?.unread).toBe(true)
  })

  it('never tells the author whether a tester has read the thread', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    await sent(project.id, inesId, jean, reply())
    const pageBefore = await (await readThread(project.id, inesId, jean)).text()
    const listBefore = await (await listThreads(project.id, jean)).text()

    await expectDone(await markRead(project.id, inesId, ines))

    // Mot pour mot la même chose, avant et après sa lecture : aucun champ ne la trahit.
    expect(await (await readThread(project.id, inesId, jean)).text()).toBe(pageBefore)
    expect(await (await listThreads(project.id, jean)).text()).toBe(listBefore)
    expect(pageBefore).not.toMatch(/read/i)
  })

  it('never tells the tester whether the author has read the thread', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    const before = await (await readThread(project.id, inesId, ines)).text()

    await expectDone(await markRead(project.id, inesId, jean))

    expect(await (await readThread(project.id, inesId, ines)).text()).toBe(before)
    expect(before).not.toMatch(/read/i)
  })

  it('lets a suspended author mark a thread as read', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    await suspendJean()

    await expectDone(await markRead(project.id, inesId, jean))
    expect((await threads(project.id)).items[0]?.unread).toBe(false)
  })
})

describe('the thread list of the author', () => {
  it('describes each thread by its tester, its last message and its state', async () => {
    const project = await publishProject()
    const since = await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    const lastAt = new Date().toISOString()
    const { handle } = await act.me(ines)

    expect(await threads(project.id)).toEqual({
      items: [
        {
          tester: { id: inesId, name: 'Inès', handle, avatarUrl: null, current: true, since },
          lastAt,
          lastFrom: 'tester',
          unread: true,
          state: 'open',
          excerpt: 'Le score repart à zéro au niveau 3.',
        },
      ],
      nextCursor: null,
      counts: { open: 1, settled: 0 },
    })
  })

  it('lists the threads from the most recent message, and says who wrote it', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sent(project.id, inesId, ines, feedback())
    await sent(project.id, malikId, malik, feedback({ outcome: 'no', text: null }))
    expect((await threads(project.id)).items.map((item) => item.tester.id)).toEqual([
      malikId,
      inesId,
    ])

    await sent(project.id, inesId, jean, reply('Je regarde le niveau 3.'))

    const list = await threads(project.id)
    expect(list.items.map((item) => item.tester.id)).toEqual([inesId, malikId])
    expect(list.items[0]).toMatchObject({ lastFrom: 'author', excerpt: 'Je regarde le niveau 3.' })
    // Un retour sans texte n'a pas d'extrait.
    expect(list.items[1]).toMatchObject({ lastFrom: 'tester', excerpt: null })
  })

  it('cuts the excerpt to 80 characters', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback({ text: 'é'.repeat(300) }))

    const excerpt = (await threads(project.id)).items[0]?.excerpt ?? ''
    expect(excerpt.length).toBeLessThanOrEqual(81)
    expect(excerpt.startsWith('é'.repeat(70))).toBe(true)
  })

  it('files a thread with an open feedback under « À traiter », and an all-settled one under « Réglés »', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sent(project.id, inesId, ines, feedback())
    const settled = await sent(project.id, malikId, malik, feedback())
    await expectDone(await settle(project.id, settled.id))

    const open = await threads(project.id, jean, '?state=open')
    expect(open.items.map((item) => [item.tester.id, item.state])).toEqual([[inesId, 'open']])
    expect(open.counts).toEqual({ open: 1, settled: 1 })
    const done = await threads(project.id, jean, '?state=settled')
    expect(done.items.map((item) => [item.tester.id, item.state])).toEqual([[malikId, 'settled']])
    expect(done.counts).toEqual({ open: 1, settled: 1 })
    // Sans filtre : « À traiter ».
    expect(await threads(project.id)).toEqual(open)

    // Un nouveau retour remet le fil de Malik dans « À traiter » : un fil n'est que dans un filtre.
    await sent(project.id, malikId, malik, feedback({ outcome: 'no' }))
    expect((await threads(project.id)).counts).toEqual({ open: 2, settled: 0 })
    expect((await threads(project.id, jean, '?state=settled')).items).toEqual([])
  })

  it('refuses an unknown filter or cursor', async () => {
    const project = await publishProject()

    await expectError(await listThreads(project.id, jean, '?state=all'), 400, 'validation')
    await expectError(await listThreads(project.id, jean, '?cursor=%27%3B'), 400, 'validation')
    expect((await threads(project.id)).items).toEqual([]) // témoin
  })

  it('never shows a removed tester message in the author’s thread list', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const kept = await sent(project.id, inesId, ines, feedback({ text: 'Le score repart à zéro.' }))
    await expectDone(await settle(project.id, kept.id))
    await expectDone(await markRead(project.id, inesId, jean))
    const keptAt = kept.createdAt
    const removed = await sent(
      project.id,
      inesId,
      ines,
      feedback({ text: 'Un texte xylophone retiré.' }),
    )

    await removeMessage(removed.id, inesId)

    // Le retour retiré ne compte plus : ni extrait, ni date, ni « non lu », ni « À traiter ».
    const res = await listThreads(project.id, jean, '?state=settled')
    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(raw).not.toContain('xylophone')
    const [row] = TesterThreadPage.parse(JSON.parse(raw)).items
    expect(row).toMatchObject({
      lastAt: keptAt,
      unread: false,
      state: 'settled',
      excerpt: 'Le score repart à zéro.',
    })
    expect((await threads(project.id)).counts).toEqual({ open: 0, settled: 1 })
  })

  it('hides the handle and photo of a blocked former tester in the thread list', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const upload = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: ines },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(upload.status).toBe(200)
    await sent(project.id, inesId, ines, feedback())
    // Témoin : avant le blocage, l'auteur voit son pseudo et sa photo.
    const [before] = (await threads(project.id)).items
    expect(before?.tester.handle).not.toBeNull()
    expect(before?.tester.avatarUrl).not.toBeNull()

    later()
    await act.block(jeanId, ines)

    const res = await listThreads(project.id, jean)
    expect(res.status).toBe(200)
    const raw = await res.text()
    const [row] = TesterThreadPage.parse(JSON.parse(raw)).items
    expect(row?.tester).toEqual({
      id: inesId,
      name: 'Inès',
      handle: null,
      avatarUrl: null,
      current: false,
      since: null,
    })
    expect(raw).not.toContain(before?.tester.avatarUrl ?? 'avatar')
    expect(raw).not.toContain(`"${before?.tester.handle}"`)
  })
})

describe('a removed message', () => {
  it('shows a removed message to its sender only, with its removal', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const kept = await sent(project.id, inesId, ines, feedback({ text: 'Un retour resté.' }))
    const removed = await sent(project.id, inesId, ines, feedback({ text: 'Un retour retiré.' }))

    const at = await removeMessage(removed.id, inesId)

    const forInes = await thread(project.id, inesId, ines)
    expect(idsOf(forInes)).toEqual([removed.id, kept.id])
    expect(forInes.items[0]?.removal).toEqual({
      ground: 'rules',
      explanation: REMOVAL_TEXT,
      at,
      afterReport: false,
    })
    expect(forInes.items[1]?.removal).toBeNull()
    // L'auteur ne voit plus que le retour resté, et rien du retrait.
    const res = await readThread(project.id, inesId, jean)
    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(idsOf(TesterMessagePage.parse(JSON.parse(raw)))).toEqual([kept.id])
    expect(raw).not.toContain(removed.id)
  })

  it('shows a removed reply of the author to the author only', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const first = await sent(project.id, inesId, ines, feedback())
    const answer = await sent(project.id, inesId, jean, reply())

    await removeMessage(answer.id, jeanId)

    expect(idsOf(await thread(project.id, inesId, jean))).toEqual([answer.id, first.id])
    expect(idsOf(await thread(project.id, inesId, ines))).toEqual([first.id])
  })
})

describe('settling feedback', () => {
  it('lets the author mark a feedback as settled, read « Réglé » by the tester', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())

    await expectDone(await settle(project.id, message.id))
    const at = new Date().toISOString()

    const [mine] = (await thread(project.id, inesId, ines)).items
    expect(mine?.settled).toEqual({ at, update: null })
    expect((await thread(project.id, inesId, jean)).items[0]?.settled).toEqual({ at, update: null })
    expect((await threads(project.id, jean, '?state=settled')).items).toHaveLength(1)
  })

  it('puts a settled feedback back to « À traiter »', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    await expectDone(await settle(project.id, message.id))

    await expectDone(await unsettle(project.id, message.id))

    expect((await thread(project.id, inesId, ines)).items[0]?.settled).toBeNull()
    expect((await threads(project.id)).counts).toEqual({ open: 1, settled: 0 })
    expect((await openFeedback(project.id)).map((item) => item.id)).toEqual([message.id])
  })

  it('is idempotent both ways, and keeps the first date', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    await expectDone(await settle(project.id, message.id))
    const at = new Date().toISOString()

    await expectDone(await settle(project.id, message.id))
    expect((await thread(project.id, inesId, ines)).items[0]?.settled?.at).toBe(at)

    await expectDone(await unsettle(project.id, message.id))
    await expectDone(await unsettle(project.id, message.id))
    expect((await thread(project.id, inesId, ines)).items[0]?.settled).toBeNull()
  })

  it('refuses a tester and another member, and settles nothing', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const message = await sent(project.id, inesId, ines, feedback())

    expect([403, 404]).toContain((await settle(project.id, message.id, ines)).status)
    for (const cookie of [malik, sami]) {
      await expectError(await settle(project.id, message.id, cookie), 404, 'not_found')
      await expectError(await unsettle(project.id, message.id, cookie), 404, 'not_found')
    }
    await expectError(await settle(project.id, message.id, null), 401, 'unauthorized')
    for (const id of [UNKNOWN, 'pas-un-identifiant']) {
      await expectError(await settle(project.id, id), 404, 'not_found')
    }

    expect((await thread(project.id, inesId, ines)).items[0]?.settled).toBeNull()
    await expectDone(await settle(project.id, message.id)) // témoin
  })

  it('refuses to settle a reply or a removed feedback', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const removed = await sent(project.id, inesId, ines, feedback())
    const answer = await sent(project.id, inesId, jean, reply())
    const fromInes = await sent(project.id, inesId, ines, reply('Une réponse d’Inès.'))
    await removeMessage(removed.id, inesId)

    for (const id of [answer.id, fromInes.id, removed.id]) {
      expect([400, 404]).toContain((await settle(project.id, id)).status)
    }
    expect((await threads(project.id, jean, '?state=settled')).items).toEqual([])
  })

  it('refuses settling in a private or removed project with 409 corner_closed', async () => {
    const hidden = await publishProject()
    const removed = await publishProject(jean, 'Le carnet de jardin')
    await join(hidden.id, ines)
    await join(removed.id, ines)
    const inHidden = await sent(hidden.id, inesId, ines, feedback())
    const inRemoved = await sent(removed.id, inesId, ines, feedback())
    await act.setVisibility(hidden.id, jean, 'private')
    await removeProject(removed.id)

    await expectError(await settle(hidden.id, inHidden.id), 409, 'corner_closed')
    await expectError(await settle(removed.id, inRemoved.id), 409, 'corner_closed')
    await expectError(await unsettle(hidden.id, inHidden.id), 409, 'corner_closed')
    expect((await thread(hidden.id, inesId, jean)).items[0]?.settled).toBeNull()
  })

  it('refuses a suspended author settling or unsettling with 409 corner_closed', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const open = await sent(project.id, inesId, ines, feedback())
    const done = await sent(project.id, inesId, ines, feedback({ outcome: 'yes' }))
    await expectDone(await settle(project.id, done.id))
    await suspendJean()

    await expectError(await settle(project.id, open.id), 409, 'corner_closed')
    await expectError(await unsettle(project.id, done.id), 409, 'corner_closed')
    const items = (await thread(project.id, inesId, jean)).items
    expect(items.find((m) => m.id === open.id)?.settled).toBeNull()
    expect(items.find((m) => m.id === done.id)?.settled).not.toBeNull()
  })

  it('counts settle and unsettle in one quota, even malformed requests', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    // 120 par heure : il en a déjà fait 117 ; « Marquer comme réglé » fait la 118e.
    await alreadyUsed(memberCounterKeys(jeanId).testerSettle, TESTER_SETTLES_PER_HOUR - 3)
    await expectDone(await settle(project.id, message.id))

    await expectError(await settle(project.id, 'pas-un-identifiant'), 404, 'not_found') // 119
    await expectDone(await unsettle(project.id, message.id)) // 120

    const res = await settle(project.id, message.id)
    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    await expectError(await unsettle(project.id, message.id), 429, 'rate_limited')
    expect((await thread(project.id, inesId, ines)).items[0]?.settled).toBeNull()
  })

  it('shows « Réglé » without version when the update was removed', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    later()
    const res = await act.send('POST', `${projectPath(project.id)}/updates`, jean, {
      title: null,
      version: 'v1.3',
      lines: [{ family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' }],
      photos: [],
      beforeAfter: false,
      settledFeedbackIds: [message.id],
    })
    expect(res.status).toBe(201)
    const update = ProjectUpdate.parse(await res.json())
    const settledUpdate = { id: update.id, version: 'v1.3', createdAt: update.createdAt }
    expect((await thread(project.id, inesId, ines)).items[0]?.settled).toEqual({
      at: update.createdAt,
      update: settledUpdate,
    })

    // Sami signale la mise à jour, Louis la retire.
    later()
    await act.report(sami, { kind: 'update', id: update.id })
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'update', id: update.id },
      ground: 'rules',
      explanation: 'Cette mise à jour enfreint les règles de la communauté.',
    })

    // Inès lit « Réglé », sans la version ; l'auteur garde la mise à jour.
    expect((await thread(project.id, inesId, ines)).items[0]?.settled).toEqual({
      at: update.createdAt,
      update: null,
    })
    expect((await thread(project.id, inesId, jean)).items[0]?.settled).toEqual({
      at: update.createdAt,
      update: settledUpdate,
    })
  })
})

describe('the open feedback of a project', () => {
  it('lists the feedback still to handle, most recent first', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const first = await sent(project.id, inesId, ines, feedback({ text: 'Le niveau 3 plante.' }))
    const settled = await sent(project.id, inesId, ines, feedback({ outcome: 'yes' }))
    await sent(project.id, inesId, jean, reply())
    await sent(project.id, inesId, ines, reply('Une réponse, pas un retour.'))
    const removed = await sent(project.id, malikId, malik, feedback())
    const last = await sent(project.id, malikId, malik, feedback({ outcome: 'no', text: null }))
    await expectDone(await settle(project.id, settled.id))
    await removeMessage(removed.id, malikId)

    expect(await openFeedback(project.id)).toEqual([
      {
        id: last.id,
        tester: { name: 'Malik', current: true },
        outcome: 'no',
        excerpt: null,
        createdAt: last.createdAt,
      },
      {
        id: first.id,
        tester: { name: 'Inès', current: true },
        outcome: 'partly',
        excerpt: 'Le niveau 3 plante.',
        createdAt: first.createdAt,
      },
    ])
  })

  it('marks the feedback of a former tester as no longer current', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    await quit(project.id, ines)

    expect(await openFeedback(project.id)).toEqual([
      expect.objectContaining({ id: message.id, tester: { name: 'Inès', current: false } }),
    ])
  })

  it('proposes 50 feedback at most', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const written: string[] = []
    for (let i = 0; i < TESTER_MESSAGES_PER_DAY; i++) {
      written.push((await sent(project.id, inesId, ines, feedback({ text: `Retour ${i}.` }))).id)
    }
    for (let i = 0; i <= OPEN_FEEDBACK_MAX - TESTER_MESSAGES_PER_DAY; i++) {
      written.push((await sent(project.id, malikId, malik, feedback({ text: `Retour ${i}.` }))).id)
    }

    const list = await openFeedback(project.id)

    expect(list.map((item) => item.id)).toEqual([...written].reverse().slice(0, OPEN_FEEDBACK_MAX))
  })
})

describe('limits against abuse', () => {
  it('blocks the 31st message of the day, all projects together, and allows it the next day', async () => {
    const project = await publishProject()
    const other = await publishProject(malik, 'Le carnet de Malik')
    await join(project.id, ines)
    await join(other.id, ines)
    for (let i = 0; i < 20; i++) await sent(project.id, inesId, ines, feedback({ text: `R${i}` }))
    for (let i = 0; i < TESTER_MESSAGES_PER_DAY - 20; i++) {
      await sent(other.id, inesId, ines, feedback({ text: `R${i}` }))
    }

    const res = await post(project.id, inesId, ines, feedback())

    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect((await thread(project.id, inesId, ines)).items).toHaveLength(20)
    // L'auteur, lui, a son propre compteur.
    await sent(project.id, inesId, jean, reply())
    later(DAY)
    await sent(project.id, inesId, ines, feedback())
  })

  it('counts even malformed requests in the member quota of messages', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    // 30 demandes, comptées avant tout examen : identifiant mal formé, projet inconnu, fil d'un
    // autre, corps illisible.
    for (let i = 0; i < 6; i++) {
      expect((await post('pas-un-identifiant', inesId, ines, feedback())).status).toBe(404)
      expect((await post(UNKNOWN, inesId, ines, feedback())).status).toBe(404)
      expect((await post(project.id, malikId, ines, feedback())).status).toBe(404)
      expect((await post(project.id, inesId, ines, {})).status).toBe(400)
      expect((await post(project.id, inesId, ines, 42)).status).toBe(400)
    }

    await expectError(await post(project.id, inesId, ines, feedback()), 429, 'rate_limited')
    expect((await thread(project.id, inesId, ines)).items).toEqual([])
  })

  it('counts even malformed requests in the quota of thread reads', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    // 300 par heure : il en a déjà fait 298 ; un identifiant mal formé fait la 299e, un projet
    // inconnu la 300e (comptées avant tout examen), la suivante, bien formée, est refusée.
    await alreadyUsed(memberCounterKeys(inesId).testerRead, 298)
    expect((await markRead('pas-un-identifiant', inesId, ines)).status).toBe(404)
    expect((await markRead(UNKNOWN, inesId, ines)).status).toBe(404)

    const res = await markRead(project.id, inesId, ines)
    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    // Une heure plus tard, la fenêtre est finie : il marque son fil lu.
    later(61)
    await expectDone(await markRead(project.id, inesId, ines))
  })

  it('counts even requests on an unknown message in the change quota', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    // 60 modifications par heure : il en a déjà fait 59 ; un message inconnu fait la 60e.
    await alreadyUsed(memberCounterKeys(inesId).projectChange, 59)
    await expectError(await deleteMessage(project.id, UNKNOWN, ines), 404, 'not_found')

    const res = await deleteMessage(project.id, message.id, ines)
    await expectError(res, 429, 'rate_limited')
    expect((await thread(project.id, inesId, ines)).items).toHaveLength(1)
  })

  it('refuses a 17 KB message body with 413', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    await expectError(
      await post(project.id, inesId, ines, feedback({ text: 'a'.repeat(17 * 1024) })),
      413,
      'payload_too_large',
    )
    expect((await thread(project.id, inesId, ines)).items).toEqual([])
    await sent(project.id, inesId, ines, feedback()) // témoin
  })
})

describe('a closed corner', () => {
  it('refuses messages in a private or removed project, still read by the author', async () => {
    const hidden = await publishProject()
    const removed = await publishProject(jean, 'Le carnet de jardin')
    for (const project of [hidden, removed]) {
      await join(project.id, ines)
      await sent(project.id, inesId, ines, feedback())
    }
    await act.setVisibility(hidden.id, jean, 'private')
    await removeProject(removed.id)

    for (const project of [hidden, removed]) {
      await expectError(await post(project.id, inesId, jean, reply()), 409, 'corner_closed')
      expect((await thread(project.id, inesId, jean)).items).toHaveLength(1)
      expect((await threads(project.id)).items).toHaveLength(1)
      // Pour Inès, le coin est introuvable.
      expect((await readThread(project.id, inesId, ines)).status).toBe(404)
      expect((await post(project.id, inesId, ines, feedback())).status).toBe(404)
    }
  })

  it('closes the corner to the testers while the author is suspended', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    await suspendJean()

    await expectError(await post(project.id, inesId, jean, reply()), 403, 'suspended')
    expect((await thread(project.id, inesId, jean)).items).toHaveLength(1)
    expect((await readThread(project.id, inesId, ines)).status).toBe(404)
    expect((await post(project.id, inesId, ines, feedback())).status).toBe(404)
  })

  it('lets a tester delete their feedback while the author is suspended', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const message = await sent(project.id, inesId, ines, feedback())
    await suspendJean()

    await expectDone(await deleteMessage(project.id, message.id, ines))

    expect((await thread(project.id, inesId, jean)).items).toEqual([])
  })

  it('lets a suspended author delete his own reply', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sent(project.id, inesId, ines, feedback())
    const answer = await sent(project.id, inesId, jean, reply())
    await suspendJean()

    await expectDone(await deleteMessage(project.id, answer.id, jean))

    expect((await thread(project.id, inesId, jean)).items).toHaveLength(1)
  })
})

describe('the API contract', () => {
  it('documents the thread routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(doc.paths['/v1/projects/{id}/threads']).toHaveProperty('get')
    expect(doc.paths['/v1/projects/{id}/threads/{testerId}/messages']).toHaveProperty('get')
    expect(doc.paths['/v1/projects/{id}/threads/{testerId}/messages']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/threads/{testerId}/read']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/messages/{messageId}']).toHaveProperty('delete')
    expect(doc.paths['/v1/projects/{id}/messages/{messageId}/settled']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/messages/{messageId}/settled']).toHaveProperty('delete')
    expect(doc.paths['/v1/projects/{id}/feedback/open']).toHaveProperty('get')
  })
})
