// Retirer et rétablir UNE partie d'un contenu (R9, 7d) : la 2e photo d'un projet, sa description, la
// bio d'un profil… Le reste du contenu reste affiché. Appelé par reports/decide.ts, dans la
// transaction de la décision, sous ses verrous.
//
// Relecture de sécurité P1 : une partie de texte retirée SORT de sa colonne (vidée, ou ses lignes
// d'outils effacées), et sa valeur est gardée dans `content_part_removal.hidden_value`, que seul son
// auteur relit. Aucune lecture oubliée ne peut donc plus la montrer. Une photo garde sa ligne,
// marquée par `removal_id` : les lectures la cachent. La photo de profil passe à une clé
// `withheld/<id>` que le service des fichiers ne sert qu'à son auteur. Le nom et le pseudo sont
// remplacés d'office (« Membre », « membre_4f2a ») ; l'ancien est gardé dans la décision
// (`previous_value`), sans ligne de retrait.
import type { ReportPartField, StoredReportTarget } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type Language, resources } from '@ruche/i18n'
import { and, desc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { provisionalHandle, restoreHandle } from '../handles/provisional'
import { favoriteToolsOf } from '../profile/tools'
import { toolsOfProjects } from '../projects/load'
import { resolveTools } from '../tools/resolve'
import { replaceProfileTools, replaceProjectTools } from '../tools/write'
import type { Tx } from './guard'

const cpr = schema.contentPartRemoval
const pm = schema.projectMedia
const tm = schema.testerMedia

/** La valeur sortie de sa colonne : un texte, une liste, ou la clé d'une photo de profil. */
type HiddenPartValue = NonNullable<(typeof cpr.$inferSelect)['hiddenValue']>

/** Une partie demandée par l'administrateur : son champ, et sa photo pour une photo. */
export type PartInput = { field: ReportPartField; mediaId?: string | undefined }

/** La photo visée par une partie, dans sa table ; les deux nulles pour une partie de texte. */
export type PartMedia = { projectMediaId: string | null; testerMediaId: string | null }

/**
 * Levée dans la transaction quand la partie est déjà retirée (une autre décision est passée avant) :
 * reports/decide.ts l'annule et répond « déjà décidé ».
 */
export class PartAlreadyDecided extends Error {}

/** Couverture et photo désignent la même image : un seul retrait par photo (relecture P6). */
const isImage = (field: ReportPartField) => field === 'cover' || field === 'photo'

/**
 * La photo d'une partie, si elle appartient bien à la cible ; null sinon (le 404 d'une cible
 * inconnue : une photo d'un autre contenu ne se distingue pas d'une photo qui n'existe pas). Une
 * partie de texte n'a pas de photo. Chaque lecture passe par la clé primaire de la photo, puis
 * compare son contenu.
 */
export const partMediaOf = async (
  tx: Tx,
  target: StoredReportTarget,
  part: PartInput,
): Promise<PartMedia | null> => {
  if (part.mediaId === undefined) return { projectMediaId: null, testerMediaId: null }
  const id = part.mediaId
  switch (target.kind) {
    case 'project': {
      // Une photo de la galerie ou la couverture verticale de ce projet (jamais celle d'une mise à jour).
      const [row] = await tx
        .select({ id: pm.id })
        .from(pm)
        .where(
          and(
            eq(pm.id, id),
            eq(pm.projectId, target.id),
            inArray(pm.slot, ['gallery', 'portrait']),
          ),
        )
      return row ? { projectMediaId: row.id, testerMediaId: null } : null
    }
    case 'update': {
      const [row] = await tx
        .select({ id: pm.id })
        .from(pm)
        .where(and(eq(pm.id, id), eq(pm.updateId, target.id)))
      return row ? { projectMediaId: row.id, testerMediaId: null } : null
    }
    case 'call':
    case 'message': {
      const owner = target.kind === 'call' ? tm.callId : tm.messageId
      const [row] = await tx
        .select({ id: tm.id })
        .from(tm)
        .where(and(eq(tm.id, id), eq(owner, target.id)))
      return row ? { projectMediaId: null, testerMediaId: row.id } : null
    }
    default:
      // Un profil, un commentaire ou une ancienne note n'ont pas de photo à retirer seule.
      return null
  }
}

/**
 * Les signalements ouverts qu'une décision sur cette partie concerne, en plus de la cible (lus et
 * clos par l'index content_report_target_idx, puis filtrés) :
 * - `exact` : ceux de cette partie (pour une photo, comme couverture ou comme photo) ;
 * - `closedByRemoval` : ceux que le retrait clôt ; pour une photo, aussi ceux de sa description,
 *   qui n'a plus rien à montrer (relecture juridique).
 * `is not distinct from` : l'égalité qui tient aussi pour deux null (`=` ne la donne pas).
 */
export const reportsOfPart = (part: PartInput) => {
  const r = schema.contentReport
  const media = part.mediaId ?? null
  const sameMedia = sql`${r.partMediaId} is not distinct from ${media}::uuid`
  const exact: SQL | undefined = isImage(part.field)
    ? and(inArray(r.partField, ['cover', 'photo']), sameMedia)
    : and(eq(r.partField, part.field), sameMedia)
  const closedByRemoval: SQL | undefined = isImage(part.field) ? sameMedia : exact
  return { exact, closedByRemoval }
}

/** La sorte de contenu d'une ligne de retrait, et sa colonne (aucune pour un profil). */
const objectOf = (target: StoredReportTarget) => {
  switch (target.kind) {
    case 'project':
      return { objectKind: 'project', projectId: target.id } as const
    case 'update':
      return { objectKind: 'update', updateId: target.id } as const
    case 'call':
      return { objectKind: 'call', callId: target.id } as const
    case 'message':
      return { objectKind: 'message', messageId: target.id } as const
    default:
      return { objectKind: 'member' } as const
  }
}

/** Ce que la décision garde d'un nom ou d'un pseudo remplacé d'office. */
export type ReplacedValue = { previousValue: string; provisionalValue: string } | null

type HideArgs = {
  target: StoredReportTarget
  part: PartInput
  media: PartMedia
  /** L'auteur du contenu, ou le membre lui-même pour un profil. */
  authorId: string
  /** La décision « remove » qui retire la partie (déjà écrite : la ligne de retrait la cite). */
  removalId: string
  now: Date
}

/**
 * Retire la partie : la sort de sa colonne (texte), marque sa photo, ou remplace le nom ou le
 * pseudo. Les lectures d'une valeur avant de la vider prennent un verrou sur la ligne
 * (`for update`) : une modification simultanée de l'auteur attend la fin de la décision, et la
 * valeur gardée est bien celle qui sort. Lève PartAlreadyDecided si la partie est déjà retirée.
 */
export const hidePart = async (tx: Tx, args: HideArgs): Promise<ReplacedValue> => {
  const { target, part, authorId, now } = args
  // Le nom et le pseudo : remplacés, sans ligne de retrait (leur ancien est dans la décision).
  if (target.kind === 'member' && (part.field === 'name' || part.field === 'handle')) {
    return replaceIdentity(tx, authorId, part.field, args.removalId, now)
  }
  const rowId = crypto.randomUUID()
  const hidden = await takeOut(tx, args, rowId)
  // La ligne du retrait en cours. « on conflict do nothing » : la partie est déjà retirée (un des
  // index uniques de content_part_removal), rien n'est écrit et « returning » ne rend rien.
  const inserted = await tx
    .insert(cpr)
    .values({
      id: rowId,
      removalId: args.removalId,
      authorId,
      ...objectOf(target),
      field: part.field,
      projectMediaId: args.media.projectMediaId,
      testerMediaId: args.media.testerMediaId,
      hiddenValue: hidden,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: cpr.id })
  if (inserted.length === 0) throw new PartAlreadyDecided()
  return null
}

/** Le nom d'office, dans la langue du compte (« Membre », « Member »). */
const provisionalName = (language: string) =>
  resources[language === 'en' ? 'en' : ('fr' satisfies Language)].translation.removal
    .provisionalNameValue

const replaceIdentity = async (
  tx: Tx,
  userId: string,
  field: 'name' | 'handle',
  removalId: string,
  now: Date,
): Promise<ReplacedValue> => {
  if (field === 'handle') {
    const replaced = await provisionalHandle(tx, userId, removalId, now)
    if (!replaced) throw new PartAlreadyDecided()
    return { previousValue: replaced.previous, provisionalValue: replaced.provisional }
  }
  // Clé primaire de user, verrouillée : un changement de nom simultané attend.
  const [member] = await tx
    .select({ name: schema.user.name, language: schema.user.language })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .for('no key update')
  if (!member) throw new PartAlreadyDecided()
  const name = provisionalName(member.language)
  await tx.update(schema.user).set({ name }).where(eq(schema.user.id, userId))
  return { previousValue: member.name, provisionalValue: name }
}

/**
 * Sort la valeur de sa colonne et la rend (null pour une photo, dont la ligne reste, marquée).
 * Chaque lecture et chaque écriture passent par la clé primaire de leur table.
 */
const takeOut = async (
  tx: Tx,
  { target, part, media, removalId }: HideArgs,
  rowId: string,
): Promise<HiddenPartValue | null> => {
  const p = schema.project
  const profile = schema.profile
  // Une photo (galerie, couverture, mise à jour, coin) : marquée seulement si elle ne l'est pas déjà.
  if (isImage(part.field)) {
    const marked = media.projectMediaId
      ? await tx
          .update(pm)
          .set({ removalId })
          .where(and(eq(pm.id, media.projectMediaId), isNull(pm.removalId)))
          .returning({ id: pm.id })
      : media.testerMediaId
        ? await tx
            .update(tm)
            .set({ removalId })
            .where(and(eq(tm.id, media.testerMediaId), isNull(tm.removalId)))
            .returning({ id: tm.id })
        : []
    if (marked.length === 0) throw new PartAlreadyDecided()
    return null
  }
  switch (part.field) {
    case 'photoDescription': {
      if (!media.projectMediaId) throw new PartAlreadyDecided()
      const [row] = await tx
        .select({ description: pm.description })
        .from(pm)
        .where(eq(pm.id, media.projectMediaId))
        .for('update')
      await tx.update(pm).set({ description: null }).where(eq(pm.id, media.projectMediaId))
      return { text: row?.description ?? '' }
    }
    case 'description':
    case 'demoUrl':
    case 'prompt': {
      const [row] = await tx
        .select({ description: p.description, demoUrl: p.demoUrl, prompts: p.prompts })
        .from(p)
        .where(eq(p.id, target.id))
        .for('update')
      if (!row) throw new PartAlreadyDecided()
      if (part.field === 'description') {
        await tx.update(p).set({ description: '' }).where(eq(p.id, target.id))
        return { text: row.description }
      }
      if (part.field === 'demoUrl') {
        await tx.update(p).set({ demoUrl: null }).where(eq(p.id, target.id))
        return { text: row.demoUrl ?? '' }
      }
      await tx.update(p).set({ prompts: [] }).where(eq(p.id, target.id))
      return { items: row.prompts }
    }
    case 'tools': {
      // Les outils vivent dans project_tool (R6b) : leurs noms sont gardés, les lignes effacées.
      const tools = (await toolsOfProjects(tx, [target.id])).get(target.id) ?? []
      await replaceProjectTools(tx, target.id, [])
      return { items: tools.map((tool) => tool.label) }
    }
    case 'favoriteTools': {
      const tools = await favoriteToolsOf(tx, target.id)
      await replaceProfileTools(tx, target.id, [])
      return { items: tools.map((tool) => tool.label) }
    }
    case 'bio':
    case 'avatar': {
      const [row] = await tx
        .select({ bio: profile.bio, avatarKey: profile.avatarKey })
        .from(profile)
        .where(eq(profile.userId, target.id))
        .for('update')
      if (!row) throw new PartAlreadyDecided()
      if (part.field === 'bio') {
        await tx.update(profile).set({ bio: '' }).where(eq(profile.userId, target.id))
        return { text: row.bio }
      }
      // La clé `withheld/<id de la ligne de retrait>` : toutes les lectures qui fabriquent l'adresse
      // de la photo de profil donnent celle-là ; le service des fichiers ne la sert qu'à son auteur.
      if (row.avatarKey === null || row.avatarKey.startsWith('withheld/')) {
        throw new PartAlreadyDecided()
      }
      await tx
        .update(profile)
        .set({ avatarKey: `withheld/${rowId}` })
        .where(eq(profile.userId, target.id))
      return { storageKey: row.avatarKey }
    }
    default:
      // Titre, pitch, catégorie, texte d'une mise à jour : refusés avant (422 part_whole_only).
      throw new PartAlreadyDecided()
  }
}

/**
 * La dernière décision sur ce nom ou ce pseudo (index moderation_decision_target_idx : sorte,
 * cible, date), si c'est un retrait : il reste à rétablir.
 */
const lastIdentityRemoval = async (
  tx: Tx,
  memberId: string,
  field: 'name' | 'handle',
  // Le rétablissement en cours, déjà écrit : il ne compte pas.
  restoreId: string,
) => {
  const d = schema.moderationDecision
  const [last] = await tx
    .select({
      action: d.action,
      previousValue: d.previousValue,
      provisionalValue: d.provisionalValue,
    })
    .from(d)
    .where(
      and(
        eq(d.targetKind, 'member'),
        eq(d.targetId, memberId),
        eq(d.partField, field),
        // Un classement (dismiss) ne compte pas : seuls un retrait ou un rétablissement changent la partie.
        inArray(d.action, ['remove', 'restore']),
        ne(d.id, restoreId),
      ),
    )
    .orderBy(desc(d.createdAt), desc(d.id))
    .limit(1)
  return last?.action === 'remove' ? last : null
}

/**
 * La ligne du retrait en cours de cette partie, ou null : pour une photo, celle de son image
 * (couverture ou photo) ; sinon celle de ce champ sur ce contenu. Index content_part_removal_*.
 */
const currentRemoval = async (
  tx: Tx,
  target: StoredReportTarget,
  part: PartInput,
  media: PartMedia,
) => {
  const object = objectOf(target)
  const ofObject =
    object.objectKind === 'member'
      ? and(eq(cpr.objectKind, 'member'), eq(cpr.authorId, target.id))
      : object.objectKind === 'project'
        ? eq(cpr.projectId, object.projectId)
        : object.objectKind === 'update'
          ? eq(cpr.updateId, object.updateId)
          : object.objectKind === 'call'
            ? eq(cpr.callId, object.callId)
            : eq(cpr.messageId, object.messageId)
  const ofField = isImage(part.field)
    ? and(
        inArray(cpr.field, ['cover', 'photo']),
        media.projectMediaId
          ? eq(cpr.projectMediaId, media.projectMediaId)
          : eq(cpr.testerMediaId, media.testerMediaId ?? ''),
      )
    : and(
        eq(cpr.field, part.field),
        sql`${cpr.projectMediaId} is not distinct from ${media.projectMediaId}::uuid`,
      )
  const [row] = await tx.select().from(cpr).where(and(ofObject, ofField))
  return row ?? null
}

/**
 * Rétablit la partie : la valeur revient dans sa colonne si elle est encore vide (sinon l'auteur
 * l'a remplacée entre-temps, et sa nouvelle valeur reste), la photo perd sa marque, le nom ou le
 * pseudo revient s'il n'a pas été changé (handles/provisional.ts). La ligne du retrait s'efface.
 * Rend faux si la partie n'est pas retirée (« déjà décidé »).
 */
export const restorePart = async (
  tx: Tx,
  target: StoredReportTarget,
  part: PartInput,
  media: PartMedia,
  { now, restoreId }: { now: Date; restoreId: string },
): Promise<boolean> => {
  if (target.kind === 'member' && (part.field === 'name' || part.field === 'handle')) {
    const last = await lastIdentityRemoval(tx, target.id, part.field, restoreId)
    if (!last?.previousValue || !last.provisionalValue) return false
    if (part.field === 'handle') {
      await restoreHandle(
        tx,
        target.id,
        { previous: last.previousValue, provisional: last.provisionalValue },
        now,
      )
    } else {
      await tx
        .update(schema.user)
        .set({ name: last.previousValue })
        .where(and(eq(schema.user.id, target.id), eq(schema.user.name, last.provisionalValue)))
    }
    return true
  }
  const row = await currentRemoval(tx, target, part, media)
  if (!row) return false
  await putBack(tx, target, row)
  await tx.delete(cpr).where(eq(cpr.id, row.id))
  return true
}

const putBack = async (
  tx: Tx,
  target: StoredReportTarget,
  row: typeof cpr.$inferSelect,
): Promise<void> => {
  const p = schema.project
  const profile = schema.profile
  const hidden = row.hiddenValue
  const text = hidden !== null && 'text' in hidden ? hidden.text : null
  const items = hidden !== null && 'items' in hidden ? hidden.items : null
  switch (row.field) {
    case 'cover':
    case 'photo':
      if (row.projectMediaId) {
        await tx.update(pm).set({ removalId: null }).where(eq(pm.id, row.projectMediaId))
      } else if (row.testerMediaId) {
        await tx.update(tm).set({ removalId: null }).where(eq(tm.id, row.testerMediaId))
      }
      return
    case 'photoDescription':
      if (row.projectMediaId && text !== null) {
        await tx
          .update(pm)
          .set({ description: text })
          .where(and(eq(pm.id, row.projectMediaId), isNull(pm.description)))
      }
      return
    case 'description':
      if (text !== null) {
        await tx
          .update(p)
          .set({ description: text })
          .where(and(eq(p.id, target.id), eq(p.description, '')))
      }
      return
    case 'demoUrl':
      if (text !== null) {
        await tx
          .update(p)
          .set({ demoUrl: text })
          .where(and(eq(p.id, target.id), isNull(p.demoUrl)))
      }
      return
    case 'prompt':
      if (items !== null) {
        await tx
          .update(p)
          .set({ prompts: items })
          .where(and(eq(p.id, target.id), sql`cardinality(${p.prompts}) = 0`))
      }
      return
    case 'tools':
      if (items !== null) {
        // Seulement si l'auteur n'en a pas remis : ses outils d'aujourd'hui l'emportent.
        const now = (await toolsOfProjects(tx, [target.id])).get(target.id) ?? []
        if (now.length === 0) {
          await replaceProjectTools(tx, target.id, (await resolveTools(tx, items)).tools)
        }
      }
      return
    case 'favoriteTools':
      if (items !== null && (await favoriteToolsOf(tx, target.id)).length === 0) {
        await replaceProfileTools(tx, target.id, (await resolveTools(tx, items)).tools)
      }
      return
    case 'bio':
      if (text !== null) {
        await tx
          .update(profile)
          .set({ bio: text })
          .where(and(eq(profile.userId, target.id), eq(profile.bio, '')))
      }
      return
    case 'avatar':
      if (hidden !== null && 'storageKey' in hidden) {
        // Encore la clé retenue : l'auteur n'a ni supprimé ni remplacé sa photo depuis.
        await tx
          .update(profile)
          .set({ avatarKey: hidden.storageKey })
          .where(and(eq(profile.userId, target.id), eq(profile.avatarKey, `withheld/${row.id}`)))
      }
      return
  }
}
