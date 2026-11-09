// Retrouver l'outil que désigne un nom tapé par un membre (tranche R6b) : l'outil du catalogue qui
// porte ce nom ou l'un de ses alias, sinon l'« Autre » qui existe déjà, sinon un nouvel « Autre ».
// Le nom est comparé « replié » (`foldTool`) : « Chat GPT », « chatgpt » et « ChatGPT » sont un seul
// outil. Les écritures des outils d'un projet ou d'un profil sont dans `tools/write.ts`.
import { foldTool, toolSlug } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { eq, inArray } from 'drizzle-orm'

/** Une ligne de la table `tool`. */
export type ToolRow = typeof schema.tool.$inferSelect

/** Ce que peut faire cette fonction : lire et insérer (la base, ou une transaction en cours). */
type Reader = Pick<Database, 'select'>
type Writer = Pick<Database, 'select' | 'insert'>

/** Un nom tapé, relié à son outil. `label` : le nom tel que le membre l'a tapé (« Autre » seulement). */
export type ResolvedTool = { tool: ToolRow; label: string | null }

/** Combien de suffixes (« -2 », « -3 »…) on essaie avant de renoncer : une borne, jamais une boucle sans fin. */
const SLUG_ATTEMPTS = 50

/**
 * Levée quand les 51 adresses d'un nouvel « Autre » sont toutes prises (relecture de sécurité
 * sec-B4 : 52 noms repliés différents peuvent donner la même adresse, « Zorblax ☀ », « Zorblax ☁ »…).
 * Ce n'est pas une panne du serveur : la route répond 400 `validation`, traduit, et la transaction
 * annulée ne garde rien de la demande.
 */
export class NoFreeToolSlugError extends Error {
  constructor() {
    super('no free address for a new tool')
    this.name = 'NoFreeToolSlugError'
  }
}

/** Ce que rend une transaction refusée faute d'adresse libre (voir `noFreeToolSlug`). */
export const NO_FREE_TOOL_SLUG = 'no_free_tool_slug' as const

/**
 * À passer au `.catch` d'une transaction qui appelle `resolveTools` : l'erreur « plus d'adresse
 * libre » devient la valeur `NO_FREE_TOOL_SLUG`, que la route change en 400 ; toute autre erreur
 * continue son chemin (500, journal).
 */
export const noFreeToolSlug = (error: unknown): typeof NO_FREE_TOOL_SLUG => {
  if (error instanceof NoFreeToolSlugError) return NO_FREE_TOOL_SLUG
  throw error
}

/**
 * Combien de noms de cette liste n'ont encore aucun outil, ni au catalogue, ni parmi les « Autre » :
 * autant de créations à compter dans le quota du jour AVANT d'écrire (sec-A5). C'est une lecture
 * seule : deux demandes simultanées peuvent compter un nom de trop (le sens sûr), jamais l'oublier
 * (`resolveTools` rend le nombre exact de créations, que la route ajoute au besoin).
 *
 * Deux requêtes, quel que soit le nombre de noms : « in (…) » sur `tool.folded` (index unique) et sur
 * `tool_alias.folded` (clé primaire).
 */
export const countNewOtherTools = async (db: Reader, names: readonly string[]): Promise<number> => {
  const folded = [...new Set(names.map(foldTool))]
  if (folded.length === 0) return 0
  const tools = await db
    .select({ folded: schema.tool.folded })
    .from(schema.tool)
    .where(inArray(schema.tool.folded, folded))
  const aliases = await db
    .select({ folded: schema.toolAlias.folded })
    .from(schema.toolAlias)
    .where(inArray(schema.toolAlias.folded, folded))
  const known = new Set([...tools, ...aliases].map((row) => row.folded))
  return folded.filter((key) => !known.has(key)).length
}

/**
 * L'adresse libre d'un nouvel « Autre » : `toolSlug(nom)`, puis « -2 », « -3 »… tant qu'un autre outil
 * (ou une ancienne adresse) la porte déjà. Deux noms différents peuvent donner la même adresse
 * (« Zorblax » et « Zorblax ✨ ») : seule l'unicité de `tool.slug` les sépare (sec-A3).
 */
const freeSlugs = async (db: Reader, name: string, skip: ReadonlySet<string>) => {
  const base = toolSlug(name)
  const candidates = [base, ...Array.from({ length: SLUG_ATTEMPTS }, (_, i) => `${base}-${i + 2}`)]
  const taken = new Set<string>(skip)
  const rows = await db
    .select({ slug: schema.tool.slug })
    .from(schema.tool)
    .where(inArray(schema.tool.slug, candidates))
  for (const row of rows) taken.add(row.slug)
  const redirects = await db
    .select({ slug: schema.toolSlugRedirect.slug })
    .from(schema.toolSlugRedirect)
    .where(inArray(schema.toolSlugRedirect.slug, candidates))
  for (const row of redirects) taken.add(row.slug)
  return candidates.filter((slug) => !taken.has(slug))
}

/**
 * Les outils désignés par ces noms, dans l'ordre où ils sont donnés, chacun une fois (« Claude » et
 * « Claude AI » sont un même outil : le premier nom tapé reste). Un nom inconnu devient un « Autre »,
 * créé sans auteur (`created_by` toujours nul : un « Autre » est partagé et n'appartient à personne,
 * relecture sec-A5). `created` : combien de nouveaux « Autre » cette fonction a vraiment insérés.
 *
 * À appeler DANS la transaction qui écrit les outils : si elle échoue, aucun « Autre » ne reste.
 * Les lignes d'« Autre » déjà là sont verrouillées en lecture (`for key share`) : la suppression
 * d'un « Autre » orphelin (`dropOrphanOthers`) les saute au lieu de les effacer sous nos yeux.
 */
export const resolveTools = async (
  tx: Writer,
  names: readonly string[],
): Promise<{ tools: ResolvedTool[]; created: number }> => {
  const entries = names.map((name) => ({ name, folded: foldTool(name) }))
  if (entries.length === 0) return { tools: [], created: 0 }

  const found = new Map<string, ToolRow>()
  // « Chercher par nom replié » : tool.folded est unique (index), un seul outil par nom.
  const load = async (folded: string[]) => {
    for (const row of await tx
      .select()
      .from(schema.tool)
      .where(inArray(schema.tool.folded, folded))
      .for('key share')) {
      found.set(row.folded, row)
    }
  }
  await load(entries.map((entry) => entry.folded))

  // Ensuite les alias : le nom replié d'un alias (« claudeai ») mène à l'outil du catalogue.
  const unmatched = entries.filter((entry) => !found.has(entry.folded)).map((entry) => entry.folded)
  if (unmatched.length > 0) {
    const aliases = await tx
      .select({ alias: schema.toolAlias.folded, tool: schema.tool })
      .from(schema.toolAlias)
      .innerJoin(schema.tool, eq(schema.tool.id, schema.toolAlias.toolId))
      .where(inArray(schema.toolAlias.folded, unmatched))
    for (const row of aliases) found.set(row.alias, row.tool)
  }

  // Les noms sans outil : un nouvel « Autre » chacun, un à la fois (l'adresse de l'un compte pour
  // l'adresse de l'autre).
  let created = 0
  const usedSlugs = new Set<string>()
  for (const entry of entries) {
    if (found.has(entry.folded)) continue
    for (const slug of await freeSlugs(tx, entry.name, usedSlugs)) {
      // `on conflict do nothing` sans cible : si le nom replié OU l'adresse existe déjà (un autre
      // membre vient de le créer), PostgreSQL ne fait rien, sans erreur ni transaction abandonnée.
      const [inserted] = await tx
        .insert(schema.tool)
        .values({
          id: crypto.randomUUID(),
          slug,
          name: entry.name,
          folded: entry.folded,
          status: 'other',
          createdAt: new Date(),
          createdBy: null,
        })
        .onConflictDoNothing()
        .returning()
      if (inserted) {
        found.set(entry.folded, inserted)
        usedSlugs.add(slug)
        created += 1
        break
      }
      // Rien inséré : soit le même nom vient d'être créé par un autre (on le lit), soit l'adresse
      // est prise par un autre nom (on essaie l'adresse suivante).
      await load([entry.folded])
      if (found.has(entry.folded)) break
    }
    if (!found.has(entry.folded)) throw new NoFreeToolSlugError()
  }

  const seen = new Set<string>()
  const tools: ResolvedTool[] = []
  for (const entry of entries) {
    const tool = found.get(entry.folded)
    if (!tool || seen.has(tool.id)) continue
    seen.add(tool.id)
    // Le nom tapé ne se garde que pour un « Autre » (sec-B8) : un outil du catalogue s'affiche
    // sous son propre nom.
    tools.push({ tool, label: tool.status === 'catalogue' ? null : entry.name })
  }
  return { tools, created }
}
