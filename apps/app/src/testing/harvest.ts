// La récolte d'exemple (R19, docs/scenarios/refonte.md, « R19 — La gamification ») : « Ma récolte »
// de Léa (GET /v1/me/harvest), celle d'un nouveau membre, et les classements de la semaine
// (GET /v1/rankings). Conformes au contrat (`packages/contracts/src/game.ts`), pour les tests des
// écrans (`screens/Harvest.testkit.tsx` les vérifie par le schéma) et les captures
// (`scripts/shots.mjs`).
//
// Seulement des types importés : `scripts/shots.mjs` lit ce fichier avec Node, qui ne sait charger
// ni les sources de @ruche/contracts (leurs imports n'ont pas d'extension), ni un autre fichier de
// `testing/` sans extension. Les identifiants des ruches et des membres sont donc recopiés de
// `testing/hives.ts` (les mêmes : toucher un nom ouvre une page que le faux serveur connaît).
import type { Harvest, HarvestHiveChallenge, Ranking } from '@ruche/contracts'

// Les ruches de Léa (`testing/hives.ts`) : « Famille » (4 membres) et « Amis du jeudi » (6).
const familleId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c01'
const amisId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c02'

/** Le lundi de la semaine des exemples (heure de Paris). */
export const HARVEST_WEEK = '2026-10-19'

/** « 5 retours entre vous » dans Famille : 3 sur 5, en cours. */
export const familleFeedbackChallenge: HarvestHiveChallenge = {
  hiveId: familleId,
  hiveName: 'Famille',
  code: 'feedback_5',
  progress: 3,
  target: 5,
  done: false,
  isNew: false,
}

/** « 10 réactions entre vous » dans Amis du jeudi : tiré ce lundi, personne n'a encore réagi. */
export const amisNewChallenge: HarvestHiveChallenge = {
  hiveId: amisId,
  hiveName: 'Amis du jeudi',
  code: 'reactions_10',
  progress: 0,
  target: 10,
  done: false,
  isNew: true,
}

/**
 * « Ma récolte » de Léa : niveau 4 (880 pollen, 7 alvéoles, 120 avant le niveau 5), Gardienne,
 * 85 pollen cette semaine (déjà butinée), 7 semaines butinées, 35 miel, trois défis à choisir, le
 * défi de Famille en cours, trois sceaux, la décoration de départ.
 */
export const leaHarvest: Harvest = {
  level: 4,
  total: 880,
  cells: 7,
  toNext: 120,
  title: { family: 'keeper', form: 'f', pinned: false },
  obtainedFamilies: ['keeper', 'forager', 'builder'],
  week: { total: 85, byFamily: { forager: 18, builder: 20, keeper: 47, dancer: 0 } },
  weeks: { count: 7, hibernating: false, currentForaged: true },
  honey: 35,
  personalChallenge: { state: 'choose', offered: ['feedback', 'update', 'comment_3'] },
  hiveChallenges: [familleFeedbackChallenge],
  seals: [
    { code: 'first_feedback', earnedAt: '2026-10-14T09:30:00.000Z' },
    { code: 'cooking', earnedAt: '2026-10-02T18:12:00.000Z' },
    { code: 'first_project', earnedAt: '2026-09-21T10:00:00.000Z' },
  ],
  decoration: { tint: 'honey', pattern: 'smooth' },
  ownedDecorations: { tints: ['honey', 'amber'], patterns: ['smooth'] },
  settings: { titleForm: 'f', pinnedFamily: null, inRankings: true, harvestNotices: true },
  levelSeen: 4,
}

/**
 * Un nouveau membre (option a11 des planches) : 10 pollen pour sa photo, niveau 1, aucun titre,
 * aucune semaine butinée, aucun miel, aucun sceau, aucune ruche de 3.
 */
export const newcomerHarvest: Harvest = {
  ...leaHarvest,
  level: 1,
  total: 10,
  cells: 1,
  toNext: 90,
  title: null,
  obtainedFamilies: [],
  week: { total: 10, byFamily: { forager: 0, builder: 10, keeper: 0, dancer: 0 } },
  weeks: { count: 0, hibernating: false, currentForaged: false },
  honey: 0,
  hiveChallenges: [],
  seals: [],
  ownedDecorations: { tints: ['honey'], patterns: ['smooth'] },
  levelSeen: 1,
}

/** Le lundi matin (capture `recolte-lundi`) : rien encore cette semaine, le défi de ruche neuf. */
export const mondayHarvest: Harvest = {
  ...leaHarvest,
  week: { total: 0, byFamily: { forager: 0, builder: 0, keeper: 0, dancer: 0 } },
  weeks: { count: 7, hibernating: false, currentForaged: false },
  hiveChallenges: [amisNewChallenge],
}

const member = (id: string, name: string) => ({ id, name, avatarUrl: null })

/**
 * Le classement des proches de Léa (ceux qu'elle suit) : Inès en tête, Léa 2e à égalité avec Max,
 * Tante Odile 4e (sans rang écrit, option b4).
 */
export const closeRanking: Ranking = {
  scope: 'close',
  week: HARVEST_WEEK,
  rows: [
    { rank: 1, member: member('ines-id', 'Inès Haddad'), pollen: 340, self: false },
    { rank: 2, member: member('u1', 'Léa'), pollen: 120, self: true },
    { rank: 2, member: member('max-id', 'Max Durand'), pollen: 120, self: false },
    { rank: 4, member: member('odile-id', 'Tante Odile'), pollen: 45, self: false },
  ],
}

/** Le classement de Famille : Papi Jean, puis Léa, puis Tante Odile. */
export const familleRanking: Ranking = {
  scope: 'hive',
  hiveId: familleId,
  week: HARVEST_WEEK,
  rows: [
    { rank: 1, member: member('jean-id', 'Papi Jean'), pollen: 95, self: false },
    { rank: 2, member: member('u1', 'Léa'), pollen: 60, self: true },
    { rank: 3, member: member('odile-id', 'Tante Odile'), pollen: 25, self: false },
  ],
}

/** Le classement d'Amis du jeudi : Hugo seul a gagné du pollen. */
export const amisRanking: Ranking = {
  scope: 'hive',
  hiveId: amisId,
  week: HARVEST_WEEK,
  rows: [{ rank: 1, member: member('hugo-id', 'Hugo Lefèvre'), pollen: 30, self: false }],
}

/** Le lundi matin : personne n'a encore gagné de pollen (l'état vide de la page). */
export const emptyRanking: Ranking = { scope: 'close', week: HARVEST_WEEK, rows: [] }
