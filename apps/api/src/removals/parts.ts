// Les parties d'un contenu retirées seules par la modération (R9, 7d), telles que leur auteur les
// relit (contrat `RemovedPart`) : la page d'un projet, la frise de ses mises à jour, la page d'un
// membre, et le coin des testeurs (appels, messages). Lues dans `content_part_removal`, qui garde la
// valeur sortie de sa colonne (relecture de sécurité P1). Pour tout autre membre : rien, et aucune
// requête ; le contenu se montre alors comme si la partie n'avait jamais été là.
import { type RemovedPart, ReportPartField } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, or, type SQL, sql } from 'drizzle-orm'
import { mediaUrl } from '../profile/me'
import { afterReportSql, toRemoval } from './load'

type Reader = Pick<Database, 'select'>

/** Les sortes de contenu qui peuvent perdre une partie (`content_part_removal.object_kind`). */
export type PartOwnerKind = 'project' | 'update' | 'member' | 'call' | 'message'

/**
 * Un contenu dont on veut les parties retirées : sa sorte, son identifiant (celui du membre pour un
 * profil) et son auteur. Seuls ceux dont le lecteur est l'auteur sont cherchés.
 */
export type PartOwner = {
  kind: PartOwnerKind
  id: string
  authorId: string
  /**
   * Pour un profil seulement : son nom et son pseudo d'aujourd'hui. Donnés, ils font chercher le nom
   * ou le pseudo retiré qui est encore provisoire (`removedIdentityParts`) ; absents, rien de tel.
   */
  current?: { name: string; handle: string }
}

/** La clé d'un contenu dans la carte rendue par `removedPartsOf`. */
export const partOwnerKey = (kind: PartOwnerKind, id: string) => `${kind}:${id}`

/**
 * L'adresse de la photo de profil retirée, pour son auteur seul : `/media/withheld/<id>.webp`, où
 * `<id>` est celui de la ligne de retrait (la clé `withheld/<id>` que la décision a posée sur le
 * profil). routes/media.ts la retrouve par cet identifiant et ne la sert qu'à son auteur.
 */
export const withheldAvatarUrl = (publicApiUrl: string, removalRowId: string) =>
  mediaUrl(publicApiUrl, `withheld/${removalRowId}.webp`)

/** Les colonnes de content_part_removal qui désignent chaque sorte de contenu. */
const cpr = schema.contentPartRemoval
const ownerColumn = {
  project: cpr.projectId,
  update: cpr.updateId,
  call: cpr.callId,
  message: cpr.messageId,
} as const

/** Le contenu d'une ligne de retrait, retrouvé par la colonne remplie. */
const ownerKeyOf = (row: {
  objectKind: string
  authorId: string
  projectId: string | null
  updateId: string | null
  callId: string | null
  messageId: string | null
}): string | null => {
  switch (row.objectKind) {
    case 'member':
      return partOwnerKey('member', row.authorId)
    case 'project':
      return row.projectId && partOwnerKey('project', row.projectId)
    case 'update':
      return row.updateId && partOwnerKey('update', row.updateId)
    case 'call':
      return row.callId && partOwnerKey('call', row.callId)
    case 'message':
      return row.messageId && partOwnerKey('message', row.messageId)
    default:
      return null
  }
}

/**
 * Le nom ou le pseudo retiré d'un membre, tant qu'il est provisoire (R9, DSA art. 17) : le dernier
 * retrait de chacun, si la valeur d'aujourd'hui est encore celle que ce retrait a mise d'office. Un
 * nom ou un pseudo n'a pas de ligne `content_part_removal` : l'ancienne valeur et le fondement sont
 * dans la décision elle-même, d'où cette lecture à part. `value` est l'ancienne valeur, que son seul
 * propriétaire relit.
 *
 * En SQL : select …, exists (…) as after_report from moderation_decision where target_kind =
 * 'member' and target_id = $membre and action = 'remove' and part_field in ('name', 'handle')
 * order by created_at desc, id desc. L'index moderation_decision_target_idx (sorte, cible, date) ne
 * lit que les décisions de ce membre, liées en paramètres ; on garde ensuite, en JS, la plus
 * récente de chaque champ (quelques lignes au plus : un retrait par signalement).
 */
const removedIdentityParts = async (
  db: Reader,
  memberId: string,
  current: { name: string; handle: string },
): Promise<RemovedPart[]> => {
  const d = schema.moderationDecision
  const rows = await db
    .select({
      field: d.partField,
      previousValue: d.previousValue,
      provisionalValue: d.provisionalValue,
      ground: d.ground,
      explanation: d.explanation,
      createdAt: d.createdAt,
      afterReport: afterReportSql({
        id: sql.raw('moderation_decision.id'),
        targetKind: sql.raw('moderation_decision.target_kind'),
        targetId: sql.raw('moderation_decision.target_id'),
        adminId: sql.raw('moderation_decision.admin_id'),
      }),
    })
    .from(d)
    .where(
      and(
        eq(d.targetKind, 'member'),
        eq(d.targetId, memberId),
        eq(d.action, 'remove'),
        inArray(d.partField, ['name', 'handle']),
      ),
    )
    .orderBy(desc(d.createdAt), desc(d.id))
  const parts: RemovedPart[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    // Du plus récent au plus ancien : le premier retrait de chaque champ est le dernier en date.
    if (row.field === null || seen.has(row.field)) continue
    seen.add(row.field)
    const field = ReportPartField.safeParse(row.field)
    const removal = toRemoval(row)
    if (!field.success || removal === null || row.previousValue === null) continue
    // Provisoire : la valeur d'aujourd'hui est encore celle que le retrait a mise (profile/provisional.ts).
    const now = field.data === 'name' ? current.name : current.handle
    if (row.provisionalValue === null || row.provisionalValue !== now) continue
    parts.push({
      field: field.data,
      mediaId: null,
      value: row.previousValue,
      imageUrl: null,
      removal,
    })
  }
  return parts
}

/**
 * Les parties retirées de ces contenus, rangées par `partOwnerKey`, pour le lecteur qui en est
 * l'auteur ; les contenus d'un autre n'y figurent jamais. Une seule requête pour toute la liste, et
 * aucune quand le lecteur n'est l'auteur d'aucun (le cas de presque toutes les pages).
 *
 * En SQL :
 *   select cpr.*, d.ground, d.explanation, d.created_at, exists (…) as after_report
 *   from content_part_removal cpr inner join moderation_decision d on d.id = cpr.removal_id
 *   where cpr.author_id = $viewer and (cpr.project_id in (…) or cpr.update_id in (…) or …)
 *   order by cpr.created_at, cpr.id
 * L'index content_part_removal_author_idx (author_id) donne les quelques retraits en cours de
 * l'auteur ; la décision se lit par sa clé primaire. L'identifiant du lecteur et ceux des contenus
 * entrent comme paramètres liés.
 */
export const removedPartsOf = async (
  db: Reader,
  owners: PartOwner[],
  viewerId: string,
  publicApiUrl: string,
): Promise<Map<string, RemovedPart[]>> => {
  const byOwner = new Map<string, RemovedPart[]>()
  const mine = owners.filter((owner) => owner.authorId === viewerId)
  if (mine.length === 0) return byOwner

  const conditions: SQL[] = []
  if (mine.some((owner) => owner.kind === 'member' && owner.id === viewerId)) {
    conditions.push(eq(cpr.objectKind, 'member'))
  }
  for (const kind of ['project', 'update', 'call', 'message'] as const) {
    const ids = mine.filter((owner) => owner.kind === kind).map((owner) => owner.id)
    if (ids.length > 0) conditions.push(inArray(ownerColumn[kind], ids))
  }
  if (conditions.length === 0) return byOwner

  const d = schema.moderationDecision
  const rows = await db
    .select({
      id: cpr.id,
      objectKind: cpr.objectKind,
      authorId: cpr.authorId,
      projectId: cpr.projectId,
      updateId: cpr.updateId,
      callId: cpr.callId,
      messageId: cpr.messageId,
      field: cpr.field,
      projectMediaId: cpr.projectMediaId,
      testerMediaId: cpr.testerMediaId,
      hiddenValue: cpr.hiddenValue,
      ground: d.ground,
      explanation: d.explanation,
      createdAt: d.createdAt,
      // « Après un signalement » : la règle de removals/load.ts, avec les colonnes de la décision
      // écrites en toutes lettres (dans la sous-requête, une colonne sans le nom de sa table
      // désignerait celle de content_report).
      afterReport: afterReportSql({
        id: sql.raw('moderation_decision.id'),
        targetKind: sql.raw('moderation_decision.target_kind'),
        targetId: sql.raw('moderation_decision.target_id'),
        adminId: sql.raw('moderation_decision.admin_id'),
      }),
    })
    .from(cpr)
    .innerJoin(d, eq(d.id, cpr.removalId))
    .where(and(eq(cpr.authorId, viewerId), or(...conditions)))
    .orderBy(asc(cpr.createdAt), asc(cpr.id))

  for (const row of rows) {
    const key = ownerKeyOf(row)
    const field = ReportPartField.safeParse(row.field)
    const removal = toRemoval(row)
    // Une ligne illisible (champ inconnu, décision sans fondement) ne casse pas la page : écartée.
    if (key === null || !field.success || removal === null) continue
    const hidden = row.hiddenValue
    const isAvatar = field.data === 'avatar'
    const part: RemovedPart = {
      field: field.data,
      mediaId: row.projectMediaId ?? row.testerMediaId,
      // Un texte, une liste, ou null : une photo reste à sa place dans la galerie de l'auteur, et
      // la clé de la photo de profil ne sort jamais (son adresse est `imageUrl`).
      value:
        hidden !== null && 'text' in hidden
          ? hidden.text
          : hidden !== null && 'items' in hidden
            ? hidden.items
            : null,
      imageUrl: isAvatar ? withheldAvatarUrl(publicApiUrl, row.id) : null,
      removal,
    }
    const list = byOwner.get(key) ?? []
    list.push(part)
    byOwner.set(key, list)
  }
  // Le nom et le pseudo retirés de son propre profil, après les autres parties (R9, DSA art. 17).
  const own = mine.find((owner) => owner.kind === 'member' && owner.id === viewerId)
  if (own?.current) {
    const identity = await removedIdentityParts(db, viewerId, own.current)
    if (identity.length > 0) {
      const key = partOwnerKey('member', viewerId)
      byOwner.set(key, [...(byOwner.get(key) ?? []), ...identity])
    }
  }
  return byOwner
}
