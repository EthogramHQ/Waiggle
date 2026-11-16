// Tests d'intégration de R11, « Mes retours envoyés » (GET /v1/me/tester-messages) : les retours et
// réponses qu'un membre a écrits comme testeur, dans le coin de n'importe quel projet, coins fermés
// compris (projet retiré ou devenu privé, testeur parti, retiré ou bloqué), à relire en lecture seule
// et à supprimer par la route du coin. Jamais un message de l'auteur du projet, ni un message que le
// membre a écrit chez lui comme auteur. Scénario : docs/scenarios/refonte.md, « R11 », « Mes retours
// envoyés » ; contrat : `MyTesterMessage` ; relecture de sécurité du plan (« Vérifié sans problème » :
// sa capture s'ouvre encore coin fermé, celle d'un autre répond 404 ; S-C3 : le curseur vérifié).
//
// Cinq membres : Papi Jean (l'auteur), Max (son testeur, qui lit sa liste), Malik (un autre testeur,
// qui a aussi son propre projet), Sam (un autre membre, qui signale) et Louis (l'administrateur). Un
// projet ou un message retirés sont posés en base, comme le ferait la décision de la modération ;
// une partie retirée seule (couverture, capture) passe par la modération, comme dans l'appli.
import {
  ErrorResponse,
  MY_DATA_PAGE_SIZE,
  MyTesterMessagesPage,
  type ReportPart,
  type ReportTarget,
  TesterMedia,
  TesterMessage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let jean: string // cookies de session
let max: string
let malik: string
let sam: string
let louis: string
let jeanId: string
let maxId: string
let malikId: string
let louisId: string

const START = new Date('2026-11-16T08:00:00.000Z')
const MINUTE = 60 * 1000
/** Un identifiant bien formé, qui ne désigne rien. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

/** Avance la fausse horloge (par défaut d'une minute : deux gestes n'ont jamais la même date). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  const member = (name: string, local: string) =>
    ctx.verifiedMember({
      name,
      email: `${local}@example.com`,
      password: `${local}-long-password`,
    })
  jean = await member('Papi Jean', 'jean')
  max = await member('Max', 'max')
  malik = await member('Malik', 'malik')
  sam = await member('Sam', 'sam')
  louis = await member('Louis', 'louis')
  jeanId = (await act.me(jean)).id
  maxId = (await act.me(max)).id
  malikId = (await act.me(malik)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

// ─── Les adresses et les lectures ────────────────────────────────────────────────────────────────

const listPath = (cursor?: string) =>
  `/v1/me/tester-messages${cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`}`
const projectPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`

/** Lit une page de « Mes retours envoyés » (200 attendu) et la vérifie par le contrat. */
const myMessages = async (cookie: string, cursor?: string) => {
  const res = await act.send('GET', listPath(cursor), cookie)
  expect(res.status, 'GET /v1/me/tester-messages').toBe(200)
  return MyTesterMessagesPage.parse(await res.json())
}

/** La réponse brute de la première page : on y cherche ce qui ne doit pas s'y trouver. */
const rawList = async (cookie: string) => {
  const res = await act.send('GET', listPath(), cookie)
  expect(res.status, 'GET /v1/me/tester-messages').toBe(200)
  return res.text()
}

/** L'élément de la liste qui porte ce message. */
const itemOf = async (cookie: string, messageId: string) => {
  const found = (await myMessages(cookie)).items.find((item) => item.id === messageId)
  if (!found) throw new Error(`message ${messageId} is not in the list`)
  return found
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

// ─── Les gestes du coin (testés ailleurs : ici, ils montent la scène) ────────────────────────────

/** Jean (ou un autre) publie un projet testable. */
const publishTestable = async (title: string, cookie = jean) => {
  later()
  return act.publish(cookie, title, TESTABLE)
}

const join = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('POST', `${projectPath(projectId)}/testers`, cookie))
}

const quit = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('DELETE', `${projectPath(projectId)}/testers`, cookie))
}

/** L'auteur retire un membre de ses testeurs. */
const removeTester = async (projectId: string, memberId: string, cookie = jean) => {
  later()
  await expectDone(
    await act.send(
      'DELETE',
      `${projectPath(projectId)}/testers/${encodeURIComponent(memberId)}`,
      cookie,
    ),
  )
}

/** Envoie un message dans le fil de ce testeur ; le rend tel que l'API l'a décrit. */
const post = async (projectId: string, testerId: string, cookie: string, body: object) => {
  later()
  const res = await act.send(
    'POST',
    `${projectPath(projectId)}/threads/${testerId}/messages`,
    cookie,
    body,
  )
  expect(res.status, 'message').toBe(201)
  return TesterMessage.parse(await res.json())
}

/** Un retour « En partie », sur téléphone, avec ou sans capture. */
const feedback = (
  text = 'Le score repart à zéro au niveau 3.',
  captureId: string | null = null,
) => ({
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  text,
  captureId,
})

const reply = (text: string) => ({ kind: 'reply', text })

/** Envoie une capture d'écran dans le coin ; elle attend d'être rattachée à un retour. */
const uploadCapture = async (projectId: string, cookie: string) => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'image', { type: 'image/jpeg' }),
  )
  form.append('kind', 'capture')
  const res = await ctx.request(`${projectPath(projectId)}/testers/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  expect(res.status, 'capture').toBe(201)
  return TesterMedia.parse(await res.json())
}

/** Ouvre l'adresse d'une image, comme l'appli ; rend le statut. */
const openStatus = async (url: string, cookie: string) =>
  (await ctx.request(new URL(url).pathname, { headers: { cookie } })).status

/** La modération retire un projet entier (posé en base, comme dans testers.test.ts). */
const removeProject = (projectId: string) =>
  ctx.db
    .update(schema.project)
    .set({ removedAt: new Date() })
    .where(eq(schema.project.id, projectId))

/** La modération retire un message (posé en base, comme reports/decide.ts). */
const removeMessage = async (messageId: string, senderId: string) => {
  const decisionId = crypto.randomUUID()
  await ctx.db.insert(schema.moderationDecision).values({
    id: decisionId,
    targetKind: 'message',
    targetId: messageId,
    action: 'remove',
    ground: 'rules',
    explanation: 'Ce message enfreint les règles de la communauté.',
    adminId: louisId,
    createdAt: new Date(),
    targetMemberId: senderId,
  })
  await ctx.db
    .update(schema.testerMessage)
    .set({ removedAt: new Date(), removalId: decisionId })
    .where(eq(schema.testerMessage.id, messageId))
}

/** Retire une partie, comme la modération : un signalement (Sam par défaut), puis Louis décide. */
const removePart = async (target: ReportTarget, part: ReportPart, reporter = sam) => {
  later()
  const res = await act.send('POST', '/v1/reports', reporter, { target, part, reason: 'other' })
  expect(res.status, 'report').toBe(201)
  later()
  await act.decide(louis, {
    action: 'remove',
    target,
    part,
    ground: 'rules',
    explanation: 'Cette photo ne respecte pas les règles de la communauté.',
  })
}

/** Ajoute une photo à la galerie d'un projet ; rend son identifiant et sa clé de stockage. */
const addPhoto = async (projectId: string, cookie = jean) => {
  later()
  const res = await ctx.request(`${projectPath(projectId)}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(800, 600)),
  })
  expect(res.status, 'visual').toBe(201)
  const rows = await ctx.db
    .select({ id: schema.projectMedia.id, key: schema.projectMedia.storageKey })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.projectId, projectId))
  const added = rows.at(-1)
  if (!added) throw new Error('no photo')
  return added
}

/** Ce que la liste montre d'un projet de Jean sans photo. */
const projectOfJean = (id: string, title: string) => ({
  id,
  title,
  cover: null,
  author: { name: 'Papi Jean' },
})

/** Un projet de Jean, Max parmi ses testeurs, et un retour de Max. */
const maxGaveFeedback = async (title = 'Décollage !') => {
  const project = await publishTestable(title)
  await join(project.id, max)
  const message = await post(project.id, maxId, max, feedback())
  return { project, message }
}

// ─── La liste ────────────────────────────────────────────────────────────────────────────────────

describe('the list of my messages as a tester', () => {
  it('lists my feedback and replies, newest first, never a message of the author', async () => {
    const { project, message } = await maxGaveFeedback()
    await post(project.id, maxId, jean, reply('Merci Max, je regarde ça ce soir.'))
    const mine = await post(project.id, maxId, max, reply('Ça marche maintenant.'))
    // Malik, autre testeur du même projet : son fil n'est pas celui de Max.
    await join(project.id, malik)
    await post(project.id, malikId, malik, feedback('Le son ne part pas.'))

    expect(await myMessages(max)).toEqual({
      items: [
        {
          id: mine.id,
          projectId: project.id,
          project: projectOfJean(project.id, 'Décollage !'),
          closed: false,
          kind: 'reply',
          text: 'Ça marche maintenant.',
          outcome: null,
          device: null,
          createdAt: mine.createdAt,
          media: null,
          removed: false,
        },
        {
          id: message.id,
          projectId: project.id,
          project: projectOfJean(project.id, 'Décollage !'),
          closed: false,
          kind: 'feedback',
          text: 'Le score repart à zéro au niveau 3.',
          outcome: 'partly',
          device: 'phone',
          createdAt: message.createdAt,
          media: null,
          removed: false,
        },
      ],
      nextCursor: null,
    })
    const raw = await rawList(max)
    expect(raw).not.toContain('Merci Max')
    expect(raw).not.toContain('Le son ne part pas')
  })

  it('never lists a message the member wrote as the author of the project, and lists his feedback on the project of another', async () => {
    const { project } = await maxGaveFeedback()
    await post(project.id, maxId, jean, reply('Merci Max, je regarde ça ce soir.'))
    const atMalik = await publishTestable('Potager', malik)
    await join(atMalik.id, jean)
    const asTester = await post(atMalik.id, jeanId, jean, feedback('Les semis ne s’affichent pas.'))

    expect((await myMessages(jean)).items.map((item) => item.id)).toEqual([asTester.id])
    expect(await rawList(jean)).not.toContain('Merci Max')
  })

  it('keeps the messages of a corner closed by leaving or by a removal, with their project', async () => {
    const left = await maxGaveFeedback('Décollage !')
    const removed = await maxGaveFeedback('Quel papillon ?')
    // Témoin : coin ouvert.
    expect((await itemOf(max, left.message.id)).closed).toBe(false)

    await quit(left.project.id, max)
    await removeTester(removed.project.id, maxId)

    expect(await itemOf(max, left.message.id)).toMatchObject({
      closed: true,
      project: projectOfJean(left.project.id, 'Décollage !'),
      text: 'Le score repart à zéro au niveau 3.',
    })
    expect(await itemOf(max, removed.message.id)).toMatchObject({
      closed: true,
      project: projectOfJean(removed.project.id, 'Quel papillon ?'),
    })
  })

  it('shows the project as null and the corner closed once it became private or was removed', async () => {
    const madePrivate = await maxGaveFeedback('Décollage !')
    const removed = await maxGaveFeedback('Quel papillon ?')
    // Témoin : le projet se voit.
    expect((await itemOf(max, madePrivate.message.id)).project).toEqual(
      projectOfJean(madePrivate.project.id, 'Décollage !'),
    )

    later()
    await act.setVisibility(madePrivate.project.id, jean, 'private')
    await removeProject(removed.project.id)

    for (const { project, message } of [madePrivate, removed]) {
      expect(await itemOf(max, message.id), project.title).toMatchObject({
        projectId: project.id,
        project: null,
        closed: true,
        text: 'Le score repart à zéro au niveau 3.',
      })
    }
    const raw = await rawList(max)
    for (const title of ['Décollage', 'papillon', '"name":"Papi Jean"']) {
      expect(raw).not.toContain(title)
    }
  })

  it('shows the project as null once its author and the sender are blocked, either way', async () => {
    const { project, message } = await maxGaveFeedback()
    // Témoin : sans blocage, le projet et le nom de Jean se lisent.
    expect((await itemOf(max, message.id)).project).toEqual(
      projectOfJean(project.id, 'Décollage !'),
    )

    later()
    await act.block(jeanId, max) // Max bloque Jean
    expect(await itemOf(max, message.id)).toMatchObject({ project: null, closed: true })
    expect(await rawList(max)).not.toContain('Décollage')

    later()
    await act.unblock(jeanId, max)
    later()
    await act.block(maxId, jean) // Jean bloque Max
    expect(await itemOf(max, message.id)).toMatchObject({
      project: null,
      closed: true,
      text: 'Le score repart à zéro au niveau 3.',
    })
    expect(await rawList(max)).not.toContain('"name":"Papi Jean"')
  })

  it('shows the project as null once the sender has left the hive it is reserved to', async () => {
    const famille = await hives.createHive('Famille', jeanId, [maxId])
    const album = await publishTestable('Album de famille')
    await hives.reserve(album.id, famille)
    await join(album.id, max)
    const message = await post(album.id, maxId, max, feedback())
    // Témoin : membre de la ruche, Max voit le projet.
    expect((await itemOf(max, message.id)).project).toEqual(
      projectOfJean(album.id, 'Album de famille'),
    )

    await hives.removeMember(famille, maxId)

    expect(await itemOf(max, message.id)).toMatchObject({ projectId: album.id, project: null })
    expect(await rawList(max)).not.toContain('Album de famille')
  })

  it('never shows the removed cover of the project of a message', async () => {
    const project = await publishTestable('Décollage !')
    const first = await addPhoto(project.id)
    const second = await addPhoto(project.id)
    await join(project.id, max)
    const message = await post(project.id, maxId, max, feedback())
    // Témoin : la 1re photo est la couverture.
    expect((await itemOf(max, message.id)).project?.cover?.id).toBe(first.id)
    expect(await rawList(max)).toContain(first.key)

    await removePart({ kind: 'project', id: project.id }, { field: 'cover', mediaId: first.id })

    expect((await itemOf(max, message.id)).project?.cover?.id).toBe(second.id)
    expect(await rawList(max)).not.toContain(first.key)
  })

  it('marks a message removed by the moderation, and keeps its text for its sender', async () => {
    const { message } = await maxGaveFeedback()

    await removeMessage(message.id, maxId)

    expect(await itemOf(max, message.id)).toMatchObject({
      removed: true,
      text: 'Le score repart à zéro au niveau 3.',
    })
  })

  it('leaves the list once deleted through the route of the corner, even in a closed corner', async () => {
    const { project, message } = await maxGaveFeedback()
    const kept = await post(project.id, maxId, max, reply('Un deuxième message.'))
    await quit(project.id, max)

    later()
    await expectDone(
      await act.send('DELETE', `${projectPath(project.id)}/messages/${message.id}`, max),
    )

    expect((await myMessages(max)).items.map((item) => item.id)).toEqual([kept.id])
  })

  it('shows 30 per page, newest first, then the next ones with the cursor', async () => {
    const { project, message } = await maxGaveFeedback()
    // 30 messages par jour au plus : les suivants sont posés en base, dans le même fil, une minute
    // d'écart chacun.
    const written = [message.id]
    for (let i = 1; i < MY_DATA_PAGE_SIZE + 5; i++) {
      later()
      const id = crypto.randomUUID()
      await ctx.db.insert(schema.testerMessage).values({
        id,
        projectId: project.id,
        testerId: maxId,
        senderId: maxId,
        kind: 'reply',
        text: `Message ${i}`,
        createdAt: new Date(),
      })
      written.push(id)
    }

    const first = await myMessages(max)
    expect(first.items).toHaveLength(MY_DATA_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
    const second = await myMessages(max, first.nextCursor ?? undefined)
    expect(second.items).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual([...written].reverse())
  })

  it('answers 400 to a cursor dated in year 0000 or 9999, or that is not ours, never 500', async () => {
    await maxGaveFeedback()
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
    // Témoin : la liste se lit sans curseur.
    expect((await myMessages(max)).items).toHaveLength(1)

    for (const cursor of [
      encode({ at: '0000-01-01T00:00:00Z', id: UNKNOWN }),
      encode({ at: '9999-12-31T23:59:59Z', id: UNKNOWN }),
      encode({ page: 2 }),
      "'OR1=1",
      'a'.repeat(201),
    ]) {
      await expectError(await act.send('GET', listPath(cursor), max), 400, 'validation')
    }
  })

  it('refuses a visitor without session with 401', async () => {
    const { message } = await maxGaveFeedback()

    await expectError(await act.send('GET', listPath(), null), 401, 'unauthorized')
    // Témoin : avec sa session, Max lit sa liste.
    expect((await myMessages(max)).items.map((item) => item.id)).toEqual([message.id])
  })
})

// ─── Les captures ────────────────────────────────────────────────────────────────────────────────

describe('the capture of a message', () => {
  it('gives the capture of my feedback, which I still open once the corner is closed, never the capture of another', async () => {
    const project = await publishTestable('Décollage !')
    await join(project.id, max)
    await join(project.id, malik)
    const capture = await uploadCapture(project.id, max)
    const message = await post(project.id, maxId, max, feedback(undefined, capture.id))
    const ofMalik = await uploadCapture(project.id, malik)
    await post(project.id, malikId, malik, feedback('Le son ne part pas.', ofMalik.id))

    expect((await itemOf(max, message.id)).media).toEqual(capture)
    expect(await rawList(max)).not.toContain(ofMalik.id)

    // Coin fermé : il a quitté les testeurs, puis le projet est devenu privé.
    await quit(project.id, max)
    later()
    await act.setVisibility(project.id, jean, 'private')

    const media = (await itemOf(max, message.id)).media
    expect(media?.id).toBe(capture.id)
    expect(await openStatus(media?.url ?? capture.url, max)).toBe(200)
    // La capture d'un autre testeur, ou la sienne pour un membre hors du fil : 404.
    expect(await openStatus(ofMalik.url, max)).toBe(404)
    expect(await openStatus(capture.url, sam)).toBe(404)
  })

  it('gives no capture once the moderation removed it alone, and keeps the message', async () => {
    const project = await publishTestable('Décollage !')
    await join(project.id, max)
    const capture = await uploadCapture(project.id, max)
    const message = await post(project.id, maxId, max, feedback(undefined, capture.id))
    // Témoin : la capture est donnée.
    expect((await itemOf(max, message.id)).media?.id).toBe(capture.id)

    // Jean, l'auteur du projet, signale la capture ; la modération la retire seule.
    await removePart(
      { kind: 'message', id: message.id },
      { field: 'photo', mediaId: capture.id },
      jean,
    )

    expect(await itemOf(max, message.id)).toMatchObject({
      media: null,
      removed: false,
      text: 'Le score repart à zéro au niveau 3.',
    })
  })
})
