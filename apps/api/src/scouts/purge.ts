// La part « Éclaireuses » de la purge de nuit (R20, relecture juridique J4) : ne rien garder plus
// longtemps qu'il ne sert. Les retours (et leurs captures, fichiers compris) s'effacent 6 mois, du
// calendrier, après la fin du mois des Éclaireuses ; les missions, 8 jours après leur semaine (leurs
// réponses « missions faites » partent avec elles, par la cascade de la base). La ligne `scout` d'une
// Éclaireuse ne s'efface pas ici : elle vit autant que le compte.
import { weekOf } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { lte, sql } from 'drizzle-orm'
import type { FileStorage } from '../media/storage'
import { utc } from '../notifications/load'

const DAY = 24 * 60 * 60 * 1000

/** Une mission s'efface 8 jours après la fin de sa semaine : 7 jours de semaine, puis 8. */
const MISSION_KEEP_DAYS = 15

/** Le mois jamais lancé (pas de ligne `scout_program`) compte comme s'il finissait 30 jours après le retour. */
const UNLAUNCHED_PROGRAM_DAYS = 30

/**
 * Efface les retours et les missions périmés ; rend leur nombre.
 *
 * Les retours : un seul `delete … returning media_key` efface les lignes et rend la clé de chaque
 * capture ; les fichiers partent ensuite (une panne entre les deux laisse un fichier orphelin, jamais
 * une ligne qui montre un fichier absent). La fin du mois est `scout_program.ends_at` (une seule
 * ligne, lue par sa clé primaire) ; sans ligne, `created_at + 30 jours`. « + interval '6 months' » :
 * six mois du calendrier, pas 183 jours. La table est petite (30 Éclaireuses, 20 retours par jour au
 * plus, pendant un mois) : une lecture complète une fois par nuit coûte moins qu'un index de plus.
 *
 * Les missions : `week` est le lundi de leur semaine ; elles s'effacent quand ce lundi plus 15 jours
 * est passé, soit le plus récent lundi qui précède `now - 15 jours`. L'index unique
 * `scout_mission_week_position_idx` commence par `week` : la plage « avant ce lundi » en est le
 * début. Les retours qui y répondaient gardent leur texte et perdent le lien (`set null`).
 */
export const purgeScouts = async (db: Database, now: Date, storage: FileStorage) => {
  const r = schema.scoutReport
  const reports = await db
    .delete(r)
    .where(
      sql`coalesce(
        (select ${schema.scoutProgram.endsAt} from ${schema.scoutProgram} where ${schema.scoutProgram.id} = 1),
        ${r.createdAt} + ${`${UNLAUNCHED_PROGRAM_DAYS} days`}::interval
      ) + interval '6 months' < ${utc(now)}`,
    )
    .returning({ mediaKey: r.mediaKey })
  for (const { mediaKey } of reports) {
    if (!mediaKey) continue
    try {
      await storage.delete(mediaKey)
    } catch (error) {
      console.error('Nightly purge: a scout capture could not be erased', mediaKey, error)
    }
  }

  const lastDeletedWeek = weekOf(new Date(now.getTime() - MISSION_KEEP_DAYS * DAY))
  const missions = await db
    .delete(schema.scoutMission)
    .where(lte(schema.scoutMission.week, lastDeletedWeek))
    .returning({ id: schema.scoutMission.id })

  return { scoutReports: reports.length, scoutMissions: missions.length }
}
