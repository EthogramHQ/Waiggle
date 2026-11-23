// Ce qui suit une entrée du grand livre du pollen (R19, plan, choix 2) : l'avancée du défi perso et
// des défis de ruche (choix 7), les sceaux (choix 8) et l'avis d'un niveau atteint (choix 10).
// `award` (game/award.ts) l'appelle dans la même transaction, sous le verrou de jeu du membre, une
// fois l'entrée écrite ; jamais pour une entrée refusée (plafond, déjà payée, compte d'exemple ou
// suspendu). Ce fichier n'écrit jamais `pollen_entry` : le pollen d'un défi réussi repasse par
// `award` (geste `challenge`), seul point d'écriture du grand livre (game.static.test.ts).
//
// Pour l'instant un point d'appel vide : les défis, les sceaux et les avis s'y branchent
// (game/challenges.ts, game/seals.ts, game/notices.ts).
import type { Family, LedgerGesture, PollenSourceKind } from '@ruche/contracts'
import type { Tx } from './award'

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

/** Les suites d'une entrée payée : rien encore (voir l'en-tête du fichier). */
export const afterAward = async (_tx: Tx, _entry: AwardedEntry): Promise<void> => {}
