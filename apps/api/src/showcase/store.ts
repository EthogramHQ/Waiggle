// La vitrine de l'accueil (tranche R12, plan choix 10) : ce que la base garde et comment elle change.
// La modération range la vitrine d'un geste (la liste entière), l'auteur la quitte (« Retirer de
// l'accueil », un refus gardé dans `project.showcase_declined_at`, relecture juridique du plan,
// décision 18), et l'export de l'auteur la relit. Les cartes montrées aux visiteurs et aux membres
// se construisent dans public/load.ts (`loadShowcase`) ; l'onglet de la modération, ici.
import {
  type ModerationShowcase,
  ProjectStatus,
  SHOWCASE_CANDIDATES_MAX,
  type ShowcaseExport,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
// `Tx` : la transaction que reçoit le rappel de `db.transaction` (même API que `db`).
import type { Tx } from '../moderation/guard'
import { projectAccess } from '../projects/load'
import { visitorVisibleProject } from '../projects/visibility'
import { toCards } from '../public/load'

/**
 * Le verrou de la vitrine entière : deux administrateurs qui la rangent en même temps passent l'un
 * après l'autre. `pg_advisory_xact_lock` prend un verrou « consultatif » (un simple numéro, sans
 * ligne), rendu seul à la fin de la transaction ; `hashtextextended` tire ce numéro d'un nom.
 */
const lockShowcase = (tx: Tx) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('showcase', 0))`)

/**
 * Remplace la vitrine par `projectIds`, dans cet ordre (la première place d'abord). Chaque projet
 * doit être visible d'un visiteur (`web`, non retiré, auteur vérifié) : sinon `not_found`, la même
 * réponse qu'un projet inconnu, pour ne rien dire d'un projet privé. Un projet dont l'auteur a
 * quitté la vitrine : `author_declined`. Dans les deux cas, rien ne change (la transaction n'écrit
 * qu'après les vérifications).
 *
 * Un projet qui y était déjà garde sa date d'entrée (changer l'ordre n'est pas une nouvelle mise en
 * avant) ; un projet qui entre reçoit `now` et une trace d'Activité pour son auteur
 * (`showcase_notice`), sauf si l'administrateur met en avant son propre projet. Un projet absent de
 * la liste en sort.
 */
export const setShowcase = async (
  db: Database,
  adminId: string,
  projectIds: readonly string[],
  now: Date,
): Promise<'ok' | 'not_found' | 'author_declined'> =>
  db.transaction(async (tx) => {
    await lockShowcase(tx)
    // Les projets demandés, par la clé primaire de project. `for share` : un verrou partagé sur ces
    // lignes jusqu'à la fin de la transaction ; l'auteur qui passe son projet hors de « Public » (ou
    // qui quitte la vitrine) attend donc notre fin, puis efface la ligne que nous venons d'écrire.
    // Sans lui, il pourrait passer entre notre lecture et notre écriture, et la vitrine garderait un
    // projet réservé aux membres (la lecture le cacherait, mais la ligne resterait).
    const found =
      projectIds.length === 0
        ? []
        : await tx
            .select({
              id: schema.project.id,
              authorId: schema.project.authorId,
              declinedAt: schema.project.showcaseDeclinedAt,
            })
            .from(schema.project)
            .where(and(inArray(schema.project.id, [...projectIds]), visitorVisibleProject()))
            .for('share', { of: schema.project })
    if (found.length !== projectIds.length) return 'not_found' as const
    if (found.some((project) => project.declinedAt !== null)) return 'author_declined' as const

    // La vitrine d'avant (quatre lignes au plus, lues en entier) : qui y était, et depuis quand.
    const before = new Map(
      (
        await tx
          .select({
            projectId: schema.showcase.projectId,
            addedAt: schema.showcase.addedAt,
            addedBy: schema.showcase.addedBy,
          })
          .from(schema.showcase)
      ).map((row) => [row.projectId, row]),
    )
    // Effacer puis réécrire : l'index unique des places (showcase_position_idx) refuserait deux
    // projets à la même place pendant un échange ligne à ligne ; la transaction rend les deux gestes
    // invisibles l'un sans l'autre.
    await tx.delete(schema.showcase)
    if (projectIds.length > 0) {
      await tx.insert(schema.showcase).values(
        projectIds.map((projectId, index) => {
          const kept = before.get(projectId)
          return {
            projectId,
            position: index + 1,
            addedAt: kept?.addedAt ?? now,
            addedBy: kept ? kept.addedBy : adminId,
          }
        }),
      )
    }
    const authorOf = new Map(found.map((project) => [project.id, project.authorId]))
    const notices = projectIds.flatMap((projectId) => {
      const authorId = authorOf.get(projectId)
      if (before.has(projectId) || authorId === undefined || authorId === adminId) return []
      return [{ id: crypto.randomUUID(), memberId: authorId, projectId, createdAt: now }]
    })
    if (notices.length > 0) await tx.insert(schema.showcaseNotice).values(notices)
    return 'ok' as const
  })

/**
 * L'auteur quitte la vitrine (« Retirer de l'accueil ») : la ligne de la vitrine s'efface, et son
 * refus est gardé (`showcase_declined_at`, la première date seulement) ; une nouvelle mise en avant
 * de ce projet sera refusée. Permis même si le projet n'y est pas (le refus vaut d'avance), même
 * retiré ou pendant une suspension : retirer n'ajoute rien. Un projet inconnu, mal formé, ou privé
 * d'un autre : `not_found` ; le projet visible d'un autre (l'administrateur compris, qui passe par
 * l'onglet) : `forbidden`, la règle commune `projectAccess`.
 */
export const leaveShowcase = async (
  db: Database,
  projectId: string,
  userId: string,
  now: Date,
): Promise<'ok' | 'not_found' | 'forbidden'> => {
  const access = await projectAccess(db, projectId, userId)
  if (access === 'not_found' || access === 'forbidden') return access
  await db.transaction(async (tx) => {
    await tx
      .update(schema.project)
      .set({
        showcaseDeclinedAt: sql`coalesce(${schema.project.showcaseDeclinedAt}, ${now.toISOString()}::timestamptz at time zone 'UTC')`,
        // `updated_at` se met à jour seul à chaque écriture ($onUpdate du schéma) ; le recopier tel
        // quel : quitter la vitrine ne modifie pas le projet (« Mis à jour », « Modifié depuis… »).
        updatedAt: sql`${schema.project.updatedAt}`,
      })
      .where(and(eq(schema.project.id, projectId), eq(schema.project.authorId, userId)))
    await tx.delete(schema.showcase).where(eq(schema.showcase.projectId, projectId))
  })
  return 'ok'
}

/**
 * L'onglet « Vitrine de l'accueil » : la vitrine dans l'ordre, puis les projets publics qui n'y sont
 * pas (les 20 plus récents). Quatre requêtes, quel que soit le nombre de projets :
 * - la vitrine (4 lignes, rangées par showcase_position_idx) jointe au projet et à son auteur par
 *   leurs clés primaires ; seuls les projets encore visibles d'un visiteur (un projet retiré ou
 *   redevenu « Membres » n'y paraît plus, même si sa ligne restait) ;
 * - les candidats, par l'index partiel project_web_published_idx (`web`, non retirés, rangés par
 *   date de publication), sans ceux de la vitrine (clé primaire de showcase) ;
 * - les photos des deux listes, en une requête (toCards : la couverture qu'un visiteur voit).
 * « Modifié depuis la mise en avant » : `updated_at` après l'entrée dans la vitrine. Un projet jamais
 * modifié garde `updated_at = created_at` (posés ensemble par la base à sa création) : on l'écarte,
 * pour ne pas dépendre de l'horloge de la base face à celle de l'API (charte, dates).
 */
export const loadModerationShowcase = async (
  db: Database,
  publicApiUrl: string,
): Promise<ModerationShowcase> => {
  const items = await db
    .select({
      id: schema.project.id,
      title: schema.project.title,
      pitch: schema.project.pitch,
      status: schema.project.status,
      authorId: schema.user.id,
      authorName: schema.user.name,
      position: schema.showcase.position,
      addedAt: schema.showcase.addedAt,
      edited: sql<boolean>`(${schema.project.updatedAt} > ${schema.showcase.addedAt}
        and ${schema.project.updatedAt} <> ${schema.project.createdAt})`,
    })
    .from(schema.showcase)
    .innerJoin(schema.project, eq(schema.project.id, schema.showcase.projectId))
    .innerJoin(schema.user, eq(schema.user.id, schema.project.authorId))
    .where(visitorVisibleProject())
    .orderBy(asc(schema.showcase.position))
  const candidates = await db
    .select({
      id: schema.project.id,
      title: schema.project.title,
      pitch: schema.project.pitch,
      status: schema.project.status,
      authorId: schema.user.id,
      authorName: schema.user.name,
      publishedAt: schema.project.publishedAt,
      createdAt: schema.project.createdAt,
      declinedAt: schema.project.showcaseDeclinedAt,
    })
    .from(schema.project)
    .innerJoin(schema.user, eq(schema.user.id, schema.project.authorId))
    .where(
      and(
        visitorVisibleProject(),
        // Écrit en toutes lettres (`project.id`) : dans une sous-requête, Drizzle peut écrire une
        // colonne sans sa table, et la condition deviendrait constante (charte de l'API).
        sql`(select 1 from showcase s where s.project_id = project.id limit 1) is null`,
      ),
    )
    .orderBy(desc(schema.project.publishedAt), desc(schema.project.id))
    .limit(SHOWCASE_CANDIDATES_MAX)
  const cards = await toCards(db, [...items, ...candidates], publicApiUrl)
  const coverOf = new Map(cards.map((card) => [card.id, card.cover]))
  const projectOf = (row: { id: string; title: string; status: string } & Author) => ({
    id: row.id,
    title: row.title,
    status: ProjectStatus.parse(row.status),
    cover: coverOf.get(row.id) ?? null,
    author: { id: row.authorId, name: row.authorName },
  })
  return {
    items: items.map((row) => ({
      project: projectOf(row),
      position: row.position,
      addedAt: row.addedAt.toISOString(),
      editedSinceAdded: row.edited === true,
    })),
    candidates: candidates.map((row) => ({
      project: projectOf(row),
      // Un projet `web` a toujours une date de publication (l'API la pose) ; repli par prudence.
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      showcaseDeclinedAt: row.declinedAt?.toISOString() ?? null,
    })),
  }
}

type Author = { authorId: string; authorName: string }

/**
 * Pour l'export de l'auteur (droit d'accès) : chacun de ses projets qui est dans la vitrine, ou
 * qu'il en a retiré, des plus anciens aux plus récents (entrée, sinon refus). Jamais
 * l'administrateur qui l'a choisi (`added_by` n'est pas lu). Ses projets par l'index
 * project_author_created_idx, la vitrine par sa clé primaire ; le refus reste après un retour à
 * « Membres » (c'est une colonne du projet).
 */
export const showcaseExportOf = async (db: Database, userId: string): Promise<ShowcaseExport[]> => {
  const rows = await db
    .select({
      projectId: schema.project.id,
      addedAt: schema.showcase.addedAt,
      declinedAt: schema.project.showcaseDeclinedAt,
    })
    .from(schema.project)
    .leftJoin(schema.showcase, eq(schema.showcase.projectId, schema.project.id))
    .where(
      and(
        eq(schema.project.authorId, userId),
        or(isNotNull(schema.showcase.projectId), isNotNull(schema.project.showcaseDeclinedAt)),
      ),
    )
  return rows
    .map((row) => ({
      projectId: row.projectId,
      addedAt: row.addedAt?.toISOString() ?? null,
      declinedAt: row.declinedAt?.toISOString() ?? null,
    }))
    .sort((a, b) =>
      (a.addedAt ?? a.declinedAt ?? '').localeCompare(b.addedAt ?? b.declinedAt ?? ''),
    )
}

/**
 * Un projet retiré par la modération quitte la vitrine dans la transaction du retrait (relecture de
 * sécurité du plan, « effacer la ligne sur chaque sortie ») : rétabli, il n'y revient pas seul.
 */
export const dropFromShowcase = (tx: Tx, projectId: string) =>
  tx.delete(schema.showcase).where(eq(schema.showcase.projectId, projectId))
