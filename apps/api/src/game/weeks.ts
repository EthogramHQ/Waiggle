// Les semaines butinées du jeu (R19, plan, choix 6) : une semaine est « butinée » quand le membre y a
// fait au moins un geste qui aide ou qui crée (publier, mettre à jour, commenter, faire un retour,
// devenir testeur : `FORAGING_GESTURES` du contrat). Rien n'est rangé : le compte se lit dans le
// grand livre du pollen. Seul le miel de la semaine (5, `HONEY.week`) s'écrit, une fois par semaine,
// à la première entrée butinante, par `award` (game/award.ts).
import { randomUUID } from 'node:crypto'
import { FORAGING_GESTURES, HONEY, type LedgerGesture, weekOf } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Tx } from './award'

const p = schema.pollenEntry
const DAY = 24 * 60 * 60 * 1000

/**
 * La semaine décalée de `weeks` semaines (négatif : avant), en `YYYY-MM-DD`. Le calcul se fait sur
 * la date du calendrier, en temps universel, où un lundi plus sept jours est toujours un lundi (le
 * changement d'heure de Paris n'y entre pas).
 */
export const weekShift = (week: string, weeks: number): string =>
  new Date(Date.parse(`${week}T00:00:00.000Z`) + weeks * 7 * DAY).toISOString().slice(0, 10)

/** Ce geste rend-il la semaine butinée ? (Le pollen d'un défi, réagir, suivre, recevoir : non.) */
export const isForaging = (gesture: LedgerGesture) =>
  (FORAGING_GESTURES as readonly string[]).includes(gesture)

/**
 * Crédite le miel de la semaine `week` à ce membre, s'il ne l'a pas déjà : `award` l'appelle après
 * chaque entrée butinante, dans sa transaction. « on conflict do nothing » : l'index unique
 * `honey_entry_once_idx` (membre, `week:<lundi>`) refuse la seconde ligne sans erreur ni
 * abandon de la transaction, si bien que deux gestes de la même semaine ne créditent qu'une fois.
 * Rend le miel crédité (0 si la semaine l'était déjà).
 */
export const creditForagedWeek = async (tx: Tx, memberId: string, week: string, now: Date) => {
  const credited = await tx
    .insert(schema.honeyEntry)
    .values({
      id: randomUUID(),
      memberId,
      amount: HONEY.week,
      reason: 'week',
      sourceKey: `week:${week}`,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: schema.honeyEntry.id })
  return credited.length > 0 ? HONEY.week : 0
}

/** Les semaines butinées d'un membre, comme « Ma récolte » les montre (`Harvest.weeks`). */
export type ForagedWeeks = {
  /** Le nombre de semaines butinées depuis le lancement. */
  count: number
  /** Ni la semaine en cours ni la précédente ne sont butinées (faux s'il n'y en a aucune). */
  hibernating: boolean
  /** La semaine en cours l'est déjà. */
  currentForaged: boolean
}

/**
 * Les semaines butinées de ce membre à l'heure `now`. Une requête : les semaines distinctes de ses
 * entrées butinantes qui comptent. Ni les entrées révoquées par la modération, ni celles du
 * rattrapage (`backfill` : les séries partent de zéro au lancement, relecture de sécurité S5).
 *
 * Index : `pollen_entry_member_week_idx` (member_id, week), lu pour ce seul membre ; « distinct »
 * ne garde qu'une ligne par semaine. `db` peut être une transaction.
 */
export const loadForagedWeeks = async (
  db: Pick<Database, 'selectDistinct'>,
  memberId: string,
  now: Date,
): Promise<ForagedWeeks> => {
  const rows = await db
    .selectDistinct({ week: p.week })
    .from(p)
    .where(
      and(
        eq(p.memberId, memberId),
        inArray(p.gesture, [...FORAGING_GESTURES]),
        isNull(p.revokedAt),
        eq(p.backfill, false),
      ),
    )
  const weeks = new Set(rows.map((row) => row.week))
  const current = weekOf(now)
  const currentForaged = weeks.has(current)
  return {
    count: weeks.size,
    hibernating: weeks.size > 0 && !currentForaged && !weeks.has(weekShift(current, -1)),
    currentForaged,
  }
}
