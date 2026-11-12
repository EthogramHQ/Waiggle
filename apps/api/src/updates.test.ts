// Tests d'intégration de la tranche R7a : les mises à jour d'un projet (publier, lire la frise,
// supprimer), qui remplacent les notes du Journal de la tranche 4b. Scénario :
// docs/scenarios/refonte.md, section R7a (« Publier une mise à jour », « Les mises à jour sur la
// page projet », « La frise », « Supprimer une mise à jour ») ; relecture de sécurité du plan :
// B4 (une mise à jour retirée ne compte pas), A1 (le rattachement des photos), A2 (l'ordre des
// gardes), A7 (les lignes relues sans confiance), A12 (le curseur de la frise).
// Les mises à jour dans le fil et les notifications sont testées par feed.test.ts et
// notifications.test.ts, l'export et la suppression du compte par accounts.test.ts, les photos en
// attente par visuals.test.ts, les testeurs par testers.test.ts.
//
// Quatre membres : Papi Jean (l'auteur), Inès (une autre membre ; en R7b, sa testeuse), Malik (un
// troisième, qui signale) et Louis (l'administrateur, qui retire). R7b ajoute, en fin de fichier, les
// retours de testeurs qu'une mise à jour règle (`settledFeedbackIds`).
//
// Le temps est maîtrisé par le test (vi.useFakeTimers, seule Date est remplacée) : les mises à jour
// ont des dates distinctes et dans un ordre connu, et la limite de 10 mises à jour par jour se
// vérifie sans attendre un jour entier.
//
// Les tables et colonnes neuves de R7a (project_update, project_media.update_id) se lisent en SQL
// brut : elles ne sont pas encore dans le schéma typé quand ces tests sont écrits.
import {
  DiscoverFeedPage,
  ErrorResponse,
  type NewProjectUpdate,
  NotificationPage,
  OpenFeedbackList,
  Project,
  ProjectUpdate,
  ProjectUpdatePage,
  TesterMessage,
  TesterMessagePage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, photoWithGps, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let ines: string
let malik: string
let louis: string
let jeanId: string
let inesId: string

const START = Date.parse('2026-11-02T08:00:00.000Z')
const MINUTE = 60 * 1000

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
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
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  jeanId = (await act.me(jean)).id
  inesId = (await act.me(ines)).id
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

/** Une requête SQL brute ; le résultat n'est pas typé, on précise sa forme nous-mêmes. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Le nombre de mises à jour gardées en base, tous projets confondus. */
const storedUpdateCount = async () =>
  (await rows<{ n: number }>(sql`select count(*)::int as n from project_update`))[0]?.n

/** Ce que la base sait d'une photo : sa mise à jour (null : en attente), sa place, sa description. */
const photoRow = async (id: string) =>
  (
    await rows<{ update_id: string | null; position: number; description: string | null }>(
      sql`select update_id, position, description from project_media where id = ${id}`,
    )
  )[0]

/** Publie un projet de Papi Jean (public par défaut) et le rend. */
const publishProject = (cookie = jean, body: object = {}) =>
  act.publish(cookie, 'Décollage !', { pitch: 'Un quiz de l’espace pour les petits.', ...body })

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

// --- Les photos en attente ---

/**
 * Envoie une photo pour une mise à jour pas encore publiée (`slot=update`), et rend son identifiant
 * et sa clé de stockage. La réponse de l'envoi n'est pas lue : on retrouve la photo en base, la
 * seule ligne `update` de ce projet qui n'y était pas avant.
 */
const pendingPhoto = async (projectId: string, cookie = jean, color = '#d9a441') => {
  const known = await updatePhotosOf(projectId)
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(800, 600, color), 'update'),
  })
  expect(res.status).toBe(201)
  const added = (await updatePhotosOf(projectId)).filter(
    (photo) => !known.some((k) => k.id === photo.id),
  )
  expect(added).toHaveLength(1)
  const [photo] = added
  if (!photo) throw new Error('no pending photo')
  return { id: photo.id, key: photo.storage_key }
}

const updatePhotosOf = (projectId: string) =>
  rows<{ id: string; storage_key: string }>(
    sql`select id, storage_key from project_media where project_id = ${projectId} and slot = 'update'`,
  )

/** Une photo de la galerie de ce projet ; rend son identifiant. */
const galleryPhoto = async (projectId: string, cookie = jean) => {
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await photoWithGps()),
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json()).visuals.at(-1)?.id ?? ''
}

// --- Les mises à jour ---

const updatesPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/updates`
const updatePath = (projectId: string, updateId: string) =>
  `${updatesPath(projectId)}/${encodeURIComponent(updateId)}`

/** Le corps le plus simple qui soit accepté : une seule ligne « Nouveau ». */
const simple = (changes: Partial<NewProjectUpdate> = {}): NewProjectUpdate => ({
  title: null,
  version: null,
  lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
  photos: [],
  beforeAfter: false,
  ...changes,
})

/** Demande la publication d'une mise à jour, une minute après ce qui précède ; réponse brute. */
const postUpdate = (projectId: string, cookie: string | null, body: unknown = simple()) => {
  later()
  return act.send('POST', updatesPath(projectId), cookie, body)
}

/**
 * Publie une mise à jour qui doit être acceptée et la rend. 160 minutes la séparent de la
 * précédente : neuf écarts font 24 heures, si bien qu'une longue suite reste sous la limite de 10
 * par jour (la frise en demande 22).
 */
const publishUpdate = async (
  projectId: string,
  changes: Partial<NewProjectUpdate> = {},
  cookie = jean,
) => {
  later(159)
  const res = await postUpdate(projectId, cookie, simple(changes))
  expect(res.status).toBe(201)
  return ProjectUpdate.parse(await res.json())
}

/** Une mise à jour dont la seule ligne dit son rang, pour reconnaître l'ordre de la frise. */
const numbered = (projectId: string, n: number) =>
  publishUpdate(projectId, { lines: [{ family: 'new', text: `Changement ${n}` }] })

const deleteUpdate = (projectId: string, updateId: string, cookie: string | null) => {
  later()
  return act.send('DELETE', updatePath(projectId, updateId), cookie)
}

/** La page d'un projet, telle que la voit ce membre (elle doit être visible). */
const readProject = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

/** Une page de la frise, réponse brute. */
const getUpdates = (projectId: string, cookie: string | null, query = '') =>
  act.send('GET', `${updatesPath(projectId)}${query}`, cookie)

const readUpdates = async (projectId: string, cookie: string, cursor?: string) => {
  const res = await getUpdates(
    projectId,
    cookie,
    cursor ? `?cursor=${encodeURIComponent(cursor)}` : '',
  )
  expect(res.status).toBe(200)
  return ProjectUpdatePage.parse(await res.json())
}

/** Les textes des premières lignes d'une page de la frise, dans l'ordre de l'API. */
const firstLines = (page: ProjectUpdatePage) => page.items.map((item) => item.lines[0]?.text)

/**
 * La modération retire une mise à jour : Malik la signale, puis Louis la retire (le retrait exige
 * un signalement ouvert, reports/decide.ts).
 */
const removeByModeration = async (updateId: string) => {
  later()
  await act.report(malik, { kind: 'update', id: updateId })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'update', id: updateId },
    ground: 'rules',
    explanation: 'Cette mise à jour enfreint les règles de la communauté.',
  })
}

/** La modération retire un projet entier (écrit en base, comme dans visuals.test.ts). */
const removeProject = (projectId: string) =>
  ctx.db
    .update(schema.project)
    .set({ removedAt: new Date() })
    .where(eq(schema.project.id, projectId))

describe('publishing an update', () => {
  it('lets the author publish an update on his project, and answers with it', async () => {
    const project = await publishProject()
    const before = await pendingPhoto(project.id, jean, '#1b2a4a')
    const after = await pendingPhoto(project.id, jean, '#f2c14e')
    const lines = [
      { family: 'new', text: 'Un compte à rebours avant chaque question' },
      { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
    ] as const

    const res = await postUpdate(project.id, jean, {
      title: 'Le décompte de la fusée',
      version: 'v1.2',
      lines,
      photos: [
        { id: before.id, description: 'La fusée de jour' },
        { id: after.id, description: null },
      ],
      beforeAfter: true,
    })

    expect(res.status).toBe(201)
    const published = ProjectUpdate.parse(await res.json())
    expect(published).toMatchObject({
      title: 'Le décompte de la fusée',
      version: 'v1.2',
      lines,
      beforeAfter: true,
      removal: null,
    })
    // Sa date est celle de la publication (l'horloge du test), écrite par l'API.
    expect(Date.parse(published.createdAt)).toBe(Date.now())
    // Les photos, dans l'ordre de la mise à jour (« Avant » puis « Après »), avec leur description.
    expect(published.photos.map((photo) => [photo.id, photo.description])).toEqual([
      [before.id, 'La fusée de jour'],
      [after.id, null],
    ])
    expect(published.photos[0]?.url).toMatch(new RegExp(`/media/${before.key}$`))
    // Elle est aussitôt la dernière mise à jour du projet, pour l'auteur comme pour les autres.
    expect((await readProject(project.id, jean)).latestUpdate).toEqual(published)
    expect((await readProject(project.id, ines)).latestUpdate).toEqual(published)
  })

  it('attaches the photos to the update, in its order, with their descriptions', async () => {
    const project = await publishProject()
    const first = await pendingPhoto(project.id)
    const second = await pendingPhoto(project.id)

    const published = await publishUpdate(project.id, {
      photos: [
        { id: second.id, description: 'La fusée de nuit' },
        { id: first.id, description: '   ' }, // vide une fois les bords retirés : pas de description
      ],
    })

    expect(await photoRow(second.id)).toEqual({
      update_id: published.id,
      position: 0,
      description: 'La fusée de nuit',
    })
    expect(await photoRow(first.id)).toEqual({
      update_id: published.id,
      position: 1,
      description: null,
    })
  })

  it('keeps the three families and the order of the lines, and trims each one', async () => {
    const project = await publishProject()

    const published = await publishUpdate(project.id, {
      lines: [
        { family: 'polish', text: '  Des étoiles qui scintillent  ' },
        { family: 'fixed', text: 'La lune ne disparaît plus à minuit' },
        { family: 'new', text: 'Un mode nuit' },
      ],
    })

    expect(published.lines).toEqual([
      { family: 'polish', text: 'Des étoiles qui scintillent' },
      { family: 'fixed', text: 'La lune ne disparaît plus à minuit' },
      { family: 'new', text: 'Un mode nuit' },
    ])
  })

  it('leaves the project itself unchanged', async () => {
    // « Mis à jour » suit désormais la dernière mise à jour : le projet n'est pas modifié.
    const project = await publishProject()
    later(60)

    await publishUpdate(project.id)

    expect((await readProject(project.id, jean)).updatedAt).toBe(project.updatedAt)
  })

  it('is only for signed-in members', async () => {
    const project = await publishProject()

    await expectError(await postUpdate(project.id, null), 401, 'unauthorized')
    expect(await storedUpdateCount()).toBe(0)
    // Témoin : la même demande, avec la session de l'auteur, réussit (la route existe bien).
    expect((await postUpdate(project.id, jean)).status).toBe(201)
  })

  it('cannot be triggered from another website', async () => {
    const project = await publishProject()

    const res = await ctx.request(updatesPath(project.id), {
      method: 'POST',
      headers: { cookie: jean, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(simple()),
    })

    expect(res.status).toBe(403)
    expect(await storedUpdateCount()).toBe(0)
    expect((await postUpdate(project.id, jean)).status).toBe(201) // témoin
  })

  it('refuses an update on the public project of another member', async () => {
    const project = await publishProject()

    await expectError(await postUpdate(project.id, ines), 403, 'forbidden')

    expect(await storedUpdateCount()).toBe(0)
    expect((await readProject(project.id, jean)).latestUpdate).toBeNull()
  })

  it('answers « not found » for the private project of another member, as for an unknown one', async () => {
    const draft = await publishProject(jean, { visibility: 'private' })
    // Témoin : l'auteur, lui, publie sur son brouillon (le 404 ne vient pas d'une route absente).
    expect((await postUpdate(draft.id, jean)).status).toBe(201)

    const res = await postUpdate(draft.id, ines)
    const unknown = await postUpdate(UNKNOWN, ines)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    expect(await storedUpdateCount()).toBe(1)
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    expect((await postUpdate((await publishProject()).id, jean)).status).toBe(201) // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await postUpdate(id, jean), 404, 'not_found')
    }
  })

  it('refuses to publish on my project removed by the moderation', async () => {
    const project = await publishProject()
    const photo = await pendingPhoto(project.id)
    await removeProject(project.id)

    const res = await postUpdate(
      project.id,
      jean,
      simple({ photos: [{ id: photo.id, description: null }] }),
    )

    await expectError(res, 409, 'removed')
    expect(await storedUpdateCount()).toBe(0)
    // La photo reste en attente : rien n'a été rattaché.
    expect((await photoRow(photo.id))?.update_id).toBeNull()
  })

  it('lets the author publish on his private project, and shows it to him alone', async () => {
    const draft = await publishProject(jean, { visibility: 'private' })

    const published = await publishUpdate(draft.id, {
      lines: [{ family: 'new', text: 'Encore en chantier' }],
    })

    expect((await readProject(draft.id, jean)).latestUpdate).toEqual(published)
    const res = await act.send('GET', `/v1/projects/${draft.id}`, ines)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('Encore en chantier')
  })
})

describe('what an update may contain', () => {
  it('refuses no line, a sixth line, an empty or invisible line, and a line over 120 characters', async () => {
    const project = await publishProject()
    const line = (text: string) => ({ family: 'new', text })
    for (const lines of [
      [],
      Array.from({ length: 6 }, (_, i) => line(`Changement ${i + 1}`)),
      [line('')],
      [line('   ')],
      [line(`Mode nuit${String.fromCodePoint(0x200b)}`)],
      [line(String.fromCodePoint(0x034f))], // un caractère qui ne dessine rien
      [line('Deux\nlignes')],
      [line('é'.repeat(121))],
      [{ family: 'bug', text: 'Une famille inconnue' }],
      [line('Une bonne ligne'), line('')], // une ligne vide parmi d'autres : l'appli les retire avant
    ]) {
      const res = await postUpdate(project.id, jean, simple({ lines } as Partial<NewProjectUpdate>))
      expect(res.status, JSON.stringify(lines).slice(0, 80)).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
    expect(await storedUpdateCount()).toBe(0)
    // Témoin : cinq lignes de 120 caractères passent. Les dix refus ont compté contre le quota
    // (10 par 24 h, chaque demande compte) : le témoin part le lendemain.
    later(24 * 60 + 1)
    const five = Array.from({ length: 5 }, () => line('é'.repeat(120)))
    expect(
      (await postUpdate(project.id, jean, simple({ lines: five } as Partial<NewProjectUpdate>)))
        .status,
    ).toBe(201)
  })

  it('refuses a title over 60 characters and a version over 20', async () => {
    const project = await publishProject()

    for (const changes of [{ title: 'T'.repeat(61) }, { version: 'v'.repeat(21) }]) {
      await expectError(await postUpdate(project.id, jean, simple(changes)), 400, 'validation')
    }
    expect(await storedUpdateCount()).toBe(0)
    const accepted = await publishUpdate(project.id, {
      title: 'T'.repeat(60),
      version: 'v'.repeat(20),
    })
    expect(accepted).toMatchObject({ title: 'T'.repeat(60), version: 'v'.repeat(20) })
  })

  it('refuses a before / after with fewer than two photos', async () => {
    const project = await publishProject()
    const photo = await pendingPhoto(project.id)

    for (const photos of [[], [{ id: photo.id, description: null }]]) {
      await expectError(
        await postUpdate(project.id, jean, simple({ photos, beforeAfter: true })),
        400,
        'validation',
      )
    }
    expect(await storedUpdateCount()).toBe(0)
    expect((await photoRow(photo.id))?.update_id).toBeNull()
  })

  it('refuses more than four photos, and the same photo twice', async () => {
    const project = await publishProject()
    const ids = []
    for (let i = 0; i < 4; i++) ids.push((await pendingPhoto(project.id)).id)
    const cite = (list: string[]) => list.map((id) => ({ id, description: null }))
    const [first = ''] = ids

    for (const photos of [cite([...ids, UNKNOWN]), cite([first, first])]) {
      await expectError(await postUpdate(project.id, jean, simple({ photos })), 400, 'validation')
    }
    expect(await storedUpdateCount()).toBe(0)
    // Témoin : les quatre, une fois chacune, passent.
    expect((await postUpdate(project.id, jean, simple({ photos: cite(ids) }))).status).toBe(201)
  })

  it('refuses a photo already attached to another update', async () => {
    const project = await publishProject()
    const photo = await pendingPhoto(project.id)
    const first = await publishUpdate(project.id, { photos: [{ id: photo.id, description: null }] })

    const res = await postUpdate(
      project.id,
      jean,
      simple({ photos: [{ id: photo.id, description: 'Volée' }] }),
    )

    await expectError(res, 400, 'invalid_photos')
    // La première mise à jour garde sa photo, et aucune seconde mise à jour n'existe.
    expect(await photoRow(photo.id)).toMatchObject({ update_id: first.id, description: null })
    expect(await storedUpdateCount()).toBe(1)
  })

  it('answers the same 400 for an unknown photo, a gallery photo and a photo of someone else’s project', async () => {
    const project = await publishProject()
    const other = await publishProject(jean, { title: 'Le carnet de jardin' })
    const malikProject = await publishProject(malik)
    const cases = {
      unknown: UNKNOWN,
      gallery: await galleryPhoto(project.id),
      'pending on another of my projects': (await pendingPhoto(other.id)).id,
      'pending on the project of another member': (await pendingPhoto(malikProject.id, malik)).id,
    }

    const bodies = []
    for (const [what, id] of Object.entries(cases)) {
      const res = await postUpdate(
        project.id,
        jean,
        simple({ photos: [{ id, description: null }] }),
      )
      expect(res.status, what).toBe(400)
      const body = await res.json()
      expect(ErrorResponse.parse(body).error.code, what).toBe('invalid_photos')
      bodies.push(body)
    }

    // Les quatre réponses sont identiques : rien ne dit pourquoi la photo est refusée.
    for (const body of bodies) expect(body).toEqual(bodies[0])
    expect(await storedUpdateCount()).toBe(0)
    expect((await photoRow(cases['pending on another of my projects']))?.update_id).toBeNull()
    expect(
      (await photoRow(cases['pending on the project of another member']))?.update_id,
    ).toBeNull()
  })

  it('publishes nothing when one photo out of two is invalid', async () => {
    const project = await publishProject()
    const valid = await pendingPhoto(project.id)

    const res = await postUpdate(
      project.id,
      jean,
      simple({
        photos: [
          { id: valid.id, description: 'La fusée' },
          { id: UNKNOWN, description: null },
        ],
      }),
    )

    await expectError(res, 400, 'invalid_photos')
    expect(await storedUpdateCount()).toBe(0)
    // La photo valide reste en attente, sans la description envoyée.
    expect(await photoRow(valid.id)).toMatchObject({ update_id: null, description: null })
  })
})

describe('the order of the checks', () => {
  // Les droits et le quota passent avant le corps (relecture A2) : ces tests envoient exprès un
  // corps invalide.
  it('answers 403 to another member before reading the body', async () => {
    const shown = await publishProject()
    const draft = await publishProject(jean, { visibility: 'private' })

    for (const body of [{}, 42]) {
      await expectError(await postUpdate(shown.id, ines, body), 403, 'forbidden')
      const hidden = await postUpdate(draft.id, ines, body)
      const missing = await postUpdate(UNKNOWN, ines, body)
      expect(hidden.status).toBe(404)
      expect(await hidden.json()).toEqual(await missing.json())
    }
  })

  it('counts even malformed requests in the update quota', async () => {
    const project = await publishProject()
    for (let i = 0; i < 10; i++) expect((await postUpdate(project.id, jean, {})).status).toBe(400)

    // La 11e demande du jour, même valide, est refusée.
    const res = await postUpdate(project.id, jean)
    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(await storedUpdateCount()).toBe(0)
  })

  it('refuses an update body over 16 KB', async () => {
    const project = await publishProject()

    const res = await postUpdate(project.id, jean, { ...simple(), title: 'T'.repeat(17 * 1024) })

    await expectError(res, 413, 'payload_too_large')
    expect(await storedUpdateCount()).toBe(0)
  })
})

describe('limits against abuse', () => {
  it('blocks the 11th update within a day, all projects of the member together', async () => {
    const rocket = await publishProject()
    const garden = await publishProject(jean, { title: 'Le carnet de jardin' })
    for (let i = 0; i < 5; i++) {
      expect((await postUpdate(rocket.id, jean)).status).toBe(201)
      expect((await postUpdate(garden.id, jean)).status).toBe(201)
    }

    const res = await postUpdate(rocket.id, jean)

    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(await storedUpdateCount()).toBe(10)
    // La limite est propre à chaque membre : Inès, elle, publie encore sur son projet.
    expect((await postUpdate((await publishProject(ines)).id, ines)).status).toBe(201)
  })

  it('lets the member publish updates again the next day', async () => {
    const project = await publishProject()
    for (let i = 0; i < 10; i++) expect((await postUpdate(project.id, jean)).status).toBe(201)
    expect((await postUpdate(project.id, jean)).status).toBe(429)

    later(24 * 60) // un jour plus tard

    expect((await postUpdate(project.id, jean)).status).toBe(201)
  })
})

describe('the updates on the project page', () => {
  it('starts with no update, no version and a count of zero', async () => {
    const project = await publishProject()

    expect(project).toMatchObject({ latestUpdate: null, updateCount: 0, version: null })
    expect(await readProject(project.id, ines)).toMatchObject({
      latestUpdate: null,
      updateCount: 0,
      version: null,
    })
  })

  it('shows the latest update in full, and counts the updates', async () => {
    const project = await publishProject()
    await numbered(project.id, 1)
    await numbered(project.id, 2)
    const third = await numbered(project.id, 3)

    for (const cookie of [jean, ines]) {
      const seen = await readProject(project.id, cookie)
      expect(seen.latestUpdate).toEqual(third)
      expect(seen.updateCount).toBe(3)
    }
  })

  it('shows the version of the latest update that has one', async () => {
    const project = await publishProject()
    await publishUpdate(project.id, { version: 'v1.1' })
    await publishUpdate(project.id, { version: 'v1.2' })
    const latest = await publishUpdate(project.id, { version: null })

    const seen = await readProject(project.id, ines)

    expect(seen.version).toBe('v1.2')
    expect(seen.latestUpdate?.id).toBe(latest.id)
  })

  it('never shows the version of a removed update under the project title', async () => {
    const project = await publishProject()
    const kept = await publishUpdate(project.id, { version: 'v1.1' })
    const removed = await publishUpdate(project.id, { version: 'v1.2' })
    await removeByModeration(removed.id)

    const res = await act.send('GET', `/v1/projects/${project.id}`, ines)
    const raw = await res.text()
    const seen = Project.parse(JSON.parse(raw))

    expect(seen.version).toBe('v1.1')
    expect(seen.latestUpdate?.id).toBe(kept.id)
    expect(seen.updateCount).toBe(1)
    expect(raw).not.toContain('v1.2')
  })

  it('never shows a removed update on a card, even to its author', async () => {
    const project = await publishProject()
    await publishUpdate(project.id, { version: 'v1.1' })
    const removed = await publishUpdate(project.id, { version: 'v1.2' })
    await removeByModeration(removed.id)

    const res = await act.send('GET', '/v1/feed/discover', jean)
    expect(res.status).toBe(200)
    const card = DiscoverFeedPage.parse(await res.json()).items.find(
      (item) => item.project.id === project.id,
    )

    expect(card?.project.latestUpdate?.version).toBe('v1.1')
    expect(card?.project.version).toBe('v1.1')
  })

  it('shows the author his removed update with its reason, and counts it for him only', async () => {
    const project = await publishProject()
    await publishUpdate(project.id, { version: 'v1.1' })
    const removed = await publishUpdate(project.id, { version: 'v1.2' })
    await removeByModeration(removed.id)

    const mine = await readUpdates(project.id, jean)
    const theirs = await readUpdates(project.id, ines)

    const shownToAuthor = mine.items.find((item) => item.id === removed.id)
    expect(shownToAuthor?.version).toBe('v1.2')
    expect(shownToAuthor?.removal).toMatchObject({ ground: 'rules', afterReport: true })
    expect(theirs.items.map((item) => item.id)).not.toContain(removed.id)
    expect((await readProject(project.id, jean)).updateCount).toBe(2)
    expect((await readProject(project.id, ines)).updateCount).toBe(1)
    // Sous le titre, même pour l'auteur, la version reste celle de la mise à jour non retirée.
    expect((await readProject(project.id, jean)).version).toBe('v1.1')
  })

  it('skips an update whose stored lines are damaged instead of failing the lists', async () => {
    // Relecture A7 : une ligne abîmée en base (gardée avant une règle plus stricte, ou écrite à la
    // main) est écartée à la lecture ; s'il ne reste aucune ligne, la mise à jour entière.
    const project = await publishProject()
    expect((await act.send('POST', `/v1/projects/${project.id}/follow`, ines)).status).toBe(204)
    const good = await publishUpdate(project.id, { version: 'v1.0' })
    // Deux mises à jour plus récentes, abîmées : un objet au lieu d'une liste, une famille inconnue.
    // Leur date est copiée de la bonne, plus une et deux minutes (jamais écrite en texte brut).
    for (const [lines, minutes] of [
      ['{}', 1],
      ['[{"family":"oops","text":"Ligne abîmée"}]', 2],
    ] as const) {
      await ctx.db.execute(sql`
        insert into project_update (id, project_id, title, version, lines, before_after, created_at)
        select gen_random_uuid(), project_id, null, 'v9.9', ${lines}::jsonb, false,
               created_at + make_interval(mins => ${minutes})
        from project_update where id = ${good.id}`)
    }

    const page = await act.send('GET', `/v1/projects/${project.id}`, ines)
    const timeline = await getUpdates(project.id, ines)
    const discover = await act.send('GET', '/v1/feed/discover', ines)
    const notifications = await act.send('GET', '/v1/notifications', ines)

    for (const res of [page, timeline, discover, notifications]) {
      expect(res.status).toBe(200)
      expect(await res.clone().text()).not.toContain('v9.9')
    }
    const seen = Project.parse(await page.json())
    expect(seen.latestUpdate?.id).toBe(good.id)
    expect(seen.updateCount).toBe(1)
    expect(ProjectUpdatePage.parse(await timeline.json()).items.map((item) => item.id)).toEqual([
      good.id,
    ])
    NotificationPage.parse(await notifications.json())
  })
})

describe('the timeline of a project', () => {
  it('lists the updates newest first, twenty per page, then the rest', async () => {
    const project = await publishProject()
    for (let n = 1; n <= 22; n++) await numbered(project.id, n)

    const first = await readUpdates(project.id, ines)

    expect(first.items).toHaveLength(20)
    expect(firstLines(first)[0]).toBe('Changement 22')
    expect(firstLines(first).at(-1)).toBe('Changement 3')
    expect(first.nextCursor).not.toBeNull()
    const second = await readUpdates(project.id, ines, first.nextCursor ?? '')
    expect(firstLines(second)).toEqual(['Changement 2', 'Changement 1'])
    // Tout au bout : plus de curseur (l'appli écrit « Première version »).
    expect(second.nextCursor).toBeNull()
  })

  it('fills a page of twenty visible updates when removed ones are in between', async () => {
    const project = await publishProject()
    const published = []
    for (let n = 1; n <= 22; n++) published.push(await numbered(project.id, n))
    // Deux retirées parmi les vingt plus récentes.
    for (const n of [21, 10]) await removeByModeration(published[n - 1]?.id ?? '')

    const page = await readUpdates(project.id, ines)

    // La limite de 20 s'applique après le filtre : la page est pleine, sans aucune retirée.
    expect(page.items).toHaveLength(20)
    expect(page.items.every((item) => item.removal === null)).toBe(true)
    expect(firstLines(page)).not.toContain('Changement 21')
    expect(firstLines(page)).not.toContain('Changement 10')
    expect(firstLines(page).at(-1)).toBe('Changement 1')
  })

  it('keeps the updates of each project apart', async () => {
    const rocket = await publishProject()
    const garden = await publishProject(jean, { title: 'Le carnet de jardin' })
    await publishUpdate(rocket.id, { lines: [{ family: 'new', text: 'Pour la fusée' }] })
    await publishUpdate(garden.id, { lines: [{ family: 'new', text: 'Pour le jardin' }] })

    expect(firstLines(await readUpdates(rocket.id, ines))).toEqual(['Pour la fusée'])
    expect(firstLines(await readUpdates(garden.id, ines))).toEqual(['Pour le jardin'])
  })

  it('is only for signed-in members', async () => {
    const project = await publishProject()
    await publishUpdate(project.id)

    await expectError(await getUpdates(project.id, null), 401, 'unauthorized')
    expect((await readUpdates(project.id, ines)).items).toHaveLength(1) // témoin
  })

  it('refuses the updates of a private project of someone else like an unknown project', async () => {
    const reference = await getUpdates(UNKNOWN, ines)
    expect(reference.status).toBe(404)
    const expected = await reference.json()
    const expectSameNotFound = async (projectId: string, what: string) => {
      const res = await getUpdates(projectId, ines)
      expect(res.status, what).toBe(404)
      expect(await res.json(), what).toEqual(expected)
    }

    const draft = await publishProject(jean, { visibility: 'private' })
    await publishUpdate(draft.id)
    expect((await readUpdates(draft.id, jean)).items).toHaveLength(1) // témoin : l'auteur la lit
    await expectSameNotFound(draft.id, 'private')

    const removed = await publishProject()
    await publishUpdate(removed.id)
    await removeProject(removed.id)
    await expectSameNotFound(removed.id, 'removed')

    const blocked = await publishProject()
    await publishUpdate(blocked.id)
    expect((await readUpdates(blocked.id, ines)).items).toHaveLength(1) // témoin, sans blocage
    await act.block(inesId, jean)
    await expectSameNotFound(blocked.id, 'the author blocked the member')
    await act.unblock(inesId, jean)
    await act.block(jeanId, ines)
    await expectSameNotFound(blocked.id, 'the member blocked the author')
    await expectSameNotFound('pas-un-identifiant', 'malformed')
  })

  it('answers 400 to a cursor dated in year 0000 or 9999, never 500', async () => {
    const project = await publishProject()
    await publishUpdate(project.id)
    const cursorAt = (at: string) =>
      Buffer.from(JSON.stringify({ at, id: UNKNOWN }), 'utf8').toString('base64url')

    for (const at of ['0000-01-01T00:00:00Z', '9999-12-31T23:59:59Z']) {
      const res = await getUpdates(project.id, ines, `?cursor=${cursorAt(at)}`)
      await expectError(res, 400, 'validation')
    }
  })

  it('answers 400 to a cursor that is not ours', async () => {
    const project = await publishProject()
    await publishUpdate(project.id)
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
    const valid = { at: new Date().toISOString(), id: UNKNOWN }

    for (const [what, query] of [
      ['free text', '?cursor=pas-un-curseur'],
      ['another JSON', `?cursor=${encode({ page: 2 })}`],
      ['an extra field', `?cursor=${encode({ ...valid, admin: true })}`],
      ['a repeated parameter', `?cursor=${encode(valid)}&cursor=${encode(valid)}`],
    ]) {
      const res = await getUpdates(project.id, ines, query)
      expect(res.status, what).toBe(400)
    }
    // Témoin : un curseur bien formé répond 200.
    expect((await getUpdates(project.id, ines, `?cursor=${encode(valid)}`)).status).toBe(200)
  })
})

describe('deleting an update', () => {
  it('lets the author delete an update, its photos and their files', async () => {
    const project = await publishProject()
    const kept = await publishUpdate(project.id, { version: 'v1.1' })
    const photo = await pendingPhoto(project.id)
    const removed = await publishUpdate(project.id, {
      version: 'v1.2',
      photos: [{ id: photo.id, description: 'La fusée' }],
    })
    expect(ctx.storage.files.has(photo.key)).toBe(true)

    await expectDone(await deleteUpdate(project.id, removed.id, jean))

    // La photo part avec elle, ligne et fichier ; « Mis à jour » et la version suivent la précédente.
    expect(ctx.storage.files.has(photo.key)).toBe(false)
    expect(await photoRow(photo.id)).toBeUndefined()
    const seen = await readProject(project.id, ines)
    expect(seen.latestUpdate?.id).toBe(kept.id)
    expect(seen.version).toBe('v1.1')
    expect(seen.updateCount).toBe(1)
    expect((await readUpdates(project.id, jean)).items.map((item) => item.id)).toEqual([kept.id])
  })

  it('leaves no update, no version and no count once the last one is deleted', async () => {
    const project = await publishProject()
    const only = await publishUpdate(project.id, { version: 'v1.0' })

    await expectDone(await deleteUpdate(project.id, only.id, jean))

    expect(await readProject(project.id, jean)).toMatchObject({
      latestUpdate: null,
      updateCount: 0,
      version: null,
    })
  })

  it('is only for signed-in members', async () => {
    const project = await publishProject()
    const published = await publishUpdate(project.id)

    await expectError(await deleteUpdate(project.id, published.id, null), 401, 'unauthorized')
    expect(await storedUpdateCount()).toBe(1)
    await expectDone(await deleteUpdate(project.id, published.id, jean)) // témoin
  })

  it('refuses the deletion of an update on the public project of another member', async () => {
    const project = await publishProject()
    const published = await publishUpdate(project.id)

    await expectError(await deleteUpdate(project.id, published.id, ines), 403, 'forbidden')

    expect((await readProject(project.id, jean)).latestUpdate?.id).toBe(published.id)
  })

  it('answers « not found » for an update on the private project of another member, as for an unknown project', async () => {
    const draft = await publishProject(jean, { visibility: 'private' })
    const published = await publishUpdate(draft.id)

    const res = await deleteUpdate(draft.id, published.id, ines)
    const unknown = await deleteUpdate(UNKNOWN, published.id, ines)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    expect(await storedUpdateCount()).toBe(1)
  })

  it('answers « not found » for an unknown or malformed update, and for one already deleted', async () => {
    const project = await publishProject()
    const published = await publishUpdate(project.id)

    for (const updateId of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await deleteUpdate(project.id, updateId, jean), 404, 'not_found')
    }
    await expectDone(await deleteUpdate(project.id, published.id, jean)) // témoin
    await expectError(await deleteUpdate(project.id, published.id, jean), 404, 'not_found')
  })

  it('answers « not found » for an update that belongs to another project, and leaves it in place', async () => {
    const rocket = await publishProject()
    const garden = await publishProject(jean, { title: 'Le carnet de jardin' })
    const gardenUpdate = await publishUpdate(garden.id)

    await expectError(await deleteUpdate(rocket.id, gardenUpdate.id, jean), 404, 'not_found')

    expect((await readProject(garden.id, jean)).latestUpdate?.id).toBe(gardenUpdate.id)
  })

  it('never lets a member delete the update of another through the address of his own project', async () => {
    const jeanProject = await publishProject()
    const jeanUpdate = await publishUpdate(jeanProject.id)
    const inesProject = await publishProject(ines)

    await expectError(await deleteUpdate(inesProject.id, jeanUpdate.id, ines), 404, 'not_found')

    expect((await readProject(jeanProject.id, jean)).latestUpdate?.id).toBe(jeanUpdate.id)
  })

  it('counts deletions aimed at an unknown project in the hourly limit of changes', async () => {
    // Relecture A2 : le quota `projectChange` passe avant la recherche du projet.
    const project = await publishProject()
    const published = await publishUpdate(project.id)
    for (let i = 0; i < 60; i++) {
      const res = await act.send('DELETE', updatePath(crypto.randomUUID(), published.id), jean)
      expect(res.status).toBe(404)
    }

    expect((await deleteUpdate(project.id, published.id, jean)).status).toBe(429)
    expect(await storedUpdateCount()).toBe(1)
  })
})

describe('a suspended member', () => {
  it('refuses a suspended author who publishes an update or becomes a tester, and lets them quit and delete', async () => {
    const project = await publishProject()
    const published = await publishUpdate(project.id)
    const demo = { status: 'testable', demoUrl: 'https://demo.example.com/' }
    const inesProject = await publishProject(ines, demo)
    const malikProject = await publishProject(malik, demo)
    await expectDone(await act.send('POST', `/v1/projects/${inesProject.id}/testers`, jean))
    later()
    await act.decide(louis, {
      action: 'suspend',
      memberId: jeanId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages répétés malgré les avertissements.',
    })

    await expectError(await postUpdate(project.id, jean), 403, 'suspended')
    await expectError(
      await act.send('POST', `/v1/projects/${malikProject.id}/testers`, jean),
      403,
      'suspended',
    )
    // Ce qui retire ou défait reste permis : quitter les testeurs, supprimer sa mise à jour.
    await expectDone(await act.send('DELETE', `/v1/projects/${inesProject.id}/testers`, jean))
    await expectDone(await deleteUpdate(project.id, published.id, jean))
    expect(await storedUpdateCount()).toBe(0)
  })
})

// --- R7b : les retours de testeurs qu'une mise à jour règle (« Réglé dans la v1.3 ») ---
// Scénario : docs/scenarios/refonte.md, section R7b, « Réglé dans la v1.3 ». Inès devient testeuse
// de Décollage ! et envoie ses retours par la route des fils (tester-threads.test.ts la teste) ; un
// retrait par la modération est posé en base, comme reports/decide.ts l'écrit.

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

/** Rejoindre les testeurs (R7a), une minute après ce qui précède. */
const joinTesters = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('POST', `/v1/projects/${projectId}/testers`, cookie))
}

/** Inès envoie un retour (« En partie », sur téléphone) dans son fil, et le rend. */
const sendFeedback = async (projectId: string, text = 'Le score repart à zéro au niveau 3.') => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/threads/${inesId}/messages`, ines, {
    kind: 'feedback',
    outcome: 'partly',
    device: 'phone',
    text,
    captureId: null,
  })
  expect(res.status).toBe(201)
  return TesterMessage.parse(await res.json())
}

/** Le fil d'Inès, lu par ce membre : ses messages, du plus récent au plus ancien. */
const inesThread = async (projectId: string, cookie = ines) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/threads/${inesId}/messages`, cookie)
  expect(res.status).toBe(200)
  return TesterMessagePage.parse(await res.json()).items
}

/** Ce que ce retour dit de son règlement, dans le fil d'Inès. */
const settledOf = async (projectId: string, messageId: string, cookie = ines) =>
  (await inesThread(projectId, cookie)).find((message) => message.id === messageId)?.settled

/** Les retours encore à traiter (la partie « Retours réglés » de la feuille). */
const openFeedbackIds = async (projectId: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/feedback/open`, jean)
  expect(res.status).toBe(200)
  return OpenFeedbackList.parse(await res.json()).map((item) => item.id)
}

/** Un projet testable de Papi Jean, dont Inès est testeuse. */
const testedProject = async (title = 'Décollage !') => {
  const project = await act.publish(jean, title, {
    pitch: 'Un quiz de l’espace pour les petits.',
    ...TESTABLE,
  })
  await joinTesters(project.id, ines)
  return project
}

describe('the feedback an update settles', () => {
  it('settles the cited feedback, with the version and the date of the update', async () => {
    const project = await testedProject()
    const settled = await sendFeedback(project.id)
    const open = await sendFeedback(project.id, 'Le son ne marche pas sur tablette.')

    const update = await publishUpdate(project.id, {
      version: 'v1.3',
      lines: [{ family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' }],
      settledFeedbackIds: [settled.id],
    })

    const expected = {
      at: update.createdAt,
      update: { id: update.id, version: 'v1.3', createdAt: update.createdAt },
    }
    expect(await settledOf(project.id, settled.id)).toEqual(expected)
    expect(await settledOf(project.id, settled.id, jean)).toEqual(expected)
    expect(await settledOf(project.id, open.id)).toBeNull()
    expect(await openFeedbackIds(project.id)).toEqual([open.id])
  })

  it('settles by the date of an update without a version', async () => {
    const project = await testedProject()
    const feedback = await sendFeedback(project.id)

    const update = await publishUpdate(project.id, { settledFeedbackIds: [feedback.id] })

    expect(await settledOf(project.id, feedback.id)).toEqual({
      at: update.createdAt,
      update: { id: update.id, version: null, createdAt: update.createdAt },
    })
  })

  it('refuses a feedback of another project, and publishes nothing', async () => {
    const project = await testedProject()
    const garden = await testedProject('Le carnet de jardin')
    const here = await sendFeedback(project.id)
    const elsewhere = await sendFeedback(garden.id)

    const res = await postUpdate(
      project.id,
      jean,
      simple({ settledFeedbackIds: [here.id, elsewhere.id] }),
    )

    await expectError(res, 400, 'invalid_feedback')
    expect(await storedUpdateCount()).toBe(0)
    // Tout est annulé : même le retour de ce projet reste à traiter.
    expect(await settledOf(project.id, here.id)).toBeNull()
    expect(await settledOf(garden.id, elsewhere.id)).toBeNull()
  })

  it('refuses a feedback already settled or removed, and publishes nothing', async () => {
    const project = await testedProject()
    const byHand = await sendFeedback(project.id, 'Réglé à la main.')
    const removed = await sendFeedback(project.id, 'Retiré par la modération.')
    const open = await sendFeedback(project.id, 'Encore à traiter.')
    later()
    await expectDone(
      await act.send('POST', `/v1/projects/${project.id}/messages/${byHand.id}/settled`, jean),
    )
    await ctx.db
      .update(schema.testerMessage)
      .set({ removedAt: new Date() })
      .where(eq(schema.testerMessage.id, removed.id))

    for (const id of [byHand.id, removed.id]) {
      const res = await postUpdate(project.id, jean, simple({ settledFeedbackIds: [open.id, id] }))
      await expectError(res, 400, 'invalid_feedback')
    }

    expect(await storedUpdateCount()).toBe(0)
    expect(await settledOf(project.id, open.id)).toBeNull()
    // Le règlement à la main reste tel quel, sans mise à jour.
    expect((await settledOf(project.id, byHand.id))?.update).toBeNull()
  })

  it('refuses a reply or an unknown identifier, and publishes nothing', async () => {
    const project = await testedProject()
    const feedback = await sendFeedback(project.id)
    later()
    const replyRes = await act.send(
      'POST',
      `/v1/projects/${project.id}/threads/${inesId}/messages`,
      jean,
      {
        kind: 'reply',
        text: 'Merci Inès, je regarde ça.',
      },
    )
    expect(replyRes.status).toBe(201)
    const reply = TesterMessage.parse(await replyRes.json())

    for (const id of [reply.id, UNKNOWN]) {
      const res = await postUpdate(
        project.id,
        jean,
        simple({ settledFeedbackIds: [feedback.id, id] }),
      )
      await expectError(res, 400, 'invalid_feedback')
    }
    expect(await storedUpdateCount()).toBe(0)
    expect(await settledOf(project.id, feedback.id)).toBeNull()
  })

  it('settles 20 feedback at most, each once', async () => {
    const project = await testedProject()
    const ids: string[] = []
    for (let i = 0; i < 21; i++) ids.push((await sendFeedback(project.id, `Retour ${i + 1}.`)).id)
    const [first = ''] = ids

    for (const settledFeedbackIds of [ids, [first, first]]) {
      await expectError(
        await postUpdate(project.id, jean, simple({ settledFeedbackIds })),
        400,
        'validation',
      )
    }
    expect(await storedUpdateCount()).toBe(0)

    // Témoin : 20 retours d'un coup.
    await publishUpdate(project.id, { settledFeedbackIds: ids.slice(0, 20) })
    expect(await openFeedbackIds(project.id)).toEqual([ids[20]])
  })

  it('settles the feedback of a former tester', async () => {
    const project = await testedProject()
    const feedback = await sendFeedback(project.id)
    later()
    await expectDone(await act.send('DELETE', `/v1/projects/${project.id}/testers`, ines))

    const update = await publishUpdate(project.id, { settledFeedbackIds: [feedback.id] })

    expect((await settledOf(project.id, feedback.id, jean))?.update?.id).toBe(update.id)
  })

  it('lets the author put a feedback settled by an update back to « À traiter »', async () => {
    const project = await testedProject()
    const feedback = await sendFeedback(project.id)
    await publishUpdate(project.id, { version: 'v1.3', settledFeedbackIds: [feedback.id] })

    later()
    await expectDone(
      await act.send('DELETE', `/v1/projects/${project.id}/messages/${feedback.id}/settled`, jean),
    )

    expect(await settledOf(project.id, feedback.id)).toBeNull()
    expect(await openFeedbackIds(project.id)).toEqual([feedback.id])
  })

  it('refuses another member citing the feedback of a project that is not his', async () => {
    const project = await testedProject()
    const feedback = await sendFeedback(project.id)
    const own = await publishProject(malik)

    const res = await postUpdate(own.id, malik, simple({ settledFeedbackIds: [feedback.id] }))

    await expectError(res, 400, 'invalid_feedback')
    expect(await storedUpdateCount()).toBe(0)
    expect(await settledOf(project.id, feedback.id)).toBeNull()
  })
})

describe('the API contract', () => {
  it('documents the update routes, and no longer the note routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(doc.paths['/v1/projects/{id}/updates']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/updates']).toHaveProperty('get')
    expect(doc.paths['/v1/projects/{id}/updates/{updateId}']).toHaveProperty('delete')
    expect(Object.keys(doc.paths)).not.toContain('/v1/projects/{id}/notes')
  })
})
