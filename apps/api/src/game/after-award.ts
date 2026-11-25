// Ce qui suit une entrée du grand livre du pollen (R19, plan, choix 2) : l'avis d'un niveau atteint
// (choix 10), les sceaux (choix 8), puis l'avancée du défi perso et des défis de ruche (choix 7).
// `award` (game/award.ts) l'appelle dans la même transaction, sous le verrou de jeu du membre, une
// fois l'entrée écrite ; jamais pour une entrée refusée (plafond, déjà payée, compte d'exemple ou
// suspendu). Ce fichier n'écrit jamais `pollen_entry` : le pollen d'un défi réussi repasse par
// `award` (geste `challenge`), seul point d'écriture du grand livre (game.static.test.ts), qui
// rappelle alors ce fichier pour cette nouvelle entrée (niveau et sceaux seulement).
import { type Family, type LedgerGesture, levelFor, type PollenSourceKind } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from './award'
import { advanceChallenges } from './challenges'
import { writeNotice } from './notices'
import { evaluateSeals } from './seals'

/** L'entrée qui vient d'être écrite, telle qu'`award` l'a rangée. */
export type AwardedEntry = {
  id: string
  memberId: string
  gesture: LedgerGesture
  family: Family
  amount: number
  sourceKind: PollenSourceKind
  sourceId: string
  sourceKey: string
  /** L'autre membre du geste (l'auteur du projet pour qui agit), ou null. */
  counterpartId: string | null
  /** Le projet où le geste a eu lieu, ou null (suivi d'un membre, ruche, profil). */
  projectId: string | null
  /** Le jour et la semaine (son lundi) de Paris, `YYYY-MM-DD`. */
  day: string
  week: string
  /** L'heure du geste (celle de l'API, jamais `now()` de SQL). */
  now: Date
}

const p = schema.pollenEntry
const n = schema.gameNotice

/**
 * L'avis « Niveau N » quand cette entrée fait passer un niveau. Le niveau n'est jamais gardé (choix
 * 4) : on le recalcule depuis le total des entrées non révoquées du membre (une somme par l'index
 * `pollen_entry_member_week_idx`, lu par son début member_id), avant et après l'entrée. Un niveau
 * déjà annoncé (perdu par une révocation, puis regagné) ne l'est pas deux fois : l'index
 * `game_notice_member_idx` (member_id, …) trouve ses avis.
 */
const noticeLevel = async (tx: Tx, entry: AwardedEntry) => {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${p.amount}), 0)`.mapWith(Number) })
    .from(p)
    .where(and(eq(p.memberId, entry.memberId), isNull(p.revokedAt)))
  const total = row?.total ?? 0
  const level = levelFor(total)
  if (level <= levelFor(total - entry.amount)) return
  const [told] = await tx
    .select({ id: n.id })
    .from(n)
    .where(and(eq(n.memberId, entry.memberId), eq(n.kind, 'level'), eq(n.level, level)))
    .limit(1)
  if (told) return
  await writeNotice(tx, entry.memberId, { kind: 'level', level }, entry.now)
}

/**
 * Les suites d'une entrée payée. Le niveau d'abord : le pollen d'un défi réussi s'ajoute ensuite
 * (advanceChallenges), et chaque entrée compare son propre avant et après.
 */
export const afterAward = async (tx: Tx, entry: AwardedEntry): Promise<void> => {
  await noticeLevel(tx, entry)
  await evaluateSeals(tx, entry)
  await advanceChallenges(tx, entry)
}
