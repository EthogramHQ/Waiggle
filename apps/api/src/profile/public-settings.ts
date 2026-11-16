// « Mon profil public » (tranche R12, plan choix 11) : les cinq cases de la page publique d'un membre,
// lues et écrites par lui seul (GET et PATCH /v1/me/public-page, et son export). Ce qu'un visiteur
// voit ensuite est décidé ailleurs, une seule fois (profile/public-page.ts, `publicPageOpen`).
import type { MyPublicPage, PublicPageSettings, PublicPageSettingsPatch } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { isJsonObject } from '../suspension/guard'

/** Les cases d'une page jamais réglée : les valeurs par défaut de la migration 0025. */
const DEFAULTS: PublicPageSettings = {
  publicPage: false,
  showBio: true,
  showFavoriteTools: true,
  showProjects: true,
  showFollowerCount: false,
}

/**
 * Ses cinq cases. Une lecture par la clé primaire de `profile` (`user_id`) ; un membre qui n'a
 * jamais rien réglé n'a pas encore de ligne : les valeurs par défaut.
 */
export const publicSettingsOf = async (db: Database, userId: string) => {
  const [row] = await db
    .select({
      publicPage: schema.profile.publicPage,
      showBio: schema.profile.publicBio,
      showFavoriteTools: schema.profile.publicTools,
      showProjects: schema.profile.publicProjects,
      showFollowerCount: schema.profile.publicFollowerCount,
    })
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
  return row ?? DEFAULTS
}

/**
 * La réponse de GET et PATCH : ses cases, et « 2 sur 4 » (ses projets publics parmi ses projets non
 * retirés, privés compris). Deux nombres en une requête : `count(*) filter (where …)` compte
 * seulement les lignes qui remplissent la condition. Ses projets par l'index
 * project_author_created_idx (author_id en tête).
 */
export const myPublicPage = async (db: Database, userId: string): Promise<MyPublicPage> => {
  const [counts] = await db
    .select({
      web: sql<number>`(count(*) filter (where ${schema.project.visibility} = 'web'))::int`,
      all: sql<number>`count(*)::int`,
    })
    .from(schema.project)
    .where(and(eq(schema.project.authorId, userId), isNull(schema.project.removedAt)))
  return {
    settings: await publicSettingsOf(db, userId),
    webProjectCount: counts?.web ?? 0,
    projectCount: counts?.all ?? 0,
  }
}

/**
 * Écrit les seules cases envoyées. « Upsert » (insert … on conflict do update) : la ligne de
 * `profile` est créée si elle manque, avec les valeurs par défaut pour les cases non envoyées.
 */
export const savePublicSettings = async (
  db: Database,
  userId: string,
  patch: PublicPageSettingsPatch,
) => {
  const set = {
    ...(patch.publicPage !== undefined && { publicPage: patch.publicPage }),
    ...(patch.showBio !== undefined && { publicBio: patch.showBio }),
    ...(patch.showFavoriteTools !== undefined && { publicTools: patch.showFavoriteTools }),
    ...(patch.showProjects !== undefined && { publicProjects: patch.showProjects }),
    ...(patch.showFollowerCount !== undefined && { publicFollowerCount: patch.showFollowerCount }),
  }
  await db
    .insert(schema.profile)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: schema.profile.userId, set })
}

/**
 * Ce qu'un membre suspendu peut encore envoyer (Q6) : fermer sa page, exactement `{ publicPage:
 * false }`. Tout le reste (l'ouvrir, cocher ou décocher une case, même avec la fermeture) reçoit
 * 403 `suspended`. Un corps qui n'est pas un objet JSON passe : le validateur répond 400.
 */
export const suspendedPublicPageChange = (body: unknown) =>
  !isJsonObject(body) ||
  (Object.keys(body).length === 1 && 'publicPage' in body && body.publicPage === false)
