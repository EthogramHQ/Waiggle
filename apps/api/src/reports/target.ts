// Retrouver la cible d'un signalement (tranche 7a) : un projet, une mise à jour, un commentaire,
// un profil, et depuis R7b un appel à tester ou un message d'un fil de testeur. Deux lectures :
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
//
// R9 (7d) : on signale aussi une PARTIE (« La 2e photo », la description, la bio). La lecture donne
// donc aussi les parties présentes sur la page, dans l'ordre de la feuille (REPORTABLE_PARTS), chacune
// avec la copie qu'en garde son signalement (ce seul champ), et le rappel de tête de la feuille
// (`head`). Une photo retirée par la modération n'est plus sur la page des autres : elle n'est ni une
// partie, ni dans la copie, et la photo suivante devient la couverture.
import {
  type MemberInputField,
  type ReportPartField,
  type ReportSnapshot,
  type ReportTarget,
  type ReportTargetPreview,
  type StoredReportTarget,
  Thumbhash,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import { rgbaToThumbHash } from 'thumbhash'

import { type Blocks, blocksOf } from '../blocks/visibility'
import { sees, viewerOf } from '../comments/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { mediaUrl } from '../profile/me'
import { favoriteToolsOf } from '../profile/tools'
import { toolsOfProjects } from '../projects/load'
import { projectVisibleTo } from '../projects/visibility'
import { type MediaRow, toVisual } from '../projects/visual'
import { cornerAccess } from '../testers/access'
import { photosOfUpdates, readLines, updateShownTo } from '../updates/load'
import { isActiveAdmin } from './admin'

const p = schema.project
const u = schema.projectUpdate
const c = schema.projectComment
const m = schema.projectMedia
// Le coin des testeurs (R7b) : les appels, les messages d'un fil et leurs images.
const tc = schema.testerCall
const tmsg = schema.testerMessage
const tm = schema.testerMedia

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
  /** R9 : le rappel en tête de la feuille, sans le nom de l'auteur (pris dans `author`). */
  head: Omit<ReportTargetPreview['head'], 'authorName'>
  /** R9 : les parties présentes sur la page, dans l'ordre de la feuille. */
  parts: ReportablePart[]
}

/** Une miniature : l'adresse de l'image et son résumé flou (contrat ProjectVisual). */
type Thumb = { url: string; thumbhash: string }

/**
 * R9 : une partie qu'on peut signaler, telle que la feuille la propose (sa photo, son rang à partir
 * de 1, sa miniature), avec la copie que garde un signalement de cette seule partie.
 */
export type ReportablePart = {
  field: ReportPartField
  mediaId: string | null
  position: number | null
  thumb: Thumb | null
  copy: ReportSnapshot
}

/** Une partie de texte : ni photo, ni rang, ni miniature. */
const textPart = (field: ReportPartField, copy: ReportSnapshot): ReportablePart => ({
  field,
  mediaId: null,
  position: null,
  thumb: null,
  copy,
})

/**
 * Une photo de profil n'a pas de résumé flou en base, mais le contrat en demande un pour chaque
 * miniature : un gris clair uni, calculé une fois au chargement, qui ne montre rien de la photo.
 */
const NEUTRAL_THUMBHASH = Thumbhash.parse(
  Buffer.from(
    rgbaToThumbHash(
      4,
      4,
      Uint8Array.from({ length: 4 * 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 224)),
    ),
  ).toString('base64'),
)

/** La miniature d'une photo d'un projet ou d'une mise à jour. */
const thumbOf = (media: MediaRow, publicApiUrl: string): Thumb => {
  const { url, thumbhash } = toVisual(media, publicApiUrl)
  return { url, thumbhash }
}

/**
 * Une photo de la page est-elle visible des autres ? Retirée seule par la modération (R9), elle ne
 * l'est plus (`removal_id`). Le prédicat commun de toutes les lectures viendra de
 * projects/media-visibility.ts ; la règle est la même.
 */
const shownMedia = <T extends { removalId: string | null }>(rows: T[]) =>
  rows.filter((row) => row.removalId === null)

/**
 * La couverture visible d'un projet, pour la tête de la feuille d'un contenu qui y vit (mise à
 * jour, commentaire, appel, message) : sa première photo visible, sinon sa couverture verticale.
 * Index project_media_project_idx (projet, emplacement, position).
 */
const projectCover = async (
  db: Database,
  projectId: string,
  publicApiUrl: string,
): Promise<Thumb | null> => {
  const rows = await db
    .select()
    .from(m)
    .where(
      and(
        eq(m.projectId, projectId),
        inArray(m.slot, ['gallery', 'portrait']),
        isNull(m.removalId),
      ),
    )
    .orderBy(asc(m.slot), asc(m.position))
  const cover = rows.find((row) => row.slot === 'gallery') ?? rows[0]
  return cover ? thumbOf(cover, publicApiUrl) : null
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

/** La photo d'un appel ou la capture d'un message du coin (R7b), seule partie qu'ils ont (R9). */
const testerPhotoPart = (
  photo: { id: string; key: string; thumbhash: string },
  copy: ReportSnapshot,
  publicApiUrl: string,
): ReportablePart => ({
  field: 'photo',
  mediaId: photo.id,
  position: 1,
  thumb: { url: mediaUrl(publicApiUrl, photo.key), thumbhash: Thumbhash.parse(photo.thumbhash) },
  copy,
})

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
    // R9 : un administrateur en fonction ne se bloque pas ; l'appli ne propose donc pas « Bloquer aussi ».
    isAdmin: await isActiveAdmin(db, authorId, new Date()),
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
  publicApiUrl: string,
): Promise<Reportable | null> => {
  // Les blocages posés par ce membre et ceux qui le visent, en une requête (blocks/visibility.ts) :
  // les règles propres au signalement (précision 2, règles 1 et 2) se lisent ensuite en JavaScript.
  const blocks = await blocksOf(db, viewerId)
  const found = await loadVisible(db, viewerId, target, blocks, publicApiUrl)
  if (!found) return null
  const author = await authorOf(db, found.authorId, blocks)
  if (!author) return null
  return { ...found, author }
}

/**
 * R9 : la partie demandée parmi celles de la page, ou null si elle n'y est pas (un prompt sur un
 * projet qui n'en a pas, une photo d'un autre contenu, une photo retirée) : la route répond alors
 * le 404 d'un contenu inconnu. Une couverture se cherche aussi par sa photo.
 */
export const findPart = (
  found: Pick<Reportable, 'parts'>,
  part: { field: ReportPartField; mediaId?: string | undefined },
) =>
  found.parts.find(
    (candidate) =>
      candidate.field === part.field && candidate.mediaId === (part.mediaId?.toLowerCase() ?? null),
  ) ?? null

const loadVisible = async (
  db: Database,
  viewerId: string,
  target: ReportTarget,
  blocks: Blocks,
  publicApiUrl: string,
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
          primaryCategory: p.primaryCategory,
          secondaryCategory: p.secondaryCategory,
        })
        .from(p)
        .where(and(eq(p.id, target.id), projectVisibleTo(viewerId)))
      if (!row) return null
      // R6b : les outils par project_tool (le nom tapé par l'auteur pour un « Autre »), plus par
      // l'ancienne colonne `project.tools`.
      const tools = (await toolsOfProjects(db, [target.id])).get(target.id) ?? []
      // Les images du projet, dans l'ordre de la page (index project_media_project_idx : projet,
      // emplacement, position). Seule leur clé est copiée : aucun fichier ne l'est.
      const media = shownMedia(
        await db
          .select()
          .from(m)
          // Seules les photos du projet (galerie, couverture verticale) : celles d'une mise à jour
          // ou en attente (jamais publiées) n'entrent pas dans sa copie (relecture de sécurité A8).
          .where(and(eq(m.projectId, target.id), inArray(m.slot, ['gallery', 'portrait'])))
          .orderBy(asc(m.slot), asc(m.position)),
      )
      const gallery = media.filter((item) => item.slot === 'gallery')
      const portrait = media.find((item) => item.slot === 'portrait')
      // La couverture est la 1re photo visible de la galerie ; la couverture verticale (téléphone)
      // en est une aussi (une seule partie « cover », chacune par sa photo).
      const covers = [...gallery.slice(0, 1), ...(portrait ? [portrait] : [])]
      // Le rang d'une photo dans la galerie visible, à partir de 1 ; null pour la verticale.
      const rankOf = (item: MediaRow) =>
        item.slot === 'gallery' ? gallery.indexOf(item) + 1 : null
      const photoPart = (field: ReportPartField, item: MediaRow, copy: ReportSnapshot) => ({
        field,
        mediaId: item.id,
        position: rankOf(item),
        thumb: thumbOf(item, publicApiUrl),
        copy,
      })
      const toolLine = filled('tools', oneLine(tools.map((tool) => tool.label)))
      const promptLines = row.prompts.flatMap((prompt) => filled('prompt', prompt))
      // La catégorie n'est pas une saisie du registre : sa copie est un texte (`text`), ses codes.
      const categories = [row.primaryCategory, row.secondaryCategory].filter(
        (code): code is string => code !== null,
      )
      // Chaque image, suivie de sa description si elle en a une (R6a, jur-J13) : la modération
      // sait ainsi quelle photo est décrite.
      const imageCopy = (item: MediaRow): ReportSnapshot => [
        { field: covers.includes(item) ? 'cover' : 'photo', value: item.storageKey },
        ...filled('photoDescription', item.description),
      ]
      const snapshot: ReportSnapshot = [
        { field: 'title', value: row.title },
        { field: 'pitch', value: row.pitch },
        ...filled('description', row.description),
        ...promptLines,
        ...toolLine,
        ...filled('demoUrl', row.demoUrl),
        ...media.flatMap(imageCopy),
      ]
      // L'ordre de la feuille (REPORTABLE_PARTS), les photos par rang ; seulement ce qui est là.
      const parts: ReportablePart[] = [
        textPart('title', [{ field: 'title', value: row.title }]),
        textPart('pitch', [{ field: 'pitch', value: row.pitch }]),
        ...(row.description === ''
          ? []
          : [textPart('description', filled('description', row.description))]),
        ...(categories.length === 0
          ? []
          : [textPart('category', [{ field: 'text', value: categories.join(', ') }])]),
        ...(toolLine.length === 0 ? [] : [textPart('tools', toolLine)]),
        ...(row.demoUrl ? [textPart('demoUrl', filled('demoUrl', row.demoUrl))] : []),
        ...covers.map((item) =>
          photoPart('cover', item, [{ field: 'cover', value: item.storageKey }]),
        ),
        ...gallery.map((item) =>
          photoPart(
            'photo',
            item,
            imageCopy(item).map((entry) =>
              entry.field === 'cover' ? { ...entry, field: 'photo' as const } : entry,
            ),
          ),
        ),
        ...media
          .filter((item) => item.description !== null && item.description !== '')
          .map((item) =>
            photoPart('photoDescription', item, filled('photoDescription', item.description)),
          ),
        ...(promptLines.length === 0 ? [] : [textPart('prompt', promptLines)]),
      ]
      const head = gallery[0] ?? portrait
      return {
        authorId: row.authorId,
        projectId: target.id,
        text: projectText(row.title, row.pitch),
        snapshot,
        head: { title: row.title, image: head ? thumbOf(head, publicApiUrl) : null },
        parts,
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
      // R9 : une photo retirée seule n'y est plus.
      const photos = shownMedia((await photosOfUpdates(db, [target.id])).get(target.id) ?? [])
      const textCopy: ReportSnapshot = [
        ...filled('title', row.title),
        ...filled('version', row.version),
        ...lines.map((line) => ({ field: 'line' as const, value: line.text })),
      ]
      const photoCopy = (photo: MediaRow): ReportSnapshot => [
        { field: 'photo', value: photo.storageKey },
        ...filled('photoDescription', photo.description),
      ]
      return {
        authorId: row.authorId,
        projectId: row.projectId,
        text: updateText(row.title, lines),
        snapshot: [...textCopy, ...photos.flatMap(photoCopy)],
        head: {
          title: row.title === null || row.title === '' ? null : row.title,
          image: await projectCover(db, row.projectId, publicApiUrl),
        },
        parts: [
          textPart('text', textCopy),
          ...photos.map((photo, i) => ({
            field: 'photo' as const,
            mediaId: photo.id,
            position: i + 1,
            thumb: thumbOf(photo, publicApiUrl),
            copy: photoCopy(photo),
          })),
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
        // Un commentaire se signale en entier : il n'a pas de parties, ni de titre.
        head: { title: null, image: await projectCover(db, row.projectId, publicApiUrl) },
        parts: [],
      }
    }
    case 'call': {
      // R7b : un appel à tester ne se voit que de ses testeurs actuels (et de son auteur) : la règle
      // d'entrée du coin (cornerAccess) l'écarte pour un ancien testeur, un testeur retiré ou séparé
      // de l'auteur par un blocage, un coin fermé (projet privé, retiré, auteur suspendu) et tout
      // autre membre. Un appel retiré par la modération ne se voit plus que de son auteur (comme une
      // mise à jour). Clé primaire de tester_call, puis de project.
      const [row] = await db
        .select({
          authorId: p.authorId,
          projectId: tc.projectId,
          text: tc.text,
          removedAt: tc.removedAt,
        })
        .from(tc)
        .innerJoin(p, eq(p.id, tc.projectId))
        .where(eq(tc.id, target.id))
      if (!row) return null
      const access = await cornerAccess(db, row.projectId, viewerId)
      const isAuthor = row.authorId === viewerId && access !== 'not_found'
      if (!isAuthor && access !== 'tester') return null
      if (row.removedAt !== null && !isAuthor) return null
      // Sa photo (index tester_media_call_idx) : la clé, puis sa description. Jamais le fichier.
      // R9 : retirée seule par la modération, elle n'y est plus (removal_id).
      const [photo] = await db
        .select({
          id: tm.id,
          key: tm.storageKey,
          thumbhash: tm.thumbhash,
          description: tm.description,
        })
        .from(tm)
        .where(and(eq(tm.callId, target.id), isNull(tm.removalId)))
        .orderBy(asc(tm.createdAt), asc(tm.id))
      const photoCopy: ReportSnapshot = photo
        ? [{ field: 'photo', value: photo.key }, ...filled('photoDescription', photo.description)]
        : []
      return {
        authorId: row.authorId,
        projectId: row.projectId,
        text: row.text,
        snapshot: [...filled('body', row.text), ...photoCopy],
        head: { title: null, image: await projectCover(db, row.projectId, publicApiUrl) },
        parts: photo ? [testerPhotoPart(photo, photoCopy, publicApiUrl)] : [],
      }
    }
    case 'message': {
      // R7b : un message d'un fil ne se voit que des deux personnes du fil : l'auteur du projet, et
      // ce testeur (actuel ou ancien : « Ne teste plus », il relit son fil ; un blocage ne l'en
      // prive pas). Un coin fermé le cache au testeur, pas à l'auteur. Un message retiré par la
      // modération ne se voit plus que de son expéditeur. Clé primaire de tester_message, puis de
      // project.
      const [row] = await db
        .select({
          projectAuthorId: p.authorId,
          projectId: tmsg.projectId,
          testerId: tmsg.testerId,
          senderId: tmsg.senderId,
          text: tmsg.text,
          removedAt: tmsg.removedAt,
        })
        .from(tmsg)
        .innerJoin(p, eq(p.id, tmsg.projectId))
        .where(eq(tmsg.id, target.id))
      if (!row) return null
      const access = await cornerAccess(db, row.projectId, viewerId)
      const inThread =
        row.projectAuthorId === viewerId
          ? access === 'author' || access === 'author_closed'
          : row.testerId === viewerId && (access === 'tester' || access === 'former_tester')
      if (!inThread) return null
      if (row.removedAt !== null && row.senderId !== viewerId) return null
      const [capture] = await db
        .select({ id: tm.id, key: tm.storageKey, thumbhash: tm.thumbhash })
        .from(tm)
        .where(and(eq(tm.messageId, target.id), isNull(tm.removalId)))
      const captureCopy: ReportSnapshot = capture ? [{ field: 'photo', value: capture.key }] : []
      return {
        authorId: row.senderId,
        projectId: row.projectId,
        text: row.text ?? '',
        snapshot: [...filled('body', row.text), ...captureCopy],
        head: { title: null, image: await projectCover(db, row.projectId, publicApiUrl) },
        parts: capture ? [testerPhotoPart(capture, captureCopy, publicApiUrl)] : [],
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
      // R9 : une photo de profil retirée par la modération porte une clé « withheld/… », que seul
      // son auteur relit : pour les autres, il n'a pas de photo.
      const avatarKey = row.avatarKey?.startsWith('withheld/') ? null : row.avatarKey
      const avatar = avatarKey
        ? { url: mediaUrl(publicApiUrl, avatarKey), thumbhash: NEUTRAL_THUMBHASH }
        : null
      const bio = filled('bio', row.bio)
      const tools = filled('favoriteTools', oneLine(favoriteTools))
      return {
        authorId: row.id,
        projectId: null,
        text: `${row.name} (@${handle})`,
        snapshot: [
          { field: 'name', value: row.name },
          { field: 'handle', value: handle },
          ...bio,
          ...tools,
          ...filled('avatar', avatarKey),
        ],
        head: { title: null, image: avatar },
        parts: [
          textPart('name', [{ field: 'name', value: row.name }]),
          textPart('handle', [{ field: 'handle', value: handle }]),
          ...(bio.length === 0 ? [] : [textPart('bio', bio)]),
          ...(tools.length === 0 ? [] : [textPart('favoriteTools', tools)]),
          ...(avatar && avatarKey
            ? [{ ...textPart('avatar', filled('avatar', avatarKey)), thumb: avatar }]
            : []),
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
    case 'call': {
      // L'auteur d'un appel est celui de son projet.
      const [row] = await db
        .select({ authorId: p.authorId, removedAt: tc.removedAt })
        .from(tc)
        .innerJoin(p, eq(p.id, tc.projectId))
        .where(eq(tc.id, target.id))
      return row ? { authorId: row.authorId, removed: row.removedAt !== null } : null
    }
    case 'message': {
      // L'auteur d'un message est son expéditeur (l'auteur du projet ou le testeur).
      const [row] = await db
        .select({ authorId: tmsg.senderId, removedAt: tmsg.removedAt })
        .from(tmsg)
        .where(eq(tmsg.id, target.id))
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
