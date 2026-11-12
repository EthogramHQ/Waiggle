// Les écritures de l'administration du catalogue (tranche R6b, plan B3) : créer, admettre, modifier,
// rattacher et écarter un outil, ranger un projet classé « Autre », créer une catégorie. Les routes
// (routes/moderation-catalogue.ts) vérifient le rôle, le quota et la forme des demandes ; ce
// fichier applique les règles, chacune dans une transaction qui écrit aussi sa ligne du journal
// « Changements récents » (`catalogue_change`) : l'écriture et sa trace réussissent ou échouent
// ensemble. Les lectures des pages sont dans catalogue/pages.ts.
import {
  type CategoryCreate,
  foldForSearch,
  foldTool,
  OTHER_CATEGORY,
  type ToolAdmit,
  type ToolEdit,
  toolSlug,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Tx } from '../moderation/guard'
import { categoriesExist } from '../projects/categories'
import { listedVerifiedProject } from '../projects/visibility'
import { NoFreeToolSlugError } from '../tools/resolve'

/** Ce que fait une écriture : réussie (avec ce qu'elle rend), ou refusée avec un code d'erreur. */
type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E }

const t = schema.tool

/** Combien d'adresses (« -2 », « -3 »…) on essaie pour un outil : une borne, jamais sans fin. */
const SLUG_ATTEMPTS = 50

/**
 * Un verrou « consultatif » de PostgreSQL (voir moderation/guard.ts) tenu jusqu'à la fin de la
 * transaction : deux administrateurs qui nomment un outil (ou créent une catégorie) au même moment
 * passent l'un après l'autre, et le second voit le nom écrit par le premier. Le texte n'entre que
 * comme paramètre lié.
 */
const lock = (tx: Tx, key: 'catalogue-names' | 'catalogue-categories') =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)

/**
 * Une erreur de la base « valeur déjà prise » (23505, un index unique) : un membre a créé un
 * « Autre » de ce nom entre notre vérification et notre écriture (il ne prend pas notre verrou).
 * Drizzle range l'erreur de la base dans `cause`.
 */
export const isUniqueViolation = (error: unknown) => {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  return [codeOf(error), error instanceof Error ? codeOf(error.cause) : undefined].includes('23505')
}

/** Écrit la ligne du journal d'une écriture réussie, dans sa transaction. */
const journal = (
  tx: Tx,
  line: {
    action: typeof schema.catalogueChange.$inferInsert.action
    adminId: string
    now: Date
    toolId?: string
    mergedName?: string
    categoryCode?: string
    projectId?: string
    fromCategory?: string
  },
) =>
  tx.insert(schema.catalogueChange).values({
    id: crypto.randomUUID(),
    action: line.action,
    adminId: line.adminId,
    toolId: line.toolId ?? null,
    mergedName: line.mergedName ?? null,
    categoryCode: line.categoryCode ?? null,
    projectId: line.projectId ?? null,
    fromCategory: line.fromCategory ?? null,
    createdAt: line.now,
  })

// ─── Les notifications du catalogue (R8) ─────────────────────────────────────────────────────────
//
// Les seules notifications qui s'écrivent (`catalogue_notice`) : le geste de l'administrateur ne
// laisse aucune autre trace lisible par l'auteur (après un rattachement, le nom tapé est effacé).
// Elles s'écrivent dans la transaction du geste : le geste et sa notification réussissent ou
// échouent ensemble. Jamais pour l'administrateur lui-même ; jamais d'e-mail (notifications/load.ts
// ne les donne qu'à l'écran et à la cloche). Un auteur qui a bloqué l'administrateur est prévenu
// quand même : la notification est signée par l'équipe, jamais par l'administrateur.

/**
 * Prévient les auteurs des projets qui citent l'« Autre » `otherId`, une seule fois chacun quel que
 * soit le nombre de ses projets, avec le nom tel qu'il l'avait tapé. À appeler AVANT d'effacer
 * `project_tool.label` (admettre, rattacher) : c'est la seule trace de ce nom. `noticeToolId` est
 * l'outil que la notification nomme : l'« Autre » lui-même pour une admission, l'outil cible pour
 * un rattachement (l'« Autre » va être effacé).
 *
 * Seuls les projets comptent, pas les profils (« Mes outils préférés ») ; et seulement ceux que
 * les membres voient (publics, pas retirés, auteur vérifié) : un outil cité seulement sur un projet
 * privé ou retiré ne prévient pas, comme le rangement d'un tel projet est impossible.
 *
 * Deux requêtes, quel que soit le nombre de projets :
 * 1. « select distinct on (author_id) … order by author_id, created_at » : une ligne par auteur,
 *    celle de son plus ancien projet qui cite l'outil (le nom qu'il a tapé la première fois).
 *    `project_tool_tool_idx` (tool_id) donne les projets de l'outil, puis la clé primaire de
 *    `project` chaque projet. `coalesce` : le nom de l'« Autre » si la ligne n'a pas de nom tapé.
 * 2. une seule insertion de toutes les lignes (aucune si personne n'est à prévenir).
 */
const noticeToolAuthors = async (
  tx: Tx,
  notice: {
    otherId: string
    noticeToolId: string
    kind: 'tool_added' | 'tool_merged'
    adminId: string
    now: Date
  },
) => {
  const p = schema.project
  const pt = schema.projectTool
  const authors = await tx
    .selectDistinctOn([p.authorId], {
      memberId: p.authorId,
      typedName: sql<string>`coalesce(${pt.label}, ${t.name})`,
    })
    .from(pt)
    .innerJoin(p, eq(p.id, pt.projectId))
    .innerJoin(t, eq(t.id, pt.toolId))
    .where(
      and(eq(pt.toolId, notice.otherId), listedVerifiedProject(), ne(p.authorId, notice.adminId)),
    )
    .orderBy(p.authorId, asc(p.createdAt))
  if (authors.length === 0) return
  await tx.insert(schema.catalogueNotice).values(
    authors.map((author) => ({
      id: crypto.randomUUID(),
      memberId: author.memberId,
      kind: notice.kind,
      toolId: notice.noticeToolId,
      typedName: author.typedName,
      createdAt: notice.now,
    })),
  )
}

// ─── Les noms et les adresses des outils ─────────────────────────────────────────────────────────

/**
 * Vrai si ce nom replié est déjà celui d'un autre outil, ou un alias d'un autre outil (relecture de
 * sécurité sec-A3 : l'unicité vaut pour `tool ∪ tool_alias`, que la base ne sait pas vérifier seule).
 * Deux lectures d'une ligne : l'index unique de `tool.folded`, la clé primaire de `tool_alias`.
 * Un alias de l'outil lui-même ne compte pas : renommer « Claude » en « Claude AI » est permis.
 */
const nameTaken = async (tx: Tx, folded: string, toolId: string | null) => {
  const [tool] = await tx
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.folded, folded), toolId === null ? undefined : ne(t.id, toolId)))
  if (tool) return true
  const [alias] = await tx
    .select({ toolId: schema.toolAlias.toolId })
    .from(schema.toolAlias)
    .where(eq(schema.toolAlias.folded, folded))
  return alias !== undefined && alias.toolId !== toolId
}

/**
 * Les adresses libres pour ce nom, dans l'ordre : `toolSlug(nom)`, puis « -2 », « -3 »… Une adresse
 * est prise si un autre outil la porte, ou si elle mène déjà à un autre outil (`tool_slug_redirect`,
 * décision 2 : jamais une redirection égale à l'adresse d'un outil). Deux requêtes « in (…) », sur
 * l'index unique de `tool.slug` et la clé primaire des redirections.
 */
const freeSlugs = async (tx: Tx, name: string, toolId: string | null) => {
  const base = toolSlug(name)
  const candidates = [base, ...Array.from({ length: SLUG_ATTEMPTS }, (_, i) => `${base}-${i + 2}`)]
  const taken = new Set<string>()
  for (const row of await tx
    .select({ slug: t.slug, id: t.id })
    .from(t)
    .where(inArray(t.slug, candidates))) {
    if (row.id !== toolId) taken.add(row.slug)
  }
  for (const row of await tx
    .select({ slug: schema.toolSlugRedirect.slug, toolId: schema.toolSlugRedirect.toolId })
    .from(schema.toolSlugRedirect)
    .where(inArray(schema.toolSlugRedirect.slug, candidates))) {
    if (row.toolId !== toolId) taken.add(row.slug)
  }
  return candidates.filter((slug) => !taken.has(slug))
}

/**
 * La nouvelle adresse d'un outil renommé, ou la sienne si le nom donne la même. Une ancienne
 * adresse de ce même outil redevient la sienne : sa redirection s'efface (une adresse n'est jamais
 * à la fois celle d'un outil et une redirection).
 */
const slugAfterRename = async (
  tx: Tx,
  tool: { id: string; slug: string; name: string },
  name: string,
) => {
  if (toolSlug(name) === toolSlug(tool.name)) return tool.slug
  const [slug] = await freeSlugs(tx, name, tool.id)
  // Les 51 adresses prises : la même erreur que pour un nouvel « Autre » (sec-B4), que la route
  // change en 400 traduit ; la transaction annulée n'écrit rien.
  if (slug === undefined) throw new NoFreeToolSlugError()
  await tx.delete(schema.toolSlugRedirect).where(eq(schema.toolSlugRedirect.slug, slug))
  return slug
}

/**
 * Le site tel qu'on le range : le contrat (`ToolSiteUrl`) rend l'adresse normalisée par `URL`, qui
 * ajoute une barre finale à une adresse sans chemin (« https://claude.ai/ »). On la retire dans ce
 * seul cas, pour garder l'adresse telle que l'administrateur l'a écrite (« https://claude.ai ») ;
 * un chemin (« …/docs/ ») reste intact.
 */
export const storedSiteUrl = (siteUrl: string | null) => {
  if (siteUrl === null) return null
  return new URL(siteUrl).pathname === '/' && siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
}

/** Les champs du catalogue tels que la base les range (les descriptions et le site). */
const catalogueFields = (input: ToolEdit) => ({
  ...(input.family !== undefined && { family: input.family }),
  ...(input.descriptionFr !== undefined && { descriptionFr: input.descriptionFr }),
  ...(input.descriptionEn !== undefined && { descriptionEn: input.descriptionEn }),
  ...(input.siteUrl !== undefined && { siteUrl: storedSiteUrl(input.siteUrl) }),
})

// ─── Créer, admettre, modifier ───────────────────────────────────────────────────────────────────

/**
 * Crée un outil du catalogue (POST /v1/moderation/tools). Rend son identifiant ; la route relit
 * ensuite l'outil hors de la transaction (sous PGlite, une lecture par `db` pendant une transaction
 * attendrait sans fin).
 */
export const createTool = async (
  db: Database,
  adminId: string,
  input: ToolAdmit,
  now: Date,
): Promise<Result<string, 'tool_name_taken'>> => {
  const folded = foldTool(input.name)
  return db.transaction(async (tx) => {
    await lock(tx, 'catalogue-names')
    if (await nameTaken(tx, folded, null)) return { ok: false, error: 'tool_name_taken' }
    for (const slug of await freeSlugs(tx, input.name, null)) {
      // `on conflict do nothing` : si un membre vient de créer un « Autre » de ce nom ou de cette
      // adresse, rien n'est écrit, sans erreur ni transaction abandonnée ; on regarde lequel.
      const [created] = await tx
        .insert(t)
        .values({
          id: crypto.randomUUID(),
          slug,
          name: input.name,
          folded,
          status: 'catalogue',
          family: input.family,
          descriptionFr: input.descriptionFr,
          descriptionEn: input.descriptionEn,
          siteUrl: storedSiteUrl(input.siteUrl),
          createdAt: now,
          createdBy: adminId,
          admittedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: t.id })
      if (created) {
        await journal(tx, { action: 'tool_create', adminId, now, toolId: created.id })
        return { ok: true, value: created.id }
      }
      if (await nameTaken(tx, folded, null)) return { ok: false, error: 'tool_name_taken' }
    }
    throw new NoFreeToolSlugError()
  })
}

/**
 * Fait entrer un « Autre » au catalogue (POST /v1/moderation/tools/{slug}/admit) : son nom (corrigé
 * s'il le faut), sa famille, ses descriptions, son site. Le nom tapé par les membres devient un
 * alias s'il diffère : qui le tape de nouveau obtient l'outil du catalogue. Les projets et profils
 * qui le citent l'affichent désormais sous le nom du catalogue (`label` remis à null, sec-B8).
 * Un « Autre » écarté peut encore être admis (l'administrateur change d'avis).
 */
export const admitTool = async (
  db: Database,
  adminId: string,
  slug: string,
  input: ToolAdmit,
  now: Date,
): Promise<Result<string, 'not_found' | 'already_decided' | 'tool_name_taken'>> =>
  db.transaction(async (tx) => {
    await lock(tx, 'catalogue-names')
    // `for update` : la ligne reste à nous jusqu'à la fin ; un rattachement simultané attend.
    const [tool] = await tx.select().from(t).where(eq(t.slug, slug)).for('update')
    if (!tool) return { ok: false, error: 'not_found' }
    if (tool.status === 'catalogue') return { ok: false, error: 'already_decided' }
    const folded = foldTool(input.name)
    if (await nameTaken(tx, folded, tool.id)) return { ok: false, error: 'tool_name_taken' }
    const newSlug = await slugAfterRename(tx, tool, input.name)
    await tx
      .update(t)
      .set({
        name: input.name,
        folded,
        slug: newSlug,
        status: 'catalogue',
        ...catalogueFields(input),
        admittedAt: now,
      })
      .where(eq(t.id, tool.id))
    if (folded !== tool.folded) {
      await tx.insert(schema.toolAlias).values({ folded: tool.folded, toolId: tool.id })
    }
    // R8 : les auteurs sont prévenus avant que le nom tapé ne s'efface (juste en dessous).
    await noticeToolAuthors(tx, {
      otherId: tool.id,
      noticeToolId: tool.id,
      kind: 'tool_added',
      adminId,
      now,
    })
    await tx
      .update(schema.projectTool)
      .set({ label: null })
      .where(eq(schema.projectTool.toolId, tool.id))
    await tx
      .update(schema.profileTool)
      .set({ label: null })
      .where(eq(schema.profileTool.toolId, tool.id))
    await journal(tx, { action: 'tool_admit', adminId, now, toolId: tool.id })
    return { ok: true, value: tool.id }
  })

/**
 * Modifie un outil du catalogue (PATCH /v1/moderation/tools/{slug}). Un « Autre » n'a rien à
 * modifier : 404 (décision 13). Renommé, l'outil garde son ancien nom comme alias (qui tape
 * « Mistral » trouve toujours l'outil), et son ancienne adresse mène à la nouvelle.
 */
export const editTool = async (
  db: Database,
  adminId: string,
  slug: string,
  input: ToolEdit,
  now: Date,
): Promise<Result<string, 'not_found' | 'tool_name_taken'>> =>
  db.transaction(async (tx) => {
    await lock(tx, 'catalogue-names')
    const [tool] = await tx
      .select()
      .from(t)
      .where(and(eq(t.slug, slug), eq(t.status, 'catalogue')))
      .for('update')
    if (!tool) return { ok: false, error: 'not_found' }
    let renamed = {}
    if (input.name !== undefined && input.name !== tool.name) {
      const folded = foldTool(input.name)
      if (await nameTaken(tx, folded, tool.id)) return { ok: false, error: 'tool_name_taken' }
      const newSlug = await slugAfterRename(tx, tool, input.name)
      if (folded !== tool.folded) {
        // Le nouveau nom était peut-être un alias de cet outil : il redevient son nom, et l'ancien
        // nom devient l'alias.
        await tx.delete(schema.toolAlias).where(eq(schema.toolAlias.folded, folded))
        await tx.insert(schema.toolAlias).values({ folded: tool.folded, toolId: tool.id })
      }
      if (newSlug !== tool.slug) {
        await tx.insert(schema.toolSlugRedirect).values({ slug: tool.slug, toolId: tool.id })
      }
      renamed = { name: input.name, folded, slug: newSlug }
    }
    await tx
      .update(t)
      .set({ ...renamed, ...catalogueFields(input) })
      .where(eq(t.id, tool.id))
    await journal(tx, { action: 'tool_edit', adminId, now, toolId: tool.id })
    return { ok: true, value: tool.id }
  })

// ─── Rattacher, écarter ──────────────────────────────────────────────────────────────────────────

/**
 * Ce que changera un rattachement (GET …/impact, jur-T5) : combien de projets (privés compris) et
 * de profils citent cet « Autre ». Deux « count » sur les index `project_tool_tool_idx` et
 * `profile_tool_tool_idx`. null : pas un « Autre » (outil du catalogue ou inconnu).
 */
export const toolImpact = async (db: Database, slug: string) => {
  const [tool] = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.slug, slug), ne(t.status, 'catalogue')))
  if (!tool) return null
  const [projects] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.projectTool)
    .where(eq(schema.projectTool.toolId, tool.id))
  const [profiles] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.profileTool)
    .where(eq(schema.profileTool.toolId, tool.id))
  return { projects: projects?.n ?? 0, profiles: profiles?.n ?? 0 }
}

/**
 * Rattache un « Autre » à un outil du catalogue (POST …/merge) : chaque projet et chaque profil qui
 * le citent citent désormais l'outil, sans doublon, à la place la plus haute des deux ; son nom
 * devient un alias de l'outil, son adresse y mène, et l'« Autre » est effacé. Jamais depuis un
 * outil du catalogue ni vers un « Autre » : 404 (décision 13). Les deux lignes `tool` sont prises
 * `for update` : un membre qui cite l'« Autre » au même moment attend la fin du rattachement.
 */
export const mergeTool = async (
  db: Database,
  adminId: string,
  slug: string,
  into: string,
  now: Date,
): Promise<Result<null, 'not_found'>> =>
  db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(t)
      .where(and(eq(t.slug, slug), ne(t.status, 'catalogue')))
      .for('update')
    const [target] = await tx
      .select()
      .from(t)
      .where(and(eq(t.slug, into), eq(t.status, 'catalogue')))
      .for('update')
    if (!source || !target) return { ok: false, error: 'not_found' }
    // R8 : les auteurs sont prévenus d'abord, tant que les projets citent encore l'« Autre » avec le
    // nom tapé ; la notification nomme l'outil cible, qui reste.
    await noticeToolAuthors(tx, {
      otherId: source.id,
      noticeToolId: target.id,
      kind: 'tool_merged',
      adminId,
      now,
    })
    // Trois requêtes par table, quel que soit le nombre de projets (sur la clé primaire et l'index
    // `*_tool_tool_idx`) :
    // 1. là où les deux outils sont cités, l'outil prend la place de l'« Autre » si elle est plus
    //    haute (« update … from » : une mise à jour qui lit une autre ligne de la même table) ;
    // 2. puis la ligne de l'« Autre » s'efface ;
    // 3. ailleurs, la ligne de l'« Autre » devient celle de l'outil (sans nom tapé : sec-B8).
    for (const [table, owner] of [
      ['project_tool', 'project_id'],
      ['profile_tool', 'user_id'],
    ] as const) {
      const name = sql.raw(table)
      const key = sql.raw(owner)
      await tx.execute(sql`
        update ${name} as kept set position = moved.position
        from ${name} as moved
        where moved.tool_id = ${source.id} and kept.tool_id = ${target.id}
          and kept.${key} = moved.${key} and moved.position < kept.position`)
      await tx.execute(sql`
        delete from ${name} as moved
        where moved.tool_id = ${source.id}
          and exists (select 1 from ${name} as kept
            where kept.tool_id = ${target.id} and kept.${key} = moved.${key})`)
      await tx.execute(sql`
        update ${name} set tool_id = ${target.id}, label = null where tool_id = ${source.id}`)
    }
    // Le nom et l'adresse de l'« Autre » mènent désormais à l'outil. `on conflict do nothing` :
    // une adresse déjà redirigée ne change pas.
    await tx
      .insert(schema.toolAlias)
      .values({ folded: source.folded, toolId: target.id })
      .onConflictDoNothing()
    await tx
      .insert(schema.toolSlugRedirect)
      .values({ slug: source.slug, toolId: target.id })
      .onConflictDoNothing()
    await journal(tx, {
      action: 'tool_merge',
      adminId,
      now,
      toolId: target.id,
      mergedName: source.name,
    })
    await tx.delete(t).where(eq(t.id, source.id))
    return { ok: true, value: null }
  })

/**
 * Laisse un « Autre » hors du catalogue (POST …/dismiss, décision 8) : il sort de « À vérifier », de
 * « Pas encore dans le catalogue » et du récap, et reste en texte simple sur ses projets. Retapé
 * par un membre, il reste écarté (même nom replié). Il n'est jamais effacé comme orphelin
 * (`dropOrphanOthers` n'efface que le statut `other`) : sinon le nom reviendrait « à vérifier ».
 * Déjà écarté : 409 (un double clic). Outil du catalogue ou inconnu : 404.
 */
export const dismissTool = async (
  db: Database,
  adminId: string,
  slug: string,
  now: Date,
): Promise<Result<null, 'not_found' | 'already_decided'>> =>
  db.transaction(async (tx) => {
    const [tool] = await tx
      .select({ id: t.id, status: t.status })
      .from(t)
      .where(and(eq(t.slug, slug), ne(t.status, 'catalogue')))
      .for('update')
    if (!tool) return { ok: false, error: 'not_found' }
    if (tool.status === 'dismissed') return { ok: false, error: 'already_decided' }
    await tx.update(t).set({ status: 'dismissed' }).where(eq(t.id, tool.id))
    await journal(tx, { action: 'tool_dismiss', adminId, now, toolId: tool.id })
    return { ok: true, value: null }
  })

// ─── Ranger un projet ────────────────────────────────────────────────────────────────────────────

/**
 * Les catégories d'un projet après un rangement : « Autre » remplacée par `category` à sa place ;
 * si l'autre place porte déjà `category`, « Autre » est seulement retirée (la seconde remonte
 * alors en principale) ; la seconde devient nulle si elle égale la principale. Une fonction pure.
 */
export const sortedCategories = (
  primary: string | null,
  secondary: string | null,
  category: string,
): { primary: string | null; secondary: string | null } => {
  let first = primary
  let second = secondary
  if (first === OTHER_CATEGORY) {
    first = category
    if (second === category) second = null
  } else if (second === OTHER_CATEGORY) {
    second = first === category ? null : category
  }
  return { primary: first, secondary: second === first ? null : second }
}

/**
 * Range un projet classé « Autre » (POST /v1/moderation/projects/{id}/category). Un projet que les
 * membres ne voient pas (privé, retiré, inconnu, auteur non vérifié) : le même 404 (décision 1).
 * Son propre projet : 403 (décision 7). Un projet sans « Autre » : 409 (ranger ne sert jamais à
 * sanctionner). La date de modification du projet ne change pas : ce n'est pas son auteur qui l'a
 * modifié.
 */
export const recategorize = async (
  db: Database,
  adminId: string,
  projectId: string,
  category: string,
  now: Date,
): Promise<Result<null, 'not_found' | 'own_project' | 'unknown_category' | 'already_decided'>> =>
  db.transaction(async (tx) => {
    const p = schema.project
    const [project] = await tx
      .select({
        authorId: p.authorId,
        primary: p.primaryCategory,
        secondary: p.secondaryCategory,
        updatedAt: p.updatedAt,
      })
      .from(p)
      .where(and(eq(p.id, projectId), listedVerifiedProject()))
      .for('update')
    if (!project) return { ok: false, error: 'not_found' }
    if (project.authorId === adminId) return { ok: false, error: 'own_project' }
    if (!(await categoriesExist(tx, [category]))) return { ok: false, error: 'unknown_category' }
    if (project.primary !== OTHER_CATEGORY && project.secondary !== OTHER_CATEGORY) {
      return { ok: false, error: 'already_decided' }
    }
    const next = sortedCategories(project.primary, project.secondary, category)
    await tx
      .update(p)
      .set({
        primaryCategory: next.primary,
        secondaryCategory: next.secondary,
        updatedAt: project.updatedAt,
      })
      .where(eq(p.id, projectId))
    await journal(tx, {
      action: 'project_recategorize',
      adminId,
      now,
      projectId,
      categoryCode: category,
      fromCategory: OTHER_CATEGORY,
    })
    // R8 : l'auteur est prévenu (son propre projet a déjà été refusé plus haut : la condition le
    // redit, un administrateur n'est jamais prévenu de ses propres gestes).
    if (project.authorId !== adminId) {
      await tx.insert(schema.catalogueNotice).values({
        id: crypto.randomUUID(),
        memberId: project.authorId,
        kind: 'project_category',
        projectId,
        categoryCode: category,
        createdAt: now,
      })
    }
    return { ok: true, value: null }
  })

// ─── Créer une catégorie ─────────────────────────────────────────────────────────────────────────

/** La longueur maximale d'un code de catégorie (contrat : `CategoryCode`). */
const CODE_MAX = 40

/**
 * Le code d'une catégorie, tiré de son nom français (décision 3) : sans accents (NFKD), en
 * minuscules, chaque suite de caractères hors de `[a-z0-9]` changée en un tiret. Un nom sans lettre
 * latine (« Ракеты ») prend les numéros Unicode de ses caractères (« u420-u430-… »), comme
 * `toolSlug` : le code n'est jamais vide.
 */
export const categoryCode = (name: string) => {
  const trim = (code: string) => code.slice(0, CODE_MAX).replace(/^-+|-+$/g, '')
  const latin = trim(
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
  )
  if (latin) return latin
  return trim(Array.from(name.trim(), (char) => `u${char.codePointAt(0)?.toString(16)}`).join('-'))
}

/** Un nom de catégorie comparé sans majuscules ni accents (« CUISINE » et « Cuisine »). */
const foldName = (name: string) => foldForSearch(name.trim())

/**
 * Crée une catégorie (POST /v1/moderation/categories), juste avant « Autre », qui reste la
 * dernière. Refus 409 `category_name_taken` : un nom (français ou anglais) déjà porté par une
 * catégorie, dans l'une ou l'autre langue, sans compter majuscules et accents ; ou un code déjà
 * pris, `other` compris (réservé). La table est petite (une vingtaine de lignes) : on la lit
 * entière, sous un verrou qui fait passer deux créations l'une après l'autre.
 */
export const createCategory = async (
  db: Database,
  adminId: string,
  input: CategoryCreate,
  now: Date,
): Promise<Result<string, 'category_name_taken'>> =>
  db.transaction(async (tx) => {
    await lock(tx, 'catalogue-categories')
    const c = schema.category
    const all = await tx
      .select({ code: c.code, nameFr: c.nameFr, nameEn: c.nameEn, position: c.position })
      .from(c)
    const names = new Set(all.flatMap((row) => [foldName(row.nameFr), foldName(row.nameEn)]))
    const code = categoryCode(input.nameFr)
    if (
      names.has(foldName(input.nameFr)) ||
      names.has(foldName(input.nameEn)) ||
      code === OTHER_CATEGORY ||
      all.some((row) => row.code === code)
    ) {
      return { ok: false, error: 'category_name_taken' }
    }
    // La nouvelle prend la place d'« Autre », qui recule d'un cran (et ce qui la suivrait).
    const other = all.find((row) => row.code === OTHER_CATEGORY)
    const position = other?.position ?? Math.max(0, ...all.map((row) => row.position)) + 1
    await tx
      .update(c)
      .set({ position: sql`${c.position} + 1` })
      .where(sql`${c.position} >= ${position}`)
    await tx.insert(c).values({
      code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      icon: input.icon,
      position,
      createdAt: now,
      createdBy: adminId,
    })
    await journal(tx, { action: 'category_create', adminId, now, categoryCode: code })
    return { ok: true, value: code }
  })
