// Tests d'intégration de la tranche 7c : l'historique des décisions de modération
// (GET /v1/moderation/decisions), l'onglet « Historique » de l'écran Modération. Scénario :
// docs/scenarios/phase-1.md, « Tranche 7c — Administrer », « L'historique des décisions ».
//
// Quatre membres : Léa (l'autrice du projet « Météo »), Zoé (une autre autrice), Max (qui signale,
// et seulement cela : son nom ne doit jamais paraître) et Louis, l'administrateur.
//
// Ce qui est vérifié :
// - toutes les décisions, de la plus récente à la plus ancienne, 20 par page, avec l'action, la
//   date, l'administrateur, la cible et son lien, le membre visé, le fondement, l'explication, la
//   durée d'une suspension et la raison d'une levée ;
// - le filtre `member` (les décisions qui visent ses contenus et son compte) ;
// - un administrateur parti, une cible supprimée, un membre parti : la ligne reste ;
// - jamais qui a signalé ;
// - pour tout autre qu'un administrateur en fonction et non suspendu, la même réponse qu'une
//   adresse qui n'existe pas (S16) ;
// - la durée et l'origine se lisent sur la décision elle-même (S20) ;
// - la migration remplit `target_member_id` des décisions d'avant 7c (S13).
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DecisionHistoryPage, ErrorResponse, type ReportTarget } from '@ruche/contracts'
import { defaultMigrationsFolder, schema } from '@ruche/db'
import { createTestPgliteDb } from '@ruche/db/pglite'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let zoe: string
let max: string
let louis: string
let leaId: string
let zoeId: string
let maxId: string
let louisId: string
let leaHandle: string
let louisHandle: string
let meteo: { id: string } // le projet public de Léa

const SECOND = 1000
const START = new Date('2026-06-15T08:00:00.000Z')
const LOUIS_PASSWORD = 'louis-long-password'
const EXPLANATION = 'Des messages insultants, plusieurs fois.'

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
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: LOUIS_PASSWORD,
  })
  const leaMe = await act.me(lea)
  const louisMe = await act.me(louis)
  leaId = leaMe.id
  leaHandle = leaMe.handle
  louisId = louisMe.id
  louisHandle = louisMe.handle
  zoeId = (await act.me(zoe)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin(louisId)
  meteo = await act.publish(lea, 'Météo', { pitch: 'La pluie de demain, quartier par quartier.' })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)
const nowIso = () => new Date(Date.now()).toISOString()

const projectTarget = (): ReportTarget => ({ kind: 'project', id: meteo.id })

/** Max signale, une seconde après ce qui précède. */
const report = async (target: ReportTarget, details?: string) => {
  later()
  return act.report(max, target, 'other', details)
}

/** Une décision ; rend la réponse brute (201 attendu, vérifié par l'appelant au besoin). */
const decide = async (cookie: string, body: unknown) => {
  later()
  const res = await act.send('POST', '/v1/moderation/decisions', cookie, body)
  expect(res.status, JSON.stringify(body)).toBe(201)
  return res
}

const suspendBody = (memberId: string, extra: object = {}) => ({
  action: 'suspend',
  memberId,
  duration: '7d',
  ground: 'rules',
  explanation: EXPLANATION,
  ...extra,
})

const readHistory = async (query: Record<string, string> = {}, cookie = louis) => {
  const search = new URLSearchParams(query).toString()
  const res = await act.send('GET', `/v1/moderation/decisions${search ? `?${search}` : ''}`, cookie)
  expect(res.status).toBe(200)
  return DecisionHistoryPage.parse(await res.json())
}

describe('the history of decisions', () => {
  it('lists every decision, newest first, with who, what, the target and the reasons', async () => {
    await report(projectTarget())
    await decide(louis, {
      action: 'remove',
      target: projectTarget(),
      ground: 'rules',
      explanation: 'Arnaque.',
    })
    const removedAt = nowIso()
    await decide(louis, { action: 'restore', target: projectTarget() })
    const restoredAt = nowIso()
    later()
    const note = await act.send('POST', `/v1/projects/${meteo.id}/notes`, lea, { body: 'Une note' })
    const noteId = z.object({ id: z.uuid() }).parse(await note.json()).id
    await report({ kind: 'note', id: noteId })
    await decide(louis, { action: 'dismiss', target: { kind: 'note', id: noteId } })
    const dismissedAt = nowIso()
    // La suspension part du signalement du profil de Léa (J2 : « après un signalement »).
    await report({ kind: 'member', id: leaId })
    await decide(louis, suspendBody(leaId, { fromReport: { kind: 'member', id: leaId } }))
    const suspendedAt = nowIso()
    await decide(louis, {
      action: 'lift',
      memberId: leaId,
      cause: 'early',
      explanation: 'Des excuses reçues.',
    })
    const liftedAt = nowIso()

    const page = await readHistory()

    const admin = { id: louisId, name: 'Louis', handle: louisHandle }
    const member = { id: leaId, name: 'Léa', handle: leaHandle }
    const none = { ground: null, explanation: null, duration: null, liftCause: null }
    expect(page.items).toEqual([
      {
        id: expect.any(String),
        action: 'lift',
        at: liftedAt,
        admin,
        target: { kind: 'member', id: leaId },
        projectId: null,
        member,
        ...none,
        explanation: 'Des excuses reçues.',
        liftCause: 'early',
        afterReport: false,
      },
      {
        id: expect.any(String),
        action: 'suspend',
        at: suspendedAt,
        admin,
        target: { kind: 'member', id: leaId },
        projectId: null,
        member,
        ...none,
        ground: 'rules',
        explanation: EXPLANATION,
        duration: '7d',
        afterReport: true,
      },
      {
        id: expect.any(String),
        action: 'dismiss',
        at: dismissedAt,
        admin,
        target: { kind: 'note', id: noteId },
        projectId: meteo.id,
        member,
        ...none,
        afterReport: false,
      },
      {
        id: expect.any(String),
        action: 'restore',
        at: restoredAt,
        admin,
        target: projectTarget(),
        projectId: meteo.id,
        member,
        ...none,
        afterReport: false,
      },
      {
        id: expect.any(String),
        action: 'remove',
        at: removedAt,
        admin,
        target: projectTarget(),
        projectId: meteo.id,
        member,
        ...none,
        ground: 'rules',
        explanation: 'Arnaque.',
        afterReport: false,
      },
    ])
    expect(page.nextCursor).toBeNull()
  })

  it('says a suspension started by the moderation did not follow a report', async () => {
    await decide(louis, suspendBody(leaId))

    expect((await readHistory()).items[0]).toMatchObject({ action: 'suspend', afterReport: false })
  })

  it('pages 20 decisions at a time, without losing or repeating one at equal dates', async () => {
    // 21 décisions posées en base : les deux plus anciennes ont la même date, de part et d'autre
    // de la fin de la première page (le curseur départage par l'identifiant).
    const ids: string[] = []
    for (let i = 0; i < 21; i++) {
      const id = randomUUID()
      ids.push(id)
      await ctx.db.insert(schema.moderationDecision).values({
        id,
        targetKind: 'project',
        targetId: meteo.id,
        action: 'dismiss',
        adminId: louisId,
        createdAt: new Date(START.getTime() + Math.max(i, 1) * SECOND),
      })
    }

    const first = await readHistory()
    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).not.toBeNull()
    const second = await readHistory({ cursor: first.nextCursor ?? '' })
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeNull()

    const seen = [...first.items, ...second.items]
    expect(new Set(seen.map((item) => item.id))).toEqual(new Set(ids))
    // De la plus récente à la plus ancienne.
    const dates = seen.map((item) => item.at)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('keeps only the decisions about a member, her contents and her account', async () => {
    const zoeComment = await act.comment(meteo.id, zoe, 'Le commentaire de Zoé')
    await report(projectTarget())
    await report({ kind: 'comment', id: zoeComment.id })
    await decide(louis, {
      action: 'remove',
      target: projectTarget(),
      ground: 'rules',
      explanation: 'Arnaque.',
    })
    await decide(louis, { action: 'dismiss', target: { kind: 'comment', id: zoeComment.id } })
    await decide(louis, suspendBody(leaId))

    expect((await readHistory({ member: leaId })).items.map((item) => item.action)).toEqual([
      'suspend',
      'remove',
    ])
    expect((await readHistory({ member: zoeId })).items.map((item) => item.target)).toEqual([
      { kind: 'comment', id: zoeComment.id },
    ])
    // Un membre sans décision : une liste vide. Témoin : sans filtre, les trois.
    expect((await readHistory({ member: maxId })).items).toEqual([])
    expect((await readHistory()).items).toHaveLength(3)
  })

  it('keeps the decision of an administrator whose account is gone, without his name', async () => {
    const sam = await ctx.verifiedMember({
      name: 'Sam',
      email: 'sam@example.com',
      password: 'sam-long-password',
    })
    const samId = (await act.me(sam)).id
    await act.makeAdmin(samId)
    await report(projectTarget())
    await decide(sam, { action: 'dismiss', target: projectTarget() })
    await report({ kind: 'member', id: leaId })
    await decide(louis, { action: 'dismiss', target: { kind: 'member', id: leaId } })
    later()
    await act.deleteAccount(sam, 'sam-long-password')

    const page = await readHistory()

    expect(page.items.map((item) => [item.action, item.admin?.id ?? null])).toEqual([
      ['dismiss', louisId],
      ['dismiss', null],
    ])
    expect(page.items[1]).toMatchObject({ target: projectTarget(), member: { id: leaId } })
  })

  it('keeps the line of a content deleted since, without its link, and of a member gone', async () => {
    later()
    const created = await act.send('POST', `/v1/projects/${meteo.id}/notes`, lea, { body: 'Note' })
    const noteId = z.object({ id: z.uuid() }).parse(await created.json()).id
    await report({ kind: 'note', id: noteId })
    await decide(louis, { action: 'dismiss', target: { kind: 'note', id: noteId } })
    await report({ kind: 'member', id: zoeId })
    await decide(louis, { action: 'dismiss', target: { kind: 'member', id: zoeId } })
    later()
    expect((await act.send('DELETE', `/v1/projects/${meteo.id}/notes/${noteId}`, lea)).status).toBe(
      204,
    )
    await act.deleteAccount(zoe, 'zoe-long-pw-1')

    const [zoeLine, noteLine] = (await readHistory()).items

    expect(zoeLine).toMatchObject({
      target: { kind: 'member', id: zoeId },
      projectId: null,
      member: null,
    })
    expect(noteLine).toMatchObject({
      target: { kind: 'note', id: noteId },
      projectId: null,
      member: { id: leaId, name: 'Léa' },
    })
  })

  it('never says who reported', async () => {
    await report(projectTarget(), 'Précision de Max')
    await decide(louis, {
      action: 'remove',
      target: projectTarget(),
      ground: 'rules',
      explanation: 'Arnaque.',
    })

    const res = await act.send('GET', '/v1/moderation/decisions', louis)
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('Arnaque.') // témoin : la décision est bien là
    for (const leak of [maxId, 'max@example.com', '"Max"', 'Précision de Max']) {
      expect(text, leak).not.toContain(leak)
    }
  })

  // S20 : la durée, l'origine et la raison d'une levée sont écrites sur la décision elle-même ;
  // l'historique ne dépend pas de la ligne de la suspension (purgée, ou effacée avec le compte).
  it('reads the duration, the origin and the cause from the decision itself', async () => {
    await report({ kind: 'member', id: leaId })
    await decide(
      louis,
      suspendBody(leaId, { duration: '30d', fromReport: { kind: 'member', id: leaId } }),
    )
    await decide(louis, {
      action: 'lift',
      memberId: leaId,
      cause: 'error',
      explanation: 'Une erreur.',
    })
    await ctx.db.execute(sql`delete from account_suspension`)

    expect(
      (await readHistory()).items.map((item) => [
        item.action,
        item.duration,
        item.afterReport,
        item.liftCause,
      ]),
    ).toEqual([
      ['lift', null, false, 'error'],
      ['suspend', '30d', true, null],
    ])
  })
})

// S16 : pour un anonyme, un membre, un administrateur révoqué ou suspendu, et quels que soient les
// paramètres (même invalides), la même réponse qu'une adresse qui n'existe pas : rien ne dit que
// l'historique existe.
describe('the history, for anyone but an administrator in office', () => {
  it('answers like a route that does not exist, whatever the parameters', async () => {
    // Sam, suspendu, puis fait administrateur en base : un administrateur suspendu n'en est plus un
    // (S19).
    const sam = await ctx.verifiedMember({
      name: 'Sam',
      email: 'sam@example.com',
      password: 'sam-long-password',
    })
    const samId = (await act.me(sam)).id
    await decide(louis, suspendBody(samId))
    await act.makeAdmin(samId)
    await act.makeAdmin(zoeId)
    await act.revokeAdmin(zoeId)

    for (const [who, cookie] of [
      ['anonymous', null],
      ['member', max],
      ['revoked', zoe],
      ['suspended administrator', sam],
    ] as const) {
      for (const query of [
        '',
        `?member=${encodeURIComponent(leaId)}`,
        '?member=%2E%2E%2Fpas+un+id',
        '?cursor=pas-un-curseur',
      ]) {
        const label = `${who} ${query}`
        const res = await act.send('GET', `/v1/moderation/decisions${query}`, cookie)
        const reference = await act.send('GET', `/v1/inexistant${query}`, cookie)
        expect(res.status, label).toBe(reference.status)
        expect(await res.json(), label).toEqual(await reference.json())
      }
    }
    // Pour un membre connecté, cette réponse est bien un 404.
    const res = await act.send('GET', '/v1/moderation/decisions', max)
    expect(res.status).toBe(404)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('not_found')
    // Témoin : l'administrateur, lui, lit l'historique (la route existe).
    expect((await readHistory()).items.map((item) => item.action)).toEqual(['suspend'])
  })
})

// ─── S13 : la migration remplit `target_member_id` ───────────────────────────────────────────────

/**
 * Le journal des migrations de drizzle-kit (meta/_journal.json) : la liste des fichiers SQL, dans
 * l'ordre. Lu avec Zod, comme toute donnée qui entre.
 */
const Journal = z.object({ entries: z.array(z.object({ idx: z.int(), tag: z.string() })) })

/** Le client PGlite brut : du SQL tel quel, sans Drizzle. */
type RawClient = {
  exec: (query: string) => Promise<unknown>
  query: <T>(query: string, params?: unknown[]) => Promise<{ rows: T[] }>
  close: () => Promise<void>
}

/**
 * Une base PGlite vide, sans aucune migration. L'API n'importe pas PGlite directement : on reprend
 * la classe du client d'une base de test (`$client`, le client que Drizzle enveloppe).
 */
const emptyDatabase = async (): Promise<RawClient> => {
  const seed = await createTestPgliteDb()
  const client: unknown = Reflect.get(seed.db, '$client')
  await seed.close()
  if (typeof client !== 'object' || client === null) throw new Error('no PGlite client')
  const PGliteClass = client.constructor as new () => RawClient
  return new PGliteClass()
}

/** Applique ces migrations, instruction par instruction, comme le fait le migrateur de Drizzle. */
const applyMigrations = async (client: RawClient, tags: string[]) => {
  for (const tag of tags) {
    const text = readFileSync(join(defaultMigrationsFolder, `${tag}.sql`), 'utf8')
    for (const statement of text.split('--> statement-breakpoint')) {
      if (statement.trim() !== '') await client.exec(statement)
    }
  }
}

describe('the migration of slice 7c', () => {
  it('fills the member aimed at by each older decision, and none for a gone profile', async () => {
    const journal = Journal.parse(
      JSON.parse(readFileSync(join(defaultMigrationsFolder, 'meta/_journal.json'), 'utf8')),
    )
    // Les migrations jusqu'à la tranche 7b (0012) ; celles de 7c viennent après.
    const before = journal.entries.filter((e) => e.idx <= 12).map((e) => e.tag)
    const after = journal.entries.filter((e) => e.idx > 12).map((e) => e.tag)
    expect(before).toHaveLength(13)

    const client = await emptyDatabase()
    try {
      await applyMigrations(client, before)
      // Des décisions de 7a et 7b, écrites avant la colonne : sur un projet, une note, un
      // commentaire, un profil, le profil d'un compte supprimé depuis, et un projet supprimé.
      const project = '11111111-1111-4111-8111-111111111111'
      const note = '22222222-2222-4222-8222-222222222222'
      const comment = '33333333-3333-4333-8333-333333333333'
      const goneProject = '44444444-4444-4444-8444-444444444444'
      await client.exec(`
        insert into "user" (id, name, email) values
          ('u-lea', 'Léa', 'lea@example.com'), ('u-zoe', 'Zoé', 'zoe@example.com');
        insert into project (id, author_id, title, pitch) values ('${project}', 'u-lea', 'Météo', 'Pitch');
        insert into project_note (id, project_id, body, created_at)
          values ('${note}', '${project}', 'Une note', '2026-06-01');
        insert into project_comment (id, project_id, author_id, body, created_at)
          values ('${comment}', '${project}', 'u-zoe', 'Un commentaire', '2026-06-01');
      `)
      const decisions = [
        ['d0000000-0000-4000-8000-000000000001', 'project', project, 'u-lea'],
        ['d0000000-0000-4000-8000-000000000002', 'note', note, 'u-lea'],
        ['d0000000-0000-4000-8000-000000000003', 'comment', comment, 'u-zoe'],
        ['d0000000-0000-4000-8000-000000000004', 'member', 'u-lea', 'u-lea'],
        // S13 : un profil dont le compte est parti donne null (jointure sur "user"), jamais une
        // copie de target_id, qui pointerait vers un compte qui n'existe plus.
        ['d0000000-0000-4000-8000-000000000005', 'member', 'u-gone', null],
        ['d0000000-0000-4000-8000-000000000006', 'project', goneProject, null],
      ] as const
      for (const [id, kind, targetId] of decisions) {
        await client.query(
          `insert into moderation_decision (id, target_kind, target_id, action, created_at)
           values ($1, $2, $3, 'dismiss', '2026-06-02')`,
          [id, kind, targetId],
        )
      }

      // Les données posées, la (ou les) migration(s) de 7c s'appliquent par-dessus.
      expect(after.length, 'the migration of slice 7c').toBeGreaterThan(0)
      await applyMigrations(client, after)

      const { rows } = await client.query<{ id: string; target_member_id: string | null }>(
        'select id, target_member_id from moderation_decision order by id',
      )
      expect(rows).toEqual(decisions.map(([id, , , member]) => ({ id, target_member_id: member })))
    } finally {
      await client.close()
    }
  })
})
