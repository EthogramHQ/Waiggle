// Retrouver la cible d'un signalement (tranche 7a) : un projet, une mise à jour, un commentaire
// ou un profil. Deux lectures :
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
  StoredReportTarget,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'

import { type Blocks, blocksOf } from '../blocks/visibility'
import { sees, viewerOf } from '../comments/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { favoriteToolsOf } from '../profile/tools'
import { toolsOfProjects } from '../projects/load'
import { projectVisibleTo } from '../projects/visibility'
import { photosOfUpdates, readLines, updateShownTo } from '../updates/load'

const p = schema.project
const u = schema.projectUpdate
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

/**
 * Le texte d'une mise à jour sur la page « Signaler » et dans la liste des contenus retirés : son
 * titre (s'il en a un), puis ses lignes, une par ligne de texte.
 */
export const updateText = (title: string | null, lines: { text: string }[]) =>
  [...(title === null || title === '' ? [] : [title]), ...lines.map((line) => line.text)].join('\n')

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
  // Un commentaire lu malgré un blocage (règles 1 et 2) garde le nom de l'auteur, pas son pseudo :
  // l'appli ne propose alors pas « Bloquer aussi » (PUT block répondrait 404 si l'auteur m'a bloqué).
  const separated = blocks.byMe.has(authorId) || blocks.ofMe.has(authorId)
  return {
    id: authorId,
    name: row.name,
    handle: separated ? null : handle,
    isBlocked: blocks.byMe.has(authorId),
  }
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
          demoUrl: p.demoUrl,
        })
        .from(p)
        .where(and(eq(p.id, target.id), projectVisibleTo(viewerId)))
      if (!row) return null
      // R6b : les outils par project_tool (le nom tapé par l'auteur pour un « Autre »), plus par
      // l'ancienne colonne `project.tools`.
      const tools = (await toolsOfProjects(db, [target.id])).get(target.id) ?? []
      // Les images du projet, dans l'ordre de la page (index project_media_project_idx : projet,
      // emplacement, position). Seule leur clé est lue : aucun fichier n'est copié.
      const media = await db
        .select({
          slot: m.slot,
          position: m.position,
          key: m.storageKey,
          description: m.description,
        })
        .from(m)
        // Seules les photos du projet (galerie, couverture verticale) : celles d'une mise à jour
        // ou en attente (jamais publiées) n'entrent pas dans sa copie (relecture de sécurité A8).
        .where(and(eq(m.projectId, target.id), inArray(m.slot, ['gallery', 'portrait'])))
        .orderBy(asc(m.slot), asc(m.position))
      const snapshot: ReportSnapshot = [
        { field: 'title', value: row.title },
        { field: 'pitch', value: row.pitch },
        ...filled('description', row.description),
        ...row.prompts.flatMap((prompt) => filled('prompt', prompt)),
        ...filled('tools', oneLine(tools.map((tool) => tool.label))),
        ...filled('demoUrl', row.demoUrl),
        // Chaque image, suivie de sa description si elle en a une (R6a, jur-J13) : la modération
        // sait ainsi quelle photo est décrite.
        ...media.flatMap((item) => [
          { field: imageField(item), value: item.key },
          ...filled('photoDescription', item.description),
        ]),
      ]
      return {
        authorId: row.authorId,
        projectId: target.id,
        text: projectText(row.title, row.pitch),
        snapshot,
      }
    }
    case 'update': {
      // Une mise à jour se voit avec son projet (projectVisibleTo, blocages compris) ; retirée par la
      // modération, seul l'auteur du projet (qui l'a écrite) la voit (updateShownTo, la règle unique
      // des mises à jour). Clé primaire de project_update, puis clé primaire de project.
      const [row] = await db
        .select({
          authorId: p.authorId,
          projectId: u.projectId,
          title: u.title,
          version: u.version,
          lines: u.lines,
        })
        .from(u)
        .innerJoin(p, eq(p.id, u.projectId))
        .where(
          and(eq(u.id, target.id), projectVisibleTo(viewerId), updateShownTo(p.authorId, viewerId)),
        )
      if (!row) return null
      const lines = readLines(row.lines)
      // Ses photos rattachées, dans l'ordre (index project_media_update_idx) : une photo en attente
      // n'a pas de mise à jour, elle n'y est donc jamais. Chacune est suivie de sa description.
      const photos = (await photosOfUpdates(db, [target.id])).get(target.id) ?? []
      return {
        authorId: row.authorId,
        projectId: row.projectId,
        text: updateText(row.title, lines),
        snapshot: [
          ...filled('title', row.title),
          ...filled('version', row.version),
          ...lines.map((line) => ({ field: 'line' as const, value: line.text })),
          ...photos.flatMap((photo) => [
            { field: 'photo' as const, value: photo.storageKey },
            ...filled('photoDescription', photo.description),
          ]),
        ],
      }
    }
    case 'comment': {
      // Un commentaire se voit sur un projet visible, s'il n'est ni supprimé, ni masqué (sauf pour
      // son auteur et l'auteur du projet), ni retiré (sauf pour son auteur, règle 1 de 7a), ni
      // caché par un blocage : tout cela est `sees`, la règle unique de comments/load.ts, blocages
      // compris (tranche 7b : l'auteur du projet lit tout chez lui, règle 1 ; un commentaire qui me
      // mentionne reste lisible si c'est son auteur qui m'a bloqué, règle 2).
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
      // `viewerOf` traite un projet retiré comme privé : il lui faut donc sa date de retrait. Ses
      // blocages (lus plus haut par blocksOf) et `mentionsViewer` donnent à `sees` les règles 1 et 2.
      const viewer = viewerOf(
        viewerId,
        {
          authorId: row.projectAuthorId,
          visibility: row.visibility,
          removedAt: row.projectRemovedAt,
        },
        blocks,
      )
      if (!sees({ ...row, mentionsViewer: row.mentionsMe }, viewer)) return null
      if (row.removedAt !== null && row.authorId !== viewerId) return null
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
      // R6b : ses outils favoris, par profile_tool, avec le nom qu'il a tapé pour un « Autre ».
      const favoriteTools = (await favoriteToolsOf(db, row.id)).map((tool) => tool.label)
      return {
        authorId: row.id,
        projectId: null,
        text: `${row.name} (@${handle})`,
        snapshot: [
          { field: 'name', value: row.name },
          { field: 'handle', value: handle },
          ...filled('bio', row.bio),
          ...filled('favoriteTools', oneLine(favoriteTools)),
          ...filled('avatar', row.avatarKey),
        ],
      }
    }
  }
}

/**
 * La copie d'une note ou d'un commentaire, ramenée à la forme de la tranche 7b. La tranche 7a ne
 * gardait qu'un texte ; la migration de 7b l'a rangé tel quel sous le champ `text`
 * (`[{ field: 'text', value }]`). Pour une note ou un commentaire, ce texte était **tout** leur
 * contenu (`snapshot: row.body` dans le target.ts de 7a) : il vaut donc la copie 7b
 * `[{ field: 'body', value }]` du même texte (tranche 7c, relecture de sécurité S3).
 *
 * On ne la réécrit que si la copie d'aujourd'hui (`current`) est elle-même une copie de note ou de
 * commentaire : un seul champ, `body`. C'est la seule forme qui n'ait qu'un `body` (loadReportable,
 * plus haut) : un projet commence par `title`, un profil par `name`. Pour eux, 7a n'avait copié
 * qu'une partie (le titre et l'accroche, pas le lien de démo) : leur copie 7a reste telle quelle,
 * et n'est jamais égale à une copie 7b. La file fait la même réécriture en SQL (queue.ts,
 * `snapshotHash`), pour ne pas dire « les copies diffèrent » à tort.
 */
const asSlice7b = (old: ReportSnapshot, current: ReportSnapshot): ReportSnapshot => {
  const [entry] = old
  const noteOrComment = current.length === 1 && current[0]?.field === 'body'
  if (entry && old.length === 1 && entry.field === 'text' && noteOrComment) {
    return [{ field: 'body', value: entry.value }]
  }
  return old
}

/**
 * Deux copies disent-elles la même chose ? Champ par champ, dans l'ordre. Sert à re-signaler
 * (règle 14 : un contenu inchangé depuis l'examen de la modération ne se signale pas de nouveau).
 * `before` est la copie du signalement précédent, peut-être d'avant 7b ; `now`, celle d'aujourd'hui.
 */
export const sameSnapshot = (before: ReportSnapshot, now: ReportSnapshot) => {
  const a = asSlice7b(before, now)
  return (
    a.length === now.length &&
    a.every((entry, i) => entry.field === now[i]?.field && entry.value === now[i]?.value)
  )
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
  target: StoredReportTarget,
): Promise<DecidableTarget | null> => {
  switch (target.kind) {
    case 'project': {
      const [row] = await db
        .select({ authorId: p.authorId, removedAt: p.removedAt })
        .from(p)
        .where(eq(p.id, target.id))
      return row ? { authorId: row.authorId, removed: row.removedAt !== null } : null
    }
    case 'update': {
      // L'auteur d'une mise à jour est celui de son projet.
      const [row] = await db
        .select({ authorId: p.authorId, removedAt: u.removedAt })
        .from(u)
        .innerJoin(p, eq(p.id, u.projectId))
        .where(eq(u.id, target.id))
      return row ? { authorId: row.authorId, removed: row.removedAt !== null } : null
    }
    case 'note':
      // Une note du Journal n'existe plus (R7a, migration 0018) : un ancien signalement ou une
      // ancienne décision la cite encore, et se lit comme une cible disparue (relecture B1).
      return null
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
