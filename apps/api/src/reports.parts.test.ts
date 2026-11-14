// Tests d'intégration de la tranche R9 (« la modération, avec 7d ») : signaler une seule partie d'un
// contenu (« La 2e photo », la description, la bio…), et ce que la feuille « Signaler » lit de sa
// cible (GET /v1/reports/target). Scénario : docs/scenarios/refonte.md, « Signaler, dans une
// feuille » et « Les parties » ; plan R9, « API » et « Ce qui change au plan » (relecture de
// sécurité P6 : les unicités).
//
// Quatre membres : Léa (l'autrice de « Météo », un projet complet : description, outils, démo,
// prompt, deux photos dont la première décrite), Max (qui signale), Zoé (une autre, qui signale
// aussi) et Louis, l'administrateur (pour les retraits et pour `author.isAdmin`).
//
// Ce que la route promet :
// - une partie se signale à part : « déjà signalé » vaut pour le contenu entier, ou pour cette
//   partie, jamais pour une autre ; la base le garde aussi (index unique, deux null y sont égaux) ;
// - la photo visée appartient au contenu, sinon la même réponse 404 qu'un contenu inconnu ;
// - la copie gardée au signalement ne prend que le champ visé ;
// - l'aperçu donne le rappel de tête (`head`), les parties présentes dans l'ordre de la feuille
//   avec ce que ce membre a déjà signalé, et si l'auteur est administrateur en fonction ;
// - une photo n'est retirée qu'une fois, qu'on l'ait signalée comme couverture ou comme photo.
//
// Le temps est maîtrisé par le test (fausse horloge, voir reports.test.ts).
import { randomUUID } from 'node:crypto'
import {
  ErrorResponse,
  Me,
  Project,
  ProjectUpdate,
  REPORTABLE_PARTS,
  REPORTS_PER_DAY,
  type ReportPartField,
  ReportSnapshot,
  ReportTargetPreview,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let louis: string
let leaId: string
let maxId: string
let louisId: string
let meteo: Project // le projet complet de Léa, ses deux photos comprises

const SECOND = 1000
const START = new Date('2026-06-15T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

const DESCRIPTION = 'Une appli qui prévoit la pluie, rue par rue.'
const PROMPT = 'Tu es un météorologue patient.'
const PHOTO_DESCRIPTION = 'Le radar de pluie au-dessus de Lyon.'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
  meteo = await completeProject(lea, 'Météo')
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge d'une seconde : deux gestes n'ont jamais la même date. */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Ajoute une photo à la galerie d'un projet ; rend le projet relu. */
const addPhoto = async (projectId: string, cookie: string, color: string) => {
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(1200, 800, color), 'gallery'),
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

/**
 * Un projet où chaque partie est présente : description, catégorie, outils, lien de démo, prompt,
 * deux photos, et la description de la première.
 */
const completeProject = async (cookie: string, title: string) => {
  const project = await act.publish(cookie, title, {
    pitch: 'La pluie de demain, quartier par quartier.',
    status: 'testable',
    description: DESCRIPTION,
    tools: ['Mistral'],
    demoUrl: 'https://meteo.example.com/',
    prompts: [PROMPT],
  })
  await addPhoto(project.id, cookie, '#3b7a9e')
  const withPhotos = await addPhoto(project.id, cookie, '#d9a441')
  const first = withPhotos.visuals[0]
  if (!first) throw new Error('no photo')
  later()
  const res = await act.send('PATCH', `/v1/projects/${project.id}/visuals/${first.id}`, cookie, {
    description: PHOTO_DESCRIPTION,
  })
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

/** L'identifiant de la photo de ce rang (à partir de 1), dans l'ordre de la galerie. */
const photoId = (project: Project, position: number) => {
  const visual = project.visuals[position - 1]
  if (!visual) throw new Error(`no photo ${position}`)
  return visual.id
}

type Part = { field: ReportPartField; mediaId?: string }

/** Signale une cible, ou une partie de cette cible ; rend la réponse brute. */
const postReport = (cookie: string, target: { kind: string; id: string }, part?: Part) => {
  later()
  return act.send('POST', '/v1/reports', cookie, {
    target,
    ...(part && { part }),
    reason: 'other',
  })
}
const projectOf = (id = meteo.id) => ({ kind: 'project', id })

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Deux réponses 404 identiques, mot pour mot : rien ne distingue l'une de l'autre. */
const expectSameNotFound = async (res: Response, reference: Response) => {
  expect(res.status).toBe(404)
  expect(reference.status).toBe(404)
  expect(await res.json()).toEqual(await reference.json())
}

/** Les signalements gardés en base, du plus ancien au plus récent. */
const storedReports = () =>
  ctx.db.select().from(schema.contentReport).orderBy(schema.contentReport.createdAt)

const previewPath = (kind: string, id: string) =>
  `/v1/reports/target?${new URLSearchParams({ kind, id })}`
const readPreview = async (cookie: string, kind: string, id: string) => {
  const res = await act.send('GET', previewPath(kind, id), cookie)
  expect(res.status, `${kind} ${id}`).toBe(200)
  return ReportTargetPreview.parse(await res.json())
}

/** Le rang d'un champ dans l'ordre de la feuille (REPORTABLE_PARTS de cette sorte de cible). */
const rankIn = (kind: keyof typeof REPORTABLE_PARTS, field: ReportPartField) =>
  (REPORTABLE_PARTS[kind] as readonly ReportPartField[]).indexOf(field)

// ─── Signaler une partie ─────────────────────────────────────────────────────────────────────────

describe('reporting a part', () => {
  it('records the reported part on the report, with its photo for a photo', async () => {
    expect((await postReport(max, projectOf(), { field: 'description' })).status).toBe(201)
    const second = photoId(meteo, 2)
    expect((await postReport(zoe, projectOf(), { field: 'photo', mediaId: second })).status).toBe(
      201,
    )

    expect(
      (await storedReports()).map((r) => [r.reporterId, r.targetId, r.partField, r.partMediaId]),
    ).toEqual([
      [maxId, meteo.id, 'description', null],
      [(await act.me(zoe)).id, meteo.id, 'photo', second],
    ])
  })

  it('keeps a whole report without a part, as before', async () => {
    expect((await postReport(max, projectOf())).status).toBe(201)

    expect((await storedReports()).map((r) => [r.partField, r.partMediaId])).toEqual([[null, null]])
  })

  // Plan R9, « API » : `loadReportable` limité à la partie, copie de ce seul champ.
  it('copies only the reported field into the report', async () => {
    expect((await postReport(max, projectOf(), { field: 'description' })).status).toBe(201)
    expect((await postReport(zoe, projectOf(), { field: 'prompt' })).status).toBe(201)

    const [description, prompt] = (await storedReports()).map((r) =>
      ReportSnapshot.parse(r.snapshot),
    )
    expect(description).toEqual([{ field: 'description', value: DESCRIPTION }])
    expect(prompt).toEqual([{ field: 'prompt', value: PROMPT }])
  })

  it('copies the key of the reported photo only, never the other photo', async () => {
    const [first, second] = await ctx.db
      .select({ id: schema.projectMedia.id, key: schema.projectMedia.storageKey })
      .from(schema.projectMedia)
      .where(eq(schema.projectMedia.projectId, meteo.id))
    if (!first || !second) throw new Error('two photos expected')
    const reported = second.id === photoId(meteo, 2) ? second : first
    const other = reported === second ? first : second

    expect(
      (await postReport(max, projectOf(), { field: 'photo', mediaId: reported.id })).status,
    ).toBe(201)

    const [copy] = (await storedReports()).map((r) => ReportSnapshot.parse(r.snapshot))
    const values = (copy ?? []).map((entry) => entry.value)
    expect(values).toContain(reported.key)
    expect(values).not.toContain(other.key)
    expect((copy ?? []).map((entry) => entry.field)).not.toContain('title')
  })

  // Contrat (ReportPart) : « l'API vérifie que la photo appartient bien au contenu (404 sinon) ».
  it('refuses a photo of another content, like an unknown content', async () => {
    const velo = await act.publish(lea, 'Vélo')
    const veloWithPhoto = await addPhoto(velo.id, lea, '#7a9e3b')
    const reference = await postReport(max, projectOf(UNKNOWN))

    for (const mediaId of [photoId(veloWithPhoto, 1), UNKNOWN]) {
      await expectSameNotFound(
        await postReport(max, projectOf(), { field: 'photo', mediaId }),
        reference,
      )
    }
    expect(await storedReports()).toEqual([])
    // Témoin : la photo de Météo se signale.
    expect(
      (await postReport(max, projectOf(), { field: 'photo', mediaId: photoId(meteo, 1) })).status,
    ).toBe(201)
  })

  // Contrat (CreateReport) : un commentaire se signale en entier ; ce refus passe déjà par Zod.
  it('refuses a part on a comment with 400, and takes the whole comment', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire de Léa')

    await expectError(
      await postReport(max, { kind: 'comment', id: comment.id }, { field: 'title' }),
      400,
      'validation',
    )
    // Témoin : le commentaire entier se signale.
    expect((await postReport(max, { kind: 'comment', id: comment.id })).status).toBe(201)
  })
})

// ─── Déjà signalé (relecture de sécurité P6) ─────────────────────────────────────────────────────

describe('a part already reported', () => {
  it('refuses the same part twice by the same member, and accepts the whole content and another part', async () => {
    const second = { field: 'photo', mediaId: photoId(meteo, 2) } as const
    expect((await postReport(max, projectOf(), second)).status).toBe(201)

    await expectError(await postReport(max, projectOf(), second), 409, 'already_reported')
    expect((await postReport(max, projectOf())).status).toBe(201)
    expect((await postReport(max, projectOf(), { field: 'description' })).status).toBe(201)
    expect(
      (await postReport(max, projectOf(), { field: 'photo', mediaId: photoId(meteo, 1) })).status,
    ).toBe(201)
    // Le contenu entier, une seconde fois : déjà signalé lui aussi.
    await expectError(await postReport(max, projectOf()), 409, 'already_reported')
    // Un autre membre signale la même partie.
    expect((await postReport(zoe, projectOf(), second)).status).toBe(201)
    expect(await storedReports()).toHaveLength(5)
  })

  // Relecture de sécurité P6 : deux null ne sont jamais égaux pour un index ordinaire ; l'index de
  // la migration 0022 les remplace par une valeur fixe. La base refuse donc elle-même le doublon,
  // même si deux demandes passaient la vérification de l'API en même temps.
  it('the database refuses a second open report of the same whole target by the same member', async () => {
    const row = () => ({
      id: randomUUID(),
      reporterId: maxId,
      targetKind: 'project',
      targetId: meteo.id,
      projectId: meteo.id,
      targetAuthorId: leaId,
      reason: 'other',
      details: null,
      snapshot: [],
      status: 'open',
      createdAt: new Date(Date.now()),
    })
    await ctx.db.insert(schema.contentReport).values(row())

    await expect(ctx.db.insert(schema.contentReport).values(row())).rejects.toThrow()
    // Témoin : la même cible, pour une partie, passe ; la même partie, une seconde fois, non.
    await ctx.db.insert(schema.contentReport).values({ ...row(), partField: 'description' })
    await expect(
      ctx.db.insert(schema.contentReport).values({ ...row(), partField: 'description' }),
    ).rejects.toThrow()
  })

  // Relecture de sécurité P6 : « un retrait par media_id ». La couverture et la photo qu'elle montre
  // sont la même image : signalée des deux façons, elle n'est retirée qu'une fois.
  it('stores one removal per photo, whether it was reported as the cover or as a photo', async () => {
    const first = photoId(meteo, 1)
    expect((await postReport(max, projectOf(), { field: 'cover', mediaId: first })).status).toBe(
      201,
    )
    expect((await postReport(zoe, projectOf(), { field: 'photo', mediaId: first })).status).toBe(
      201,
    )

    later()
    const cover = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'remove',
      target: projectOf(),
      part: { field: 'cover', mediaId: first },
      ground: 'rules',
      explanation: 'Une photo volée.',
    })
    expect(cover.status).toBe(201)
    later()
    const photo = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'remove',
      target: projectOf(),
      part: { field: 'photo', mediaId: first },
      ground: 'rules',
      explanation: 'Une photo volée.',
    })
    expect(photo.status).toBe(409)

    const removals = await ctx.db
      .select()
      .from(schema.contentPartRemoval)
      .where(eq(schema.contentPartRemoval.projectMediaId, first))
    expect(removals).toHaveLength(1)
    // Le projet reste affiché : seule la photo est retirée.
    const [project] = await ctx.db
      .select({ removedAt: schema.project.removedAt })
      .from(schema.project)
      .where(eq(schema.project.id, meteo.id))
    expect(project?.removedAt).toBeNull()
  })
})

// ─── L'aperçu de la feuille (GET /v1/reports/target) ─────────────────────────────────────────────

describe('the preview of a target, its head and its parts', () => {
  it('gives the head of a project: its title, the name of its author and its cover', async () => {
    const preview = await readPreview(max, 'project', meteo.id)

    expect(preview.head).toEqual({
      title: 'Météo',
      authorName: 'Léa',
      image: { url: meteo.visuals[0]?.url, thumbhash: meteo.visuals[0]?.thumbhash },
    })
  })

  it('gives no title to a comment or a profile, and the photo of a profile', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire de Léa')
    later()
    const avatar = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: lea },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(avatar.status).toBe(200)

    const onComment = await readPreview(max, 'comment', comment.id)
    expect(onComment.head).toMatchObject({ title: null, authorName: 'Léa' })
    const onProfile = await readPreview(max, 'member', leaId)
    expect(onProfile.head).toMatchObject({ title: null, authorName: 'Léa' })
    expect(onProfile.head.image?.url).toBe(Me.parse(await act.me(lea)).avatarUrl)
  })

  it('lists the parts of a project in the order of the sheet, each photo with its rank and thumbnail', async () => {
    const { parts } = await readPreview(max, 'project', meteo.id)

    // L'ordre de la feuille : celui de REPORTABLE_PARTS, les photos par rang.
    const ranks = parts.map((part) => rankIn('project', part.field))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(parts.map((part) => part.field))).toEqual(
      new Set([
        'title',
        'pitch',
        'description',
        'category',
        'tools',
        'demoUrl',
        'cover',
        'photo',
        'photoDescription',
        'prompt',
      ]),
    )
    const [first, second] = meteo.visuals
    expect(parts.filter((part) => part.field === 'photo')).toEqual([
      {
        field: 'photo',
        mediaId: first?.id,
        position: 1,
        thumb: { url: first?.url, thumbhash: first?.thumbhash },
        reportedByMe: false,
      },
      {
        field: 'photo',
        mediaId: second?.id,
        position: 2,
        thumb: { url: second?.url, thumbhash: second?.thumbhash },
        reportedByMe: false,
      },
    ])
    // La couverture est la 1re photo ; seule la 1re photo a une description.
    expect(parts.filter((part) => part.field === 'cover').map((part) => part.mediaId)).toEqual([
      first?.id,
    ])
    expect(parts.filter((part) => part.field === 'photoDescription')).toEqual([
      expect.objectContaining({ mediaId: first?.id, position: 1 }),
    ])
    // Un texte n'a ni photo, ni rang, ni miniature.
    for (const field of ['title', 'pitch', 'description', 'tools', 'demoUrl', 'prompt'] as const) {
      expect(
        parts.find((part) => part.field === field),
        field,
      ).toEqual({
        field,
        mediaId: null,
        position: null,
        thumb: null,
        reportedByMe: false,
      })
    }
  })

  it('leaves out the parts a project does not have', async () => {
    const bare = await act.publish(lea, 'Vélo')

    const { parts } = await readPreview(max, 'project', bare.id)
    expect(parts.map((part) => part.field)).toEqual(['title', 'pitch', 'category'])
  })

  it('lists the parts of a profile and of an update, and none for a comment', async () => {
    await act.updateProfile(lea, { bio: 'J’aime la pluie.', favoriteTools: ['Mistral'] })
    later()
    const avatar = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: lea },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(avatar.status).toBe(200)
    const comment = await act.comment(meteo.id, lea, 'Un commentaire de Léa')
    later()
    const update = await act.send('POST', `/v1/projects/${meteo.id}/updates`, lea, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un mode hors ligne' }],
      photos: [],
      beforeAfter: false,
    })
    expect(update.status).toBe(201)
    const { id: updateId } = ProjectUpdate.parse(await update.json())

    expect((await readPreview(max, 'member', leaId)).parts.map((part) => part.field)).toEqual([
      'name',
      'handle',
      'bio',
      'favoriteTools',
      'avatar',
    ])
    expect((await readPreview(max, 'update', updateId)).parts.map((part) => part.field)).toEqual([
      'text',
    ])
    expect((await readPreview(max, 'comment', comment.id)).parts).toEqual([])
    // Un profil sans bio, sans outils ni photo : son nom et son pseudo seulement.
    expect((await readPreview(lea, 'member', maxId)).parts.map((part) => part.field)).toEqual([
      'name',
      'handle',
    ])
  })

  it('says which parts, and whether the whole content, this member already reported', async () => {
    const second = photoId(meteo, 2)
    expect((await postReport(max, projectOf(), { field: 'photo', mediaId: second })).status).toBe(
      201,
    )
    expect((await postReport(max, projectOf(), { field: 'description' })).status).toBe(201)

    const before = await readPreview(max, 'project', meteo.id)
    expect(before.reportedByMe).toBe(false)
    expect(
      before.parts.filter((part) => part.reportedByMe).map((part) => [part.field, part.mediaId]),
    ).toEqual([
      ['description', null],
      ['photo', second],
    ])

    expect((await postReport(max, projectOf())).status).toBe(201)
    expect((await readPreview(max, 'project', meteo.id)).reportedByMe).toBe(true)
    // Ce que Max a signalé ne compte pas pour Zoé.
    const forZoe = await readPreview(zoe, 'project', meteo.id)
    expect(forZoe.reportedByMe).toBe(false)
    expect(forZoe.parts.filter((part) => part.reportedByMe)).toEqual([])
  })

  it('forgets a report of a part once the moderation has decided on it', async () => {
    expect((await postReport(max, projectOf(), { field: 'description' })).status).toBe(201)
    later()
    await act.decide(louis, {
      action: 'dismiss',
      target: { kind: 'project', id: meteo.id },
      part: { field: 'description' },
    })

    const { parts } = await readPreview(max, 'project', meteo.id)
    expect(parts.find((part) => part.field === 'description')?.reportedByMe).toBe(false)
  })

  // Une photo retirée par la modération n'est plus sur la page des autres : elle n'est plus une
  // partie à signaler, et la photo suivante devient la couverture (« Ce qui change au plan »).
  it('leaves out a photo removed by the moderation, and the next photo becomes the cover', async () => {
    const second = meteo.visuals[1]
    const firstId = photoId(meteo, 1)
    expect((await postReport(zoe, projectOf(), { field: 'photo', mediaId: firstId })).status).toBe(
      201,
    )
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: meteo.id },
      part: { field: 'photo', mediaId: firstId },
      ground: 'rules',
      explanation: 'Une photo volée.',
    })

    const { parts, head } = await readPreview(max, 'project', meteo.id)
    expect(parts.filter((part) => part.field === 'photo').map((part) => part.mediaId)).toEqual([
      second?.id,
    ])
    expect(parts.find((part) => part.field === 'photo')?.position).toBe(1)
    expect(parts.filter((part) => part.field === 'cover').map((part) => part.mediaId)).toEqual([
      second?.id,
    ])
    expect(head.image?.url).toBe(second?.url)
  })

  it('says whether the author is an administrator in office', async () => {
    expect((await readPreview(max, 'project', meteo.id)).author.isAdmin).toBe(false)

    await act.makeAdmin(leaId)
    expect((await readPreview(max, 'project', meteo.id)).author.isAdmin).toBe(true)
    expect((await readPreview(max, 'member', leaId)).author.isAdmin).toBe(true)

    later()
    await act.revokeAdmin(leaId)
    expect((await readPreview(max, 'project', meteo.id)).author.isAdmin).toBe(false)
  })

  it('gives the reports this member can still send today', async () => {
    expect((await readPreview(max, 'project', meteo.id)).remainingToday).toBe(REPORTS_PER_DAY)

    expect((await postReport(max, projectOf(), { field: 'description' })).status).toBe(201)
    expect((await readPreview(max, 'project', meteo.id)).remainingToday).toBe(REPORTS_PER_DAY - 1)
    expect((await readPreview(zoe, 'project', meteo.id)).remainingToday).toBe(REPORTS_PER_DAY)
  })
})
