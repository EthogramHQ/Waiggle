// La table des preuves de R12 (relecture de sécurité du plan, B3) : chaque état qui rend un projet
// invisible d'un visiteur, sur chaque surface qui montre un projet sans compte. Une seule condition
// (`visibleToVisitor`, `publicPageOf`) sert partout ; ce fichier vérifie qu'aucune surface n'y
// échappe. Les surfaces : la page du projet, ses mises à jour (la liste et une par son id), la page
// publique de l'auteur, la vitrine, le plan du site, la tête des pages (titre, image), la cible d'un
// signalement, et les fichiers (photo de la galerie, photo d'une mise à jour).
//
// Pour chaque état, un témoin d'abord : le projet public paraît sur chaque surface. Puis l'état est
// posé, par l'API quand une route le permet, en base sinon (un auteur non vérifié). Une surface qui
// lit le projet par son adresse répond alors exactement comme pour un identifiant inconnu (statut,
// corps, `Cache-Control`, type) ; une liste ne le contient plus.
//
// Scénario : docs/scenarios/refonte.md, « R12 », « Revenir en arrière », « Un projet qui n'est pas
// public ». Trois membres : Léa (l'autrice), Max (qui signale), Louis (l'administrateur).
//
// Un second tableau, plus court : une partie retirée seule par la modération (une photo, la photo
// de profil) ne paraît sur aucune surface qui n'a pas sa propre preuve ailleurs (la vitrine, la
// tête des pages, la cible d'un signalement).
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { seedHive } from './testing/hive-seeds'
import {
  answerOf,
  later,
  UNKNOWN_ID,
  unknownFileBeside,
  visitorGestures,
} from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let lea: string // cookies de session
let max: string
let louis: string
let leaId: string

const LEA = { name: 'Léa Fournier', email: 'lea@example.com', password: 'lea-long-password' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  lea = await ctx.verifiedMember(LEA)
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/**
 * Les états d'un projet qui fut public et ne l'est plus pour un visiteur (relecture B3) : rendu aux
 * membres, réservé à une ruche, privé, retiré par la modération, auteur parti (compte supprimé),
 * auteur non vérifié, auteur suspendu et projet retiré.
 */
const STATES = [
  'members',
  'hive',
  'private',
  'removed',
  'author gone',
  'unverified author',
  'suspended and removed',
] as const
type State = (typeof STATES)[number]

/** Pose l'état sur le projet `id` de Léa. */
const apply = async (state: State, id: string) => {
  switch (state) {
    case 'members':
      return world.setVisibility(lea, id, { visibility: 'public' })
    case 'hive': {
      const hiveId = await seedHive(ctx.db, { name: 'Famille', animatorId: leaId })
      return world.setVisibility(lea, id, { visibility: 'hive', hiveId })
    }
    case 'private':
      return world.setVisibility(lea, id, { visibility: 'private' })
    case 'removed':
      return world.remove(max, louis, { kind: 'project', id })
    case 'author gone':
      later()
      return act.deleteAccount(lea, LEA.password)
    case 'unverified author':
      // Aucune route ne fait perdre la vérification : l'état se pose en base.
      await ctx.db
        .update(schema.user)
        .set({ emailVerified: false })
        .where(eq(schema.user.id, leaId))
      return
    case 'suspended and removed':
      await world.remove(max, louis, { kind: 'project', id })
      return world.suspend(louis, leaId)
  }
}

/** Les surfaces qui lisent un projet par son adresse (et celle de sa mise à jour). */
const byAddress = (projectId: string, updateId: string) => [
  `/v1/public/projects/${projectId}`,
  `/v1/public/projects/${projectId}?lang=en`,
  `/v1/public/projects/${projectId}/updates`,
  `/v1/public/projects/${projectId}/updates/${updateId}`,
  `/v1/public/reports/target?${new URLSearchParams({ kind: 'project', id: projectId })}`,
  `/v1/public/reports/target?${new URLSearchParams({ kind: 'update', id: updateId })}`,
  `/v1/public/head?${new URLSearchParams({ path: `/fr/projects/${projectId}`, lang: 'fr' })}`,
  `/v1/public/head?${new URLSearchParams({ path: `/en/projects/${projectId}`, lang: 'en' })}`,
  `/v1/public/head?${new URLSearchParams({ path: `/fr/projects/${projectId}/updates`, lang: 'fr' })}`,
]

/** Les listes qui montrent un projet sans compte : la vitrine, le plan du site. */
const LISTS = ['/v1/public/showcase', '/v1/public/sitemap']

/** La page publique de Léa. */
const leaPage = () => `/v1/public/members/${encodeURIComponent(leaId)}`

/** Un visiteur signale le projet (POST /v1/public/reports, `VisitorReport`), sans adresse. */
const reportAsVisitor = async (projectId: string) =>
  answerOf(
    await ctx.visitorPostJson('/v1/public/reports', {
      target: { kind: 'project', id: projectId },
      reason: 'other',
    }),
  )

describe('the table of proofs: state × visitor surface', () => {
  it.each(STATES)(
    'hides a %s project from every visitor surface, with the response of an unknown id',
    async (state) => {
      // Léa publie « Décollage ! » en public, avec une photo et une mise à jour illustrée ; elle
      // ouvre sa page, et Louis met le projet en vitrine.
      later()
      const id = await ctx.webProject(lea)
      const photo = await world.uploadVisual(lea, id)
      const pending = await world.uploadVisual(lea, id, 'update')
      const update = await world.publishUpdate(lea, id, [pending.id])
      later()
      await ctx.openPublicPage(lea)
      await world.setShowcase(louis, [id])
      const files = [photo.path, pending.path]

      // Témoin : le projet paraît sur chaque surface.
      for (const path of byAddress(id, update.id)) {
        const answer = await world.asVisitor(path)
        expect(answer.status, `before, ${path}`).toBe(200)
      }
      for (const path of [...LISTS, leaPage()])
        expect((await world.asVisitor(path)).body, `before, ${path}`).toContain(id)
      for (const path of files)
        expect((await world.asVisitor(path)).status, `before, ${path}`).toBe(200)
      const report = await reportAsVisitor(id)
      expect(report.status, `before, POST /v1/public/reports: ${report.body}`).toBeLessThan(300)
      expect(report.status).toBeGreaterThanOrEqual(200)

      await apply(state, id)

      const wrong: string[] = []
      const unknown = byAddress(UNKNOWN_ID, UNKNOWN_ID)
      for (const [index, path] of byAddress(id, update.id).entries()) {
        const got = await world.asVisitor(path)
        const expected = await world.asVisitor(unknown[index] ?? '')
        if (JSON.stringify(got) !== JSON.stringify(expected))
          wrong.push(`${path}: ${got.status} ${got.body.slice(0, 80)}`)
      }
      for (const path of LISTS) {
        const got = await world.asVisitor(path)
        if (got.status !== 200 || got.body.includes(id)) wrong.push(`${path}: ${got.status}`)
      }
      for (const path of files) {
        const got = await world.asVisitor(path)
        const expected = await world.asVisitor(unknownFileBeside(path))
        if (got.status !== 404 || JSON.stringify(got) !== JSON.stringify(expected))
          wrong.push(`${path}: ${got.status}`)
      }
      // Signaler le projet : la réponse d'une cible inconnue (chaque envoi compte dans le quota de
      // 5 par jour de cette adresse IP : trois ici).
      const reported = await reportAsVisitor(id)
      const reportedUnknown = await reportAsVisitor(UNKNOWN_ID)
      if (reported.status !== 404 || JSON.stringify(reported) !== JSON.stringify(reportedUnknown))
        wrong.push(`POST /v1/public/reports: ${reported.status} ${reported.body.slice(0, 80)}`)
      // La page de l'auteur : sans le projet ; fermée comme un membre inconnu si l'auteur est parti
      // ou n'est plus vérifié.
      const page = await world.asVisitor(leaPage())
      if (state === 'author gone' || state === 'unverified author') {
        const unknownMember = await world.asVisitor(`/v1/public/members/${UNKNOWN_ID}`)
        if (JSON.stringify(page) !== JSON.stringify(unknownMember))
          wrong.push(`${leaPage()}: ${page.status}, not the unknown member`)
      } else if (page.status !== 200 || page.body.includes(id)) {
        wrong.push(`${leaPage()}: ${page.status}`)
      }
      expect(wrong.join('\n')).toBe('')
    },
    60_000,
  )
})

describe('the table of proofs: removed part × visitor surface', () => {
  it('shows a visitor no removed photo or avatar in the showcase, the head of a page or the report sheet', async () => {
    const avatar = await world.uploadAvatar(lea)
    later()
    const id = await ctx.webProject(lea)
    const removed = await world.uploadVisual(lea, id)
    const kept = await world.uploadVisual(lea, id)
    later()
    await ctx.openPublicPage(lea)
    await world.setShowcase(louis, [id])
    const fileName = (path: string) =>
      path
        .split('/')
        .pop()
        ?.replace(/\.webp$/, '') ?? path
    const surfaces = [
      '/v1/public/showcase',
      `/v1/public/head?${new URLSearchParams({ path: `/fr/projects/${id}`, lang: 'fr' })}`,
      `/v1/public/head?${new URLSearchParams({ path: `/fr/members/${leaId}`, lang: 'fr' })}`,
      `/v1/public/reports/target?${new URLSearchParams({ kind: 'project', id })}`,
      `/v1/public/reports/target?${new URLSearchParams({ kind: 'member', id: leaId })}`,
    ]
    // Témoins : la vitrine montre la photo (couverture) et l'avatar ; la feuille du signalement
    // propose la photo.
    const showcase = (await world.asVisitor('/v1/public/showcase')).body
    expect(showcase).toContain(fileName(removed.path))
    expect(showcase).toContain(fileName(avatar))
    expect(
      (
        await world.asVisitor(
          `/v1/public/reports/target?${new URLSearchParams({ kind: 'project', id })}`,
        )
      ).body,
    ).toContain(removed.id)

    await world.remove(max, louis, { kind: 'project', id }, { field: 'photo', mediaId: removed.id })
    await world.remove(max, louis, { kind: 'member', id: leaId }, { field: 'avatar' })

    const wrong: string[] = []
    for (const path of surfaces) {
      const answer = await world.asVisitor(path)
      if (answer.status !== 200) wrong.push(`${path}: ${answer.status}`)
      for (const gone of [removed.id, fileName(removed.path), fileName(avatar)])
        if (answer.body.includes(gone)) wrong.push(`${path}: shows ${gone}`)
    }
    expect(wrong.join('\n')).toBe('')
    // La photo suivante devient la couverture de la carte (comme pour les membres, R9).
    expect((await world.asVisitor('/v1/public/showcase')).body).toContain(fileName(kept.path))
  })
})
