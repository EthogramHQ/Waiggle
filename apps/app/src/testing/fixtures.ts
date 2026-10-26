// Données d'exemple réutilisées par les tests.
import type { Me } from '@ruche/contracts'

export const leaMe: Me = {
  id: 'u1',
  name: 'Léa',
  handle: 'lea',
  email: 'lea@example.com',
  emailVerified: true,
  language: 'fr',
  createdAt: '2026-10-12T08:00:00.000Z',
  bio: 'Je bricole des agents IA le week-end.',
  favoriteTools: ['Claude', 'Cursor'],
  avatarUrl: null,
  // Tranche 7a : Léa n'est pas administratrice (voir `adminMe` pour Louis).
  isAdmin: false,
  // Tranche 7c : pas suspendue.
  suspension: null,
}

/** Louis, administrateur (tranche 7a) : il voit « Modération » dans Mon compte. */
export const adminMe: Me = {
  ...leaMe,
  id: 'u9',
  name: 'Louis',
  handle: 'louis',
  email: 'louis@example.com',
  bio: '',
  favoriteTools: [],
  isAdmin: true,
}

/**
 * Léa, suspendue 7 jours après un signalement (tranche 7c) : son compte est en lecture seule. Les
 * valeurs sont celles de `sevenDaySuspension` (testing/moderation.ts), recopiées ici : les captures
 * (scripts/shots.mjs) lisent ce fichier avec Node, qui ne suit pas un import sans extension. La fin,
 * 23 h 30 UTC le 2 novembre, s'écrit « 3 novembre à 0 h 30 (heure de Paris) » (J4).
 */
export const suspendedMe: Me = {
  ...leaMe,
  suspension: {
    since: '2026-10-26T23:30:00.000Z',
    endsAt: '2026-11-02T23:30:00.000Z',
    ground: 'rules',
    explanation: 'Trois messages d’arnaque en deux jours, après deux retraits.',
    afterReport: true,
  },
}
