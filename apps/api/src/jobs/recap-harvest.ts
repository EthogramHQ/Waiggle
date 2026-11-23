// Le jeu dans le récap du dimanche (R19, plan, choix 16 ; planche R19-Recap) : le bloc « Ta
// semaine » (`RecapData.harvest`) et le défi de chaque ruche (`RecapHive.challenge`). Rien de tout
// cela quand le membre a coupé « Ma récolte » (`member_game.harvest_notices`). Seul le pollen de la
// semaine compte pour décider d'envoyer le récap (« inciter un peu ») ; un défi de ruche en cours
// n'est montré que si le récap part pour autre chose.
//
// Lecture seule : le récap ne fait naître aucun défi. Celui d'une ruche naît à la lecture de sa
// page ; s'il n'existe pas cette semaine, la ruche n'a rien à dire de son défi.
import { weekOf } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { RecapHarvest, RecapHiveChallenge } from '../email/templates'
import { hiveChallengesOf } from '../game/challenges'

/** Le défi d'une ruche du membre, avec le nom montré de la ruche (null : retiré ou vide). */
export type RecapHarvestHive = {
  hiveId: string
  name: string | null
  challenge: RecapHiveChallenge
}

export type RecapHarvestOf = {
  /** « Ma récolte » allumé : sans lui, ni bloc ni défi. */
  on: boolean
  /** Le pollen de la semaine en cours (non révoqué). */
  pollen: number
  /** Le bloc, ou null s'il n'a rien à dire (aucun pollen et aucun défi de ruche). */
  harvest: Omit<RecapHarvest, 'news'> | null
  /** Le défi de la semaine de chaque ruche du membre qui en a un, dans l'ordre des ruches. */
  hives: RecapHarvestHive[]
}

const Summary = z.object({
  on: z.boolean(),
  pollen: z.coerce.number().int(),
  challenge_done: z.boolean().nullable(),
})

const HiveRow = z.object({
  hive_id: z.string(),
  name: z.string(),
  name_removal_id: z.string().nullable(),
})

/**
 * Ce que le récap dit du jeu pour ce membre, à l'heure `now` (le dimanche : la semaine qui finit
 * est la semaine en cours). Trois lectures, plus celles de `hiveChallengesOf` (un nombre fixe,
 * quel que soit le nombre de ruches) :
 *
 *   select coalesce(mg.harvest_notices, true) as on,
 *     (select coalesce(sum(pe.amount), 0) from pollen_entry pe
 *      where pe.member_id = $me and pe.week = $week and pe.revoked_at is null) as pollen,
 *     (select pc.completed_at is not null from personal_challenge pc
 *      where pc.member_id = $me and pc.week = $week) as challenge_done
 *   from "user" u left join member_game mg on mg.member_id = u.id where u.id = $me
 *
 * Index : la clé primaire de "user" et de member_game (member_id) ; pollen_entry_member_week_idx
 * (member_id, week) pour la somme ; la clé primaire de personal_challenge (member_id, week).
 *
 *   select hm.hive_id, h.name, h.name_removal_id
 *   from hive_member hm
 *   join hive_challenge hc on hc.hive_id = hm.hive_id and hc.week = $week
 *   join hive h on h.id = hm.hive_id
 *   where hm.user_id = $me order by hm.joined_at, hm.hive_id
 *
 * Index : hive_member_user_idx (user_id) donne ses ruches ; la clé primaire de hive_challenge
 * (hive_id, week) le défi de la semaine ; celle de hive le nom. Seules les ruches qui ont déjà leur
 * défi passent à `hiveChallengesOf` (qui n'en crée donc aucun, et ne garde que les ruches de 3
 * membres au moins aujourd'hui).
 */
export const recapHarvestOf = async (
  db: Database,
  memberId: string,
  now: Date,
  appUrl: string,
): Promise<RecapHarvestOf> => {
  const week = weekOf(now)
  const [summary] = z.object({ rows: z.array(Summary) }).parse(
    await db.execute(sql`
        select coalesce(mg.harvest_notices, true) as on,
          (select coalesce(sum(pe.amount), 0) from pollen_entry pe
            where pe.member_id = ${memberId} and pe.week = ${week}::date
              and pe.revoked_at is null) as pollen,
          (select pc.completed_at is not null from personal_challenge pc
            where pc.member_id = ${memberId} and pc.week = ${week}::date) as challenge_done
        from "user" u left join member_game mg on mg.member_id = u.id
        where u.id = ${memberId}
      `),
  ).rows
  if (!summary?.on) return { on: false, pollen: 0, harvest: null, hives: [] }

  const rows = z.object({ rows: z.array(HiveRow) }).parse(
    await db.execute(sql`
        select hm.hive_id, h.name, h.name_removal_id
        from hive_member hm
        join hive_challenge hc on hc.hive_id = hm.hive_id and hc.week = ${week}::date
        join hive h on h.id = hm.hive_id
        where hm.user_id = ${memberId}
        order by hm.joined_at, hm.hive_id
      `),
  ).rows
  const challenges = await hiveChallengesOf(
    db,
    rows.map((row) => row.hive_id),
    now,
  )
  const hives = rows.flatMap((row): RecapHarvestHive[] => {
    const challenge = challenges.get(row.hive_id)
    if (!challenge) return []
    // Le nom montré, comme « Dans tes ruches » (recap-hives.ts) : vide ou retiré, « Ruche sans nom ».
    const name = row.name === '' || row.name_removal_id !== null ? null : row.name
    const { code, progress, target, done, isNew } = challenge
    return [{ hiveId: row.hive_id, name, challenge: { code, progress, target, done, isNew } }]
  })
  const pollen = summary.pollen
  return {
    on: true,
    pollen,
    harvest:
      pollen > 0 || hives.length > 0
        ? {
            pollen,
            challengeDone: summary.challenge_done === true,
            // « Voir ma récolte » : l'adresse de l'appli et un chemin fixe, jamais un texte de membre.
            url: new URL('/harvest', appUrl).toString(),
          }
        : null,
    hives,
  }
}
