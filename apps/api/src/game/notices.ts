// Les avis du jeu dans l'Activité (R19, plan, choix 10 et 11) : un niveau passé, un sceau gagné, le
// défi d'une ruche réussi, du miel reçu sur un projet. Ce fichier est le seul qui écrit la table
// `game_notice` (l'avis d'introduction mis à part, écrit une fois par la migration du rattrapage) ;
// notifications/load.ts les relit comme une source de plus de l'Activité.
//
// Le réglage « Ma récolte » (`member_game.harvest_notices`) coupe les avis : pendant qu'il est
// éteint, on n'en écrit plus (ici), et la lecture cache ceux d'avant. Rallumé, les anciens
// reviennent ; ce qui s'est passé pendant la coupure n'a jamais été écrit.
//
// R20, les Éclaireuses : « Ta danse a été entendue » (un retour corrigé), « N missions cette
// semaine » et le retrait. Le retrait n'est jamais coupé par « Ma récolte » : il dit à l'Éclaireuse
// pourquoi on l'a retirée et comment joindre l'éditeur (relecture juridique J1, 26/11/2026).
import { randomUUID } from 'node:crypto'
import { schema } from '@ruche/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from './award'

/** Ce que dit un avis, selon sa sorte ; les identifiants vont dans des colonnes à clé étrangère. */
export type GameNoticeInput =
  | { kind: 'level'; level: number }
  | { kind: 'seal'; code: string }
  | { kind: 'hive_challenge'; hiveId: string; code: string; honey: number }
  | { kind: 'honey_gift'; actorId: string; projectId: string }
  // R20 : le retour corrigé (son extrait se lit à l'affichage, jamais recopié ici). `honey` : le
  // miel versé, ou null quand rien ne l'a été (compte suspendu ou d'exemples, relecture juridique
  // L1) : l'avis ne promet alors aucun gain.
  | { kind: 'scout_heard'; reportId: string; honey: number | null }
  // R20 : la semaine (son lundi, dans `code` : un seul avis par membre et par semaine) et le
  // nombre de missions publiées.
  | { kind: 'scout_missions'; week: string; count: number }
  // R20 : le motif du retrait, écrit par l'administrateur.
  | { kind: 'scout_removed'; reason: string }

/** Les sortes d'avis que « Ma récolte » ne coupe pas (le retrait, J1). notifications/load.ts lit la même liste. */
export const ALWAYS_SHOWN_NOTICES: readonly GameNoticeInput['kind'][] = ['scout_removed']

/** Les colonnes d'un avis, à partir de sa sorte (les autres restent vides, contrainte de la base). */
const columnsOf = (notice: GameNoticeInput) => {
  switch (notice.kind) {
    case 'level':
      return { kind: notice.kind, level: notice.level }
    case 'seal':
      return { kind: notice.kind, code: notice.code }
    case 'hive_challenge':
      return { kind: notice.kind, hiveId: notice.hiveId, code: notice.code, honey: notice.honey }
    case 'honey_gift':
      return { kind: notice.kind, actorId: notice.actorId, projectId: notice.projectId }
    case 'scout_heard':
      return { kind: notice.kind, reportId: notice.reportId, honey: notice.honey }
    case 'scout_missions':
      return { kind: notice.kind, code: notice.week, count: notice.count }
    case 'scout_removed':
      return { kind: notice.kind, reason: notice.reason }
  }
}

/**
 * Écrit un avis pour chacun de ces membres, sauf ceux qui ont coupé « Ma récolte » (le retrait des
 * Éclaireuses, `ALWAYS_SHOWN_NOTICES`, part quand même). Deux requêtes,
 * quel que soit le nombre de membres (tous ceux d'une ruche, pour un défi réussi) : les réglages
 * coupés, par la clé primaire de `member_game` (pas de ligne : allumé, la valeur par défaut) ; puis
 * une seule insertion de plusieurs lignes. Rend les membres prévenus.
 */
export const writeNotices = async (
  tx: Tx,
  notices: readonly { memberId: string; notice: GameNoticeInput }[],
  now: Date,
): Promise<string[]> => {
  if (notices.length === 0) return []
  const ids = [...new Set(notices.map((item) => item.memberId))]
  const off = await tx
    .select({ memberId: schema.memberGame.memberId })
    .from(schema.memberGame)
    .where(
      and(inArray(schema.memberGame.memberId, ids), eq(schema.memberGame.harvestNotices, false)),
    )
  const muted = new Set(off.map((row) => row.memberId))
  const kept = notices.filter(
    (item) => ALWAYS_SHOWN_NOTICES.includes(item.notice.kind) || !muted.has(item.memberId),
  )
  if (kept.length === 0) return []
  // « on conflict do nothing » (R20) : un avis déjà écrit pour la même chose (le même retour
  // corrigé, la même semaine de missions : les index uniques de game_notice) est sauté sans erreur
  // ni abandon de la transaction. « returning » rend les lignes vraiment écrites.
  const written = await tx
    .insert(schema.gameNotice)
    .values(
      kept.map((item) => ({
        id: randomUUID(),
        memberId: item.memberId,
        ...columnsOf(item.notice),
        createdAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ memberId: schema.gameNotice.memberId })
  return written.map((row) => row.memberId)
}

/**
 * Écrit un avis pour un membre, s'il n'a pas coupé « Ma récolte » ; rend vrai s'il est écrit. L'offre
 * de miel (game/honey.ts) l'appelle pour l'auteur du projet : `{ kind: 'honey_gift', actorId,
 * projectId }`.
 */
export const writeNotice = async (
  tx: Tx,
  memberId: string,
  notice: GameNoticeInput,
  now: Date,
): Promise<boolean> => (await writeNotices(tx, [{ memberId, notice }], now)).length > 0
