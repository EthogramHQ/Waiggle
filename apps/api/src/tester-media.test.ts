// Tests d'intégration de la tranche R7b : les images du coin des testeurs, l'envoi (POST
// /v1/projects/{id}/testers/media) et le service (GET /media/testers/<clé>.webp). Une photo d'appel
// vient de l'auteur, une capture d'écran d'un testeur ; chacune est ré-encodée sans métadonnées et
// ne s'ouvre que pour ceux qui voient l'appel ou le message. Scénario : docs/scenarios/refonte.md,
// section R7b, « Les retours » (« une capture d'écran facultative, ré-encodée sans métadonnées ») et
// « La modération » ; décisions du plan : R7a-S2 (`Cache-Control: private, no-store`), décision 4
// de Louis du 11/11/2026 (la modération voit la capture d'un message visé par un signalement ouvert,
// jamais le reste du fil) ; relecture de sécurité : A2 à A4 (un contrôle par dossier, le déposant
// voit le sien, un message retiré n'est plus vu que de son expéditeur), A15 (100 images par fil ou
// par projet), sec-S6 (deux attentes au plus).
// Le rattachement des images aux appels et aux messages est testé par tester-calls.test.ts et
// tester-threads.test.ts, la purge de nuit en détail par jobs/nightly-purge.test.ts, la suppression
// du compte par accounts.test.ts.
//
// Cinq membres : Papi Jean (l'auteur), Inès et Malik (ses testeurs), Sami (ni l'un ni l'autre) et
// Louis (l'administrateur). Un retrait, un signalement ou un plafond atteint sont posés en base :
// ces tests ne dépendent ainsi que des routes du coin.
import { randomBytes } from 'node:crypto'
import {
  CALL_PHOTOS_PER_PROJECT_MAX,
  CAPTURES_PER_THREAD_MAX,
  ErrorResponse,
  TesterMedia,
  type TesterMediaKind,
  TesterMessage,
  VISUAL_MAX_BYTES,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nightlyPurge } from './jobs/nightly-purge'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, photoWithGps } from './testing/images'

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
const HOUR = 60

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

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

const publishProject = (cookie = jean, title = 'Décollage !') =>
  act.publish(cookie, title, { pitch: 'Un quiz de l’espace pour les petits.', ...TESTABLE })

const projectPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

const join = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('POST', `${projectPath(projectId)}/testers`, cookie))
}

const quit = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('DELETE', `${projectPath(projectId)}/testers`, cookie))
}

// --- L'envoi ---

/** Envoie une image du coin ; réponse brute. `bytes` : un JPEG uni par défaut. */
const sendImage = async (
  projectId: string,
  cookie: string | null,
  kind: TesterMediaKind,
  bytes?: Uint8Array,
  type = 'image/jpeg',
) => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(bytes ?? (await jpegImage(800, 600)))], 'image', { type }),
  )
  form.append('kind', kind)
  return ctx.request(`${projectPath(projectId)}/testers/media`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: form,
  })
}

/** Envoie une image qui doit être acceptée, et la rend (elle est en attente). */
const upload = async (
  projectId: string,
  cookie: string,
  kind: TesterMediaKind,
  bytes?: Uint8Array,
) => {
  const res = await sendImage(projectId, cookie, kind, bytes)
  expect(res.status).toBe(201)
  return TesterMedia.parse(await res.json())
}

/** La clé de stockage d'une image, tirée de son adresse (« testers/<uuid>.webp »). */
const keyOf = (media: TesterMedia) => new URL(media.url).pathname.replace(/^\/media\//, '')

/** Les fichiers du coin dans le stockage du test (photos d'appel et captures). */
const testerFiles = () => [...ctx.storage.files.keys()].filter((key) => key.startsWith('testers/'))

// --- Rattacher (les routes des appels et des fils, testées ailleurs) ---

/** Inès (ou un autre testeur) envoie un retour avec cette capture. */
const feedbackWith = async (
  projectId: string,
  testerId: string,
  cookie: string,
  captureId: string | null,
) => {
  later()
  const res = await act.send(
    'POST',
    `${projectPath(projectId)}/threads/${testerId}/messages`,
    cookie,
    {
      kind: 'feedback',
      outcome: 'partly',
      device: 'phone',
      text: 'Le score repart à zéro au niveau 3.',
      captureId,
    },
  )
  expect(res.status).toBe(201)
  return TesterMessage.parse(await res.json())
}

/** L'auteur lance un appel avec cette photo. */
const callWith = async (projectId: string, photoId: string) => {
  later()
  const res = await act.send('POST', `${projectPath(projectId)}/calls`, jean, {
    text: 'Essayez le niveau 3 ce week-end.',
    photoId,
    photoDescription: 'La fusée au départ du niveau 3.',
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** Une capture rattachée à un retour d'Inès, et ce retour. */
const inesCapture = async (projectId: string) => {
  const capture = await upload(projectId, ines, 'capture')
  const message = await feedbackWith(projectId, inesId, ines, capture.id)
  return { capture, message }
}

// --- Le service ---

/** Ouvre l'adresse d'une image, comme le ferait l'appli ; réponse brute. */
const open = (url: string, cookie: string | null) =>
  ctx.request(new URL(url).pathname, { headers: cookie ? { cookie } : {} })

const status = async (url: string, cookie: string | null) => (await open(url, cookie)).status

/** Vérifie que l'image s'ouvre pour ces membres et pas pour ceux-là (404, comme une inconnue). */
const expectServed = async (
  url: string,
  to: Record<string, string>,
  notTo: Record<string, string | null>,
) => {
  for (const [who, cookie] of Object.entries(to)) {
    expect(await status(url, cookie), who).toBe(200)
  }
  for (const [who, cookie] of Object.entries(notTo)) {
    expect(await status(url, cookie), who).toBe(404)
  }
}

// --- Ce qui se pose en base ---

/** La modération retire un message (écrit en base, comme reports/decide.ts). */
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

/** Un signalement ouvert sur un message (écrit en base, comme POST /v1/reports). */
const reportMessage = async (projectId: string, messageId: string, authorId: string) => {
  const id = crypto.randomUUID()
  await ctx.db.insert(schema.contentReport).values({
    id,
    reporterId: jeanId,
    targetKind: 'message',
    targetId: messageId,
    projectId,
    targetAuthorId: authorId,
    reason: 'other',
    details: null,
    snapshot: [{ field: 'text', value: 'Le score repart à zéro au niveau 3.' }],
    status: 'open',
    createdAt: new Date(),
  })
  return id
}

/** Des images déjà rattachées, posées en base sans fichier : seul leur nombre compte. */
const storedImages = (
  rows: number,
  image: { projectId: string; ownerId: string; kind: TesterMediaKind } & (
    | { messageId: string }
    | { callId: string }
  ),
) =>
  ctx.db.insert(schema.testerMedia).values(
    Array.from({ length: rows }, () => ({
      id: crypto.randomUUID(),
      ...image,
      storageKey: `testers/${crypto.randomUUID()}.webp`,
      width: 10,
      height: 10,
      thumbhash: 'AAAA',
      createdAt: new Date(),
    })),
  )

/** La modération retire un projet entier (écrit en base, comme dans testers.test.ts). */
const removeProject = (projectId: string) =>
  ctx.db
    .update(schema.project)
    .set({ removedAt: new Date() })
    .where(eq(schema.project.id, projectId))

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

/**
 * Une image PNG de pixels tirés au hasard, sans compression : environ 4,3 Mo, sous la limite de
 * 5 Mo. Le hasard empêche toute compression de la rapetisser.
 */
const fourMegabytePng = () => {
  const width = 1250
  const height = 1150
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
}

describe('uploading an image of the corner', () => {
  it('re-encodes a capture to WebP, without its EXIF metadata', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    const capture = await upload(project.id, ines, 'capture', await photoWithGps())

    expect(capture).toMatchObject({ width: 1200, height: 800, description: null })
    expect(capture.url).toMatch(/^http:\/\/localhost:3000\/media\/testers\/[0-9a-f-]+\.webp$/)
    // Le fichier rangé, puis le fichier servi : du WebP, sans EXIF (ni position GPS).
    const stored = ctx.storage.files.get(keyOf(capture))
    expect(stored).toBeDefined()
    const kept = await sharp(new Uint8Array(stored ?? new Uint8Array())).metadata()
    expect(kept).toMatchObject({ format: 'webp', width: 1200, height: 800 })
    expect(kept.exif).toBeUndefined()
    const res = await open(capture.url, ines)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    const served = await sharp(new Uint8Array(await res.arrayBuffer())).metadata()
    expect(served.format).toBe('webp')
    expect(served.exif).toBeUndefined()
  })

  it('accepts a 4 MB capture', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const bytes = await fourMegabytePng()
    expect(bytes.length).toBeGreaterThan(4 * 1024 * 1024)
    expect(bytes.length).toBeLessThan(VISUAL_MAX_BYTES)

    const res = await sendImage(project.id, ines, 'capture', bytes, 'image/png')

    expect(res.status).toBe(201)
    expect(TesterMedia.parse(await res.json())).toMatchObject({ width: 1250, height: 1150 })
  })

  it('takes a call photo from the author and a capture from a tester only', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    await expectError(await sendImage(project.id, jean, 'capture'), 403, 'forbidden')
    await expectError(await sendImage(project.id, ines, 'call'), 403, 'forbidden')
    expect(testerFiles()).toEqual([])
    // Témoins.
    await upload(project.id, jean, 'call')
    await upload(project.id, ines, 'capture')
  })

  it('refuses another member, a former tester and a visitor, and stores nothing', async () => {
    const project = await publishProject()
    await join(project.id, malik)
    await feedbackWith(project.id, malikId, malik, null)
    await quit(project.id, malik)

    await expectError(await sendImage(project.id, sami, 'capture'), 404, 'not_found')
    await expectError(await sendImage(project.id, malik, 'capture'), 404, 'not_found')
    await expectError(await sendImage(project.id, null, 'capture'), 401, 'unauthorized')
    expect(testerFiles()).toEqual([])
  })

  it('refuses an upload in a closed corner', async () => {
    const hidden = await publishProject()
    const removed = await publishProject(jean, 'Le carnet de jardin')
    await join(hidden.id, ines)
    await act.setVisibility(hidden.id, jean, 'private')
    await removeProject(removed.id)

    await expectError(await sendImage(hidden.id, jean, 'call'), 409, 'corner_closed')
    await expectError(await sendImage(removed.id, jean, 'call'), 409, 'corner_closed')
    await expectError(await sendImage(hidden.id, ines, 'capture'), 404, 'not_found')
    expect(testerFiles()).toEqual([])
  })

  it('keeps at most two pending captures per member and project', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture: attached } = await inesCapture(project.id)
    const oldest = await upload(project.id, ines, 'capture')
    const middle = await upload(project.id, ines, 'capture')

    const newest = await upload(project.id, ines, 'capture')

    // La plus ancienne attente est remplacée ; la capture rattachée à un retour reste.
    expect(testerFiles().sort()).toEqual([keyOf(attached), keyOf(middle), keyOf(newest)].sort())
    expect(await status(oldest.url, ines)).toBe(404)
    expect(await status(newest.url, ines)).toBe(200)
    // Une photo d'appel de l'auteur ne compte pas dans les attentes d'Inès.
    await upload(project.id, jean, 'call')
    expect(testerFiles()).toHaveLength(4)
  })

  it('refuses a capture beyond the cap of the thread with 409', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { message } = await inesCapture(project.id)
    await storedImages(CAPTURES_PER_THREAD_MAX - 1, {
      projectId: project.id,
      ownerId: inesId,
      kind: 'capture',
      messageId: message.id,
    })
    const before = testerFiles()

    await expectError(await sendImage(project.id, ines, 'capture'), 409, 'tester_media_full')

    expect(testerFiles()).toEqual(before)
    // Le plafond est propre au fil : Malik envoie la sienne.
    await join(project.id, malik)
    await upload(project.id, malik, 'capture')
  })

  it('refuses a call photo beyond the cap of the project with 409', async () => {
    const project = await publishProject()
    const photo = await upload(project.id, jean, 'call')
    const callId = await callWith(project.id, photo.id)
    await storedImages(CALL_PHOTOS_PER_PROJECT_MAX - 1, {
      projectId: project.id,
      ownerId: jeanId,
      kind: 'call',
      callId,
    })

    await expectError(await sendImage(project.id, jean, 'call'), 409, 'tester_media_full')
    expect(testerFiles()).toEqual([keyOf(photo)])
  })
})

describe('who sees an image of the corner', () => {
  it('serves a capture to the tester of the thread and to the author', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture, message } = await inesCapture(project.id)
    expect(message.capture?.url).toBe(capture.url)

    await expectServed(capture.url, { ines, jean }, {})
  })

  it('refuses a tester capture to a member outside the thread', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const { capture } = await inesCapture(project.id)

    // Un autre testeur, un autre membre, l'administrateur sans signalement, un visiteur.
    await expectServed(capture.url, { ines }, { malik, sami, louis, visitor: null })
  })

  it('serves a pending image to its uploader only', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const capture = await upload(project.id, ines, 'capture')
    const photo = await upload(project.id, jean, 'call')

    await expectServed(capture.url, { ines }, { jean, sami })
    await expectServed(photo.url, { jean }, { ines, sami })
  })

  it('serves a call photo to the author and the current testers only', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await feedbackWith(project.id, malikId, malik, null)
    const photo = await upload(project.id, jean, 'call')
    await callWith(project.id, photo.id)
    await quit(project.id, malik) // un ancien testeur ne lit plus les appels

    await expectServed(photo.url, { jean, ines }, { malik, sami, visitor: null })
  })

  it('refuses a call photo when the corner is closed', async () => {
    const project = await publishProject()
    const other = await publishProject(jean, 'Le carnet de jardin')
    for (const p of [project, other]) await join(p.id, ines)
    const hiddenPhoto = await upload(project.id, jean, 'call')
    await callWith(project.id, hiddenPhoto.id)
    const suspendedPhoto = await upload(other.id, jean, 'call')
    await callWith(other.id, suspendedPhoto.id)
    expect(await status(hiddenPhoto.url, ines)).toBe(200) // témoin

    await act.setVisibility(project.id, jean, 'private')
    // L'auteur relit son coin fermé, photo comprise ; Inès, plus rien.
    await expectServed(hiddenPhoto.url, { jean }, { ines })

    await suspendJean()
    await expectServed(suspendedPhoto.url, { jean }, { ines })
  })

  it('hides the photo of a removed call from the testers', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const photo = await upload(project.id, jean, 'call')
    const callId = await callWith(project.id, photo.id)

    await ctx.db
      .update(schema.testerCall)
      .set({ removedAt: new Date() })
      .where(eq(schema.testerCall.id, callId))

    await expectServed(photo.url, { jean }, { ines })
  })

  it('serves a former tester his own capture', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const { capture } = await inesCapture(project.id)
    const photo = await upload(project.id, jean, 'call')
    await callWith(project.id, photo.id)
    const ofMalik = await upload(project.id, malik, 'capture')
    await feedbackWith(project.id, malikId, malik, ofMalik.id)

    await quit(project.id, ines)
    later()
    await expectDone(
      await act.send('DELETE', `${projectPath(project.id)}/testers/${malikId}`, jean),
    )

    // Partie ou retiré : chacun garde sa capture ; plus la photo de l'appel.
    await expectServed(capture.url, { ines, jean }, {})
    await expectServed(ofMalik.url, { malik, jean }, {})
    await expectServed(photo.url, { jean }, { ines, malik })
  })

  it('hides the capture of a removed feedback from the project author', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture, message } = await inesCapture(project.id)

    await removeMessage(message.id, inesId)

    await expectServed(capture.url, { ines }, { jean })
  })

  it('sends the images of the corner with « Cache-Control: private, no-store »', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture } = await inesCapture(project.id)
    const photo = await upload(project.id, jean, 'call')
    await callWith(project.id, photo.id)

    for (const [url, cookie] of [
      [capture.url, ines],
      [photo.url, ines],
      [capture.url, jean],
    ] as const) {
      const res = await open(url, cookie)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      expect(res.headers.get('content-type')).toBe('image/webp')
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    }
  })

  it('answers « not found » for an unknown or malformed file of the corner', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture } = await inesCapture(project.id)
    expect(await status(capture.url, ines)).toBe(200) // témoin

    for (const path of [
      `/media/testers/${crypto.randomUUID()}.webp`,
      '/media/testers/pas-une-cle.webp',
      `/media/testers/${keyOf(capture).slice('testers/'.length).replace('.webp', '.png')}`,
      `/media/inconnu/${keyOf(capture).slice('testers/'.length)}`,
    ]) {
      const res = await ctx.request(path, { headers: { cookie: ines } })
      expect(res.status, path).toBe(404)
    }
  })
})

describe('the moderation and the images of the corner', () => {
  it('serves a reported message capture to an administrator while the report is open', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture, message } = await inesCapture(project.id)
    expect(await status(capture.url, louis)).toBe(404)

    const reportId = await reportMessage(project.id, message.id, inesId)
    expect(await status(capture.url, louis)).toBe(200)

    // Le signalement classé, l'image se referme.
    await ctx.db
      .update(schema.contentReport)
      .set({ status: 'dismissed', decidedAt: new Date() })
      .where(eq(schema.contentReport.id, reportId))
    expect(await status(capture.url, louis)).toBe(404)
  })

  it('refuses a tester capture to an administrator when no open report targets it', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const first = await inesCapture(project.id)
    const second = await inesCapture(project.id)

    // Le premier retour est signalé : la modération voit sa capture, jamais le reste du fil.
    await reportMessage(project.id, first.message.id, inesId)

    expect(await status(first.capture.url, louis)).toBe(200)
    expect(await status(second.capture.url, louis)).toBe(404)
  })
})

describe('erasing the images of the corner', () => {
  it('purges a pending image after 24 hours, never an attached one', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const { capture: attached } = await inesCapture(project.id)
    const pending = await upload(project.id, ines, 'capture')
    const fresh = { at: Date.now() }

    // À 23 h, rien ne part ; à 25 h, l'attente part, ligne et fichier.
    await nightlyPurge(ctx.db, new Date(fresh.at + 23 * HOUR * MINUTE), ctx.storage)
    expect(testerFiles().sort()).toEqual([keyOf(attached), keyOf(pending)].sort())
    await nightlyPurge(ctx.db, new Date(fresh.at + 25 * HOUR * MINUTE), ctx.storage)
    expect(testerFiles()).toEqual([keyOf(attached)])
    const rows = await ctx.db
      .select({ id: schema.testerMedia.id })
      .from(schema.testerMedia)
      .where(eq(schema.testerMedia.id, pending.id))
    expect(rows).toEqual([])
  })

  it('erases the files of the corner with the project', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await inesCapture(project.id)
    const photo = await upload(project.id, jean, 'call')
    await callWith(project.id, photo.id)
    await upload(project.id, ines, 'capture') // une attente
    expect(testerFiles()).toHaveLength(3)

    later()
    await expectDone(await act.send('DELETE', projectPath(project.id), jean))

    expect(testerFiles()).toEqual([])
  })
})
