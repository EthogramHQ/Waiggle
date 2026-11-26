// Le profil du membre tel que l'appli le voit (contrat `Me`), lu dans la base.
// Il rassemble trois tables : `user` (géré par Better Auth), `profile` (bio, outils, avatar) et
// `member_handle` (le pseudo, tranche 6a). Depuis R20, il dit aussi sa place chez les Éclaireuses
// (`scout`, lue dans `scout` et `scout_program`).
import { type Me, type MeScout, weekOf } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { defaultLanguage, type Language, supportedLanguages } from '@ruche/i18n'
import { and, count, eq, isNull } from 'drizzle-orm'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { rulesStateOf } from '../rules/acceptance'
import { activeScout } from '../scouts/join'
import { loadActiveSuspension } from '../suspension/load'
import { provisionalOf } from './provisional'
import { favoriteToolsOf } from './tools'

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)

/** Adresse publique d'un fichier stocké, servie par la route /media/… de l'API. */
export const mediaUrl = (publicApiUrl: string, key: string) => `${publicApiUrl}/media/${key}`

/**
 * L'adresse de la photo de profil d'un membre, ou null : pas de photo, ou une photo retirée par la
 * modération (R9). Une photo retirée garde sur le profil la clé `withheld/<id>` (moderation/parts.ts) :
 * elle ne paraît plus nulle part à sa place, pas même pour son auteur, qui la relit dans
 * `removedParts` de sa page (removals/parts.ts). Toute lecture qui montre la photo d'un membre passe
 * par ici, pour qu'aucune n'écrive l'adresse `withheld/…`.
 */
export const avatarUrlOf = (publicApiUrl: string, key: string | null | undefined) =>
  key && !key.startsWith('withheld/') ? mediaUrl(publicApiUrl, key) : null

/**
 * Lit le membre, son profil et son pseudo actuel en une requête. `leftJoin` = « avec son profil
 * s'il en a un » : un membre tout juste inscrit n'a pas encore de ligne dans `profile`. Le pseudo
 * suit l'index partiel member_handle_current_idx (voir handles/load.ts).
 *
 * Un membre vérifié qui n'a pas encore de pseudo (un compte d'avant la tranche 6a, que le
 * rattrapage du démarrage n'aurait pas vu) en reçoit un ici, en filet. Un compte jamais vérifié
 * n'a pas de profil : null, comme un membre inconnu.
 */
export const loadMe = async (
  db: Database,
  userId: string,
  publicApiUrl: string,
): Promise<Me | null> => {
  const [row] = await db
    .select({
      user: schema.user,
      profile: schema.profile,
      handle: schema.memberHandle.handle,
      adminSince: schema.adminMember.grantedAt,
    })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
    // Administrateur (tranche 7a) : une ligne de admin_member, non révoquée. Lue à chaque fois,
    // dans la même requête (la clé primaire de admin_member) : un rôle retiré se voit aussitôt.
    .leftJoin(
      schema.adminMember,
      and(eq(schema.adminMember.userId, schema.user.id), isNull(schema.adminMember.revokedAt)),
    )
    .where(eq(schema.user.id, userId))
  if (!row) return null

  const { user, profile } = row
  const handle = row.handle ?? (user.emailVerified ? await ensureHandle(db, user.id) : null)
  if (handle === null) return null
  // Tranche 7c : sa suspension en cours, ou null. La règle « active » est celle de
  // suspension/load.ts (S10), à l'heure de l'API ; une requête de plus, par l'index unique partiel
  // account_suspension_open_idx (une ligne au plus). Le membre y lit la fin, le fondement et
  // l'explication, jamais l'administrateur qui a décidé.
  const suspension = (await loadActiveSuspension(db, user.id, new Date()))?.suspension ?? null
  return {
    id: user.id,
    name: user.name,
    handle,
    email: user.email,
    emailVerified: user.emailVerified,
    language: isLanguage(user.language) ? user.language : defaultLanguage,
    createdAt: user.createdAt.toISOString(), // le JSON ne connaît pas les dates : on les écrit en texte
    bio: profile?.bio ?? '',
    // R6b : lus par profile_tool ; « Mon profil » montre les noms que le membre a tapés.
    favoriteTools: (await favoriteToolsOf(db, user.id)).map((tool) => tool.label),
    avatarUrl: avatarUrlOf(publicApiUrl, profile?.avatarKey),
    // Seulement pour que l'appli montre l'entrée « Modération » : les routes de modération relisent
    // elles-mêmes admin_member à chaque demande, sans croire l'appli. Un administrateur suspendu
    // n'en est plus un tant que dure sa suspension (S19, reports/admin.ts) : l'entrée disparaît.
    isAdmin: row.adminSince !== null && suspension === null,
    suspension,
    // R9 (7d) : le nom ou le pseudo mis d'office par la modération, tant qu'il n'en a pas choisi
    // d'autre (profile/provisional.ts) ; une requête de plus, par l'index des décisions d'une cible.
    provisional: await provisionalOf(db, user.id, { name: user.name, handle }),
    // R10 : « Ne pas me proposer aux autres ».
    hideFromSuggestions: profile?.hideFromSuggestions ?? false,
    // R11 : la version des règles en vigueur acceptée ou non, et « Ce qui change » sinon ; une
    // requête de plus, par la clé primaire de rules_acceptance (rules/acceptance.ts).
    ...(await rulesStateOf(db, user.id)),
    // R20 : sa place chez les Éclaireuses, ou null s'il ne l'a jamais été.
    scout: await meScoutOf(db, user.id, new Date()),
  }
}

/**
 * R20 (plan, choix 4 ; relecture juridique J1) : `Me.scout`. Null pour qui n'a jamais été
 * Éclaireuse ; une retirée garde son état, avec sa date de retrait (ses réglages disent « Retirée
 * le … » et mènent à « Mes retours »). `active` : ni retirée, ni mois fini. `missionsLeft` : les
 * missions de la semaine auxquelles elle n'a pas encore répondu, 0 si elle n'est pas active.
 *
 * Une requête pour l'état (activeScout : la ligne par sa clé primaire, jointe au mois), et une de
 * plus pour une Éclaireuse active seulement : les missions de la semaine (index unique
 * scout_mission_week_position_idx, `week` en tête), chacune cherchée dans scout_mission_done par sa
 * clé primaire (member_id, mission_id). « left join … is null » garde celles qui n'y sont pas.
 */
const meScoutOf = async (db: Database, userId: string, now: Date): Promise<MeScout | null> => {
  const state = await activeScout(db, userId, now)
  if (state.kind === 'none') return null
  const done = schema.scoutMissionDone
  const missionsLeft =
    state.kind !== 'active'
      ? 0
      : ((
          await db
            .select({ left: count() })
            .from(schema.scoutMission)
            .leftJoin(
              done,
              and(eq(done.missionId, schema.scoutMission.id), eq(done.memberId, userId)),
            )
            .where(and(eq(schema.scoutMission.week, weekOf(now)), isNull(done.memberId)))
        )[0]?.left ?? 0)
  return {
    active: state.kind === 'active',
    joinedAt: state.scout.joinedAt.toISOString(),
    removedAt: state.scout.removedAt?.toISOString() ?? null,
    showDrop: state.scout.showDrop,
    programEndsAt: state.program?.endsAt.toISOString() ?? null,
    missionsLeft,
  }
}
