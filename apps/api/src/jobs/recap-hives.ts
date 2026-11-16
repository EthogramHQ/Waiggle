// Les lectures de la partie « Dans tes ruches » du récap du dimanche (R10), à part de
// weekly-recap.ts qui les appelle. Scénario : docs/scenarios/refonte.md, « R10 », « La partie Dans
// tes ruches du récap » ; planche R10-Recap ; plan R10, « Ce qui change au plan », points 1 et 4.
//
// Ruche par ruche, les projets publiés et mis à jour dans la semaine par les AUTRES membres (ses
// propres projets sont déjà dans « Tes projets »), et les invitations en attente. Un projet n'entre
// que s'il passe la règle commune (`listedVerifiedProjectFor`, projects/visibility.ts : public, ou
// réservé à l'une de ses ruches ; jamais d'un membre bloqué dans un sens ou l'autre ; auteur
// vérifié), puis s'il appartient à CETTE ruche : réservé à elle, ou projet « Membres » d'un de ses
// membres (comme l'actualité de la ruche, hives/load.ts). Un nombre fixe de requêtes par membre,
// quel que soit le nombre de ses ruches : quatre pour les nouveautés, une pour les invitations.
import { RECAP_MAX_LINES } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, gt, inArray, isNull, lte, ne, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { notBlockedWith } from '../blocks/visibility'
import type { RecapHive, RecapHiveInvitation, RecapHiveItem } from '../email/templates'
import { invitationValidSince } from '../hives/load'
import { listedVerifiedProjectFor, MEMBER_VISIBLE } from '../projects/visibility'
import { activeSuspensionSql } from '../suspension/load'
import { hasReadableLines, updateOnCards } from '../updates/load'

const h = schema.hive
const hm = schema.hiveMember
const hi = schema.hiveInvitation
const p = schema.project
const u = schema.projectUpdate
/** Un autre membre de la même ruche (la table hive_member, une seconde fois sous un autre nom). */
const mate = alias(schema.hiveMember, 'mate')
/** L'auteur d'un projet, ou l'inviteur (la table "user" sous un autre nom). */
const person = alias(schema.user, 'person')

/**
 * Au plus tant de lignes lues par requête : la partie n'en montre que 5 par ruche, et un membre a
 * 20 ruches au plus. La borne garde la lecture courte même dans une semaine très active ; « Et N
 * autres » compte alors les lignes lues, pas toutes celles de la semaine.
 */
const ROWS_MAX = 200

/** Une nouveauté lue en base, avant le regroupement par ruche. */
type HiveEvent = {
  hiveId: string
  hiveName: string
  nameRemovalId: string | null
  projectId: string
  title: string
  author: string
  at: Date | null
}

/**
 * Les nouveautés des ruches de `me` entre `since` (exclu) et `now` (inclus), ruche par ruche, la
 * plus récemment active en tête. Quatre requêtes lancées ensemble : les projets publiés et les mises
 * à jour, chacun en deux branches, celle des projets réservés à la ruche et celle des projets
 * « Membres » de ses membres. Deux branches plutôt qu'un « or » dans la jointure : chacune suit son
 * index (comme hives/load.ts, `activityStatsOf`) :
 *
 *   select hm.hive_id, hive.name, hive.name_removal_id, project.id, project.title, person.name,
 *     project.published_at
 *   from hive_member hm
 *   join hive on hive.id = hm.hive_id
 *   join project on project.hive_id = hm.hive_id and project.visibility = 'hive'   -- réservés
 *   -- ou : join hive_member mate on mate.hive_id = hm.hive_id
 *   --      join project on project.author_id = mate.user_id
 *   --        and project.visibility in ('public', 'web')                 -- « Membres », « Public »
 *   join "user" person on person.id = project.author_id
 *   where hm.user_id = $me and project.author_id <> $me
 *     and project.published_at > $since and project.published_at <= $now
 *     and <listedVerifiedProjectFor($me)> and not <auteur suspendu>
 *   order by project.published_at desc limit 200
 *
 * Index : hive_member_user_idx (user_id) donne ses ruches ; la clé primaire de hive leur nom ;
 * l'index partiel project_hive_created_idx (hive_id, created_at) where visibility = 'hive' les
 * projets réservés ; la clé primaire de hive_member (hive_id, user_id), lue par son début, les
 * autres membres, puis project_author_published_idx (author_id, published_at) leurs projets ;
 * project_update_project_created_idx (project_id, created_at, id) les mises à jour de ces projets.
 * Les vérifications de la règle commune (ruches du lecteur, blocages, auteur vérifié) et de la
 * suspension passent par des clés primaires et account_suspension_user_idx.
 */
export const hiveNewsOf = async (
  db: Database,
  me: string,
  since: Date,
  now: Date,
  appUrl: string,
): Promise<RecapHive[]> => {
  // Ce que les quatre requêtes ont en commun : ses ruches, ni ses propres projets, ni ceux d'un
  // auteur suspendu (comme « Nouveaux projets de tes proches »), et la règle commune de visibilité.
  const common = (): SQL | undefined =>
    and(
      eq(hm.userId, me),
      ne(p.authorId, me),
      listedVerifiedProjectFor(me),
      sql`not exists (select 1 from account_suspension s
        where s.user_id = ${p.authorId} and ${activeSuspensionSql('s', now)})`,
    )
  const reserved = and(eq(p.hiveId, hm.hiveId), eq(p.visibility, 'hive'))
  // R12 : « Membres » ou « Public » (`MEMBER_VISIBLE`) : un projet public d'un membre de la ruche
  // compte comme un projet « Membres ». `inArray` : « visibility in ($1, $2) ».
  const ofMate = and(eq(p.authorId, mate.userId), inArray(p.visibility, [...MEMBER_VISIBLE]))
  const columns = (at: typeof p.publishedAt | typeof u.createdAt) => ({
    hiveId: hm.hiveId,
    hiveName: h.name,
    nameRemovalId: h.nameRemovalId,
    projectId: p.id,
    title: p.title,
    author: person.name,
    at,
  })
  const publishedIn = and(gt(p.publishedAt, since), lte(p.publishedAt, now))
  // Une mise à jour compte comme sur les cartes : ni retirée, ni sans ligne lisible.
  const updatedIn = and(
    gt(u.createdAt, since),
    lte(u.createdAt, now),
    updateOnCards(),
    hasReadableLines(),
  )
  const [published, membersPublished, updated, membersUpdated] = await Promise.all([
    db
      .select(columns(p.publishedAt))
      .from(hm)
      .innerJoin(h, eq(h.id, hm.hiveId))
      .innerJoin(p, reserved)
      .innerJoin(person, eq(person.id, p.authorId))
      .where(and(common(), publishedIn))
      .orderBy(desc(p.publishedAt), desc(p.id))
      .limit(ROWS_MAX),
    db
      .select(columns(p.publishedAt))
      .from(hm)
      .innerJoin(h, eq(h.id, hm.hiveId))
      .innerJoin(mate, eq(mate.hiveId, hm.hiveId))
      .innerJoin(p, ofMate)
      .innerJoin(person, eq(person.id, p.authorId))
      .where(and(common(), publishedIn))
      .orderBy(desc(p.publishedAt), desc(p.id))
      .limit(ROWS_MAX),
    db
      .select(columns(u.createdAt))
      .from(hm)
      .innerJoin(h, eq(h.id, hm.hiveId))
      .innerJoin(p, reserved)
      .innerJoin(u, eq(u.projectId, p.id))
      .innerJoin(person, eq(person.id, p.authorId))
      .where(and(common(), updatedIn))
      .orderBy(desc(u.createdAt), desc(u.id))
      .limit(ROWS_MAX),
    db
      .select(columns(u.createdAt))
      .from(hm)
      .innerJoin(h, eq(h.id, hm.hiveId))
      .innerJoin(mate, eq(mate.hiveId, hm.hiveId))
      .innerJoin(p, ofMate)
      .innerJoin(u, eq(u.projectId, p.id))
      .innerJoin(person, eq(person.id, p.authorId))
      .where(and(common(), updatedIn))
      .orderBy(desc(u.createdAt), desc(u.id))
      .limit(ROWS_MAX),
  ])
  return groupByHive(
    appUrl,
    [...published, ...membersPublished].map((row) => ({ ...row, kind: 'published' as const })),
    [...updated, ...membersUpdated].map((row) => ({ ...row, kind: 'updated' as const })),
  )
}

/**
 * Le regroupement, en JavaScript : une ligne par projet et par ruche (« a publié » l'emporte sur
 * « a mis à jour » : un projet publié cette semaine est neuf, ses mises à jour n'apprennent rien de
 * plus), la plus récente en tête ; 5 lignes par ruche (RECAP_MAX_LINES), puis « Et N autres
 * nouveautés ». Les ruches, de la plus récemment active à la plus calme.
 *
 * Le lien d'une ligne : la page du projet pour une publication, sa frise des mises à jour pour une
 * mise à jour. L'adresse de l'appli et l'identifiant du projet (un uuid), jamais un texte de membre,
 * jamais l'adresse de la ruche (son nom n'est jamais un lien, décision de Louis du 14/11/2026).
 */
const groupByHive = (
  appUrl: string,
  published: (HiveEvent & { kind: 'published' })[],
  updated: (HiveEvent & { kind: 'updated' })[],
): RecapHive[] => {
  type Line = { item: RecapHiveItem; at: number }
  type Hive = { name: string | null; last: number; lines: Map<string, Line> }
  const hives = new Map<string, Hive>()
  // Les publiées d'abord : une mise à jour du même projet trouve sa place prise.
  for (const event of [...published, ...updated]) {
    if (event.at === null) continue
    const at = event.at.getTime()
    let hive = hives.get(event.hiveId)
    if (hive === undefined) {
      hive = { name: shownName(event), last: at, lines: new Map() }
      hives.set(event.hiveId, hive)
    }
    hive.last = Math.max(hive.last, at)
    const known = hive.lines.get(event.projectId)
    if (known === undefined) {
      const page = event.kind === 'updated' ? '/updates' : ''
      hive.lines.set(event.projectId, {
        item: {
          kind: event.kind,
          author: event.author,
          title: event.title,
          url: new URL(`/projects/${event.projectId}${page}`, appUrl).toString(),
        },
        at,
      })
    } else if (known.item.kind === event.kind && at > known.at) {
      // Plusieurs mises à jour du même projet : une seule ligne, datée de la plus récente.
      known.at = at
    }
  }
  return [...hives.values()]
    .sort((a, b) => b.last - a.last)
    .map((hive) => {
      const lines = [...hive.lines.values()].sort((a, b) => b.at - a.at)
      return {
        name: hive.name,
        items: lines.slice(0, RECAP_MAX_LINES).map((line) => line.item),
        more: Math.max(0, lines.length - RECAP_MAX_LINES),
      }
    })
}

/**
 * Le nom d'une ruche tel qu'on le montre : null quand la modération l'a retiré (« Ruche sans
 * nom ») ; la même règle que hives/load.ts (`shownName`).
 */
const shownName = (row: { hiveName: string; nameRemovalId: string | null }) =>
  row.hiveName === '' || row.nameRemovalId !== null ? null : row.hiveName

/**
 * Les invitations en attente de `me` (« Ruches » réglé sur « Dans le récap ») : de moins de 30 jours
 * (`invitationValidSince`, la règle des routes), ni refusées, ni d'après `now` ; une invitation
 * acceptée n'a plus de ligne. Le nom de l'inviteur seulement, jamais celui de la ruche ; null si
 * son compte a été supprimé (inviter_id mis à nul). Bloquer efface déjà les invitations entre deux
 * membres ; le filtre de blocage reste par prudence.
 *
 *   select person.name from hive_invitation hi left join "user" person on person.id = hi.inviter_id
 *   where hi.invitee_id = $me and hi.refused_at is null
 *     and hi.created_at > $now - 30 jours and hi.created_at <= $now and not <bloqué>
 *   order by hi.created_at desc limit 200
 *
 * Index : hive_invitation_invitee_idx (invitee_id, created_at) ; l'inviteur par la clé primaire de
 * "user".
 */
export const hiveInvitationsOf = async (
  db: Database,
  me: string,
  now: Date,
): Promise<{ shown: RecapHiveInvitation[]; more: number }> => {
  const rows = await db
    .select({ inviter: person.name })
    .from(hi)
    .leftJoin(person, eq(person.id, hi.inviterId))
    .where(
      and(
        eq(hi.inviteeId, me),
        isNull(hi.refusedAt),
        gt(hi.createdAt, invitationValidSince(now)),
        lte(hi.createdAt, now),
        notBlockedWith(me, hi.inviterId),
      ),
    )
    .orderBy(desc(hi.createdAt), desc(hi.id))
    .limit(ROWS_MAX)
  return {
    shown: rows.slice(0, RECAP_MAX_LINES).map((row) => ({ inviter: row.inviter })),
    more: Math.max(0, rows.length - RECAP_MAX_LINES),
  }
}
