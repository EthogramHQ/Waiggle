// Tests d'intégration de R9 (« la modération, avec 7d ») : la purge de nuit face aux retraits d'une
// partie, et la suppression du compte face aux anciens noms et pseudos gardés dans les décisions.
// Plan R9, « Ce qui change au plan » (Purge, Suppression du compte) ; relectures de sécurité (P2) et
// juridique (P1) du plan, tests demandés mot pour mot.
//
// Les règles :
// - une décision n'est jamais purgée tant qu'une partie qu'elle a retirée l'est encore (ligne de
//   `content_part_removal`, photo de projet ou du coin marquée de son `removal_id`), ni tant que
//   l'appel ou le message du coin qu'elle a retiré en entier le reste : sinon le contenu
//   reviendrait, ou l'auteur perdrait l'explication du retrait ;
// - une partie retirée suit son contenu : supprimer le projet, la mise à jour, le message ou la
//   photo efface la ligne du retrait, et la décision redevient purgeable un an après ;
// - un compte supprimé ne laisse pas son ancien nom ni son ancien pseudo dans les décisions
//   (`previous_value` vidé).
//
// Trois membres : Léa (l'autrice de « Météo »), Max (qui signale, et teste « Météo ») et Louis,
// l'administrateur. Chaque retrait passe par les vraies routes : Max (ou Léa) signale, Louis
// décide. La purge s'appelle comme la tâche de nuit, avec une heure `now` d'un an et plus après la
// décision ; l'horloge de l'API, elle, ne bouge pas (les sessions resteraient sinon expirées).
import {
  Project,
  ProjectUpdate,
  type ReportPart,
  type ReportTarget,
  TesterCall,
  TesterMedia,
  TesterMessage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { purgeModeration } from './reports/retention'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let louis: string
let leaId: string
let maxId: string
let meteo: Project // le projet « Testable » de Léa, avec sa description et sa démo

const SECOND = 1000
const DAY = 24 * 60 * 60 * SECOND
const START = new Date('2026-06-15T08:00:00.000Z')
const LEA_PASSWORD = 'correct-horse-battery'
const DESCRIPTION = 'Une appli qui prévoit la pluie, rue par rue.'
const DEMO = 'https://meteo.example.com/'
const EXPLANATION = 'Une photo volée à un autre site.'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({ name: 'Léa', email: 'lea@example.com', password: LEA_PASSWORD })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
  meteo = await act.publish(lea, 'Météo', {
    pitch: 'La pluie de demain, quartier par quartier.',
    status: 'testable',
    description: DESCRIPTION,
    demoUrl: DEMO,
  })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge d'une seconde : deux gestes n'ont jamais la même date. */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** La purge de nuit, `days` jours après l'heure de l'API. */
const purgeAfter = (days: number) => purgeModeration(ctx.db, new Date(Date.now() + days * DAY))

const projectTarget = (id = meteo.id): ReportTarget => ({ kind: 'project', id })

/** Signale une cible entière, ou une de ses parties (201 attendu). */
const report = async (cookie: string, target: ReportTarget, part?: ReportPart) => {
  later()
  const res = await act.send('POST', '/v1/reports', cookie, {
    target,
    ...(part && { part }),
    reason: part?.field === 'name' || part?.field === 'handle' ? 'impersonation' : 'other',
  })
  expect(res.status, `report ${target.kind} ${part?.field ?? 'whole'}`).toBe(201)
}

/** Signale puis retire (Louis) une partie, ou la cible entière sans `part` ; rend la décision. */
const remove = async (target: ReportTarget, part?: ReportPart, reporter = max) => {
  await report(reporter, target, part)
  later()
  return act.decide(louis, {
    action: 'remove',
    target,
    ...(part && { part }),
    ground: 'rules',
    explanation: EXPLANATION,
  })
}

/** Louis rétablit une partie. */
const restore = async (target: ReportTarget, part: ReportPart) => {
  later()
  return act.decide(louis, { action: 'restore', target, part })
}

/** Une demande qui doit réussir (2xx), quel que soit son code exact. */
const expectOk = async (method: string, path: string, cookie: string, body?: unknown) => {
  later()
  const res = await act.send(method, path, cookie, body)
  expect(res.status, `${method} ${path}`).toBeLessThan(300)
  return res
}

const projectOf = async (cookie: string, id = meteo.id) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  const text = await res.text()
  return { text, project: Project.parse(JSON.parse(text)) }
}

/** Ajoute une photo à un projet (galerie, ou en attente d'une mise à jour) ; rend son identifiant. */
const uploadVisual = async (projectId: string, slot?: 'gallery' | 'update') => {
  const known = new Set((await mediaRows(projectId)).map((row) => row.id))
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie: lea },
    body: visualForm(await jpegImage(800, 600), slot),
  })
  expect(res.status, `visual ${slot ?? 'gallery'}`).toBe(201)
  const added = (await mediaRows(projectId)).find((row) => !known.has(row.id))
  if (!added) throw new Error('no new photo')
  return added.id
}

/** Envoie une image du coin des testeurs (photo d'un appel ou capture d'un message). */
const uploadTesterImage = async (cookie: string, kind: 'call' | 'capture') => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'image.jpg', { type: 'image/jpeg' }),
  )
  form.append('kind', kind)
  const res = await ctx.request(`/v1/projects/${meteo.id}/testers/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  expect(res.status, `tester ${kind}`).toBe(201)
  return TesterMedia.parse(await res.json()).id
}

/** Max rejoint les testeurs de « Météo ». */
const maxTests = async () => {
  later()
  expect((await act.send('POST', `/v1/projects/${meteo.id}/testers`, max)).status).toBe(204)
}

/** Léa lance un appel aux testeurs, avec une photo si `photoId` est donné. */
const postCall = async (text: string, photoId: string | null = null) => {
  const res = await expectOk('POST', `/v1/projects/${meteo.id}/calls`, lea, {
    text,
    photoId,
    photoDescription: null,
  })
  return TesterCall.parse(await res.json())
}

/** Max envoie un retour dans son fil de « Météo », avec une capture si `captureId` est donné. */
const postFeedback = async (text: string, captureId?: string) => {
  const res = await expectOk('POST', `/v1/projects/${meteo.id}/threads/${maxId}/messages`, max, {
    kind: 'feedback',
    outcome: 'no',
    device: 'phone',
    text,
    captureId: captureId ?? null,
  })
  return TesterMessage.parse(await res.json())
}

const mediaRows = (projectId: string) =>
  ctx.db
    .select({ id: schema.projectMedia.id, removalId: schema.projectMedia.removalId })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.projectId, projectId))
const decisionIds = async () =>
  (await ctx.db.select({ id: schema.moderationDecision.id }).from(schema.moderationDecision))
    .map((row) => row.id)
    .sort()
const partRemovals = () => ctx.db.select().from(schema.contentPartRemoval)
const reportsInBase = () => ctx.db.select().from(schema.contentReport)

// ─── La purge de nuit ────────────────────────────────────────────────────────────────────────────

describe('the nightly purge and the removed parts', () => {
  it('keeps a part removed after the nightly purge, a year and more after its decision', async () => {
    const removal = await remove(projectTarget(), { field: 'description' })
    // Témoins : la description est sortie de sa colonne (cachée à Max), et gardée pour Léa dans
    // la ligne du retrait.
    expect((await projectOf(max)).text).not.toContain(DESCRIPTION)
    const kept = [
      expect.objectContaining({ removalId: removal.id, hiddenValue: { text: DESCRIPTION } }),
    ]
    expect(await partRemovals()).toEqual(kept)

    // Un an et un jour, puis deux ans après la décision.
    await purgeAfter(366)
    await purgeAfter(2 * 365)

    // La purge a bien tourné : le signalement clos depuis un an est parti.
    expect(await reportsInBase()).toEqual([])
    // La décision (et son explication, que Léa lit) et la ligne du retrait restent ; la partie
    // reste cachée.
    expect(await decisionIds()).toEqual([removal.id])
    expect(await partRemovals()).toEqual(kept)
    expect((await projectOf(max)).text).not.toContain(DESCRIPTION)
  })

  it('keeps a removed photo hidden after the nightly purge a year and a day later', async () => {
    // Une photo de la galerie, et la photo d'un appel aux testeurs (tester_media).
    await uploadVisual(meteo.id)
    const second = await uploadVisual(meteo.id)
    await maxTests()
    const callPhoto = await uploadTesterImage(lea, 'call')
    const call = await postCall('Testez la carte des vents.', callPhoto)
    const photoRemoval = await remove(projectTarget(), { field: 'photo', mediaId: second })
    const callRemoval = await remove(
      { kind: 'call', id: call.id },
      { field: 'photo', mediaId: callPhoto },
    )
    // Ce qui cache une photo retirée : son `removal_id` (le prédicat partagé `visibleMedia` des
    // lectures le lit) et la ligne de son retrait. Les lectures elles-mêmes sont vérifiées par
    // parts-visibility.test.ts ; ici, la purge ne doit rien en défaire.
    const hidden = async () => {
      const [projectPhoto] = await ctx.db
        .select({ removalId: schema.projectMedia.removalId })
        .from(schema.projectMedia)
        .where(eq(schema.projectMedia.id, second))
      const [testerPhoto] = await ctx.db
        .select({ removalId: schema.testerMedia.removalId })
        .from(schema.testerMedia)
        .where(eq(schema.testerMedia.id, callPhoto))
      const parts = (await partRemovals()).map((row) => row.removalId).sort()
      return { project: projectPhoto?.removalId, tester: testerPhoto?.removalId, parts }
    }
    const expected = {
      project: photoRemoval.id,
      tester: callRemoval.id,
      parts: [photoRemoval.id, callRemoval.id].sort(),
    }
    // Témoin : les deux photos sont marquées de leur retrait.
    expect(await hidden()).toEqual(expected)

    await purgeAfter(366)

    expect(await reportsInBase()).toEqual([])
    expect(await decisionIds()).toEqual([photoRemoval.id, callRemoval.id].sort())
    expect(await hidden()).toEqual(expected)
  })

  it('keeps a decision while one of its parts is still removed', async () => {
    // Deux parties retirées de « Météo », puis le lien de la démo rétabli.
    const description = await remove(projectTarget(), { field: 'description' })
    await remove(projectTarget(), { field: 'demoUrl' })
    await restore(projectTarget(), { field: 'demoUrl' })
    // Témoin : seule la description reste retirée.
    expect(await partRemovals()).toEqual([
      expect.objectContaining({ removalId: description.id, field: 'description' }),
    ])

    // Un an et un jour après : la décision dont la partie est rétablie part, avec le
    // rétablissement ; celle de la description, encore retirée, reste.
    await purgeAfter(366)
    expect(await decisionIds()).toEqual([description.id])

    // La description rétablie à son tour, la décision part un an et un jour plus tard.
    await restore(projectTarget(), { field: 'description' })
    expect(await partRemovals()).toEqual([])
    await purgeAfter(366)
    expect(await decisionIds()).toEqual([])
  })

  it('deletes the part removals of a deleted project, update, message or photo', async () => {
    // Un projet dont la description est retirée, puis supprimé.
    later()
    const brouillon = await act.publish(lea, 'Brouillon', { description: 'Un essai, sans suite.' })
    await remove(projectTarget(brouillon.id), { field: 'description' })
    // Une photo de la galerie de « Météo », retirée.
    const photo = await uploadVisual(meteo.id)
    await remove(projectTarget(), { field: 'photo', mediaId: photo })
    // Une mise à jour dont la photo est retirée.
    const updatePhoto = await uploadVisual(meteo.id, 'update')
    const posted = await expectOk('POST', `/v1/projects/${meteo.id}/updates`, lea, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Les prévisions arrivent maintenant à 7 h.' }],
      photos: [{ id: updatePhoto, description: null }],
      beforeAfter: false,
    })
    const updateId = ProjectUpdate.parse(await posted.json()).id
    await remove({ kind: 'update', id: updateId }, { field: 'photo', mediaId: updatePhoto })
    // Un message de Max dont la capture est retirée (Léa la signale).
    await maxTests()
    const capture = await uploadTesterImage(max, 'capture')
    const message = await postFeedback('Le vent du soir n’apparaît pas.', capture)
    await remove({ kind: 'message', id: message.id }, { field: 'photo', mediaId: capture }, lea)
    // Témoin : quatre retraits en cours, un par contenu.
    expect(await partRemovals()).toHaveLength(4)

    await expectOk('DELETE', `/v1/projects/${brouillon.id}`, lea)
    await expectOk('DELETE', `/v1/projects/${meteo.id}/visuals/${photo}`, lea)
    await expectOk('DELETE', `/v1/projects/${meteo.id}/updates/${updateId}`, lea)
    await expectOk('DELETE', `/v1/projects/${meteo.id}/messages/${message.id}`, max)

    expect(await partRemovals()).toEqual([])
    // Plus rien ne les retient : leurs décisions partent un an et un jour après.
    await purgeAfter(366)
    expect(await decisionIds()).toEqual([])
  })

  it('keeps the decision of a removed tester call or message while it is removed', async () => {
    await maxTests()
    const call = await postCall('Testez la carte des vents.')
    const message = await postFeedback('Le vent du soir n’apparaît pas.')
    // Max signale l'appel, Léa le message ; Louis retire les deux en entier.
    const callRemoval = await remove({ kind: 'call', id: call.id })
    const messageRemoval = await remove({ kind: 'message', id: message.id }, undefined, lea)
    const callRow = async () =>
      (
        await ctx.db
          .select({ removalId: schema.testerCall.removalId })
          .from(schema.testerCall)
          .where(eq(schema.testerCall.id, call.id))
      )[0]
    const messageRow = async () =>
      (
        await ctx.db
          .select({ removalId: schema.testerMessage.removalId })
          .from(schema.testerMessage)
          .where(eq(schema.testerMessage.id, message.id))
      )[0]
    // Témoins : les deux sont marqués de leur retrait, et l'appel est caché à Max.
    expect((await callRow())?.removalId).toBe(callRemoval.id)
    expect((await messageRow())?.removalId).toBe(messageRemoval.id)
    const calls = `/v1/projects/${meteo.id}/calls`
    expect(await (await act.send('GET', calls, max)).text()).not.toContain(call.id)

    await purgeAfter(366)

    // La purge a tourné (les signalements clos sont partis), mais les décisions restent, et
    // l'appel comme le message restent retirés.
    expect(await reportsInBase()).toEqual([])
    expect(await decisionIds()).toEqual([callRemoval.id, messageRemoval.id].sort())
    expect((await callRow())?.removalId).toBe(callRemoval.id)
    expect((await messageRow())?.removalId).toBe(messageRemoval.id)
    expect(await (await act.send('GET', calls, max)).text()).not.toContain(call.id)
  })
})

// ─── La suppression du compte ────────────────────────────────────────────────────────────────────

describe('a deleted account and the decisions about it', () => {
  it('clears the former name and handle kept in the decisions when the member deletes her account', async () => {
    later()
    await act.updateProfile(lea, { handle: 'lea_meteo' })
    const profile: ReportTarget = { kind: 'member', id: leaId }
    await remove(profile, { field: 'name' })
    await remove(profile, { field: 'handle' })
    // Témoin : les deux décisions gardent l'ancien nom et l'ancien pseudo, pour un rétablissement.
    const kept = () =>
      ctx.db
        .select({
          field: schema.moderationDecision.partField,
          previousValue: schema.moderationDecision.previousValue,
          targetMemberId: schema.moderationDecision.targetMemberId,
        })
        .from(schema.moderationDecision)
        .orderBy(schema.moderationDecision.createdAt)
    expect(await kept()).toEqual([
      { field: 'name', previousValue: 'Léa', targetMemberId: leaId },
      { field: 'handle', previousValue: 'lea_meteo', targetMemberId: leaId },
    ])

    later()
    await act.deleteAccount(lea, LEA_PASSWORD)

    // Les décisions restent (la garde d'un an), sans le membre ni ce qu'il s'appelait.
    expect(await kept()).toEqual([
      { field: 'name', previousValue: null, targetMemberId: null },
      { field: 'handle', previousValue: null, targetMemberId: null },
    ])
    // Nulle part ailleurs dans la table non plus (toutes ses colonnes, lues en SQL brut).
    const raw = JSON.stringify(
      ((await ctx.db.execute(sql`select * from moderation_decision`)) as unknown as { rows: [] })
        .rows,
    )
    expect(raw).not.toContain('lea_meteo')
    expect(raw).not.toContain('"Léa"')
  })
})
