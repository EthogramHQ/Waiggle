// Tests d'intégration de R20 « Les Éclaireuses » : la capture jointe à un retour (la partie `file`
// de POST /v1/me/scout/reports) et son service (GET /media/scouts/<clé>.webp). Scénario :
// docs/scenarios/refonte.md, « R20 — Les Éclaireuses », « Le retour normé » (« une capture,
// facultative : JPEG, PNG ou WebP, 5 Mo au plus, ré-encodée sans ses métadonnées ») et « Seuls
// l'administrateur et son autrice le voient » ; plan : choix 6 et 10 (dossier `scouts`, visible de
// l'autrice et d'un administrateur actif, `Cache-Control: no-store`), relecture de sécurité A3 (la
// limite de 5 Mo + 64 Ko posée après la garde et le quota, la clé `scouts/` apprise par
// `isValidKey`) et A5 (le fichier part avec le retour ; un identifiant mal formé a le 404 d'un
// inconnu).
//
// Cinq membres : Léa et Malik (Éclaireuses), Sami (membre ordinaire), Louis (administrateur) et Rémi
// (administrateur révoqué).
import { randomBytes } from 'node:crypto'
import { ErrorResponse, ScoutReport } from '@ruche/contracts'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, photoWithGps, pngImage } from './testing/images'
import {
  addMission,
  type Capture,
  freshCode,
  IDEA,
  memberIdOf,
  sendReport,
} from './testing/scout-seeds'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let malik: string
let sami: string
let louis: string
let remi: string

const START = Date.parse('2026-12-02T09:00:00.000Z')
const MINUTE = 60 * 1000
const MB = 1024 * 1024

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  const signupCode = freshCode()
  const scoutCode = freshCode()
  ctx = await createTestContext({ inviteCode: signupCode, scoutCode })
  act = activity(ctx)
  const account = async (name: string, inviteCode: string) => {
    const email = `${name.toLowerCase()}@example.com`
    const cookie = await ctx.verifiedMember({
      name,
      email,
      password: `${name.toLowerCase()}-long-password`,
      inviteCode,
    })
    return { cookie, id: await memberIdOf(ctx, email) }
  }
  // Léa et Malik deviennent Éclaireuses à l'inscription, avec le code des Éclaireuses.
  lea = (await account('Lea', scoutCode)).cookie
  malik = (await account('Malik', scoutCode)).cookie
  sami = (await account('Sami', signupCode)).cookie
  const admin = await account('Louis', signupCode)
  louis = admin.cookie
  await act.makeAdmin(admin.id)
  const former = await account('Remi', signupCode)
  remi = former.cookie
  await act.makeAdmin(former.id)
  await act.revokeAdmin(former.id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Envoie un retour avec cette capture (un JPEG uni par défaut), qui doit être accepté. */
const withCapture = async (cookie: string, capture?: Capture, report: object = IDEA) => {
  later()
  const res = await sendReport(ctx, cookie, report, capture ?? { bytes: await jpegImage(800, 600) })
  expect(res.status).toBe(201)
  return ScoutReport.parse(await res.json())
}

/** L'adresse de la capture d'un retour ; un retour sans capture fait échouer le test. */
const urlOf = (report: ScoutReport) => {
  if (report.mediaUrl === null) throw new Error('the report has no capture')
  return report.mediaUrl
}

/** La clé de stockage d'une capture, tirée de son adresse (« scouts/<uuid>.webp »). */
const keyOf = (url: string) => new URL(url).pathname.replace(/^\/media\//, '')

/** Les captures des Éclaireuses dans le stockage du test. */
const scoutFiles = () => [...ctx.storage.files.keys()].filter((key) => key.startsWith('scouts/'))

/** Ouvre l'adresse d'une capture, comme le ferait l'appli ; null : un visiteur sans compte. */
const open = (url: string, cookie: string | null) => {
  const path = new URL(url, 'http://localhost:3000').pathname
  return cookie === null ? ctx.visitor(path) : ctx.request(path, { headers: { cookie } })
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

/**
 * Un envoi de `size` octets en flux, qui compte ce que le serveur en a lu : `read()` dit combien
 * d'octets ont été tirés du flux. Sans longueur annoncée (pas de Content-Length), seul ce qui est
 * vraiment lu compte.
 */
const countedUpload = (cookie: string, size: number) => {
  let pulled = 0
  const chunk = new Uint8Array(64 * 1024)
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= size) {
        controller.close()
        return
      }
      pulled += chunk.length
      controller.enqueue(chunk)
    },
  })
  const response = ctx.request('/v1/me/scout/reports', {
    method: 'POST',
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=goutte' },
    body,
    // Un corps en flux, envoyé au fil de l'eau (exigé par fetch pour un ReadableStream).
    duplex: 'half',
  } as RequestInit)
  return { response, read: () => pulled }
}

// --- L'envoi ---

describe('attaching a capture to a report', () => {
  it('stores the capture re-encoded without EXIF or GPS metadata under scouts/', async () => {
    const report = await withCapture(lea, { bytes: await photoWithGps() })

    const url = urlOf(report)
    expect(url).toMatch(/^http:\/\/localhost:3000\/media\/scouts\/[0-9a-f-]{36}\.webp$/)
    expect(scoutFiles()).toEqual([keyOf(url)])
    // Le fichier rangé, puis le fichier servi : du WebP, sans EXIF (ni position GPS).
    const stored = ctx.storage.files.get(keyOf(url))
    const kept = await sharp(new Uint8Array(stored ?? new Uint8Array())).metadata()
    expect(kept).toMatchObject({ format: 'webp', width: 1200, height: 800 })
    expect(kept.exif).toBeUndefined()
    const res = await open(url, lea)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    const served = await sharp(new Uint8Array(await res.arrayBuffer())).metadata()
    expect(served.format).toBe('webp')
    expect(served.exif).toBeUndefined()
  })

  it('accepts a PNG and a WebP capture', async () => {
    const webp = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#d9a441' },
    })
      .webp()
      .toBuffer()

    await withCapture(lea, { bytes: await pngImage(), type: 'image/png', name: 'capture.png' })
    await withCapture(lea, { bytes: webp, type: 'image/webp', name: 'capture.webp' })

    expect(scoutFiles()).toHaveLength(2)
  })

  it('accepts a 4 MB capture', async () => {
    const bytes = await fourMegabytePng()
    expect(bytes.length).toBeGreaterThan(4 * MB)
    expect(bytes.length).toBeLessThan(5 * MB)

    await withCapture(lea, { bytes, type: 'image/png', name: 'capture.png' })
    expect(scoutFiles()).toHaveLength(1)
  })

  it('refuses a file that is not a JPEG, PNG or WebP image, and keeps neither file nor report', async () => {
    const gif = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#3b6ea8' },
    })
      .gif()
      .toBuffer()

    for (const capture of [
      { bytes: gif, type: 'image/gif', name: 'capture.gif' },
      { bytes: new TextEncoder().encode('pas une image'), type: 'image/png', name: 'x.png' },
    ]) {
      later()
      await expectError(await sendReport(ctx, lea, IDEA, capture), 415, 'unsupported_media_type')
    }
    expect(scoutFiles()).toEqual([])
    expect(
      (await (
        await ctx.request('/v1/me/scout/reports', { headers: { cookie: lea } })
      ).json()) as unknown,
    ).toEqual({ reports: [] })
  })

  it('refuses a capture over 5 MB with 413, and keeps neither file nor report', async () => {
    // Un peu plus de 5 Mo : sous l'enveloppe du formulaire (5 Mo + 64 Ko), refusé par la taille
    // du fichier ; 6 Mo : refusé par la limite du corps.
    for (const size of [5 * MB + 16 * 1024, 6 * MB]) {
      later()
      await expectError(
        await sendReport(ctx, lea, IDEA, { bytes: randomBytes(size), type: 'image/png' }),
        413,
        'payload_too_large',
      )
    }
    expect(scoutFiles()).toEqual([])
    // Témoin : une capture de quelques centaines de Ko (au-delà des 16 Ko d'une requête ordinaire)
    // passe ; le refus vient bien de la limite des 5 Mo.
    const bytes = await sharp(randomBytes(300 * 300 * 3), {
      raw: { width: 300, height: 300, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer()
    expect(bytes.length).toBeGreaterThan(64 * 1024)
    await withCapture(lea, { bytes, type: 'image/png', name: 'capture.png' })
  })

  it('refuses a 6 MB upload from a member who is not a scout with 403, without reading it', async () => {
    const upload = countedUpload(sami, 6 * MB)

    await expectError(await upload.response, 403, 'scout_only')
    // La garde passe avant toute lecture : au plus ce que le flux prépare d'avance.
    expect(upload.read()).toBeLessThanOrEqual(256 * 1024)
    // Témoin : le même envoi d'une Éclaireuse est lu, puis coupé par la limite de taille.
    later()
    const fromScout = countedUpload(lea, 6 * MB)
    await expectError(await fromScout.response, 413, 'payload_too_large')
  })

  it('keeps no file when the report is refused after the image is processed', async () => {
    later()
    const res = await sendReport(
      ctx,
      lea,
      { ...IDEA, missionId: crypto.randomUUID() },
      { bytes: await jpegImage(800, 600) },
    )

    await expectError(res, 400, 'scout_mission_invalid')
    expect(scoutFiles()).toEqual([])
    // Témoin : la même capture avec une mission de la semaine est rangée.
    const mission = await addMission(ctx, { textFr: 'Publie un projet avec une photo' })
    await withCapture(lea, undefined, { ...IDEA, missionId: mission })
    expect(scoutFiles()).toHaveLength(1)
  })
})

// --- Le service ---

describe('who sees a scout capture', () => {
  it('serves a scout capture to its author and to an active admin only, with the same 404 as an unknown file for another scout, a member, a visitor and a revoked admin', async () => {
    const url = urlOf(await withCapture(lea))
    const unknown = `/media/scouts/${crypto.randomUUID()}.webp`

    for (const [who, cookie] of [
      ['author', lea],
      ['admin', louis],
    ] as const) {
      expect((await open(url, cookie)).status, who).toBe(200)
    }
    const unknownBody = await (await open(unknown, louis)).text()
    for (const [who, cookie] of [
      ['another scout', malik],
      ['a member', sami],
      ['a visitor', null],
      ['a revoked admin', remi],
    ] as const) {
      const res = await open(url, cookie)
      expect(res.status, who).toBe(404)
      expect(await res.text(), who).toBe(unknownBody)
    }
  })

  it('serves a scout capture with Cache-Control: private, no-store', async () => {
    const url = urlOf(await withCapture(lea))

    for (const cookie of [lea, louis]) {
      const res = await open(url, cookie)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      expect(res.headers.get('content-type')).toBe('image/webp')
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    }
  })

  it('answers « not found » for an unknown or malformed scout file', async () => {
    const url = urlOf(await withCapture(lea))
    expect((await open(url, louis)).status).toBe(200) // témoin
    const name = keyOf(url).slice('scouts/'.length)

    for (const path of [
      `/media/scouts/${crypto.randomUUID()}.webp`,
      '/media/scouts/pas-une-cle.webp',
      `/media/scouts/${name.replace('.webp', '.png')}`,
      `/media/scout/${name}`,
    ]) {
      expect((await open(path, louis)).status, path).toBe(404)
    }
  })
})

// --- L'effacement ---

describe('erasing a scout capture', () => {
  it('deletes the capture file with its report, and answers the same 404 to another scout report, an unknown id and a malformed id', async () => {
    const mine = await withCapture(lea)
    const his = await withCapture(malik)
    const remove = (id: string) =>
      ctx.request(`/v1/me/scout/reports/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { cookie: lea },
      })

    const bodies: string[] = []
    for (const id of [his.id, crypto.randomUUID(), 'pas-un-identifiant']) {
      later()
      const res = await remove(id)
      expect(res.status, id).toBe(404)
      bodies.push(await res.text())
    }
    expect(new Set(bodies).size).toBe(1)
    expect(scoutFiles().sort()).toEqual([keyOf(urlOf(mine)), keyOf(urlOf(his))].sort())

    later()
    expect((await remove(mine.id)).status).toBe(204)

    expect(scoutFiles()).toEqual([keyOf(urlOf(his))])
    expect((await open(urlOf(mine), lea)).status).toBe(404)
    expect((await open(urlOf(mine), louis)).status).toBe(404)
    expect((await open(urlOf(his), malik)).status).toBe(200)
  })
})
