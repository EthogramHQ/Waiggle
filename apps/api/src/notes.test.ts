// Tests d'intégration de la tranche 4b : les notes d'un projet (publier, supprimer, le journal).
// Scénarios : docs/scenarios/phase-1.md, « Précisions (tranche 4) », « Les notes (4b) ». Trois
// membres : Léa (l'autrice), Max (un autre membre) et Zoé (une troisième).
// Les notes dans le fil « Abonnements » sont testées dans feed.test.ts, l'export dans projects.test.ts.
//
// Le temps est maîtrisé par le test, comme dans feed.test.ts : vi.useFakeTimers remplace l'horloge
// de JavaScript (Date) par une fausse, qu'on avance à la main. Les notes ont ainsi des dates
// distinctes et dans un ordre connu, et la limite de 30 notes par jour se vérifie sans attendre
// un jour entier. Seule Date est remplacée (toFake) : la base et les minuteries tournent normalement.
import { ErrorResponse, Project, ProjectNote } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let lea: string // cookies de session
let max: string
let zoe: string

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  const start = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)

  ctx = await createTestContext()
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * 60 * 1000)

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

/** Un identifiant bien formé, qui ne désigne aucun projet ni aucune note. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Publie un projet et renvoie ce que l'API a répondu. */
const publish = async (cookie: string, body: object = {}) => {
  const res = await send('POST', '/v1/projects', cookie, {
    title: 'Mon agent de recettes',
    pitch: 'Un menu avec ce qu’il y a au frigo.',
    ...body,
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

// Les adresses des notes d'un projet. encodeURIComponent : un identifiant piégé (« ../ ») reste un
// simple morceau d'adresse.
const notesPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/notes`
const notePath = (projectId: string, noteId: string) =>
  `${notesPath(projectId)}/${encodeURIComponent(noteId)}`

/** Demande la publication d'une note, une minute après ce qui précède ; renvoie la réponse brute. */
const postNote = (
  projectId: string,
  cookie: string | null,
  body: unknown = 'v2 : mode hors ligne',
) => {
  later()
  return send('POST', notesPath(projectId), cookie, { body })
}

/** Publie une note qui doit être acceptée, et renvoie la note telle que l'API l'a décrite. */
const note = async (projectId: string, cookie: string, body = 'v2 : mode hors ligne') => {
  const res = await postNote(projectId, cookie, body)
  expect(res.status).toBe(201)
  return ProjectNote.parse(await res.json())
}

const deleteNote = (projectId: string, noteId: string, cookie: string | null) =>
  send('DELETE', notePath(projectId, noteId), cookie)

/** La page d'un projet, telle que la voit ce membre (elle doit être visible). */
const readProject = async (id: string, cookie: string) => {
  const res = await send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

/** Les textes du journal d'un projet, dans l'ordre où l'API les donne. */
const journal = async (id: string, cookie: string) =>
  (await readProject(id, cookie)).notes.map((n) => n.body)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

describe('publishing a note', () => {
  it('lets the author publish a note on her project, and answers with it', async () => {
    const project = await publish(lea)

    const res = await postNote(project.id, lea, 'v2 : mode hors ligne')

    expect(res.status).toBe(201)
    const published = ProjectNote.parse(await res.json())
    expect(published.body).toBe('v2 : mode hors ligne')
    // Sa date est celle de la publication (l'horloge du test).
    expect(Date.parse(published.createdAt)).toBe(Date.now())
    // Elle apparaît aussitôt dans le journal du projet.
    expect((await readProject(project.id, lea)).notes).toEqual([published])
  })

  it('shows the note to the other members on the page of a public project', async () => {
    const project = await publish(lea)
    const published = await note(project.id, lea)

    expect((await readProject(project.id, max)).notes).toEqual([published])
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)

    await expectError(await postNote(project.id, null), 401, 'unauthorized')
    // Témoin : la même demande, avec la session de l'autrice, réussit (la route existe bien).
    expect((await postNote(project.id, lea)).status).toBe(201)
    expect(await journal(project.id, lea)).toHaveLength(1)
  })

  it('cannot be triggered from another website', async () => {
    const project = await publish(lea)

    const res = await ctx.request(notesPath(project.id), {
      method: 'POST',
      headers: { cookie: lea, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ body: 'Note glissée par un autre site' }),
    })

    expect(res.status).toBe(403)
    expect((await postNote(project.id, lea)).status).toBe(201) // témoin
    expect(await journal(project.id, lea)).toEqual(['v2 : mode hors ligne'])
  })

  it('refuses a note on the public project of another member', async () => {
    const project = await publish(lea)

    await expectError(await postNote(project.id, max, 'Note de Max'), 403, 'forbidden')

    expect(await journal(project.id, lea)).toEqual([])
  })

  it('answers « not found » for the private project of another member, as for an unknown one', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    // Témoin : l'autrice, elle, publie sur son brouillon (le 404 ne vient pas d'une route absente).
    expect((await postNote(draft.id, lea)).status).toBe(201)

    const res = await postNote(draft.id, max, 'Note de Max')
    const unknown = await postNote(UNKNOWN, max, 'Note de Max')

    // Même réponse, mot pour mot : impossible de deviner qu'un projet privé existe à cette adresse.
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    expect(await journal(draft.id, lea)).toEqual(['v2 : mode hors ligne'])
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    expect((await postNote((await publish(lea)).id, lea)).status).toBe(201) // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await postNote(id, lea), 404, 'not_found')
    }
  })

  it('refuses an empty note, a note over 1 000 characters, or invisible characters', async () => {
    const project = await publish(lea)
    for (const body of [
      '',
      '   \n  ', // que des espaces : vide une fois les bords retirés
      'a'.repeat(1_001),
      'v2​', // espace de largeur nulle
      'v2\u0007', // caractère de contrôle (sonnerie)
      '‮v2', // retourne le sens du texte
      42, // pas un texte
    ]) {
      const res = await postNote(project.id, lea, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
    expect(await journal(project.id, lea)).toEqual([])
  })

  it('accepts 1 000 characters over several lines, trimmed, and keeps the text exactly as typed', async () => {
    const project = await publish(lea)
    const long = `${'é'.repeat(499)}\n${'à'.repeat(500)}` // 1 000 caractères, saut de ligne compris
    // Du texte brut : ni Markdown ni HTML ne sont interprétés, ni retirés. L'appli l'affiche tel quel.
    const raw = '**v2** : <b>hors ligne</b> & [lien](https://example.com)'

    expect((await note(project.id, lea, long)).body).toBe(long)
    expect((await note(project.id, lea, `  ${raw}  \n`)).body).toBe(raw)
  })

  it('lets the author write on her private project, and shows it to her alone', async () => {
    const draft = await publish(lea, { visibility: 'private' })

    const published = await note(draft.id, lea, 'Encore en chantier')

    expect((await readProject(draft.id, lea)).notes).toEqual([published])
    // Pour un autre membre, le projet reste introuvable, notes comprises.
    const res = await send('GET', `/v1/projects/${draft.id}`, max)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('Encore en chantier')
  })
})

describe('the journal of a project', () => {
  it('lists the notes newest first, for the author and for the others', async () => {
    const project = await publish(lea)
    await note(project.id, lea, 'Première version en ligne')
    await note(project.id, lea, 'Ajout des menus de la semaine')
    await note(project.id, lea, 'v2 : mode hors ligne')

    const newestFirst = [
      'v2 : mode hors ligne',
      'Ajout des menus de la semaine',
      'Première version en ligne',
    ]
    expect(await journal(project.id, lea)).toEqual(newestFirst)
    expect(await journal(project.id, max)).toEqual(newestFirst)
  })

  it('shows only the 20 most recent notes', async () => {
    const project = await publish(lea)
    for (let i = 1; i <= 21; i++) await note(project.id, lea, `Note ${i}`)

    const shown = await journal(project.id, max)

    expect(shown).toHaveLength(20)
    expect(shown[0]).toBe('Note 21')
    expect(shown.at(-1)).toBe('Note 2')
    expect(shown).not.toContain('Note 1') // la plus ancienne n'y est plus
  })

  it('keeps the notes of each project apart', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    await note(recipes.id, lea, 'Note des recettes')
    await note(garden.id, lea, 'Note du jardin')

    expect(await journal(recipes.id, max)).toEqual(['Note des recettes'])
    expect(await journal(garden.id, max)).toEqual(['Note du jardin'])
  })

  it('starts empty', async () => {
    const project = await publish(lea)

    expect(project.notes).toEqual([])
    expect(await journal(project.id, max)).toEqual([])
  })
})

describe('deleting a note', () => {
  it('lets the author delete a note, which leaves the journal', async () => {
    const project = await publish(lea)
    const kept = await note(project.id, lea, 'Première version en ligne')
    const removed = await note(project.id, lea, 'Une note publiée par erreur')

    await expectDone(await deleteNote(project.id, removed.id, lea))

    expect((await readProject(project.id, lea)).notes).toEqual([kept])
    expect((await readProject(project.id, max)).notes).toEqual([kept])
  })

  it('lets the author delete a note of her private project', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    const removed = await note(draft.id, lea)

    await expectDone(await deleteNote(draft.id, removed.id, lea))

    expect(await journal(draft.id, lea)).toEqual([])
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)
    const published = await note(project.id, lea)

    await expectError(await deleteNote(project.id, published.id, null), 401, 'unauthorized')
    expect(await journal(project.id, lea)).toHaveLength(1)
    await expectDone(await deleteNote(project.id, published.id, lea)) // témoin
  })

  it('refuses the deletion of a note on the public project of another member', async () => {
    const project = await publish(lea)
    const published = await note(project.id, lea)

    await expectError(await deleteNote(project.id, published.id, max), 403, 'forbidden')

    expect((await readProject(project.id, lea)).notes).toEqual([published])
  })

  it('answers « not found » for a note on the private project of another member, as for an unknown project', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    const published = await note(draft.id, lea)

    const res = await deleteNote(draft.id, published.id, max)
    const unknown = await deleteNote(UNKNOWN, published.id, max)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    expect((await readProject(draft.id, lea)).notes).toEqual([published])
  })

  it('answers « not found » for an unknown or malformed note, and for a note already deleted', async () => {
    const project = await publish(lea)
    const published = await note(project.id, lea)

    for (const noteId of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await deleteNote(project.id, noteId, lea), 404, 'not_found')
    }
    await expectDone(await deleteNote(project.id, published.id, lea)) // témoin
    await expectError(await deleteNote(project.id, published.id, lea), 404, 'not_found')
  })

  it('answers « not found » for a note that belongs to another project, and leaves it in place', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    const gardenNote = await note(garden.id, lea, 'Note du jardin')

    // L'adresse mêle un projet de Léa et la note d'un autre de ses projets.
    await expectError(await deleteNote(recipes.id, gardenNote.id, lea), 404, 'not_found')

    expect((await readProject(garden.id, lea)).notes).toEqual([gardenNote])
  })

  it('never lets a member delete the note of another through the address of her own project', async () => {
    const leaProject = await publish(lea)
    const leaNote = await note(leaProject.id, lea, 'Note de Léa')
    const maxProject = await publish(max, { title: 'Projet de Max' })

    // Max est bien l'auteur du projet de l'adresse, mais la note n'est pas la sienne.
    await expectError(await deleteNote(maxProject.id, leaNote.id, max), 404, 'not_found')

    expect((await readProject(leaProject.id, lea)).notes).toEqual([leaNote])
  })
})

describe('limits against abuse', () => {
  it('blocks the 31st note within a day, all projects of the member together', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    for (let i = 0; i < 15; i++) {
      await note(recipes.id, lea, `Recettes ${i}`)
      await note(garden.id, lea, `Jardin ${i}`)
    }

    const res = await postNote(recipes.id, lea, 'Une note de trop')

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    // Le refus ne publie rien.
    expect(await journal(recipes.id, lea)).not.toContain('Une note de trop')
    // La limite est propre à chaque membre : Zoé, elle, publie encore sur son projet.
    expect((await postNote((await publish(zoe)).id, zoe)).status).toBe(201)
  })

  it('lets the member publish notes again the next day', async () => {
    const project = await publish(lea)
    for (let i = 0; i < 30; i++) await note(project.id, lea, `Note ${i}`)
    expect((await postNote(project.id, lea)).status).toBe(429)

    later(24 * 60) // un jour plus tard

    expect((await postNote(project.id, lea, 'Le lendemain')).status).toBe(201)
  })
})

describe('the API contract', () => {
  it('documents the note routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/v1/projects/{id}/notes', '/v1/projects/{id}/notes/{noteId}']),
    )
    expect(doc.paths['/v1/projects/{id}/notes']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/notes/{noteId}']).toHaveProperty('delete')
  })
})
