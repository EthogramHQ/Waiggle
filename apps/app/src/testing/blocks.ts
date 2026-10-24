// Les membres bloqués d'exemple pour les tests de l'appli (tranche 7b) : la liste « Membres
// bloqués » telle que l'API la donne à Malik (GET /v1/me/blocks), du blocage le plus récent au plus
// ancien. Seuls des types viennent de @ruche/contracts : les captures (scripts/shots.mjs) lisent ce
// fichier.
import type { BlockedMember, BlockedPage } from '@ruche/contracts'

/** Inès, bloquée hier par Malik après avoir signalé son commentaire. */
export const blockedInes: BlockedMember = {
  member: { id: 'u5', name: 'Inès Morel', handle: 'ines_morel', avatarUrl: null },
  blockedAt: '2026-10-23T18:30:00.000Z',
}

/** Sam, bloqué la semaine dernière. */
export const blockedSam: BlockedMember = {
  member: { id: 'u9', name: 'Sam Petit', handle: 'sam', avatarUrl: null },
  blockedAt: '2026-10-17T08:15:00.000Z',
}

export const blockedMembers: BlockedMember[] = [blockedInes, blockedSam]

export const blockedPageOf = (
  items: BlockedMember[] = blockedMembers,
  nextCursor: string | null = null,
): BlockedPage => ({ items, nextCursor })
