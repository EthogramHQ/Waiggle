// Tests du SQL de la migration 0016 (tranche R6b) : le repli et l'adresse qu'elle calcule en SQL
// pour les anciennes étiquettes sont les mêmes que `foldTool` et `toolSlug` du contrat, et le
// catalogue semé en base porte les noms repliés et les adresses que le contrat calcule. Sans cela,
// un nom tapé après la mise en ligne ne retrouverait pas l'outil rattaché par la migration. Puis la
// mise à jour du catalogue (0017) : après toutes les migrations, la base est tools.json, champ par
// champ, même quand des membres ont déjà tapé les noms qui entrent au catalogue.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { foldTool, toolSlug } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  catalogueRows,
  catalogueSql,
  catalogueUpdateSql,
  foldFunctionsSql,
  foldTool as scriptFoldTool,
} from './scripts/catalogue-sql.mjs'
import { type Database, defaultMigrationsFolder } from './src/index'
import { createTestPgliteDb } from './src/pglite'

const catalogue: {
  name: string
  aliases: string[]
  family: string
  descriptionFr: string
  descriptionEn: string
  siteUrl: string | null
}[] = JSON.parse(readFileSync(new URL('./catalogue/tools.json', import.meta.url), 'utf8'))

/** Le texte de la migration 0016, telle qu'elle partira en production. */
const migration = readFileSync(new URL('./migrations/0016_r6b_tools.sql', import.meta.url), 'utf8')

let db: Database
let close: () => Promise<void>

/** Des libellés de toutes sortes : accents, ligatures, ponctuation, symboles seuls, autres alphabets. */
const LABELS = [
  'Claude Code',
  'Chat-G.P.T',
  'L’Élève',
  'Œuvre ß Æon',
  'ÀÉÎÕÜ Ÿ',
  '  padded  ',
  'C++',
  "O'Reilly Bot",
  'Back\\slash Bot',
  '100% Bot',
  'Ρομπότ Κήπου',
  '日本語 ツール',
  'Écrivain Studio',
  '---',
  '🤖',
  `Robot ${String.fromCodePoint(0x2728)}`,
  // Les adresses trop longues (sec-A1) : coupées à 120 caractères sur un tiret, comme le contrat.
  String.fromCodePoint(0x1f916).repeat(40),
  Array.from({ length: 30 }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' '),
  'a'.repeat(130),
]

beforeAll(async () => {
  ;({ db, close } = await createTestPgliteDb())
  // Les fonctions temporaires de la migration : ici elles vivent le temps de la connexion du test.
  for (const statement of foldFunctionsSql()) await db.execute(sql.raw(statement))
})

afterAll(async () => {
  await close()
})

describe('the SQL folding of the migration', () => {
  it('folds and slugs every label exactly as the contract does', async () => {
    for (const label of LABELS) {
      const result = await db.execute(
        sql`select pg_temp.r6b_fold(${label}) as folded, pg_temp.r6b_slug(${label}) as slug`,
      )
      const [row] = (result as unknown as { rows: { folded: string; slug: string }[] }).rows
      expect(row?.folded, `fold of « ${label} »`).toBe(foldTool(label))
      expect(row?.slug, `slug of « ${label} »`).toBe(toolSlug(label))
    }
  })

  it('has a script fold identical to the contract fold', () => {
    for (const label of LABELS) expect(scriptFoldTool(label), label).toBe(foldTool(label))
  })

  it('finds in migration 0016, word for word, the functions this test checks', () => {
    // Le test ci-dessus vérifie les fonctions du script ; la migration en porte une copie. Sans ce
    // contrôle, une borne ajoutée au script (sec-A1) pourrait manquer à la migration.
    for (const statement of foldFunctionsSql()) expect(migration).toContain(statement)
  })
})

describe('the seeded catalogue', () => {
  it('stores for every tool the folded name and the slug the contract computes, and every alias', async () => {
    const tools = (await db.execute(
      sql`select name, slug, folded, family, status, description_fr, description_en, site_url from tool`,
    )) as unknown as {
      rows: {
        name: string
        slug: string
        folded: string
        family: string
        status: string
        description_fr: string | null
        description_en: string | null
        site_url: string | null
      }[]
    }
    const aliases = (await db.execute(
      sql`select a.folded, t.name from tool_alias a join tool t on t.id = a.tool_id`,
    )) as unknown as {
      rows: { folded: string; name: string }[]
    }
    expect(tools.rows).toHaveLength(catalogue.length)
    for (const entry of catalogue) {
      expect(
        tools.rows.find((tool) => tool.name === entry.name),
        entry.name,
      ).toMatchObject({
        slug: toolSlug(entry.name),
        folded: foldTool(entry.name),
        family: entry.family,
        status: 'catalogue',
      })
    }
    // jur-J3 : les descriptions et le site aussi, champ par champ. Louis relit tools.json : une
    // description corrigée ou un site retiré (`null`) qui n'arriverait pas dans 0016 ferait servir
    // l'ancien texte ou l'ancien domaine par la base.
    for (const entry of catalogue) {
      const tool = tools.rows.find((row) => row.name === entry.name)
      expect(tool?.description_fr, `${entry.name} : description_fr`).toBe(entry.descriptionFr)
      expect(tool?.description_en, `${entry.name} : description_en`).toBe(entry.descriptionEn)
      expect(tool?.site_url, `${entry.name} : site_url`).toBe(entry.siteUrl)
    }
    expect(aliases.rows).toHaveLength(catalogue.reduce((n, entry) => n + entry.aliases.length, 0))
    for (const entry of catalogue) {
      for (const alias of entry.aliases) {
        expect(aliases.rows.find((a) => a.folded === foldTool(alias))?.name, alias).toBe(entry.name)
      }
    }
  })

  it('generates one statement for the tools and one for the aliases', () => {
    expect(
      catalogueSql(
        catalogue.map((e) => ({ ...e, descriptionFr: 'x', descriptionEn: 'y', siteUrl: null })),
      ),
    ).toHaveLength(2)
  })
})

// ─── La mise à jour du catalogue (migration 0017) ────────────────────────────────────────────────
//
// 0016 est en production depuis le 9/11/2026 : des membres ont pu y taper « Llama » ou « Meta Llama »
// avant que ces noms entrent au catalogue, et 0016 a posé des redirections (« gpt » vers ChatGPT).
// On rejoue donc l'histoire : une base vide, les migrations jusqu'à 0016, l'état d'une production
// (des « Autre », des projets, des profils, posés en SQL brut), puis la suite (0017 et après).

/** La dernière migration déjà en production : l'état de départ de 0017. */
const DEPLOYED = '0016_r6b_tools'

/** Le résultat d'une requête SQL brute ; on précise nous-mêmes la forme des lignes. */
const rowsOf = async <T>(base: Database, query: ReturnType<typeof sql>) =>
  ((await base.execute(query)) as unknown as { rows: T[] }).rows

/** Les migrations du dossier, coupées après celle qui porte ce nom (avant, après). */
const migrationsAround = (tag: string) => {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
  )
  const cut = journal.entries.findIndex((entry) => entry.tag === tag) + 1
  const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
  return { before: migrations.slice(0, cut), after: migrations.slice(cut), tags: journal.entries }
}

/** Applique des migrations instruction par instruction, comme le fait Drizzle. */
const applyMigrations = async (base: Database, migrations: { sql: string[] }[]) => {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      if (statement.trim()) await base.execute(sql.raw(statement))
    }
  }
}

describe('the catalogue update after deployment (migration 0017)', () => {
  let prod: Database
  let closeProd: () => Promise<void>
  /** Les identifiants des outils avant 0017, par nom replié. */
  const before = new Map<string, string>()

  const P = {
    llama: '00000000-0000-4000-8000-000000000101',
    metaLlama: '00000000-0000-4000-8000-000000000102',
    jetson: '00000000-0000-4000-8000-000000000103',
    gpt: '00000000-0000-4000-8000-000000000104',
    gemma: '00000000-0000-4000-8000-000000000105',
  }

  const idOf = async (folded: string) =>
    (await rowsOf<{ id: string }>(prod, sql`select id from tool where folded = ${folded}`))[0]?.id

  const toolOf = async (folded: string) =>
    (
      await rowsOf<{
        id: string
        name: string
        slug: string
        status: string
        family: string | null
        description_fr: string | null
        description_en: string | null
        site_url: string | null
      }>(
        prod,
        sql`select id, name, slug, status, family, description_fr, description_en, site_url from tool where folded = ${folded}`,
      )
    )[0]

  const linksOf = (table: 'project_tool' | 'profile_tool', owner: string) =>
    rowsOf<{ tool_id: string; label: string | null }>(
      prod,
      table === 'project_tool'
        ? sql`select tool_id, label from project_tool where project_id = ${owner} order by position`
        : sql`select tool_id, label from profile_tool where user_id = ${owner} order by position`,
    )

  const redirectOf = async (slug: string) =>
    (
      await rowsOf<{ tool_id: string }>(
        prod,
        sql`select tool_id from tool_slug_redirect where slug = ${slug}`,
      )
    )[0]?.tool_id

  const aliasOf = async (folded: string) =>
    (
      await rowsOf<{ tool_id: string }>(
        prod,
        sql`select tool_id from tool_alias where folded = ${folded}`,
      )
    )[0]?.tool_id

  /** Tout ce que 0017 peut toucher, rangé dans un ordre fixe : deux lectures égales = rien n'a bougé. */
  const snapshot = async () => ({
    tools: await rowsOf(
      prod,
      sql`select id, slug, name, folded, status, family, description_fr, description_en, site_url from tool order by id`,
    ),
    aliases: await rowsOf(prod, sql`select folded, tool_id from tool_alias order by folded`),
    redirects: await rowsOf(prod, sql`select slug, tool_id from tool_slug_redirect order by slug`),
    projects: await rowsOf(
      prod,
      sql`select project_id, tool_id, position, label from project_tool order by project_id, tool_id`,
    ),
    profiles: await rowsOf(
      prod,
      sql`select user_id, tool_id, position, label from profile_tool order by user_id, tool_id`,
    ),
  })

  beforeAll(async () => {
    ;({ db: prod, close: closeProd } = await createTestPgliteDb())
    await prod.execute(sql.raw('drop schema public cascade'))
    await prod.execute(sql.raw('create schema public'))
    const { before: deployed, after } = migrationsAround(DEPLOYED)
    await applyMigrations(prod, deployed)
    for (const row of await rowsOf<{ id: string; folded: string }>(
      prod,
      sql`select id, folded from tool`,
    ))
      before.set(row.folded, row.id)

    // La production après 0016 : deux membres, des « Autre » tapés depuis (un écarté par
    // l'administration), et les redirections que 0016 a posées pour « GPT » et « Mistral ».
    for (const id of ['lea', 'max']) {
      await prod.execute(
        sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${id}, ${`${id}@example.com`}, true, now(), now())`,
      )
      await prod.execute(sql`insert into profile (user_id, updated_at) values (${id}, now())`)
    }
    const others = [
      ['Llama', 'llama', 'llama', 'other'],
      ['Meta Llama', 'metallama', 'meta-llama', 'other'],
      ['Code Llama', 'codellama', 'code-llama', 'dismissed'],
      ['Jetson Orin', 'jetsonorin', 'jetson-orin', 'other'],
      // Un autre nom replié (l'emoji compte), mais la même adresse que le nouvel outil « Gemma ».
      [
        `Gemma ${String.fromCodePoint(0x2728)}`,
        `gemma${String.fromCodePoint(0x2728)}`,
        'gemma',
        'other',
      ],
    ] as const
    for (const [name, folded, slug, status] of others) {
      await prod.execute(
        sql`insert into tool (id, slug, name, folded, status, created_at) values (gen_random_uuid(), ${slug}, ${name}, ${folded}, ${status}, now())`,
      )
    }
    for (const [key, author] of [
      ['llama', 'lea'],
      ['metaLlama', 'max'],
      ['jetson', 'lea'],
      ['gpt', 'max'],
      ['gemma', 'lea'],
    ] as const) {
      await prod.execute(
        sql`insert into project (id, author_id, title, pitch, visibility, primary_category, created_at, updated_at, published_at) values (${P[key]}, ${author}, ${key}, 'Un projet.', 'public', 'cooking', now(), now(), now())`,
      )
    }
    const projectLinks: [string, string, string | null][] = [
      // [projet, outil (nom replié), nom tapé]
      [P.llama, 'llama', 'Llama'],
      [P.llama, 'claude', null],
      [P.llama, 'metallama', 'Meta Llama'],
      [P.metaLlama, 'metallama', 'meta llama'],
      [P.metaLlama, 'codellama', 'Code Llama'],
      [P.jetson, 'jetsonorin', 'Jetson Orin'],
      [P.jetson, 'jetsonnano', null],
      // « GPT » tapé avant 0016 : rattaché à ChatGPT par son alias, il y reste.
      [P.gpt, 'chatgpt', null],
      [P.gemma, `gemma${String.fromCodePoint(0x2728)}`, `Gemma ${String.fromCodePoint(0x2728)}`],
    ]
    const positions = new Map<string, number>()
    for (const [project, folded, label] of projectLinks) {
      const position = positions.get(project) ?? 0
      positions.set(project, position + 1)
      await prod.execute(
        sql`insert into project_tool (project_id, tool_id, position, label) select ${project}, id, ${position}, ${label} from tool where folded = ${folded}`,
      )
    }
    await prod.execute(
      sql`insert into profile_tool (user_id, tool_id, position, label) select 'max', id, 0, null from tool where folded = 'lechat'`,
    )
    await prod.execute(
      sql`insert into profile_tool (user_id, tool_id, position, label) select 'max', id, 1, 'llama' from tool where folded = 'llama'`,
    )
    await prod.execute(
      sql`insert into tool_slug_redirect (slug, tool_id) select 'gpt', id from tool where folded = 'chatgpt'`,
    )
    await prod.execute(
      sql`insert into tool_slug_redirect (slug, tool_id) select 'mistral', id from tool where folded = 'lechat'`,
    )

    await applyMigrations(prod, after)
  }, 60_000)

  afterAll(async () => {
    await closeProd()
  })

  it('has a migration after 0016', () => {
    // Le témoin : sans 0017, les tests suivants échoueraient tous pour la même raison.
    expect(migrationsAround(DEPLOYED).after.length).toBeGreaterThan(0)
  })

  it('brings every catalogue tool to tools.json, field by field, on a database that went through production', async () => {
    for (const entry of catalogue) {
      expect(await toolOf(foldTool(entry.name)), entry.name).toEqual({
        id: expect.any(String),
        name: entry.name,
        slug: toolSlug(entry.name),
        status: 'catalogue',
        family: entry.family,
        description_fr: entry.descriptionFr,
        description_en: entry.descriptionEn,
        site_url: entry.siteUrl,
      })
      for (const alias of entry.aliases)
        expect(await aliasOf(foldTool(alias)), alias).toBe(await idOf(foldTool(entry.name)))
    }
    const catalogueCount = await rowsOf<{ n: number }>(
      prod,
      sql`select count(*)::int as n from tool where status = 'catalogue'`,
    )
    expect(catalogueCount[0]?.n).toBe(catalogue.length)
  })

  it('moves an « other » tool typed by members onto a new catalogue tool of the same name, without duplicates', async () => {
    const llama = await toolOf('llama')
    expect(llama).toMatchObject({ name: 'Llama', slug: 'llama', status: 'catalogue' })
    // « Meta Llama » et « Code Llama » (écarté) sont des alias de Llama : rattachés, puis effacés.
    expect(await idOf('metallama')).toBeUndefined()
    expect(await idOf('codellama')).toBeUndefined()
    expect(await aliasOf('metallama')).toBe(llama?.id)
    expect(await aliasOf('codellama')).toBe(llama?.id)
    // Leurs adresses mènent à la page de Llama, comme après un rattachement de l'administration.
    expect(await redirectOf('meta-llama')).toBe(llama?.id)
    expect(await redirectOf('code-llama')).toBe(llama?.id)

    // Un projet qui citait « Llama » et « Meta Llama » ne cite plus qu'une fois Llama, à la place
    // la plus haute ; le nom tapé s'efface (un outil du catalogue s'affiche sous son nom, sec-B8).
    expect(await linksOf('project_tool', P.llama)).toEqual([
      { tool_id: llama?.id, label: null },
      { tool_id: await idOf('claude'), label: null },
    ])
    expect(await linksOf('project_tool', P.metaLlama)).toEqual([
      { tool_id: llama?.id, label: null },
    ])
    expect(await linksOf('profile_tool', 'max')).toEqual([
      { tool_id: await idOf('lechat'), label: null },
      { tool_id: llama?.id, label: null },
    ])
  })

  it('gives a new catalogue tool its own address, and the next free one to the « other » that held it', async () => {
    const sparkle = `gemma${String.fromCodePoint(0x2728)}`
    expect(await toolOf('gemma')).toMatchObject({ slug: 'gemma', status: 'catalogue' })
    expect(await toolOf(sparkle)).toMatchObject({ slug: 'gemma-2', status: 'other' })
    expect(await linksOf('project_tool', P.gemma)).toEqual([
      { tool_id: await idOf(sparkle), label: `Gemma ${String.fromCodePoint(0x2728)}` },
    ])
  })

  it('keeps the old address of a renamed catalogue tool through a redirect', async () => {
    const id = before.get('jetsonnano')
    expect(id).toBeDefined()
    const jetson = await toolOf('nvidiajetson')
    // Le même outil (ses projets le gardent), sous son nouveau nom et sa nouvelle adresse.
    expect(jetson).toMatchObject({ id, name: 'NVIDIA Jetson', slug: 'nvidia-jetson' })
    expect(await idOf('jetsonnano')).toBeUndefined()
    expect(await redirectOf('jetson-nano')).toBe(id)
    // L'ancien nom devient un alias ; l'ancien alias « NVIDIA Jetson » devient le nom.
    expect(await aliasOf('jetsonnano')).toBe(id)
    expect(await aliasOf('nvidiajetson')).toBeUndefined()
    // « Jetson Orin », tapé par un membre, est un alias neuf : rattaché sans doublon.
    expect(await idOf('jetsonorin')).toBeUndefined()
    expect(await linksOf('project_tool', P.jetson)).toEqual([{ tool_id: id, label: null }])
  })

  it('hands « GPT » and « Mistral » over to their new tools, and keeps the links made through them', async () => {
    const gpt = await toolOf('gpt')
    const mistral = await toolOf('mistral')
    expect(gpt).toMatchObject({ name: 'GPT', slug: 'gpt', status: 'catalogue' })
    expect(mistral).toMatchObject({ name: 'Mistral', slug: 'mistral', status: 'catalogue' })
    expect(await aliasOf('gpt')).toBeUndefined()
    expect(await aliasOf('mistral')).toBeUndefined()
    // Ce qui avait été rattaché par l'ancien alias reste où il était.
    expect(await linksOf('project_tool', P.gpt)).toEqual([
      { tool_id: before.get('chatgpt'), label: null },
    ])
    // Une adresse n'est jamais à la fois celle d'un outil et une redirection (sec-A2).
    expect(await redirectOf('gpt')).toBeUndefined()
    expect(await redirectOf('mistral')).toBeUndefined()
  })

  it('leaves no alias equal to a tool name and no redirect equal to a tool address', async () => {
    expect(
      await rowsOf(prod, sql`select a.folded from tool_alias a join tool t on t.folded = a.folded`),
    ).toEqual([])
    expect(
      await rowsOf(
        prod,
        sql`select r.slug from tool_slug_redirect r join tool t on t.slug = r.slug`,
      ),
    ).toEqual([])
  })

  it('replays migration 0017 without changing anything', async () => {
    const first = await snapshot()
    const { after } = migrationsAround(DEPLOYED)
    expect(after.length).toBeGreaterThan(0)
    await applyMigrations(prod, after.slice(0, 1))
    expect(await snapshot()).toEqual(first)
  })
})

describe('the generated catalogue update', () => {
  it('moves an alias from one catalogue tool to another', async () => {
    const { db: base, close: closeBase } = await createTestPgliteDb()
    try {
      // tools.json est déjà en base (toutes les migrations) ; on y déplace « Claude AI » vers
      // ChatGPT et on applique le SQL que le script en tire.
      const moved = catalogue.map((entry) => {
        if (entry.name === 'Claude')
          return { ...entry, aliases: entry.aliases.filter((alias) => alias !== 'Claude AI') }
        if (entry.name === 'ChatGPT') return { ...entry, aliases: [...entry.aliases, 'Claude AI'] }
        return entry
      })
      for (const statement of catalogueUpdateSql(catalogueRows(catalogue), moved))
        await base.execute(sql.raw(statement))
      const [row] = await rowsOf<{ name: string }>(
        base,
        sql`select t.name from tool_alias a join tool t on t.id = a.tool_id where a.folded = 'claudeai'`,
      )
      expect(row?.name).toBe('ChatGPT')
      const [count] = await rowsOf<{ n: number }>(
        base,
        sql`select count(*)::int as n from tool_alias`,
      )
      expect(count?.n).toBe(catalogue.reduce((n, entry) => n + entry.aliases.length, 0))
    } finally {
      await closeBase()
    }
  })
})
