// Tests d'intégration de la liste des outils (tranche R3) : GET /v1/tools rend les outils des
// projets publics que le membre peut voir, chacun avec son nombre de projets, du plus utilisé au
// moins utilisé, 500 au plus. Explorer en tire « Outils populaires » et « Tous les outils ».
// Scénario : docs/scenarios/refonte.md, « R3 », « Explorer », « Les outils » ; règle sec-A9
// (500 au plus) de la relecture de sécurité du plan.
//
// Trois membres : Inès et Zoé (autrices), Malik (qui lit). Louis, administrateur, sert au retrait.
import { randomUUID } from 'node:crypto'
import { ErrorResponse, TOOL_LIST_MAX, ToolList, toolSlug } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let louis: string
let inesId: string
let malikId: string

const SECOND = 1000
const HOUR = 60 * 60 * SECOND

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))

  ctx = await createTestContext()
  act = activity(ctx)
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
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Publie un projet avec ses outils, une seconde après ce qui précède. */
const publish = (cookie: string, title: string, tools: string[], body: object = {}) => {
  later()
  return act.publish(cookie, title, { tools, ...body })
}

const toolsRaw = (cookie: string | null) => act.send('GET', '/v1/tools', cookie)

/** La liste, telle que ce membre la lit (la demande doit réussir), vérifiée par le contrat. */
const tools = async (cookie: string) => {
  const res = await toolsRaw(cookie)
  expect(res.status).toBe(200)
  return ToolList.parse(await res.json()).tools
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

describe('the list of tools', () => {
  it('is only for signed-in members', async () => {
    await publish(ines, 'Un', ['Claude Code'])

    await expectError(await toolsRaw(null), 401, 'unauthorized')
    // Témoin : la même demande, avec une session, réussit (la route existe bien).
    expect(await tools(malik)).toEqual([
      { slug: 'claude-code', label: 'Claude Code', projectCount: 1 },
    ])
  })

  it('counts the public projects of each tool, most used first, then by label', async () => {
    await publish(ines, 'Un', ['Claude Code', 'Python'])
    await publish(zoe, 'Deux', ['claude code', 'Mistral'])
    await publish(ines, 'Trois', ['Claude Code', 'Python', 'Glide'])

    expect(await tools(malik)).toEqual([
      { slug: 'claude-code', label: 'Claude Code', projectCount: 3 },
      { slug: 'python', label: 'Python', projectCount: 2 },
      { slug: 'glide', label: 'Glide', projectCount: 1 },
      { slug: 'mistral', label: 'Mistral', projectCount: 1 },
    ])
  })

  it('shows the label typed on the most recent public project', async () => {
    await publish(ines, 'Un', ['claude code'])
    await publish(zoe, 'Deux', ['Claude Code'])

    expect(await tools(malik)).toEqual([
      { slug: 'claude-code', label: 'Claude Code', projectCount: 2 },
    ])
  })

  it('leaves out private projects, even mine, and removed ones', async () => {
    await publish(ines, 'Un', ['Claude Code'])
    await publish(malik, 'Mon brouillon', ['Zapier', 'Claude Code'], { visibility: 'private' })
    const removed = await publish(zoe, 'Retiré', ['Lovable', 'Claude Code'])
    // Témoin : avant le retrait, Lovable est là et Claude Code compte deux projets.
    expect(await tools(malik)).toEqual([
      { slug: 'claude-code', label: 'Claude Code', projectCount: 2 },
      { slug: 'lovable', label: 'Lovable', projectCount: 1 },
    ])

    // Un retrait répond à un signalement ouvert (reports/decide.ts) : Malik signale, Louis retire.
    // (Correction de la session, R3 : sans signalement, le retrait était refusé en 409.)
    later()
    await act.report(malik, { kind: 'project', id: removed.id })
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: removed.id },
      ground: 'rules',
      explanation: 'Ce projet ne respecte pas les règles.',
    })

    expect(await tools(malik)).toEqual([
      { slug: 'claude-code', label: 'Claude Code', projectCount: 1 },
    ])
  })

  it('leaves out the projects of an author who never verified his account', async () => {
    await publish(ines, 'Un', ['Claude Code'])
    await ctx.db.insert(schema.user).values({
      id: 'unverified',
      name: 'Fantôme',
      email: 'fantome@example.com',
      emailVerified: false,
    })
    const at = new Date()
    await ctx.db.insert(schema.project).values({
      id: randomUUID(),
      authorId: 'unverified',
      title: 'Fantôme',
      pitch: 'Un projet sans auteur vérifié.',
      tools: ['Carnetix', 'Claude Code'],
      toolSlugs: ['carnetix', 'claude-code'],
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
    })

    expect(await tools(malik)).toEqual([
      { slug: 'claude-code', label: 'Claude Code', projectCount: 1 },
    ])
  })

  it('gives an empty list when no public project has a tool', async () => {
    await publish(ines, 'Sans outil', [])

    expect(await tools(malik)).toEqual([])
  })

  it('lists at most 500 tools', async () => {
    // 34 projets de 15 outils : 510 outils différents, tous publics.
    const start = Date.now()
    await ctx.db.insert(schema.project).values(
      Array.from({ length: 34 }, (_, p) => {
        const labels = Array.from({ length: 15 }, (_, i) => `Outil ${p * 15 + i + 1}`)
        const at = new Date(start + p * SECOND)
        return {
          id: randomUUID(),
          authorId: inesId,
          title: `Projet ${p + 1}`,
          pitch: 'Un petit projet pour essayer.',
          tools: labels,
          toolSlugs: labels.map(toolSlug),
          createdAt: at,
          updatedAt: at,
          publishedAt: at,
        }
      }),
    )

    expect(await tools(malik)).toHaveLength(TOOL_LIST_MAX)
  })

  it('answers 600 readings an hour per member, then asks to wait', async () => {
    await publish(ines, 'Un', ['Claude Code'])
    await ctx.db
      .insert(schema.apiRateLimit)
      .values({ key: memberCounterKeys(malikId).toolsHour, count: 599, windowStart: Date.now() })

    expect(await tools(malik)).toHaveLength(1)
    const blocked = await toolsRaw(malik)
    await expectError(blocked, 429, 'rate_limited')
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    // Chaque membre a son compteur : Zoé lit encore ; une heure plus tard, Malik aussi.
    expect(await tools(zoe)).toHaveLength(1)
    later(HOUR)
    expect(await tools(malik)).toHaveLength(1)
  })
})

describe('a block', () => {
  /** Les deux sens du blocage, avec qui bloque qui. */
  const DIRECTIONS = [
    ['Inès blocked Malik', () => act.block(malikId, ines)],
    ['Malik blocked Inès', () => act.block(inesId, malik)],
  ] as const

  describe.each(DIRECTIONS)('when %s', (_, blockNow) => {
    it('leaves the tools of a blocked member out of the list, in both directions', async () => {
      await publish(ines, 'Un', ['Mistral', 'Claude Code'])
      await publish(zoe, 'Deux', ['Claude Code'])
      await publish(malik, 'Trois', ['Ollama'])
      // Témoin : avant le blocage, Malik voit Mistral, Inès voit Ollama.
      expect((await tools(malik)).map((t) => t.slug)).toEqual(['claude-code', 'mistral', 'ollama'])
      expect((await tools(ines)).map((t) => t.slug)).toEqual(['claude-code', 'mistral', 'ollama'])

      later()
      await blockNow()

      // Pour Malik : plus de Mistral, et Claude Code ne compte plus que le projet de Zoé.
      expect(await tools(malik)).toEqual([
        { slug: 'claude-code', label: 'Claude Code', projectCount: 1 },
        { slug: 'ollama', label: 'Ollama', projectCount: 1 },
      ])
      // Pour Inès : plus d'Ollama.
      expect((await tools(ines)).map((t) => t.slug)).toEqual(['claude-code', 'mistral'])
      // Zoé ne voit aucune différence.
      expect((await tools(zoe)).map((t) => t.slug)).toEqual(['claude-code', 'mistral', 'ollama'])
    })
  })
})
