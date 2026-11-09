// Tests de la migration 0016 (tranche R6b, docs/scenarios/refonte.md, « La bascule des étiquettes
// existantes » et « La colonne du temps passé ») : le jour de la mise en ligne, chaque outil déjà
// cité par un projet ou un profil est rattaché à l'outil du catalogue qui porte ce nom ou cet alias
// (sans accents, majuscules, espaces ni ponctuation : `foldTool`), les autres deviennent des
// « Autre » ; aucun projet ni profil ne perd un outil ; la colonne time_spent disparaît ; les seize
// catégories de R6a sont semées en base.
//
// Comment on teste une migration : on part d'une base de test vide (schéma effacé), on y applique
// les migrations jusqu'à 0015 (l'état de la production avant R6b), on y écrit des projets et des
// profils comme en production, puis on applique la suite (0016). Les migrations sont lues dans le
// dossier du paquet @ruche/db par `readMigrationFiles` de Drizzle : chaque fichier y est découpé en
// instructions SQL, qu'on exécute une par une. Tout est en SQL brut : les tables d'avant et
// d'après ne sont pas celles du schéma typé.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CATEGORY_ICON_CHOICES,
  foldTool,
  PROJECT_CATEGORIES,
  ToolSlug,
  toolSlug,
} from '@ruche/contracts'
import { type Database, defaultMigrationsFolder } from '@ruche/db'
import { createTestPgliteDb } from '@ruche/db/pglite'
import { type SQL, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

/** La dernière migration d'avant R6b : la base de production telle qu'elle est avant la bascule. */
const BEFORE_R6B = '0015_r6a_publish'

let db: Database
let close: () => Promise<void>
/** Le nombre de migrations appliquées après 0015 (0016 et les suivantes). */
let appliedAfter = 0
/** Un alias du catalogue écrit autrement que le nom de son outil (« Chat GPT » ne compte pas). */
let aliasCase: { alias: string; name: string } | null = null

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) => ((await db.execute(query)) as unknown as { rows: T[] }).rows

/** Une date ISO, liée comme texte puis lue en UTC (voir code-api.md : dates en SQL brut). */
const utc = (iso: string) => sql`${iso}::timestamptz at time zone 'UTC'`

/**
 * Un tableau de textes PostgreSQL, sans rien coller dans le SQL : la liste passe en JSON (un seul
 * paramètre lié), puis PostgreSQL la déplie dans l'ordre. (Drizzle, lui, transformerait un tableau
 * JavaScript en liste « ($1, $2) », qui n'est pas un text[].)
 */
const textArray = (values: string[]) =>
  sql`array(select e.v from jsonb_array_elements_text(${JSON.stringify(values)}::jsonb) with ordinality as e(v, n) order by e.n)`

/** Applique une liste de migrations, instruction par instruction. */
const apply = async (migrations: { sql: string[] }[]) => {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      if (statement.trim()) await db.execute(sql.raw(statement))
    }
  }
}

// Les libellés « piégés » (relecture de sécurité sec-B1, B3) : apostrophe, barre oblique inverse,
// guillemets, pourcentage et point-virgule ; un accent, un emoji et un autre alphabet. La bascule
// doit les replier exactement comme foldTool, sans jamais les coller dans le SQL.
const SPARKLE = String.fromCodePoint(0x2728)
const TRAPPED = [
  "O'Reilly Bot",
  'Back\\slash Bot',
  '"Quoted" Bot',
  '100% Bot',
  'Semi;colon Bot; drop table project',
  'Écrivain Studio',
  `Robot ${SPARKLE}`,
  'Ρομπότ Κήπου',
]

// Les projets d'avant la bascule. Les libellés et leurs « slugs » sont ceux que R6a écrivait
// (`toolSlug`), y compris deux écritures d'un même outil dans un projet (R6a ne dédoublonnait
// que par slug).
const PROJECTS = {
  // Le plus ancien cite « Teachable Machine », mais il est privé : il ne donne pas son nom (jur-T14).
  hidden: {
    id: '00000000-0000-4000-8000-000000000001',
    author: 'lea',
    visibility: 'private',
    createdAt: '2026-01-02T10:00:00.000Z',
    tools: ['TEACHABLE MACHINE'],
  },
  lea: {
    id: '00000000-0000-4000-8000-000000000002',
    author: 'lea',
    visibility: 'public',
    createdAt: '2026-01-05T10:00:00.000Z',
    tools: ['Claude Code', 'Teachable Machine', 'Chat GPT'],
  },
  max: {
    id: '00000000-0000-4000-8000-000000000003',
    author: 'max',
    visibility: 'public',
    createdAt: '2026-01-07T10:00:00.000Z',
    tools: ['ChatGPT', 'Chat-G.P.T', 'teachable-machine'],
  },
  trapped: {
    id: '00000000-0000-4000-8000-000000000004',
    author: 'max',
    visibility: 'public',
    createdAt: '2026-01-09T10:00:00.000Z',
    tools: TRAPPED,
  },
  empty: {
    id: '00000000-0000-4000-8000-000000000005',
    author: 'lea',
    visibility: 'public',
    createdAt: '2026-01-10T10:00:00.000Z',
    tools: [] as string[],
  },
  // sec-B3 : « Claude 2 » a l'adresse claude-2 ; « Claude ✨ » a l'adresse claude, prise par le
  // catalogue, et son premier suffixe libre semblait claude-2 : deux fois la même adresse, et la
  // migration s'arrêtait (23505). sec-A1 : 40 emoji, une adresse qui dépassait 200 caractères.
  collide: {
    id: '00000000-0000-4000-8000-000000000007',
    author: 'max',
    visibility: 'public',
    createdAt: '2026-01-12T10:00:00.000Z',
    tools: ['Claude 2', `Claude ${SPARKLE}`, String.fromCodePoint(0x1f916).repeat(40)],
  },
}
const FAVOURITES = { lea: ['Cursor', 'Mon robot maison'], max: ['claude code', 'CHAT GPT'] }

/** L'alias choisi dans le catalogue, cité par un projet à part (s'il existe déjà). */
const ALIAS_PROJECT_ID = '00000000-0000-4000-8000-000000000006'

beforeAll(async () => {
  ;({ db, close } = await createTestPgliteDb())
  // Une base vide : la base de test arrive déjà migrée, on efface son schéma pour repartir de zéro.
  await db.execute(sql.raw('drop schema public cascade'))
  await db.execute(sql.raw('create schema public'))

  const journal = z
    .object({ entries: z.array(z.object({ tag: z.string() })) })
    .parse(JSON.parse(readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8')))
  const cut = journal.entries.findIndex((entry) => entry.tag === BEFORE_R6B) + 1
  expect(cut).toBe(16)
  const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
  await apply(migrations.slice(0, cut))

  // Un alias du catalogue semé (packages/db/catalogue/tools.json, écrit en même temps que 0016) :
  // le premier dont le nom replié diffère de celui de son outil.
  const cataloguePath = join(defaultMigrationsFolder, '..', 'catalogue', 'tools.json')
  if (existsSync(cataloguePath)) {
    const entries = z
      .array(z.object({ name: z.string(), aliases: z.array(z.string()) }))
      .parse(JSON.parse(readFileSync(cataloguePath, 'utf8')))
    for (const entry of entries) {
      const alias = entry.aliases.find((a) => foldTool(a) !== foldTool(entry.name))
      if (alias) {
        aliasCase = { alias, name: entry.name }
        break
      }
    }
  }

  // Les membres, leurs profils et leurs projets, comme en production avant R6b.
  for (const [id, name] of [
    ['lea', 'Léa'],
    ['max', 'Max'],
  ] as const) {
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${name}, ${`${id}@example.com`}, true, ${utc('2025-12-01T00:00:00.000Z')}, ${utc('2025-12-01T00:00:00.000Z')})`,
    )
    await db.execute(
      sql`insert into profile (user_id, favorite_tools, updated_at) values (${id}, ${textArray(FAVOURITES[id])}, ${utc('2025-12-01T00:00:00.000Z')})`,
    )
  }
  const projects = [
    ...Object.values(PROJECTS),
    ...(aliasCase
      ? [
          {
            id: ALIAS_PROJECT_ID,
            author: 'lea',
            visibility: 'public',
            createdAt: '2026-01-11T10:00:00.000Z',
            tools: [aliasCase.alias],
          },
        ]
      : []),
  ]
  for (const project of projects) {
    await db.execute(
      sql`insert into project (id, author_id, title, pitch, visibility, tools, tool_slugs, time_spent, primary_category, created_at, updated_at, published_at) values (${project.id}, ${project.author}, ${`Projet ${project.id.slice(-1)}`}, 'Un projet d’avant R6b.', ${project.visibility}, ${textArray(project.tools)}, ${textArray(project.tools.map(toolSlug))}, 'week', 'cooking', ${utc(project.createdAt)}, ${utc(project.createdAt)}, ${project.visibility === 'public' ? utc(project.createdAt) : null})`,
    )
  }

  // La bascule : 0016 et ce qui suit.
  const after = migrations.slice(cut)
  appliedAfter = after.length
  await apply(after)
}, 60_000)

afterAll(async () => {
  await close()
})

type Tool = { id: string; slug: string; name: string; folded: string; status: string }

const allTools = () =>
  rows<Tool & { created_by: string | null }>(
    sql`select id, slug, name, folded, status, created_by from tool`,
  )

const aliases = () =>
  rows<{ folded: string; tool_id: string }>(sql`select folded, tool_id from tool_alias`)

/** L'outil qu'un libellé doit rejoindre : celui qui porte ce nom replié, ou cet alias. */
const resolver = async () => {
  const byFolded = new Map((await allTools()).map((tool) => [tool.folded, tool] as const))
  const byId = new Map([...byFolded.values()].map((tool) => [tool.id, tool] as const))
  const aliasOf = new Map((await aliases()).map((a) => [a.folded, a.tool_id] as const))
  return (label: string) => {
    const folded = foldTool(label)
    const aliasId = aliasOf.get(folded)
    return byFolded.get(folded) ?? (aliasId === undefined ? undefined : byId.get(aliasId))
  }
}

const projectTools = (projectId: string) =>
  rows<{ tool_id: string; label: string | null }>(
    sql`select tool_id, label from project_tool where project_id = ${projectId} order by position`,
  )

const profileTools = (userId: string) =>
  rows<{ tool_id: string; label: string | null }>(
    sql`select tool_id, label from profile_tool where user_id = ${userId} order by position`,
  )

/** Les outils attendus pour une liste de libellés : chacun résolu, une seule fois, dans l'ordre. */
const expectedIds = (labels: string[], resolve: (label: string) => Tool | undefined) => {
  const ids: string[] = []
  for (const label of labels) {
    const tool = resolve(label)
    expect(tool, `the label « ${label} » has a tool`).toBeDefined()
    if (tool && !ids.includes(tool.id)) ids.push(tool.id)
  }
  return ids
}

describe('the switch of the former tool labels (migration 0016)', () => {
  it('links every former label to a catalogue tool or a single « other », and loses none', async () => {
    // La migration 0016 existe (écrite à la main, avec son instantané Drizzle).
    expect(appliedAfter).toBeGreaterThan(0)
    const resolve = await resolver()

    for (const project of Object.values(PROJECTS)) {
      const linked = await projectTools(project.id)
      expect(
        linked.map(({ tool_id }) => tool_id),
        project.id,
      ).toEqual(expectedIds(project.tools, resolve))
    }
    for (const [userId, labels] of Object.entries(FAVOURITES)) {
      expect(
        (await profileTools(userId)).map(({ tool_id }) => tool_id),
        userId,
      ).toEqual(expectedIds(labels, resolve))
    }

    // Les outils du catalogue cités le sont restés ; les autres sont des « Autre », un par nom
    // replié, sans famille ni auteur.
    for (const label of ['Claude Code', 'Chat GPT', 'ChatGPT', 'Cursor', 'claude code']) {
      expect(resolve(label)?.status, label).toBe('catalogue')
    }
    const labels = [
      ...Object.values(PROJECTS).flatMap((p) => p.tools),
      ...Object.values(FAVOURITES).flat(),
    ]
    const otherFolds = new Set(
      labels.filter((label) => resolve(label)?.status !== 'catalogue').map(foldTool),
    )
    const others = (await allTools()).filter((tool) => tool.status === 'other')
    expect(others.map((tool) => tool.folded).sort()).toEqual([...otherFolds].sort())
    expect(others.every((tool) => tool.created_by === null)).toBe(true)
  })

  it('links a former label written as an alias of the catalogue to its tool', async () => {
    // Un alias semé avec le catalogue (« ce nom ou cet alias », décision de Louis du 9/11/2026).
    expect(aliasCase).not.toBeNull()
    if (!aliasCase) return
    const [link] = await projectTools(ALIAS_PROJECT_ID)
    const tool = (await allTools()).find((t) => t.id === link?.tool_id)

    expect(tool).toMatchObject({ name: aliasCase.name, status: 'catalogue' })
    expect(link?.label).toBeNull()
  })

  it('names a shared « other » after the oldest listed project, and keeps on each project the name typed there', async () => {
    const machine = (await allTools()).find((tool) => tool.folded === 'teachablemachine')

    // jur-T14 : le projet privé, plus ancien, ne donne pas son nom ; le plus ancien projet listé, oui.
    expect(machine).toMatchObject({ name: 'Teachable Machine', status: 'other', created_by: null })
    // sec-B8 : chaque projet garde l'écriture de son auteur ; un outil du catalogue n'en garde pas.
    expect((await projectTools(PROJECTS.hidden.id)).map(({ label }) => label)).toEqual([
      'TEACHABLE MACHINE',
    ])
    expect((await projectTools(PROJECTS.lea.id)).map(({ label }) => label)).toEqual([
      null,
      'Teachable Machine',
      null,
    ])
    expect((await projectTools(PROJECTS.max.id)).map(({ label }) => label)).toEqual([
      null,
      'teachable-machine',
    ])
    // Il compte « en attente depuis plus d'une semaine » : sa date est celle d'un projet, pas celle
    // de la mise en ligne.
    const [dated] = await rows<{ old: boolean }>(
      sql`select created_at < ${utc('2026-02-01T00:00:00.000Z')} as old from tool where folded = 'teachablemachine'`,
    )
    expect(dated?.old).toBe(true)
  })

  it('migrates two old labels with the same folded name and different slugs as two redirects to one tool', async () => {
    // « Chat GPT » (chat-gpt) et « Chat-G.P.T » (chat-g-p-t) sont ChatGPT : leurs vieilles adresses
    // mènent à sa page (sec-A2 : une table des redirections, à part des alias).
    const chatgpt = (await allTools()).find((tool) => tool.folded === 'chatgpt')
    expect(chatgpt?.status).toBe('catalogue')
    const redirects = await rows<{ slug: string; tool_id: string }>(
      sql`select slug, tool_id from tool_slug_redirect`,
    )

    expect(redirects).toEqual(
      expect.arrayContaining([
        { slug: 'chat-gpt', tool_id: chatgpt?.id },
        { slug: 'chat-g-p-t', tool_id: chatgpt?.id },
      ]),
    )
    // Jamais une redirection égale au slug d'un outil : « chatgpt » est déjà la page de ChatGPT.
    const slugs = new Set((await allTools()).map((tool) => tool.slug))
    expect(redirects.filter(({ slug }) => slugs.has(slug))).toEqual([])
  })

  it('folds in the migration SQL exactly as foldTool for trapped labels (apostrophe, backslash, quotes, percent, semicolon)', async () => {
    const tools = await allTools()

    const linked = await projectTools(PROJECTS.trapped.id)
    expect(linked.map(({ label }) => label)).toEqual(TRAPPED)
    for (const [i, label] of TRAPPED.entries()) {
      const tool = tools.find((t) => t.id === linked[i]?.tool_id)
      expect(tool?.folded, label).toBe(foldTool(label))
      expect(tool?.name, label).toBe(label)
    }
    // Le point-virgule n'a rien exécuté : les projets sont tous là.
    expect(await rows(sql`select id from project`)).toHaveLength(
      Object.keys(PROJECTS).length + (aliasCase ? 1 : 0),
    )
  })

  it('gives « Claude 2 » and « Claude ✨ » two different addresses, and 40 emoji a bounded one', async () => {
    const tools = await allTools()
    const linked = await projectTools(PROJECTS.collide.id)
    const [two, sparkle, robots] = PROJECTS.collide.tools.map((label, i) =>
      tools.find((t) => t.id === linked[i]?.tool_id && t.folded === foldTool(label)),
    )

    expect(two).toMatchObject({ status: 'other', slug: 'claude-2' })
    expect(sparkle?.status).toBe('other')
    expect(sparkle?.slug).not.toBe(two?.slug)
    expect(sparkle?.slug).toMatch(/^claude-\d+$/)
    // Les adresses restent uniques, et chacune passe ToolSlug, que l'API vérifie en sortie.
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length)
    expect(robots?.slug).toBe(toolSlug(PROJECTS.collide.tools[2] ?? ''))
    for (const tool of tools) expect(ToolSlug.safeParse(tool.slug).success, tool.slug).toBe(true)
  })

  it('keeps the former tool columns as they were, and drops time_spent', async () => {
    const [lea] = await rows<{ tools: string[]; tool_slugs: string[] }>(
      sql`select tools, tool_slugs from project where id = ${PROJECTS.lea.id}`,
    )
    const [profile] = await rows<{ favorite_tools: string[] }>(
      sql`select favorite_tools from profile where user_id = 'lea'`,
    )

    // Décision du plan : les anciennes colonnes restent jusqu'en R7 (retour possible à R6a).
    expect(lea).toEqual({ tools: PROJECTS.lea.tools, tool_slugs: PROJECTS.lea.tools.map(toolSlug) })
    expect(profile?.favorite_tools).toEqual(FAVOURITES.lea)
    // jur-P1 : la colonne du temps passé est effacée.
    expect(
      await rows(
        sql`select column_name from information_schema.columns where table_name = 'project' and column_name = 'time_spent'`,
      ),
    ).toEqual([])
  })

  it('seeds the sixteen categories of R6a, « other » last, and ties the categories of a project to them', async () => {
    const categories = await rows<{ code: string; name_fr: string; name_en: string; icon: string }>(
      sql`select code, name_fr, name_en, icon from category order by position`,
    )

    expect(categories.map(({ code }) => code)).toEqual([...PROJECT_CATEGORIES])
    expect(categories.find(({ code }) => code === 'cooking')).toMatchObject({
      name_fr: 'Cuisine',
      name_en: 'Cooking',
    })
    expect(categories.at(-1)).toMatchObject({ code: 'other', name_fr: 'Autre', name_en: 'Other' })
    for (const { code, icon } of categories) {
      expect(CATEGORY_ICON_CHOICES as readonly string[], code).toContain(icon)
    }
    // Les catégories des projets existants sont gardées, et un code absent de la table est refusé
    // par la base (clé étrangère).
    expect(
      await rows(
        sql`select 1 from project where id = ${PROJECTS.lea.id} and primary_category = 'cooking'`,
      ),
    ).toHaveLength(1)
    await expect(
      db.execute(
        sql`update project set primary_category = 'jardinage' where id = ${PROJECTS.lea.id}`,
      ),
    ).rejects.toThrow()
  })
})

describe('the literals of the generated catalogue SQL', () => {
  it('escapes an apostrophe, a backslash and a newline in a generated literal and refuses a NUL', async () => {
    // packages/db/scripts/catalogue-sql.mjs écrit le SQL du catalogue à partir de tools.json
    // (sec-B1) : chaque texte passe par literal(). On vérifie ce que PostgreSQL en relit.
    const script = new URL('../../../packages/db/scripts/catalogue-sql.mjs', import.meta.url)
    const { literal } = (await import(script.href)) as { literal: (value: string) => string }

    for (const value of [
      "O'Reilly",
      'C:\\outils\\robot',
      'ligne 1\nligne 2',
      "'; drop table project; --",
    ]) {
      const [row] = await rows<{ v: string }>(sql`select ${sql.raw(literal(value))} as v`)
      expect(row?.v, value).toBe(value)
    }
    expect(() => literal(`a${String.fromCodePoint(0)}b`)).toThrow()
  })
})
