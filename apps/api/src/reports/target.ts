// Retrouver la cible d'un signalement (tranche 6d) : un projet, une note, un commentaire ou un
// profil. Deux lectures :
// - pour un membre qui signale (POST /v1/reports, GET /v1/reports/target) : seulement ce qu'il voit,
//   avec les règles de visibilité des autres lectures (projects/visibility.ts, comments/load.ts) ;
//   tout le reste, inconnu, privé, retiré, masqué ou supprimé, donne « rien », et la route répond
//   le même 404 ;
// - pour un administrateur qui décide (POST /v1/moderation/decisions) : la cible telle qu'elle est
//   en base, qu'elle soit visible ou non, pour savoir qui en est l'auteur et si elle est retirée.
import type { ReportTarget } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm'

import { sees, viewerOf } from '../comments/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { projectVisibleTo } from '../projects/visibility'

const p = schema.project
const n = schema.projectNote
const c = schema.projectComment

/** Ce qu'on sait d'une cible que le membre voit. */
export type Reportable = {
  /** L'auteur du contenu, ou le membre visé : on ne signale pas ce qui est à soi. */
  authorId: string
  /** Le projet de la cible, pour le lien « Voir » ; null pour un profil. */
  projectId: string | null
  /** Le texte montré sur la page « Signaler » (ReportTargetPreview.text). */
  text: string
  /** Le texte copié dans le signalement (règle 7 : lu ici, jamais envoyé par l'appli). */
  snapshot: string
}

/** Le texte d'un projet : son titre, puis son pitch. */
const projectText = (title: string, pitch: string) => `${title}\n\n${pitch}`

/**
 * La cible, telle que ce membre la voit, ou null s'il ne la voit pas. L'identifiant a déjà été
 * validé selon sa sorte (ReportTarget) : chaque requête est servie par une clé primaire.
 */
export const loadReportable = async (
  db: Database,
  viewerId: string,
  target: ReportTarget,
): Promise<Reportable | null> => {
  switch (target.kind) {
    case 'project': {
      // Public et non retiré, ou l'un des siens (projectVisibleTo) : la règle de la page du projet.
      const [row] = await db
        .select({ authorId: p.authorId, title: p.title, pitch: p.pitch })
        .from(p)
        .where(and(eq(p.id, target.id), projectVisibleTo(viewerId)))
      if (!row) return null
      const text = projectText(row.title, row.pitch)
      return { authorId: row.authorId, projectId: target.id, text, snapshot: text }
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
        snapshot: row.body,
      }
    }
    case 'comment': {
      // Un commentaire se voit sur un projet visible, s'il n'est ni supprimé, ni masqué (sauf pour
      // son auteur et l'auteur du projet : `sees`, la règle unique de comments/load.ts), ni retiré
      // (sauf pour son auteur, règle 1).
      const [row] = await db
        .select({
          authorId: c.authorId,
          hiddenAt: c.hiddenAt,
          removedAt: c.removedAt,
          body: c.body,
          projectId: c.projectId,
          projectAuthorId: p.authorId,
          visibility: p.visibility,
        })
        .from(c)
        .innerJoin(p, eq(p.id, c.projectId))
        .where(and(eq(c.id, target.id), isNull(c.deletedAt), projectVisibleTo(viewerId)))
      if (!row || row.authorId === null) return null
      const viewer = viewerOf(viewerId, {
        authorId: row.projectAuthorId,
        visibility: row.visibility,
      })
      if (!sees(row, viewer)) return null
      if (row.removedAt !== null && row.authorId !== viewerId) return null
      return {
        authorId: row.authorId,
        projectId: row.projectId,
        text: row.body,
        snapshot: row.body,
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
        })
        .from(schema.user)
        .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
        .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
        .where(and(eq(schema.user.id, target.id), eq(schema.user.emailVerified, true)))
      if (!row) return null
      const handle = row.handle ?? (await ensureHandle(db, row.id))
      if (handle === null) return null
      const text = `${row.name} (@${handle})`
      const bio = row.bio ?? ''
      return {
        authorId: row.id,
        projectId: null,
        text,
        snapshot: bio === '' ? text : `${text}\n\n${bio}`,
      }
    }
  }
}

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
