// Les avis du jeu dans l'Activité (R19, plan, choix 10 et 11) : un niveau passé, un sceau gagné, le
// défi d'une ruche réussi, du miel reçu sur un projet. Ce fichier est le seul qui écrit la table
// `game_notice` (l'avis d'introduction mis à part, écrit une fois par la migration du rattrapage) ;
// notifications/load.ts les relit comme une source de plus de l'Activité.
//
// Le réglage « Ma récolte » (`member_game.harvest_notices`) coupe les avis : pendant qu'il est
// éteint, on n'en écrit plus (ici), et la lecture cache ceux d'avant. Rallumé, les anciens
// reviennent ; ce qui s'est passé pendant la coupure n'a jamais été écrit.
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
  }
}

/**
 * Écrit un avis pour chacun de ces membres, sauf ceux qui ont coupé « Ma récolte ». Deux requêtes,
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
  const kept = notices.filter((item) => !muted.has(item.memberId))
  if (kept.length === 0) return []
  await tx.insert(schema.gameNotice).values(
    kept.map((item) => ({
      id: randomUUID(),
      memberId: item.memberId,
      ...columnsOf(item.notice),
      createdAt: now,
    })),
  )
  return kept.map((item) => item.memberId)
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
