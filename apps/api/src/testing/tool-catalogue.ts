// Un petit catalogue d'outils pour les tests de l'API (tranche R6b). La migration 0016 sème environ
// 120 outils (packages/db/catalogue/tools.json) ; pour qu'un test sache exactement ce que la liste
// doit rendre, il efface ce catalogue semé, puis ajoute les quelques outils dont il a besoin, avec
// leurs alias et leurs anciennes adresses. Rien ici n'est utilisé en production.
//
// Les lignes sont écrites en SQL brut, avec les colonnes du plan (tables `tool`, `tool_alias`,
// `tool_slug_redirect`, `project_tool`) : ces tests ne dépendent pas des noms que le schéma Drizzle
// donnera à ses objets. `sql\`…\`` (de Drizzle) envoie chaque `${valeur}` comme un paramètre lié,
// jamais collé dans le texte de la requête.
import { randomUUID } from 'node:crypto'
import { foldTool, type ToolFamily, toolSlug } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import type { TestContext } from './context'

type Db = TestContext['db']

/** Un outil à ajouter au catalogue du test. */
export type TestTool = {
  name: string
  family: ToolFamily
  descriptionFr?: string | null
  descriptionEn?: string | null
  siteUrl?: string | null
  /** Ses autres noms (« Claude AI ») : la base ne garde que leur repli. */
  aliases?: string[]
  /** Ses anciennes adresses (`/tags/chat-gpt`), qui mènent à sa page. */
  redirects?: string[]
}

/**
 * Une date pour une colonne `timestamp` : du texte ISO, lu comme une heure UTC (charte de l'API :
 * jamais une `Date` dans un `sql\`…\`` brut, que le pilote pourrait écrire en heure locale).
 */
const utc = (date: Date) => sql`${date.toISOString()}::timestamptz at time zone 'UTC'`

/** Efface le catalogue semé : alias, anciennes adresses et outils (aucun projet ne les cite encore). */
export const clearCatalogue = async (db: Db) => {
  await db.execute(sql`delete from tool_slug_redirect`)
  await db.execute(sql`delete from tool_alias`)
  await db.execute(sql`delete from tool`)
}

/** Ajoute un outil au catalogue (statut `catalogue`, admis maintenant) ; rend son id et son slug. */
export const addCatalogueTool = async (db: Db, tool: TestTool) => {
  const id = randomUUID()
  const slug = toolSlug(tool.name)
  const now = new Date()
  await db.execute(sql`
    insert into tool (id, slug, name, folded, status, family, description_fr, description_en,
                      site_url, created_at, created_by, admitted_at)
    values (${id}, ${slug}, ${tool.name}, ${foldTool(tool.name)}, 'catalogue', ${tool.family},
            ${tool.descriptionFr ?? null}, ${tool.descriptionEn ?? null}, ${tool.siteUrl ?? null},
            ${utc(now)}, null, ${utc(now)})`)
  for (const alias of tool.aliases ?? []) {
    await db.execute(
      sql`insert into tool_alias (folded, tool_id) values (${foldTool(alias)}, ${id})`,
    )
  }
  for (const old of tool.redirects ?? []) {
    await db.execute(sql`insert into tool_slug_redirect (slug, tool_id) values (${old}, ${id})`)
  }
  return { id, slug }
}

/**
 * Rattache directement en base un projet à un outil, à sa position : pour un projet posé hors de
 * l'API (auteur jamais vérifié, longues listes), que la route de publication n'a pas écrit.
 */
export const linkProjectTool = async (db: Db, projectId: string, toolId: string, position = 0) => {
  await db.execute(
    sql`insert into project_tool (project_id, tool_id, position) values (${projectId}, ${toolId}, ${position})`,
  )
}

/** L'id d'un outil d'après son nom replié (un « Autre » créé par la publication d'un projet). */
export const toolIdByName = async (db: Db, name: string) => {
  // `execute` rend les lignes sans type : on les lit comme des objets, puis on vérifie la valeur.
  const result = (await db.execute(
    sql`select id from tool where folded = ${foldTool(name)}`,
  )) as unknown as {
    rows: { id: unknown }[]
  }
  const id = result.rows[0]?.id
  if (typeof id !== 'string') throw new Error(`no tool folded as ${foldTool(name)}`)
  return id
}
