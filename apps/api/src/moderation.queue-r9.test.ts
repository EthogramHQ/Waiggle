// Tests d'intégration de la tranche R9 (« la modération, avec 7d ») : ce que la file de modération
// dit de chaque élément depuis qu'on signale une partie d'un contenu. GET /v1/moderation/reports
// (la file), GET /v1/moderation/removed (les retirés), GET /v1/moderation/decisions (l'historique).
// Plan R9, « API » (BE-D) et « Ce qui change au plan » (contrat ui-P1, appariement jur-P4) ;
// contrat : `ModerationQueueItem`, `RemovedItem`, `DecisionHistoryItem` (packages/contracts).
//
// Quatre membres : Léa (l'autrice de « Météo », un projet testable à trois photos), Max (qui
// signale, commente et teste), Zoé (qui signale aussi) et Louis, l'administrateur.
//
// Ce qui est vérifié :
// - un élément par cible et par partie : le projet entier et sa 2e photo font deux éléments ;
// - le projet porteur (`context`) et la date de publication (`contentCreatedAt`) d'un commentaire,
//   d'une mise à jour, d'un appel et d'un message ; pas de miniature pour un projet signalé
//   lui-même (sa couverture est une image de la copie, montrée sans sa clé : règle 7b) ;
// - la fiche de l'autrice : nom, pseudo, inscription, nombres de projets et de commentaires, retraits
//   (ceux d'une partie compris, sauf rétablis) et suspensions ;
// - la partie d'un retrait dans la liste des retirés et dans l'historique ;
// - le rang d'une photo compte toutes les photos, retirées comprises (celui que voit l'autrice).
//
// Chaque retrait passe par la vraie route de décision, après un vrai signalement. Le temps est
// maîtrisé par le test (fausse horloge, voir moderation.test.ts).
import {
  type DecisionHistoryItem,
  DecisionHistoryPage,
  type ModerationDecisionInput,
  type ModerationQueueItem,
  ModerationQueuePage,
  Project,
  ProjectUpdate,
  RemovedPage,
  type ReportPartField,
  type ReportTarget,
  TesterCall,
  TesterMessage,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
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
let meteo: Project // le projet testable de Léa, ses trois photos comprises

const SECOND = 1000
const DAY = 24 * 60 * 60 * SECOND
const START = new Date('2026-06-15T08:00:00.000Z')

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  // Léa s'inscrit la première, à START : sa date d'inscription est connue du test.
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  later()
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
  await act.makeAdmin((await act.me(louis)).id)
  // Trois jours plus tard : une date d'inscription relue « maintenant » se verrait.
  later(3 * DAY)
  const project = await act.publish(lea, 'Météo', {
    pitch: 'La pluie de demain, quartier par quartier.',
    status: 'testable',
    demoUrl: 'https://meteo.example.com/',
    description: 'Une appli qui prévoit la pluie, rue par rue.',
  })
  await addPhoto(project.id, lea, '#3b7a9e')
  await addPhoto(project.id, lea, '#d9a441')
  meteo = await addPhoto(project.id, lea, '#7a3b9e')
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
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

/** Envoie une photo de mise à jour, encore libre ; rend son identifiant. */
const uploadUpdatePhoto = async (projectId: string, cookie: string) => {
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(800, 600), 'update'),
  })
  expect(res.status).toBe(201)
  return z.object({ id: z.uuid() }).parse(await res.json()).id
}

/** Publie une mise à jour d'une ligne, avec des photos si on en donne. */
const postUpdate = async (
  projectId: string,
  cookie: string,
  text: string,
  photos: string[] = [],
) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
    title: null,
    version: null,
    lines: [{ family: 'new', text }],
    photos: photos.map((id) => ({ id, description: null })),
    beforeAfter: false,
  })
  expect(res.status).toBe(201)
  return ProjectUpdate.parse(await res.json())
}

/** L'identifiant de la photo de ce rang (à partir de 1), dans l'ordre de la galerie. */
const photoId = (position: number) => {
  const visual = meteo.visuals[position - 1]
  if (!visual) throw new Error(`no photo ${position}`)
  return visual.id
}

type Part = { field: ReportPartField; mediaId?: string }
const photo = (position: number): Part => ({ field: 'photo', mediaId: photoId(position) })
const DESCRIPTION: Part = { field: 'description' }

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

/** Une décision de Louis, par la vraie route (201 attendu). */
const decide = async (decision: ModerationDecisionInput) => {
  later()
  return act.decide(louis, decision)
}
const remove = (target: ReportTarget, part?: Part) =>
  decide({
    action: 'remove',
    target,
    ...(part && { part }),
    ground: 'rules',
    explanation: 'Une photo volée.',
  })
const restore = (target: ReportTarget, part?: Part) =>
  decide({ action: 'restore', target, ...(part && { part }) })

const readQueue = async () => {
  const res = await act.send('GET', '/v1/moderation/reports', louis)
  expect(res.status).toBe(200)
  return ModerationQueuePage.parse(await res.json()).items
}
const readRemoved = async () => {
  const res = await act.send('GET', '/v1/moderation/removed', louis)
  expect(res.status).toBe(200)
  return RemovedPage.parse(await res.json()).items
}
const readHistory = async () => {
  const res = await act.send('GET', '/v1/moderation/decisions', louis)
  expect(res.status).toBe(200)
  return DecisionHistoryPage.parse(await res.json()).items
}

/** L'élément de la file qui vise cette cible (et cette partie : aucune, le contenu entier). */
const itemOf = (items: ModerationQueueItem[], target: ReportTarget, mediaOrField?: string) => {
  const found = items.find(
    (item) =>
      item.target.kind === target.kind &&
      item.target.id === target.id &&
      (mediaOrField === undefined
        ? item.part === null
        : item.part?.mediaId === mediaOrField || item.part?.field === mediaOrField),
  )
  if (!found) throw new Error(`no queue item for ${target.kind} ${mediaOrField ?? 'whole'}`)
  return found
}

/** La miniature de « Météo » : sa première photo, telle que l'autrice la lit. */
const meteoThumb = () => {
  const first = meteo.visuals[0]
  if (!first) throw new Error('no first photo')
  return { url: first.url, thumbhash: first.thumbhash }
}

// ─── Un élément par partie ───────────────────────────────────────────────────────────────────────

describe('the queue, part by part', () => {
  it('keeps the whole project and its second photo as two items, each with its part', async () => {
    await report(max, projectTarget())
    await report(zoe, projectTarget(), photo(2))
    await report(max, projectTarget(), photo(2))

    const items = await readQueue()

    expect(items).toHaveLength(2)
    // Du premier signalement au plus récent : le projet entier, puis sa 2e photo.
    expect(items.map((item) => [item.target, item.part, item.count])).toEqual([
      [projectTarget(), null, 1],
      [projectTarget(), { field: 'photo', mediaId: photoId(2), position: 2 }, 2],
    ])
  })

  it('ranks a photo among all the photos of its place, removed ones included', async () => {
    // La 2e photo retirée reste à sa place chez Léa : la 3e reste « la 3e photo ».
    await report(max, projectTarget(), photo(2))
    await remove(projectTarget(), photo(2))
    await report(zoe, projectTarget(), photo(3))
    // Une mise à jour à deux photos : la seconde est « la 2e photo » de la mise à jour.
    const first = await uploadUpdatePhoto(meteo.id, lea)
    const second = await uploadUpdatePhoto(meteo.id, lea)
    const update = await postUpdate(meteo.id, lea, 'Deux nouvelles cartes', [first, second])
    await report(max, { kind: 'update', id: update.id }, { field: 'photo', mediaId: second })

    const items = await readQueue()

    expect(itemOf(items, projectTarget(), photoId(3)).part).toEqual({
      field: 'photo',
      mediaId: photoId(3),
      position: 3,
    })
    expect(itemOf(items, { kind: 'update', id: update.id }, second).part).toEqual({
      field: 'photo',
      mediaId: second,
      position: 2,
    })
  })
})

// ─── Le projet porteur et la date de publication ─────────────────────────────────────────────────

describe('the context of an item', () => {
  it('situates a comment, an update, a call and a message in their project, with their date', async () => {
    const comment = await act.comment(meteo.id, max, 'La carte ne charge pas chez moi.')
    later()
    const update = await postUpdate(meteo.id, lea, 'Le radar couvre Lyon')
    // Le coin des testeurs : Max rejoint, Léa lance un appel, Max envoie un retour.
    later()
    expect((await act.send('POST', `/v1/projects/${meteo.id}/testers`, max)).status).toBe(204)
    later()
    const callRes = await act.send('POST', `/v1/projects/${meteo.id}/calls`, lea, {
      text: 'Essayez la carte de nuit, merci !',
      photoId: null,
      photoDescription: null,
    })
    expect(callRes.status).toBe(201)
    const call = TesterCall.parse(await callRes.json())
    later()
    const messageRes = await act.send(
      'POST',
      `/v1/projects/${meteo.id}/threads/${encodeURIComponent(maxId)}/messages`,
      max,
      {
        kind: 'feedback',
        outcome: 'partly',
        device: 'phone',
        text: 'La carte de nuit reste blanche.',
        captureId: null,
      },
    )
    expect(messageRes.status).toBe(201)
    const message = TesterMessage.parse(await messageRes.json())
    // Les signalements viennent des jours plus tard : la date de publication ne s'y confond pas.
    later(2 * DAY)
    await report(zoe, { kind: 'comment', id: comment.id })
    await report(max, { kind: 'update', id: update.id })
    await report(max, { kind: 'call', id: call.id })
    await report(lea, { kind: 'message', id: message.id })

    const items = await readQueue()

    const context = { projectId: meteo.id, title: 'Météo', image: meteoThumb() }
    expect(
      [
        { kind: 'comment', id: comment.id },
        { kind: 'update', id: update.id },
        { kind: 'call', id: call.id },
        { kind: 'message', id: message.id },
      ].map((target) => {
        const item = itemOf(items, target as ReportTarget)
        return [target.kind, item.context, item.contentCreatedAt]
      }),
    ).toEqual([
      ['comment', context, comment.createdAt],
      ['update', context, update.createdAt],
      ['call', context, call.createdAt],
      ['message', context, message.createdAt],
    ])
    // Témoin : chaque date est bien celle de la publication, pas celle du signalement.
    expect(comment.createdAt).not.toBe(
      itemOf(items, { kind: 'comment', id: comment.id }).firstReportedAt,
    )
  })

  it('gives no thumbnail for a project reported itself, and the project thumbnail for a comment', async () => {
    const comment = await act.comment(meteo.id, max, 'Bravo pour le radar !')
    await report(zoe, projectTarget())
    await report(zoe, { kind: 'comment', id: comment.id })

    const items = await readQueue()

    // Choix gardé : la couverture d'un projet signalé est une image de sa copie, que la file montre
    // sans sa clé (règle 7b, « without its key ») ; le contexte ne la donne donc pas.
    expect(itemOf(items, projectTarget()).context).toEqual({
      projectId: meteo.id,
      title: 'Météo',
      image: null,
    })
    expect(itemOf(items, projectTarget()).contentCreatedAt).toBe(meteo.createdAt)
    expect(itemOf(items, { kind: 'comment', id: comment.id }).context?.image).toEqual(meteoThumb())
  })
})

// ─── La fiche de l'autrice ───────────────────────────────────────────────────────────────────────

describe('the author record', () => {
  it('names the author: her name, her handle and the date she joined', async () => {
    const { handle } = await act.me(lea)
    await report(zoe, projectTarget())

    const [item] = await readQueue()

    expect(item?.authorRecord).toMatchObject({
      memberId: leaId,
      name: 'Léa',
      handle,
      joinedAt: START.toISOString(),
    })
    // Témoin : le pseudo lu n'est pas vide (sinon le test passerait avec un pseudo manquant).
    expect(handle).not.toBe('')
  })

  it('counts every project and every comment not deleted, private and removed ones included', async () => {
    // Projets de Léa : Météo (public), Carnet (privé), Brouillon (retiré par la modération), et
    // Ancien (supprimé par elle : il ne compte plus).
    const carnet = await act.publish(lea, 'Carnet')
    later()
    await act.setVisibility(carnet.id, lea, 'private')
    later()
    const brouillon = await act.publish(lea, 'Brouillon')
    await report(max, projectTarget(brouillon.id))
    await remove(projectTarget(brouillon.id))
    later()
    const ancien = await act.publish(lea, 'Ancien')
    later()
    expect((await act.send('DELETE', `/v1/projects/${ancien.id}`, lea)).status).toBe(204)
    // Commentaires de Léa sur le projet de Max : un gardé, un supprimé par elle, un retiré.
    later()
    const fusee = await act.publish(max, 'Fusée')
    later()
    await act.comment(fusee.id, lea, 'Joli décollage.')
    later()
    const deleted = await act.comment(fusee.id, lea, 'Oups, doublon.')
    later()
    await act.deleteComment(fusee.id, deleted.id, lea)
    later()
    const removed = await act.comment(fusee.id, lea, 'Un lien douteux.')
    await report(zoe, { kind: 'comment', id: removed.id })
    await remove({ kind: 'comment', id: removed.id })

    await report(zoe, projectTarget())
    const items = await readQueue()

    expect(itemOf(items, projectTarget()).authorRecord).toMatchObject({
      projectCount: 3,
      commentCount: 2,
    })
    // Témoin : la fiche compte plus que ce qu'un autre membre voit (le contrat : « privés et
    // retirés compris ») ; Zoé, elle, ne voit ni Carnet ni Brouillon.
    expect((await act.send('GET', `/v1/projects/${carnet.id}`, zoe)).status).toBe(404)
    expect((await act.send('GET', `/v1/projects/${brouillon.id}`, zoe)).status).toBe(404)
  })

  it('counts the removals of parts and the suspensions, but no longer a part restored since', async () => {
    await report(max, projectTarget(), photo(2))
    await report(max, projectTarget(), DESCRIPTION)
    await remove(projectTarget(), photo(2))
    await remove(projectTarget(), DESCRIPTION)
    await decide({
      action: 'suspend',
      memberId: leaId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des photos volées, plusieurs fois.',
    })
    await report(zoe, projectTarget())

    expect(itemOf(await readQueue(), projectTarget()).authorRecord).toMatchObject({
      removals: 2,
      suspensions: 1,
      suspendedNow: true,
    })

    // La 2e photo rétablie ne compte plus ; la description, toujours retirée, compte encore.
    await restore(projectTarget(), photo(2))

    expect(itemOf(await readQueue(), projectTarget()).authorRecord).toMatchObject({
      removals: 1,
      suspensions: 1,
    })
  })
})

// ─── Les retirés et l'historique ─────────────────────────────────────────────────────────────────

describe('the removed list and the history', () => {
  it('names the part of each removal, in the removed list and in the history', async () => {
    await report(max, projectTarget(), photo(2))
    await report(max, projectTarget(), DESCRIPTION)
    await remove(projectTarget(), photo(2))
    await remove(projectTarget(), DESCRIPTION)

    const removedParts = (await readRemoved()).map((item) => [item.target, item.part])
    expect(removedParts).toEqual(
      expect.arrayContaining([
        [projectTarget(), { field: 'photo', mediaId: photoId(2), position: 2 }],
        [projectTarget(), { field: 'description', mediaId: null, position: null }],
      ]),
    )
    expect(removedParts).toHaveLength(2)

    await restore(projectTarget(), photo(2))

    // Rétablie, la photo quitte la liste des retirés ; la description y reste.
    expect((await readRemoved()).map((item) => item.part)).toEqual([
      { field: 'description', mediaId: null, position: null },
    ])
    // L'historique, de la plus récente à la plus ancienne : le rétablissement, puis les retraits.
    const history = (await readHistory()).map((item: DecisionHistoryItem) => [
      item.action,
      item.part,
    ])
    expect(history).toEqual([
      ['restore', { field: 'photo', mediaId: photoId(2), position: 2 }],
      ['remove', { field: 'description', mediaId: null, position: null }],
      ['remove', { field: 'photo', mediaId: photoId(2), position: 2 }],
    ])
  })
})
