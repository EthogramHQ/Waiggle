// Tests du SQL de la migration 0016 (tranche R6b) : le repli et l'adresse qu'elle calcule en SQL
// pour les anciennes étiquettes sont les mêmes que `foldTool` et `toolSlug` du contrat, et le
// catalogue semé en base porte les noms repliés et les adresses que le contrat calcule. Sans cela,
// un nom tapé après la mise en ligne ne retrouverait pas l'outil rattaché par la migration.
import { readFileSync } from 'node:fs'
import { foldTool, toolSlug } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  catalogueSql,
  foldFunctionsSql,
  foldTool as scriptFoldTool,
} from './scripts/catalogue-sql.mjs'
import type { Database } from './src/index'
import { createTestPgliteDb } from './src/pglite'

const catalogue: { name: string; aliases: string[]; family: string }[] = JSON.parse(
  readFileSync(new URL('./catalogue/tools.json', import.meta.url), 'utf8'),
)

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
})

describe('the seeded catalogue', () => {
  it('stores for every tool the folded name and the slug the contract computes, and every alias', async () => {
    const tools = (await db.execute(
      sql`select name, slug, folded, family, status from tool`,
    )) as unknown as {
      rows: { name: string; slug: string; folded: string; family: string; status: string }[]
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
