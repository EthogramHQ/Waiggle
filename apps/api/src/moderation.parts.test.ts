// Tests d'intégration de la tranche R9 (« la modération, avec 7d ») : retirer, classer et rétablir
// une seule partie d'un contenu (POST /v1/moderation/decisions avec `part`). Scénario :
// docs/scenarios/refonte.md, « Retirer une partie » et « Les parties » ; plan R9, « API » et « Ce
// qui change au plan » (relecture de sécurité P1 et P4), et les tests demandés mot pour mot par la
// relecture de sécurité.
//
// Quatre membres : Léa (l'autrice de « Météo », un projet complet : description, outils, démo,
// prompt, deux photos dont la première décrite), Max (qui signale), Zoé (une autre, qui signale
// aussi, et parfois administratrice) et Louis, l'administrateur.
//
// Ce que la route promet :
// - un retrait de partie exige un signalement ouvert de cette partie (409 `part_not_reported`), et
//   une photo qui appartient à la cible (sinon le 404 d'une cible inconnue) ;
// - le titre, le pitch, la catégorie d'un projet et le texte d'une mise à jour ne se retirent qu'avec
//   tout le contenu (422 `part_whole_only`) ;
// - la décision ne clôt que les signalements de cette partie (et ceux de la description d'une photo
//   retirée) ; un retrait entier clôt aussi ceux des parties, un classement entier non ;
// - une partie retirée sort de sa colonne : la valeur est gardée pour le rétablissement (P1) ;
// - les mêmes gardes qu'un retrait entier : son propre contenu, un membre bloqué, le mot de passe
//   au-delà de 10 retraits dans l'heure.
//
// Le temps est maîtrisé par le test (fausse horloge, voir moderation.test.ts).
import {
  ErrorResponse,
  type ModerationDecisionInput,
  Project,
  ProjectUpdate,
  REMOVALS_BEFORE_PASSWORD,
  type ReportPartField,
  type ReportTarget,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let louis: string
let leaId: string
let maxId: string
let zoeId: string
let meteo: Project // le projet complet de Léa, ses deux photos comprises

const SECOND = 1000
const LOUIS_PASSWORD = 'louis-long-password'
const START = new Date('2026-06-15T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const DESCRIPTION = 'Une appli qui prévoit la pluie, rue par rue.'

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
    password: LOUIS_PASSWORD,
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  await act.makeAdmin((await act.me(louis)).id)
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

/** Un projet où chaque partie est présente, deux photos comprises, la première décrite. */
const completeProject = async (cookie: string, title: string) => {
  const project = await act.publish(cookie, title, {
    pitch: 'La pluie de demain, quartier par quartier.',
    status: 'testable',
    description: DESCRIPTION,
    tools: ['Mistral'],
    demoUrl: 'https://meteo.example.com/',
    prompts: ['Tu es un météorologue patient.'],
  })
  await addPhoto(project.id, cookie, '#3b7a9e')
  const withPhotos = await addPhoto(project.id, cookie, '#d9a441')
  later()
  const res = await act.send(
    'PATCH',
    `/v1/projects/${project.id}/visuals/${withPhotos.visuals[0]?.id ?? ''}`,
    cookie,
    { description: 'Le radar de pluie au-dessus de Lyon.' },
  )
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

/** L'identifiant de la photo de ce rang (à partir de 1), dans l'ordre de la galerie. */
const photoId = (position: number, project: Project = meteo) => {
  const visual = project.visuals[position - 1]
  if (!visual) throw new Error(`no photo ${position}`)
  return visual.id
}

type Part = { field: ReportPartField; mediaId?: string }
const photo = (position: number, project: Project = meteo): Part => ({
  field: 'photo',
  mediaId: photoId(position, project),
})

const projectTarget = (id = meteo.id): ReportTarget => ({ kind: 'project', id })

/** Signale une cible, ou une de ses parties (201 attendu). */
const report = async (cookie: string, target: ReportTarget, part?: Part) => {
  later()
  const res = await act.send('POST', '/v1/reports', cookie, {
    target,
    ...(part && { part }),
    reason: 'other',
  })
  expect(res.status, `report ${target.kind} ${part?.field ?? 'whole'}`).toBe(201)
}

const decideRaw = (cookie: string, body: unknown) => {
  later()
  return act.send('POST', '/v1/moderation/decisions', cookie, body)
}
/** Le corps d'un retrait d'une partie (ou du contenu entier sans `part`). */
const removal = (target: ReportTarget, part?: Part, password?: string) => ({
  action: 'remove',
  target,
  ...(part && { part }),
  ground: 'rules',
  explanation: 'Une photo volée.',
  ...(password !== undefined && { password }),
})
const removeRaw = (target: ReportTarget, part?: Part, cookie = louis) =>
  decideRaw(cookie, removal(target, part))

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const reportsInBase = () =>
  ctx.db.select().from(schema.contentReport).orderBy(schema.contentReport.createdAt)
const decisionsInBase = () =>
  ctx.db.select().from(schema.moderationDecision).orderBy(schema.moderationDecision.createdAt)
const partRemovalsInBase = () =>
  ctx.db.select().from(schema.contentPartRemoval).orderBy(schema.contentPartRemoval.createdAt)
/** L'état de chaque signalement, avec sa partie : [champ (ou « whole »), photo, statut]. */
const reportStates = async () =>
  (await reportsInBase()).map((r) => [r.partField ?? 'whole', r.partMediaId, r.status])

const mediaRow = async (id: string) => {
  const [row] = await ctx.db
    .select()
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.id, id))
  return row
}
const projectRow = async (id = meteo.id) => {
  const [row] = await ctx.db.select().from(schema.project).where(eq(schema.project.id, id))
  return row
}

// ─── Les tests de la relecture de sécurité (mot pour mot) ────────────────────────────────────────

describe('removing a part, the guards of the security review', () => {
  it('refuses to remove a part that no open report targets, even when the whole project has one', async () => {
    await report(max, projectTarget())
    const before = { reports: await reportsInBase(), decisions: await decisionsInBase() }

    await expectError(
      await removeRaw(projectTarget(), { field: 'description' }),
      409,
      'part_not_reported',
    )
    expect(await reportsInBase()).toEqual(before.reports)
    expect(await decisionsInBase()).toEqual(before.decisions)
    expect(await partRemovalsInBase()).toEqual([])
    expect((await projectRow())?.removedAt).toBeNull()

    // Témoin : signalée, la description se retire.
    await report(zoe, projectTarget(), { field: 'description' })
    expect((await removeRaw(projectTarget(), { field: 'description' })).status).toBe(201)
  })

  it('refuses a part whose photo belongs to another content, like an unknown content', async () => {
    const velo = await addPhoto((await act.publish(lea, 'Vélo')).id, lea, '#7a9e3b')
    await report(max, projectTarget(), photo(2))
    await report(max, projectTarget(velo.id), photo(1, velo))
    const reference = await removeRaw(projectTarget(UNKNOWN), photo(1, velo))
    expect(reference.status).toBe(404)
    const referenceBody = await reference.json()

    for (const mediaId of [photoId(1, velo), UNKNOWN]) {
      const res = await removeRaw(projectTarget(), { field: 'photo', mediaId })
      expect(res.status, mediaId).toBe(404)
      expect(await res.json(), mediaId).toEqual(referenceBody)
    }
    expect(await decisionsInBase()).toEqual([])
    expect(await partRemovalsInBase()).toEqual([])
    expect((await projectRow())?.removedAt).toBeNull()
  })

  it('dismissing the report of a part keeps the reports of the whole project and of the other parts open', async () => {
    await report(max, projectTarget())
    await report(zoe, projectTarget(), photo(2))
    // Un administrateur peut signaler, puis décider (moderation.test.ts). Trois membres : les trois
    // signalements restent distincts même lus sans leur partie.
    await report(louis, projectTarget(), { field: 'description' })

    const res = await decideRaw(louis, {
      action: 'dismiss',
      target: projectTarget(),
      part: photo(2),
    })
    expect(res.status).toBe(201)

    expect(await reportStates()).toEqual([
      ['whole', null, 'open'],
      ['photo', photoId(2), 'dismissed'],
      ['description', null, 'open'],
    ])
    const [decision] = await decisionsInBase()
    expect(decision).toMatchObject({
      action: 'dismiss',
      partField: 'photo',
      partMediaId: photoId(2),
    })
  })

  it('counts a part removal among the 10 removals of the hour before asking the password', async () => {
    // Cinq projets de Léa, deux parties signalées sur chacun : dix retraits de partie.
    const projects = [meteo]
    for (const title of ['Vélo', 'Jardin', 'Cuisine', 'Lecture']) {
      projects.push(
        await act.publish(lea, title, {
          status: 'testable',
          description: `La description de ${title}.`,
          demoUrl: 'https://demo.example.com/',
        }),
      )
    }
    const parts: [ReportTarget, Part][] = projects.flatMap((p) => [
      [projectTarget(p.id), { field: 'description' }],
      [projectTarget(p.id), { field: 'demoUrl' }],
    ])
    expect(parts).toHaveLength(REMOVALS_BEFORE_PASSWORD)
    for (const [target, part] of parts) await report(max, target, part)
    const comment = await act.comment(meteo.id, lea, 'Un commentaire de Léa')
    await report(max, { kind: 'comment', id: comment.id })

    for (const [target, part] of parts) {
      expect((await removeRaw(target, part)).status, `${target.id} ${part.field}`).toBe(201)
    }

    const eleventh = removal({ kind: 'comment', id: comment.id })
    await expectError(await decideRaw(louis, eleventh), 403, 'password_required')
    expect(
      (
        await decideRaw(
          louis,
          removal({ kind: 'comment', id: comment.id }, undefined, LOUIS_PASSWORD),
        )
      ).status,
    ).toBe(201)
  })

  it('refuses a part of her own content or of a member she blocked, and accepts one of a member who blocked her', async () => {
    await act.makeAdmin(zoeId)
    const recettes = await act.publish(zoe, 'Recettes', {
      description: 'Mes recettes du dimanche.',
    })
    await act.updateProfile(max, { bio: 'Je teste tout.' })
    await report(max, projectTarget(recettes.id), { field: 'description' }) // le contenu de Zoé
    await report(max, projectTarget(), { field: 'description' }) // Léa, que Zoé va bloquer
    await report(lea, { kind: 'member', id: maxId }, { field: 'bio' }) // Max, qui va bloquer Zoé
    later()
    await act.block(leaId, zoe) // Zoé bloque Léa
    later()
    await act.block(zoeId, max) // Max bloque Zoé
    const before = { reports: await reportsInBase(), decisions: await decisionsInBase() }

    await expectError(
      await removeRaw(projectTarget(recettes.id), { field: 'description' }, zoe),
      422,
      'own_content',
    )
    await expectError(
      await removeRaw(projectTarget(), { field: 'description' }, zoe),
      422,
      'own_content',
    )
    expect(await reportsInBase()).toEqual(before.reports)
    expect(await decisionsInBase()).toEqual(before.decisions)

    // Max a bloqué Zoé : cela ne la concerne pas, elle retire sa bio.
    expect((await removeRaw({ kind: 'member', id: maxId }, { field: 'bio' }, zoe)).status).toBe(201)
    // Témoin : Louis retire la description de Léa ; le refus venait bien du blocage.
    expect((await removeRaw(projectTarget(), { field: 'description' })).status).toBe(201)
  })
})

// ─── Retirer une partie ──────────────────────────────────────────────────────────────────────────

describe('removing a part', () => {
  it('removes a photo alone: marks it, keeps the project, and closes the reports of that photo only', async () => {
    await report(max, projectTarget(), photo(2))
    await report(zoe, projectTarget())
    await report(louis, projectTarget(), photo(1))

    const res = await removeRaw(projectTarget(), photo(2))
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }

    expect(await decisionsInBase()).toEqual([
      expect.objectContaining({
        id,
        action: 'remove',
        targetKind: 'project',
        targetId: meteo.id,
        targetMemberId: leaId,
        partField: 'photo',
        partMediaId: photoId(2),
      }),
    ])
    expect(await partRemovalsInBase()).toEqual([
      expect.objectContaining({
        removalId: id,
        authorId: leaId,
        objectKind: 'project',
        projectId: meteo.id,
        field: 'photo',
        projectMediaId: photoId(2),
        createdAt: new Date(Date.now()),
      }),
    ])
    // La photo garde sa ligne, marquée ; l'autre photo et le projet restent.
    expect((await mediaRow(photoId(2)))?.removalId).toBe(id)
    expect((await mediaRow(photoId(1)))?.removalId).toBeNull()
    expect((await projectRow())?.removedAt).toBeNull()
    expect(await reportStates()).toEqual([
      ['photo', photoId(2), 'removed'],
      ['whole', null, 'open'],
      ['photo', photoId(1), 'open'],
    ])
  })

  it('refuses with 422 part_whole_only the title, the pitch and the category of a project, and the text of an update', async () => {
    later()
    const created = await act.send('POST', `/v1/projects/${meteo.id}/updates`, lea, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un mode hors ligne' }],
      photos: [],
      beforeAfter: false,
    })
    expect(created.status).toBe(201)
    const update: ReportTarget = {
      kind: 'update',
      id: ProjectUpdate.parse(await created.json()).id,
    }
    const wholeOnly: [ReportTarget, Part][] = [
      [projectTarget(), { field: 'title' }],
      [projectTarget(), { field: 'pitch' }],
      [projectTarget(), { field: 'category' }],
      [update, { field: 'text' }],
    ]
    // Un membre par signalement du projet : chacun reste distinct, même lu sans sa partie.
    const reporters = [max, zoe, louis, max]
    for (const [i, [target, part]] of wholeOnly.entries()) {
      await report(reporters[i] ?? max, target, part)
    }

    for (const [target, part] of wholeOnly) {
      await expectError(await removeRaw(target, part), 422, 'part_whole_only')
    }
    expect(await decisionsInBase()).toEqual([])
    expect((await reportsInBase()).map((r) => r.status)).toEqual(['open', 'open', 'open', 'open'])
    // Ils se classent, eux : la modération répond au signalement.
    expect(
      (
        await decideRaw(louis, {
          action: 'dismiss',
          target: projectTarget(),
          part: { field: 'title' },
        })
      ).status,
    ).toBe(201)
  })

  it('closes the reports of its parts with a whole removal, but not with a whole dismissal', async () => {
    const velo = await completeProject(lea, 'Vélo')
    await report(max, projectTarget(velo.id))
    await report(zoe, projectTarget(velo.id), { field: 'description' })
    await report(max, projectTarget())
    await report(zoe, projectTarget(), { field: 'description' })

    expect(
      (await decideRaw(louis, { action: 'dismiss', target: projectTarget(velo.id) })).status,
    ).toBe(201)
    expect((await removeRaw(projectTarget())).status).toBe(201)

    expect(await reportStates()).toEqual([
      ['whole', null, 'dismissed'],
      ['description', null, 'open'],
      ['whole', null, 'removed'],
      ['description', null, 'removed'],
    ])
  })

  // Relecture juridique (plan R9, « Tests demandés ») : la description d'une photo retirée n'a plus
  // rien à montrer ; son signalement est traité avec la photo.
  it('closes the reports on the description of a removed photo', async () => {
    await report(max, projectTarget(), { field: 'photoDescription', mediaId: photoId(1) })
    await report(zoe, projectTarget(), photo(1))
    await report(louis, projectTarget(), { field: 'description' })

    expect((await removeRaw(projectTarget(), photo(1))).status).toBe(201)

    expect(await reportStates()).toEqual([
      ['photoDescription', photoId(1), 'removed'],
      ['photo', photoId(1), 'removed'],
      ['description', null, 'open'],
    ])
    expect((await partRemovalsInBase()).map((r) => [r.field, r.projectMediaId])).toEqual([
      ['photo', photoId(1)],
    ])
  })

  // Relecture de sécurité P1 : la valeur retirée sort de sa colonne (aucune lecture oubliée ne peut
  // plus la montrer) et reste gardée dans la ligne du retrait, pour son auteur et le rétablissement.
  it('takes a removed description out of its column, and keeps it for the restore', async () => {
    await report(max, projectTarget(), { field: 'description' })

    expect((await removeRaw(projectTarget(), { field: 'description' })).status).toBe(201)

    expect((await projectRow())?.description).toBe('')
    expect((await partRemovalsInBase()).map((r) => [r.field, r.hiddenValue])).toEqual([
      ['description', { text: DESCRIPTION }],
    ])
  })

  it('takes a removed bio out of the profile, while a whole profile still cannot be removed', async () => {
    await act.updateProfile(lea, { bio: 'J’aime la pluie.' })
    await report(max, { kind: 'member', id: leaId }, { field: 'bio' })
    await report(zoe, { kind: 'member', id: leaId })

    // Le profil entier : refusé comme avant R9 (moderation.test.ts, « is the only action on a profile »).
    expect((await removeRaw({ kind: 'member', id: leaId })).status).toBe(422)
    expect((await removeRaw({ kind: 'member', id: leaId }, { field: 'bio' })).status).toBe(201)

    const [profile] = await ctx.db
      .select({ bio: schema.profile.bio })
      .from(schema.profile)
      .where(eq(schema.profile.userId, leaId))
    expect(profile?.bio).toBe('')
    expect(
      (await partRemovalsInBase()).map((r) => [r.objectKind, r.authorId, r.hiddenValue]),
    ).toEqual([['member', leaId, { text: 'J’aime la pluie.' }]])
    expect(await reportStates()).toEqual([
      ['bio', null, 'removed'],
      ['whole', null, 'open'],
    ])
  })
})

// ─── Rétablir une partie ─────────────────────────────────────────────────────────────────────────

describe('restoring a part', () => {
  it('restores a removed photo: its mark goes, and both decisions are kept with the part', async () => {
    await report(max, projectTarget(), photo(2))
    expect((await removeRaw(projectTarget(), photo(2))).status).toBe(201)

    const res = await decideRaw(louis, {
      action: 'restore',
      target: projectTarget(),
      part: photo(2),
    })
    expect(res.status).toBe(201)

    expect(await partRemovalsInBase()).toEqual([])
    expect((await mediaRow(photoId(2)))?.removalId).toBeNull()
    expect((await decisionsInBase()).map((d) => [d.action, d.partField, d.partMediaId])).toEqual([
      ['remove', 'photo', photoId(2)],
      ['restore', 'photo', photoId(2)],
    ])
  })

  it('puts a removed description back into its empty column', async () => {
    await report(max, projectTarget(), { field: 'description' })
    expect((await removeRaw(projectTarget(), { field: 'description' })).status).toBe(201)
    expect((await projectRow())?.description).toBe('')

    const restore: ModerationDecisionInput = {
      action: 'restore',
      target: projectTarget(),
      part: { field: 'description' },
    }
    expect((await decideRaw(louis, restore)).status).toBe(201)

    expect((await projectRow())?.description).toBe(DESCRIPTION)
    expect(await partRemovalsInBase()).toEqual([])
  })

  it('refuses to restore a part that is not removed, even when another part is', async () => {
    await report(max, projectTarget(), photo(2))
    expect((await removeRaw(projectTarget(), photo(2))).status).toBe(201)

    for (const part of [photo(1), { field: 'description' } as Part]) {
      await expectError(
        await decideRaw(louis, { action: 'restore', target: projectTarget(), part }),
        409,
        'already_decided',
      )
    }
    // Le contenu entier n'est pas retiré non plus.
    await expectError(
      await decideRaw(louis, { action: 'restore', target: projectTarget() }),
      409,
      'already_decided',
    )
    expect((await mediaRow(photoId(2)))?.removalId).not.toBeNull()
  })
})
