// La comparaison d'un code tapé par un visiteur avec un code du serveur : le code d'inscription
// (SIGNUP_INVITE_CODE, lu par auth.ts) et, depuis R20, celui des Éclaireuses (SCOUT_INVITE_CODE, lu
// aussi par routes/scouts.ts). Une seule façon de comparer, au même endroit, pour les deux.
import { createHash, timingSafeEqual } from 'node:crypto'
import { normalizeInviteCode } from '@ruche/contracts'

// L'empreinte (SHA-256) d'un code d'invitation, sous sa forme comparable (voir
// normalizeInviteCode). Deux empreintes ont toujours la même longueur : c'est ce que demande
// timingSafeEqual, ci-dessous.
const inviteDigest = (code: string) =>
  createHash('sha256').update(normalizeInviteCode(code)).digest()

/**
 * Le code envoyé est-il le bon ? timingSafeEqual compare les deux empreintes en un temps qui ne
 * dépend pas de leur contenu. Une comparaison ordinaire s'arrête au premier caractère différent :
 * en chronométrant les réponses, un attaquant pourrait deviner le code caractère par caractère.
 */
export const isRightInviteCode = (sent: unknown, expected: string) =>
  typeof sent === 'string' && timingSafeEqual(inviteDigest(sent), inviteDigest(expected))
