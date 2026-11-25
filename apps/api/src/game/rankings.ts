// Les classements de la semaine (R19, choix 14) : le pollen gagné depuis lundi par soi et ceux que
// l'on suit (`close`), ou par les membres d'une ruche (`hive`). La route (routes/rankings.ts) vérifie
// la session, le quota, la requête et l'appartenance à la ruche ; ce fichier ne fait que lire.
//
// Qui n'y figure jamais : un membre qui s'est retiré des classements (`member_game.in_rankings`
// faux), un compte d'exemples, un membre bloqué dans un sens ou dans l'autre avec le lecteur, et
// tout membre sans pollen cette semaine (le classement ne montre personne à zéro).
//
// Ce qui n'y compte jamais : les réactions et les suivis, ni le pollen du défi « Réagis à 5
// projets » (relecture de sécurité de R19, B1, décision du 23/11). Chaque geste a un montant qui le
// signe (réaction 2, suivi 3) et le classement est relu à chaque demande : Léa verrait Max passer de
// 2 à 4 juste après la première réaction sur son projet, et saurait que c'est lui, quand l'appli ne
// dit jamais qui a réagi ni qui s'abonne. Ces lignes comptent toujours pour le niveau, les sceaux et
// « Ma récolte » : seul le classement les laisse de côté. Les autres gestes ont un auteur que celui
// qui les reçoit voit déjà (un commentaire, un retour, un testeur, une ruche, une invitation).
import {
  type Gesture,
  PERSONAL_CHALLENGES,
  RANKING_MAX,
  type Ranking,
  type RankingScope,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, isNull, not, notInArray, or, type SQL, sql } from 'drizzle-orm'
import { isExampleAccountSql } from '../accounts/example'
import { notBlockedWith } from '../blocks/visibility'
import { avatarUrlOf } from '../profile/me'

const pe = schema.pollenEntry
const mg = schema.memberGame
const pc = schema.personalChallenge

/** Les gestes dont l'appli tait l'auteur : le classement ne les compte pas (B1). */
const SECRET_AUTHOR_GESTURES = ['reaction', 'follow'] as const satisfies readonly Gesture[]
const isSecret = (gesture: Gesture) =>
  (SECRET_AUTHOR_GESTURES as readonly Gesture[]).includes(gesture)

/**
 * Les défis perso qui comptent un de ces gestes (aujourd'hui `react_5`), tirés de la liste du
 * contrat : un défi de ce genre ajouté plus tard est exclu lui aussi, sans toucher à ce fichier.
 */
const SECRET_AUTHOR_CHALLENGES = PERSONAL_CHALLENGES.filter((challenge) =>
  isSecret(challenge.gesture),
).map((challenge) => challenge.code)

/**
 * La condition « cette ligne compte dans le classement » :
 * - ni une réaction, ni un suivi (`not in`, sur la colonne `gesture` de la ligne déjà lue) ;
 * - ni le pollen d'un défi perso réussi qui comptait l'un d'eux. Ce pollen est une ligne `challenge`
 *   écrite la semaine du défi ; on le reconnaît par le défi choisi cette semaine-là, lu par la clé
 *   primaire de `personal_challenge` (member_id, week) dans une sous-requête « corrélée » : elle
 *   reprend le membre et la semaine de la ligne en cours, et ne tourne que pour les lignes
 *   `challenge` (une par membre et par semaine au plus). Les codes entrent en paramètres liés.
 */
const countsInRankings = (): SQL | undefined => {
  const secretChallenge = sql`exists (select 1 from ${pc}
    where ${pc.memberId} = ${pe.memberId} and ${pc.week} = ${pe.week}
      and ${pc.chosen} in (${sql.join(
        SECRET_AUTHOR_CHALLENGES.map((code) => sql`${code}`),
        sql`, `,
      )}))`
  return and(
    notInArray(pe.gesture, [...SECRET_AUTHOR_GESTURES]),
    SECRET_AUTHOR_CHALLENGES.length === 0
      ? undefined
      : sql`not (${pe.gesture} = ${'challenge'} and ${secretChallenge})`,
  )
}

/**
 * Faux si ce membre s'est retiré des classements (403 `rankings_off` : il ne les lit plus). Pas de
 * ligne `member_game` : la valeur par défaut, dans les classements. Lu par la clé primaire.
 */
export const inRankings = async (db: Database, memberId: string): Promise<boolean> => {
  const [row] = await db
    .select({ inRankings: mg.inRankings })
    .from(mg)
    .where(eq(mg.memberId, memberId))
  return row?.inRankings ?? true
}

/** Le cercle d'un classement : soi et ceux que l'on suit, ou les membres d'une ruche. */
export type RankingCircle = { scope: 'close' } | { scope: 'hive'; hiveId: string }

/**
 * La condition « ce membre est dans le cercle », écrite sur la colonne `member_id` du grand livre.
 * `in (select …)` : une sous-requête qui rend la liste des membres ; PostgreSQL la lit une fois.
 * - proches : le lecteur, ou un membre qu'il suit (la clé primaire de `member_follow` commence par
 *   `follower_id`) ; un suivi non rendu suffit (Louis, 23/11) ;
 * - ruche : ses membres actuels (la clé primaire de `hive_member` commence par `hive_id`).
 */
const inCircle = (viewerId: string, circle: RankingCircle): SQL | undefined => {
  if (circle.scope === 'hive') {
    const members = sql`select ${schema.hiveMember.userId} from ${schema.hiveMember}
      where ${schema.hiveMember.hiveId} = ${circle.hiveId}`
    return sql`${pe.memberId} in (${members})`
  }
  const followed = sql`select ${schema.memberFollow.memberId} from ${schema.memberFollow}
    where ${schema.memberFollow.followerId} = ${viewerId}`
  return or(eq(pe.memberId, viewerId), sql`${pe.memberId} in (${followed})`)
}

/**
 * Le classement de la semaine de `now` (son lundi, à l'heure de Paris), en une seule requête :
 *
 *   select u.id, u.name, p.avatar_key, sum(e.amount), rank() over (order by sum(e.amount) desc)
 *   from pollen_entry e join "user" u on u.id = e.member_id left join profile p …
 *   left join member_game g on g.member_id = e.member_id
 *   where e.week = $lundi and e.revoked_at is null
 *     and e.gesture not in ('reaction', 'follow')
 *     and not (e.gesture = 'challenge' and exists (select 1 from personal_challenge c
 *              where c.member_id = e.member_id and c.week = e.week and c.chosen in ('react_5')))
 *     and e.member_id in (<le cercle>)
 *     and coalesce(g.in_rankings, true) and not exists (compte d'exemples)
 *     and not (bloqué avec le lecteur)
 *   group by u.id, u.name, p.avatar_key order by 4 desc, u.name, u.id limit 50
 *
 * L'index `pollen_entry_member_week_idx` (member_id, week) sert chaque membre du cercle : PostgreSQL
 * ne lit que les entrées de cette semaine de ces membres-là, jamais tout le grand livre ; les
 * conditions sur le geste trient ensuite ces quelques dizaines de lignes. Seuls les membres qui ont
 * une entrée comptée apparaissent : un membre qui n'a fait que réagir ou suivre cette semaine n'a
 * aucune ligne gardée, il n'apparaît pas (personne à zéro, sans condition de plus).
 *
 * `rank() over (…)` est une « fonction de fenêtre » : calculée sur les lignes déjà groupées, elle
 * donne à chacune son rang dans l'ordre demandé ; deux sommes égales reçoivent le même rang, et le
 * suivant saute d'autant (1, 1, 3), comme sur un podium. Elle est calculée avant le `limit` : la
 * 50e ligne garde son vrai rang. Les ex aequo sont ensuite rangés par nom, pour un ordre stable.
 */
export const loadRanking = async (
  db: Database,
  viewerId: string,
  circle: RankingCircle,
  publicApiUrl: string,
  now: Date,
): Promise<Ranking> => {
  const week = weekOf(now)
  const pollen = sql<number>`sum(${pe.amount})::int`
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      avatarKey: schema.profile.avatarKey,
      pollen,
      rank: sql<number>`(rank() over (order by sum(${pe.amount}) desc))::int`,
    })
    .from(pe)
    .innerJoin(schema.user, eq(schema.user.id, pe.memberId))
    .leftJoin(schema.profile, eq(schema.profile.userId, pe.memberId))
    .leftJoin(mg, eq(mg.memberId, pe.memberId))
    .where(
      and(
        eq(pe.week, week),
        isNull(pe.revokedAt),
        countsInRankings(),
        inCircle(viewerId, circle),
        // Pas de ligne de réglages : dans les classements (la valeur par défaut).
        sql`coalesce(${mg.inRankings}, true)`,
        not(isExampleAccountSql(pe.memberId)),
        notBlockedWith(viewerId, pe.memberId),
      ),
    )
    .groupBy(schema.user.id, schema.user.name, schema.profile.avatarKey)
    .orderBy(desc(pollen), asc(schema.user.name), asc(schema.user.id))
    .limit(RANKING_MAX)

  const scope: RankingScope = circle.scope
  return {
    scope,
    ...(circle.scope === 'hive' ? { hiveId: circle.hiveId } : {}),
    week,
    rows: rows.map((row) => ({
      rank: row.rank,
      member: {
        id: row.id,
        name: row.name,
        // Une photo retirée par la modération (clé `withheld/…`) ne paraît pas : avatarUrlOf.
        avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey),
      },
      pollen: row.pollen,
      self: row.id === viewerId,
    })),
  }
}
