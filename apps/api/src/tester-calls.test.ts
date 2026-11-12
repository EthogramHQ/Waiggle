// Tests d'intégration de la tranche R7b : les appels à tester, de l'auteur à tous ses testeurs
// (GET et POST /v1/projects/{id}/calls, DELETE /v1/projects/{id}/calls/{callId}). Scénario :
// docs/scenarios/refonte.md, section R7b, « Les appels à tester » ; relecture de sécurité du plan :
// B1 (le quota du membre avant tout, celui du projet après le droit d'auteur), A3 (une photo en
// attente ne se rattache qu'une fois), A13 (un texte fait d'invisibles est vide).
// Les notifications des appels sont testées par notifications.test.ts, l'envoi des photos et leur
// service par les tests des fichiers du coin, l'entrée du coin par tester-corner.test.ts.
//
// Cinq membres : Papi Jean (l'auteur), Inès (sa testeuse), Malik (ni l'un ni l'autre, qui a son
// propre projet), Sami (un ancien testeur) et Louis (l'administrateur). Les tables neuves de R7b
// ne sont lues qu'à travers les routes ; les fichiers, dans le stockage en mémoire du test.
import {
  CALL_TEXT_MAX,
  CALLS_PAGE_SIZE,
  ErrorResponse,
  TesterCall,
  TesterCallPage,
  TesterMedia,
  type TesterMediaKind,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let ines: string
let malik: string
let sami: string
let louis: string
let jeanId: string
let samiId: string

const START = Date.parse('2026-11-02T08:00:00.000Z')
const MINUTE = 60 * 1000
const DAY = 24 * 60

// Les caractères invisibles, fabriqués par leur numéro : écrits tels quels, on ne les relirait pas.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const COMBINING_ACUTE = String.fromCodePoint(0x0301)
const COMBINING_GRAPHEME_JOINER = String.fromCodePoint(0x034f)

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
  samiId = (await act.me(sami)).id
  await act.makeAdmin((await act.me(louis)).id)
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

const callsPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/calls`

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Rejoindre les testeurs (R7a), une minute après ce qui précède. */
const join = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('POST', `/v1/projects/${projectId}/testers`, cookie))
}

/** Un appel simple, sans photo. */
const simple = (text = 'Essayez le niveau 3 ce week-end, surtout sur téléphone.') => ({
  text,
  photoId: null,
  photoDescription: null,
})

/** Lance un appel, une minute après ce qui précède ; réponse brute. */
const postCall = (projectId: string, cookie: string | null, body: unknown = simple()) => {
  later()
  return act.send('POST', callsPath(projectId), cookie, body)
}

/** Lance un appel et vérifie qu'il est créé. */
const launch = async (projectId: string, body: object = simple(), cookie = jean) => {
  const res = await postCall(projectId, cookie, body)
  expect(res.status).toBe(201)
  return TesterCall.parse(await res.json())
}

/** Lit l'onglet « Appels » ; réponse brute. */
const readCalls = (projectId: string, cookie: string | null, cursor?: string) =>
  act.send(
    'GET',
    cursor === undefined
      ? callsPath(projectId)
      : `${callsPath(projectId)}?cursor=${encodeURIComponent(cursor)}`,
    cookie,
  )

/** Lit l'onglet « Appels » et vérifie qu'il s'ouvre. */
const calls = async (projectId: string, cookie: string, cursor?: string) => {
  const res = await readCalls(projectId, cookie, cursor)
  expect(res.status).toBe(200)
  return TesterCallPage.parse(await res.json())
}

const deleteCall = (projectId: string, callId: string, cookie: string | null = jean) => {
  later()
  return act.send('DELETE', `${callsPath(projectId)}/${encodeURIComponent(callId)}`, cookie)
}

/**
 * Envoie une image du coin (POST …/testers/media) : une photo d'appel (`call`, l'auteur) ou une
 * capture (`capture`, un testeur). Elle reste « en attente » tant qu'aucun appel ni message ne la
 * cite. La route est testée ailleurs ; ici, elle prépare la scène.
 */
const upload = async (projectId: string, cookie = jean, kind: TesterMediaKind = 'call') => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'photo.jpg', { type: 'image/jpeg' }),
  )
  form.append('kind', kind)
  const res = await ctx.request(`/v1/projects/${projectId}/testers/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  expect(res.status).toBe(201)
  return TesterMedia.parse(await res.json())
}

/** Les fichiers du coin dans le stockage du test (photos d'appel et captures). */
const testerFiles = () => [...ctx.storage.files.keys()].filter((key) => key.startsWith('testers/'))

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

/** Inès signale l'appel, puis Louis le retire. */
const removeCall = async (callId: string) => {
  later()
  await act.report(ines, { kind: 'call', id: callId })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'call', id: callId },
    ground: 'rules',
    explanation: 'Cet appel enfreint les règles de la communauté.',
  })
}

/** Sami a été testeur et l'est resté par son fil, puis a quitté : un ancien testeur. */
const makeSamiFormer = async (projectId: string) => {
  await join(projectId, sami)
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/threads/${samiId}/messages`, sami, {
    kind: 'feedback',
    outcome: 'yes',
    device: null,
    text: null,
    captureId: null,
  })
  expect(res.status).toBe(201)
  later()
  await expectDone(await act.send('DELETE', `/v1/projects/${projectId}/testers`, sami))
}

describe('launching a call', () => {
  it('lets the author launch a call, shown to the author and the testers', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    const call = await launch(project.id)
    const at = new Date().toISOString()

    expect(call).toEqual({
      id: expect.any(String),
      text: 'Essayez le niveau 3 ce week-end, surtout sur téléphone.',
      photo: null,
      createdAt: at,
      removal: null,
    })
    expect(await calls(project.id, jean)).toEqual({ items: [call], nextCursor: null })
    expect(await calls(project.id, ines)).toEqual({ items: [call], nextCursor: null })
  })

  it('keeps line breaks and trims the text', async () => {
    const project = await publishProject()

    const call = await launch(
      project.id,
      simple('  Niveau 3 ce week-end.\nSurtout sur téléphone.  '),
    )

    expect(call.text).toBe('Niveau 3 ce week-end.\nSurtout sur téléphone.')
  })

  it('takes 500 characters, and refuses more', async () => {
    const project = await publishProject()

    expect((await launch(project.id, simple('é'.repeat(CALL_TEXT_MAX)))).text).toHaveLength(
      CALL_TEXT_MAX,
    )
    await expectError(
      await postCall(project.id, jean, simple('é'.repeat(CALL_TEXT_MAX + 1))),
      400,
      'validation',
    )
    expect((await calls(project.id, jean)).items).toHaveLength(1)
  })

  it('refuses an empty call, or one made only of spaces', async () => {
    const project = await publishProject()

    for (const text of ['', '   ', '\n\n']) {
      await expectError(await postCall(project.id, jean, simple(text)), 400, 'validation')
    }
    await expectError(await postCall(project.id, jean, { photoId: null }), 400, 'validation')
    expect((await calls(project.id, jean)).items).toEqual([])
  })

  it('refuses a call made only of U+200B and combining marks', async () => {
    const project = await publishProject()

    for (const text of [
      ZERO_WIDTH_SPACE.repeat(3),
      `${COMBINING_ACUTE}${COMBINING_GRAPHEME_JOINER}`,
      ` ${ZERO_WIDTH_SPACE}${COMBINING_ACUTE} `,
    ]) {
      await expectError(await postCall(project.id, jean, simple(text)), 400, 'validation')
    }
    expect((await calls(project.id, jean)).items).toEqual([])
  })

  it('refuses unknown fields', async () => {
    const project = await publishProject()

    await expectError(
      await postCall(project.id, jean, { ...simple(), pinned: true }),
      400,
      'validation',
    )
    expect((await calls(project.id, jean)).items).toEqual([])
  })
})

describe('the photo of a call', () => {
  it('attaches a pending photo of the author, with its description', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const photo = await upload(project.id)

    const call = await launch(project.id, {
      ...simple(),
      photoId: photo.id,
      photoDescription: 'Le niveau 3, la fusée au départ.',
    })

    expect(call.photo).toMatchObject({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      description: 'Le niveau 3, la fusée au départ.',
    })
    expect((await calls(project.id, ines)).items[0]?.photo?.id).toBe(photo.id)
  })

  it('never attaches one pending photo to two calls', async () => {
    const project = await publishProject()
    const photo = await upload(project.id)
    await launch(project.id, { ...simple(), photoId: photo.id, photoDescription: null })

    const res = await postCall(project.id, jean, {
      ...simple('Et maintenant le niveau 4.'),
      photoId: photo.id,
      photoDescription: null,
    })

    await expectError(res, 400, 'invalid_photo')
    expect((await calls(project.id, jean)).items).toHaveLength(1)
  })

  it('refuses a photo of another project, a capture of a tester, or an unknown photo', async () => {
    const project = await publishProject()
    const garden = await publishProject(jean, 'Le carnet de jardin')
    await join(project.id, ines)
    const otherProject = await upload(garden.id)
    const capture = await upload(project.id, ines, 'capture')

    for (const [what, photoId] of [
      ['another project', otherProject.id],
      ['a tester capture', capture.id],
      ['unknown', UNKNOWN],
    ] as const) {
      const res = await postCall(project.id, jean, { ...simple(), photoId, photoDescription: null })
      expect(res.status, what).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code, what).toBe('invalid_photo')
    }
    expect((await calls(project.id, jean)).items).toEqual([])
    // Témoin : la photo de l'autre projet sert à un appel de ce projet-là.
    await launch(garden.id, { ...simple(), photoId: otherProject.id, photoDescription: null })
  })

  it('refuses a description without a photo', async () => {
    const project = await publishProject()

    const res = await postCall(project.id, jean, {
      ...simple(),
      photoId: null,
      photoDescription: 'Une photo qui n’existe pas.',
    })

    await expectError(res, 400, 'validation')
    expect((await calls(project.id, jean)).items).toEqual([])
  })
})

describe('the order of the calls', () => {
  it('lists the calls from the most recent to the oldest', async () => {
    const project = await publishProject()
    const first = await launch(project.id, simple('Premier appel.'))
    const second = await launch(project.id, simple('Deuxième appel.'))
    const third = await launch(project.id, simple('Troisième appel.'))

    expect((await calls(project.id, jean)).items.map((call) => call.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ])
  })

  it('reads the calls 20 by 20, the next page from the cursor', async () => {
    const project = await publishProject()
    const launched: string[] = []
    // 21 appels : 5 par jour et par projet au plus, on avance d'un jour tous les 5.
    for (let i = 0; i < CALLS_PAGE_SIZE + 1; i++) {
      if (i > 0 && i % 5 === 0) later(DAY)
      launched.push((await launch(project.id, simple(`Appel numéro ${i + 1}.`))).id)
    }
    const newestFirst = [...launched].reverse()

    const page = await calls(project.id, jean)
    expect(page.items.map((call) => call.id)).toEqual(newestFirst.slice(0, CALLS_PAGE_SIZE))
    expect(page.nextCursor).not.toBeNull()

    const next = await calls(project.id, jean, page.nextCursor ?? '')
    expect(next.items.map((call) => call.id)).toEqual(newestFirst.slice(CALLS_PAGE_SIZE))
    expect(next.nextCursor).toBeNull()
  })
})

describe('who sees the calls', () => {
  it('refuses another member and a visitor, and shows the call nowhere else', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await launch(project.id, simple('Essayez le niveau xylophone ce week-end.'))
    const unknown = await readCalls(UNKNOWN, malik)
    expect(unknown.status).toBe(404)
    const expected = await unknown.json()

    const other = await readCalls(project.id, malik)
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(expected)
    await expectError(await readCalls(project.id, null), 401, 'unauthorized')

    // Ni la page du projet, ni le fil, ni la recherche, ni Activité ne montrent l'appel à Malik.
    expect((await act.send('POST', `/v1/projects/${project.id}/follow`, malik)).status).toBe(204)
    for (const path of [
      `/v1/projects/${project.id}`,
      '/v1/feed/following',
      '/v1/search?q=xylophone',
      '/v1/notifications',
    ]) {
      const res = await act.send('GET', path, malik)
      expect(res.status, path).toBe(200)
      expect(await res.text(), path).not.toContain('xylophone')
    }
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    const project = await publishProject()
    expect((await calls(project.id, jean)).items).toEqual([]) // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await readCalls(id, jean), 404, 'not_found')
    }
  })

  it('refuses a former tester the calls', async () => {
    const project = await publishProject()
    await launch(project.id)
    await makeSamiFormer(project.id)

    const res = await readCalls(project.id, sami)

    expect(res.status).toBe(404)
    await join(project.id, ines)
    expect((await calls(project.id, ines)).items).toHaveLength(1) // témoin
  })

  it('shows a removed call to the author only, with its removal', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const kept = await launch(project.id, simple('Un appel resté.'))
    const removed = await launch(project.id, simple('Un appel retiré.'))

    await removeCall(removed.id)

    const mine = await calls(project.id, jean)
    expect(mine.items.map((call) => call.id)).toEqual([removed.id, kept.id])
    expect(mine.items[0]?.removal).toMatchObject({
      ground: 'rules',
      explanation: 'Cet appel enfreint les règles de la communauté.',
    })
    expect(mine.items[1]?.removal).toBeNull()
    // Inès, la testeuse, ne voit plus que l'appel resté, et rien du retrait.
    const res = await readCalls(project.id, ines)
    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(TesterCallPage.parse(JSON.parse(raw)).items.map((call) => call.id)).toEqual([kept.id])
    expect(raw).not.toContain(removed.id)
  })
})

describe('who launches a call', () => {
  it('refuses a tester and another member, and writes nothing', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const unknown = await postCall(UNKNOWN, malik)
    expect(unknown.status).toBe(404)
    const expected = await unknown.json()

    // Un autre membre : comme un projet inconnu, avant même de lire le corps.
    for (const body of [simple(), {}, 42]) {
      const res = await postCall(project.id, malik, body)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(expected)
    }
    // La testeuse lit les appels, mais n'en lance pas.
    expect([403, 404]).toContain((await postCall(project.id, ines)).status)
    await expectError(await postCall(project.id, null), 401, 'unauthorized')

    expect((await calls(project.id, jean)).items).toEqual([])
    await launch(project.id) // témoin
  })

  it('refuses a call when the corner is closed by a private or removed project', async () => {
    const hidden = await publishProject()
    const removed = await publishProject(jean, 'Le carnet de jardin')
    await act.setVisibility(hidden.id, jean, 'private')
    await removeProject(removed.id)

    await expectError(await postCall(hidden.id, jean), 409, 'corner_closed')
    await expectError(await postCall(removed.id, jean), 409, 'corner_closed')

    // L'auteur relit toujours son coin fermé.
    expect((await calls(hidden.id, jean)).items).toEqual([])
    expect((await calls(removed.id, jean)).items).toEqual([])
  })

  it('refuses a suspended author, who still reads and deletes his calls', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const call = await launch(project.id)
    await suspendJean()

    await expectError(await postCall(project.id, jean), 403, 'suspended')

    expect((await calls(project.id, jean)).items).toHaveLength(1)
    expect((await readCalls(project.id, ines)).status).toBe(404)
    // Supprimer ce qui est à soi reste permis pendant la suspension.
    await expectDone(await deleteCall(project.id, call.id))
    expect((await calls(project.id, jean)).items).toEqual([])
  })
})

describe('deleting a call', () => {
  it('lets the author delete a call, gone for the testers', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const kept = await launch(project.id, simple('Un appel gardé.'))
    const call = await launch(project.id, simple('Un appel supprimé.'))

    await expectDone(await deleteCall(project.id, call.id))

    expect((await calls(project.id, jean)).items.map((c) => c.id)).toEqual([kept.id])
    expect((await calls(project.id, ines)).items.map((c) => c.id)).toEqual([kept.id])
  })

  it('erases the photo file with the call', async () => {
    const project = await publishProject()
    const photo = await upload(project.id)
    const call = await launch(project.id, {
      ...simple(),
      photoId: photo.id,
      photoDescription: null,
    })
    expect(testerFiles()).toHaveLength(1)

    await expectDone(await deleteCall(project.id, call.id))

    expect(testerFiles()).toEqual([])
  })

  it('refuses a tester and another member, and deletes nothing', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const call = await launch(project.id)
    const other = await publishProject(malik, 'Le carnet de Malik')
    const otherCall = await launch(other.id, simple(), malik)

    expect((await deleteCall(project.id, call.id, malik)).status).toBe(404)
    expect([403, 404]).toContain((await deleteCall(project.id, call.id, ines)).status)
    await expectError(await deleteCall(project.id, call.id, null), 401, 'unauthorized')
    // L'appel d'un autre projet, cité sous le sien : introuvable.
    await expectError(await deleteCall(project.id, otherCall.id), 404, 'not_found')
    for (const id of [UNKNOWN, 'pas-un-identifiant']) {
      await expectError(await deleteCall(project.id, id), 404, 'not_found')
    }

    expect((await calls(project.id, jean)).items).toHaveLength(1)
    expect((await calls(other.id, malik)).items).toHaveLength(1)
    await expectDone(await deleteCall(project.id, call.id)) // témoin
  })
})

describe('limits against abuse', () => {
  it('blocks the 6th call of the day on a project, and allows another project', async () => {
    const project = await publishProject()
    const garden = await publishProject(jean, 'Le carnet de jardin')
    for (let i = 0; i < 5; i++) await launch(project.id, simple(`Appel ${i + 1}.`))

    const res = await postCall(project.id, jean)

    await expectError(res, 429, 'project_calls_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect((await calls(project.id, jean)).items).toHaveLength(5)
    // Le plafond est propre à chaque projet.
    await launch(garden.id)
  })

  it('lets the author launch calls again the next day', async () => {
    const project = await publishProject()
    for (let i = 0; i < 5; i++) await launch(project.id, simple(`Appel ${i + 1}.`))
    expect((await postCall(project.id, jean)).status).toBe(429)

    later(DAY)

    await launch(project.id)
  })

  it('counts even malformed calls of the author in the quota of the project', async () => {
    const project = await publishProject()
    // Le quota du projet se compte avant le corps (« chaque demande compte »).
    for (let i = 0; i < 5; i++) {
      await expectError(await postCall(project.id, jean, {}), 400, 'validation')
    }

    await expectError(await postCall(project.id, jean), 429, 'project_calls_limited')
    expect((await calls(project.id, jean)).items).toEqual([])
  })

  it('counts the calls of a project once, whatever the case of its identifier', async () => {
    const project = await publishProject()
    // z.uuid() et PostgreSQL ignorent la casse : la même adresse en majuscules désigne le même projet,
    // et son plafond de 5 appels par jour ne se contourne pas en alternant les graphies.
    for (let i = 0; i < 5; i++) {
      const written = i % 2 === 0 ? project.id : project.id.toUpperCase()
      expect((await postCall(written, jean, simple(`Appel ${i + 1}.`))).status).toBe(201)
    }

    await expectError(await postCall(project.id.toUpperCase(), jean), 429, 'project_calls_limited')
    await expectError(await postCall(project.id, jean), 429, 'project_calls_limited')
    expect((await calls(project.id, jean)).items).toHaveLength(5)
  })

  it('counts even requests on an unknown call in the change quota', async () => {
    const project = await publishProject()
    const call = await launch(project.id)
    // 60 modifications par heure : il en a déjà fait 59 ; un appel inconnu fait la 60e.
    await ctx.db
      .insert(schema.apiRateLimit)
      .values({ key: memberCounterKeys(jeanId).projectChange, count: 59, windowStart: Date.now() })
    await expectError(await deleteCall(project.id, UNKNOWN), 404, 'not_found')

    const res = await deleteCall(project.id, call.id)
    await expectError(res, 429, 'rate_limited')
    expect((await calls(project.id, jean)).items).toHaveLength(1)
  })

  it('does not spend the author’s daily calls when another member posts calls', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    // La testeuse et un autre membre envoient des appels : refusés, et jamais comptés pour le projet.
    for (let i = 0; i < 5; i++) {
      expect((await postCall(project.id, malik)).status).toBe(404)
      expect([403, 404]).toContain((await postCall(project.id, ines)).status)
    }

    for (let i = 0; i < 5; i++) await launch(project.id, simple(`Appel ${i + 1}.`))
    expect((await calls(project.id, ines)).items).toHaveLength(5)
  })

  it('counts even malformed requests in the member quota of calls', async () => {
    const project = await publishProject()
    const own = await publishProject(malik, 'Le carnet de Malik')
    // 20 demandes par membre et par jour, comptées avant tout examen : identifiant mal formé,
    // projet inconnu, projet d'un autre, corps illisible.
    for (let i = 0; i < 5; i++) {
      expect((await postCall('pas-un-identifiant', malik)).status).toBe(404)
      expect((await postCall(crypto.randomUUID(), malik)).status).toBe(404)
      expect((await postCall(project.id, malik, {})).status).toBe(404)
      expect((await postCall(project.id, malik, 42)).status).toBe(404)
    }

    // La 21e, sur son propre projet et bien formée, est refusée.
    const res = await postCall(own.id, malik)
    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect((await calls(own.id, malik)).items).toEqual([])

    // Le lendemain, il lance son appel.
    later(DAY)
    await launch(own.id, simple(), malik)
  })
})

describe('the API contract', () => {
  it('documents the call routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(doc.paths['/v1/projects/{id}/calls']).toHaveProperty('get')
    expect(doc.paths['/v1/projects/{id}/calls']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/calls/{callId}']).toHaveProperty('delete')
  })
})
