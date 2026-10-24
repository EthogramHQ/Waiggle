// Retrouver la cible d'un signalement (tranche 7a) : un projet, une note, un commentaire ou un
// profil. Deux lectures :
// - pour un membre qui signale (POST /v1/reports, GET /v1/reports/target) : seulement ce qu'il voit,
//   avec les règles de visibilité des autres lectures (projects/visibility.ts, comments/load.ts) ;
//   tout le reste, inconnu, privé, retiré, masqué, supprimé ou caché par un blocage, donne « rien »,
//   et la route répond le même 404 ;
// - pour un administrateur qui décide (POST /v1/moderation/decisions) : la cible telle qu'elle est
//   en base, qu'elle soit visible ou non, pour savoir qui en est l'auteur et si elle est retirée.
//
// Tranche 7b : la copie devient complète, un champ par entrée, nommé comme au registre des entrées
// (moderation/inputs.ts) ; une image n'y est que sa clé de stockage, jamais le fichier (règle 15).
// Et le blocage : un contenu d'un membre bloqué avec moi, dans un sens ou l'autre, est introuvable,
// sauf trois cas de la relecture du plan (précision 2, règles 1 et 2, plus bas).
import type {
  MemberInputField,
  ReportSnapshot,
  ReportTarget,
  ReportTargetPreview,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, isNull, or, type SQL, sql } from 'drizzle-orm'

import { type Blocks, blocksOf } from '../blocks/visibility'
import { sees, type Viewer, viewerOf } from '../comments/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { projectVisibleTo } from '../projects/visibility'

const p = schema.project
const n = schema.projectNote
const c = schema.projectComment
const m = schema.projectMedia

/** Ce qu'on sait d'une cible que le membre voit. */
export type Reportable = {
  /** L'auteur du contenu, ou le membre visé : on ne signale pas ce qui est à soi. */
  authorId: string
  /** Le projet de la cible, pour le lien « Voir » ; null pour un profil. */
  projectId: string | null
  /** Le texte montré sur la page « Signaler » (ReportTargetPreview.text). */
  text: string
  /** La copie gardée dans le signalement (règle 7 : lue ici, jamais envoyée par l'appli). */
  snapshot: ReportSnapshot
  /** L'auteur, pour « Bloquer aussi @x » après l'envoi ; `isBlocked` : je l'ai déjà bloqué. */
  author: ReportTargetPreview['author']
}

/** Le texte d'un projet : son titre, puis son pitch. */
const projectText = (title: string, pitch: string) => `${title}\n\n${pitch}`

/** Une liste (outils) tient sur une ligne de la copie, séparée par « , » (contrat). */
const oneLine = (values: string[]) => values.join(', ')

/**
 * Les champs facultatifs n'entrent dans la copie que s'ils sont remplis : une description vide ou
 * un lien absent n'ont rien à montrer à la modération. Le titre, le pitch, le nom, le pseudo et le
 * texte d'une note ou d'un commentaire sont toujours là.
 */
const filled = (field: MemberInputField, value: string | null | undefined): ReportSnapshot =>
  value === null || value === undefined || value === '' ? [] : [{ field, value }]

/**
 * Une image d'un projet, nommée comme au registre : la couverture (la première photo de la
 * galerie, ou la couverture verticale), ou une autre photo.
 */
const imageField = (media: { slot: string; position: number }): MemberInputField =>
  media.slot === 'portrait' || media.position === 0 ? 'cover' : 'photo'

/**
 * Le blocage laisse-t-il ce membre lire ce commentaire ? Après les règles de `sees` (masqué,
 * retiré, projet privé), qui restent celles de comments/load.ts :
 * - le sien : toujours ;
 * - règle 1 (B1) : l'auteur du projet garde la modération de son espace, quel que soit le blocage ;
 * - je l'ai bloqué (un double blocage se lit ainsi) : non ;
 * - règle 2 (B2) : il m'a bloqué, seulement si le commentaire me mentionne (écrit avant le blocage :
 *   la victime peut encore le signaler) ;
 * - aucun blocage : oui.
 */
const blockLetsSee = (authorId: string, viewer: Viewer, blocks: Blocks, mentionsMe: boolean) => {
  if (authorId === viewer.id || viewer.isProjectAuthor) return true
  if (blocks.byMe.has(authorId)) return false
  if (blocks.ofMe.has(authorId)) return mentionsMe
  return true
}

/**
 * Le nom et le pseudo actuel de l'auteur, pour l'aperçu (une requête par la clé primaire de user,
 * et l'index member_handle_current_idx). Un compte d'avant les pseudos reçoit le sien ici, comme
 * sur sa page ; null s'il n'existe plus.
 */
const authorOf = async (
  db: Database,
  authorId: string,
  blocks: Blocks,
): Promise<Reportable['author'] | null> => {
  const [row] = await db
    .select({ name: schema.user.name, handle: schema.memberHandle.handle })
    .from(schema.user)
    .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
    .where(eq(schema.user.id, authorId))
  if (!row) return null
  const handle = row.handle ?? (await ensureHandle(db, authorId))
  if (handle === null) return null
  return { id: authorId, name: row.name, handle, isBlocked: blocks.byMe.has(authorId) }
}

/**
 * La cible, telle que ce membre la voit, ou null s'il ne la voit pas. L'identifiant a déjà été
 * validé selon sa sorte (ReportTarget) : chaque requête est servie par une clé primaire. Un nombre
 * fixe de requêtes : les blocages du membre, la cible, ses images (projet), son auteur.
 */
export const loadReportable = async (
  db: Database,
  viewerId: string,
  target: ReportTarget,
): Promise<Reportable | null> => {
  // Les blocages posés par ce membre et ceux qui le visent, en une requête (blocks/visibility.ts) :
  // les règles propres au signalement (précision 2, règles 1 et 2) se lisent ensuite en JavaScript.
  const blocks = await blocksOf(db, viewerId)
  const found = await loadVisible(db, viewerId, target, blocks)
  if (!found) return null
  const author = await authorOf(db, found.authorId, blocks)
  if (!author) return null
  return { ...found, author }
}

const loadVisible = async (
  db: Database,
  viewerId: string,
  target: ReportTarget,
  blocks: Blocks,
): Promise<Omit<Reportable, 'author'> | null> => {
  switch (target.kind) {
    case 'project': {
      // Public et non retiré, ou l'un des siens (projectVisibleTo) : la règle de la page du projet,
      // qui écarte depuis 7b le projet d'un membre bloqué avec moi, dans un sens ou l'autre.
      const [row] = await db
        .select({
          authorId: p.authorId,
          title: p.title,
          pitch: p.pitch,
          description: p.description,
          prompts: p.prompts,
          tools: p.tools,
          demoUrl: p.demoUrl,
        })
        .from(p)
        .where(and(eq(p.id, target.id), projectVisibleTo(viewerId)))
      if (!row) return null
      // Les images du projet, dans l'ordre de la page (index project_media_project_idx : projet,
      // emplacement, position). Seule leur clé est lue : aucun fichier n'est copié.
      const media = await db
        .select({ slot: m.slot, position: m.position, key: m.storageKey })
        .from(m)
        .where(eq(m.projectId, target.id))
        .orderBy(asc(m.slot), asc(m.position))
      const snapshot: ReportSnapshot = [
        { field: 'title', value: row.title },
        { field: 'pitch', value: row.pitch },
        ...filled('description', row.description),
        ...row.prompts.flatMap((prompt) => filled('prompt', prompt)),
        ...filled('tools', oneLine(row.tools)),
        ...filled('demoUrl', row.demoUrl),
        ...media.map((item) => ({ field: imageField(item), value: item.key })),
      ]
      return {
        authorId: row.authorId,
        projectId: target.id,
        text: projectText(row.title, row.pitch),
        snapshot,
      }
    }
    case 'note': {
      // Une note se voit avec son projet ; retirée, seul l'auteur du projet (qui l'a écrite) la voit.
      const [row] = await db
        .select({ authorId: p.authorId, projectId: n.projectId, body: n.body })
        .from(n)
        .innerJoin(p, eq(p.id, n.projectId))
        .where(
          and(
            eq(n.id, target.id),
            projectVisibleTo(viewerId),
            or(isNull(n.removedAt), eq(p.authorId, viewerId)),
          ),
        )
      if (!row) return null
      return {
        authorId: row.authorId,
        projectId: row.projectId,
        text: row.body,
        snapshot: [{ field: 'body', value: row.body }],
      }
    }
    case 'comment': {
      // Un commentaire se voit sur un projet visible, s'il n'est ni supprimé, ni masqué (sauf pour
      // son auteur et l'auteur du projet : `sees`, la règle unique de comments/load.ts), ni retiré
      // (sauf pour son auteur, règle 1 de 7a), ni caché par un blocage (blockLetsSee).
      // `mentionsMe` : « exists (select 1 …) » est vrai dès qu'une ligne existe ; la clé primaire
      // de comment_mention (comment_id, member_id) y répond sans rien lire d'autre.
      const cm = schema.commentMention
      const [row] = await db
        .select({
          authorId: c.authorId,
          hiddenAt: c.hiddenAt,
          removedAt: c.removedAt,
          body: c.body,
          projectId: c.projectId,
          projectAuthorId: p.authorId,
          visibility: p.visibility,
          projectRemovedAt: p.removedAt,
          mentionsMe: sql<boolean>`exists (select 1 from ${cm} where ${cm.commentId} = ${c.id} and ${cm.memberId} = ${viewerId})`,
        })
        .from(c)
        .innerJoin(p, eq(p.id, c.projectId))
        .where(and(eq(c.id, target.id), isNull(c.deletedAt), projectVisibleTo(viewerId)))
      if (!row || row.authorId === null) return null
      // `viewerOf` traite un projet retiré comme privé : il lui faut donc sa date de retrait.
      const viewer = viewerOf(viewerId, {
        authorId: row.projectAuthorId,
        visibility: row.visibility,
        removedAt: row.projectRemovedAt,
      })
      if (!sees(row, viewer)) return null
      if (row.removedAt !== null && row.authorId !== viewerId) return null
      if (!blockLetsSee(row.authorId, viewer, blocks, row.mentionsMe)) return null
      return {
        authorId: row.authorId,
        projectId: row.projectId,
        text: row.body,
        snapshot: [{ field: 'body', value: row.body }],
      }
    }
    case 'member': {
      // Un profil se voit comme sa page (routes/members.ts) : un compte vérifié, avec son pseudo
      // actuel. Seules les colonnes publiques sont lues (ni l'e-mail, ni la langue).
      const [row] = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          handle: schema.memberHandle.handle,
          bio: schema.profile.bio,
          favoriteTools: schema.profile.favoriteTools,
          avatarKey: schema.profile.avatarKey,
        })
        .from(schema.user)
        .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
        .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
        .where(and(eq(schema.user.id, target.id), eq(schema.user.emailVerified, true)))
      if (!row) return null
      // Précision 2 : qui a bloqué voit encore l'en-tête de la page, et peut signaler le profil ;
      // qui est bloqué reçoit le 404 d'un membre inconnu. Un double blocage se lit « je l'ai
      // bloqué », comme sur la page.
      if (blocks.ofMe.has(row.id) && !blocks.byMe.has(row.id)) return null
      const handle = row.handle ?? (await ensureHandle(db, row.id))
      if (handle === null) return null
      return {
        authorId: row.id,
        projectId: null,
        text: `${row.name} (@${handle})`,
        snapshot: [
          { field: 'name', value: row.name },
          { field: 'handle', value: handle },
          ...filled('bio', row.bio),
          ...filled('favoriteTools', oneLine(row.favoriteTools ?? [])),
          ...filled('avatar', row.avatarKey),
        ],
      }
    }
  }
}

/**
 * Deux copies disent-elles la même chose ? Champ par champ, dans l'ordre. Sert à re-signaler
 * (règle 14 : un contenu inchangé depuis l'examen de la modération ne se signale pas de nouveau).
 */
export const sameSnapshot = (a: ReportSnapshot, b: ReportSnapshot) =>
  a.length === b.length &&
  a.every((entry, i) => entry.field === b[i]?.field && entry.value === b[i]?.value)

/** Une cible vue par l'administrateur : son auteur, et si elle est retirée. */
export type DecidableTarget = { authorId: string | null; removed: boolean }

/**
 * La cible telle qu'elle est en base, visible ou non, ou null si elle n'existe plus (supprimée par
 * son auteur, compte supprimé). Un commentaire supprimé alors qu'il avait des réponses (« Commentaire
 * supprimé », deleted_at) compte comme disparu : son texte n'existe plus.
 */
export const loadDecidable = async (
  db: Pick<Database, 'select'>,
  target: ReportTarget,
): Promise<DecidableTarget | null> => {
  switch (target.kind) {
    case 'project': {
      const [row] = await db
        .select({ authorId: p.authorId, removedAt: p.removedAt })
        .from(p)
        .where(eq(p.id, target.id))
      return row ? { authorId: row.authorId, removed: row.removedAt !== null } : null
    }
    case 'note': {
      const [row] = await db
        .select({ authorId: p.authorId, removedAt: n.removedAt })
        .from(n)
        .innerJoin(p, eq(p.id, n.projectId))
        .where(eq(n.id, target.id))
      return row ? { authorId: row.authorId, removed: row.removedAt !== null } : null
    }
    case 'comment': {
      const [row] = await db
        .select({ authorId: c.authorId, removedAt: c.removedAt })
        .from(c)
        .where(and(eq(c.id, target.id), isNull(c.deletedAt)))
      return row ? { authorId: row.authorId, removed: row.removedAt !== null } : null
    }
    case 'member': {
      const [row] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, target.id))
      return row ? { authorId: row.id, removed: false } : null
    }
  }
}

/**
 * L'identifiant d'une cible de contenu, en uuid, pour le comparer à la clé primaire de sa table
 * (et profiter de son index). target_id est un texte, car l'id d'un membre n'est pas un uuid ; un
 * « ::uuid » sur l'id d'un membre ferait échouer la requête. `case when` ne calcule la conversion
 * que pour les sortes qui ont un uuid (PostgreSQL garantit cet ordre pour une expression non
 * constante) ; pour un profil, l'expression vaut null, qui n'est égal à rien.
 *
 * `alias` est le nom de la table des signalements ou des décisions dans la requête (« r », « d ») :
 * un nom écrit dans le code, jamais une donnée reçue, d'où sql.raw (du texte SQL tel quel).
 */
export const targetUuid = (alias: string): SQL =>
  sql.raw(`(case when ${alias}.target_kind <> 'member' then ${alias}.target_id::uuid end)`)
