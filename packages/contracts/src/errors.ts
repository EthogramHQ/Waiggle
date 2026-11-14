import { z } from 'zod'

// La liste fermée des codes d'erreur. Le code sert aux programmes (l'appli réagit selon le code),
// le message sert aux humains (il est traduit dans la langue du visiteur).
export const ErrorCode = z.enum([
  'not_found',
  'validation',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'payload_too_large',
  'unsupported_media_type',
  'unavailable',
  'too_many_visuals',
  'cannot_follow_own',
  'cannot_react_own',
  'handle_taken',
  'handle_change_limit',
  'unsubscribe_invalid',
  // Tranche 7a : signaler son propre contenu, ou décider de ce qui nous concerne ; signaler deux
  // fois la même chose ; une décision déjà prise entre-temps ; modifier un contenu retiré.
  'own_content',
  'already_reported',
  'already_decided',
  'removed',
  // Tranche 7b : se bloquer soi-même ; mentionner un membre qu'on a bloqué ; re-signaler un contenu
  // inchangé depuis que la modération l'a examiné.
  'cannot_block_own',
  'blocked_mention',
  'already_examined',
  // Tranche 7c : une action refusée à un compte suspendu ; le mot de passe redemandé à un
  // administrateur, absent ou faux ; suspendre un administrateur en fonction.
  'suspended',
  'password_required',
  'wrong_password',
  'cannot_suspend_admin',
  // Tranche R2 : corriger l'adresse d'un compte déjà vérifié (il suffit de se connecter).
  'already_verified',
  // Tranche R6a : une seconde catégorie sans principale (projet d'avant R6a), ou égale à la
  // principale déjà enregistrée.
  'category_required',
  'same_category',
  // Tranche R6b : une catégorie qui n'est pas en base ; un nom d'outil ou de catégorie déjà pris ;
  // trop d'« Autre » créés en un jour ; un administrateur qui range son propre projet.
  'unknown_category',
  'tool_name_taken',
  'category_name_taken',
  'too_many_other_tools',
  'own_project',
  // Tranche R7a : une photo citée par une mise à jour qui n'est pas une photo en attente de ce projet ;
  // tester son propre projet ; un projet qui ne cherche pas de testeurs, ou qui en a 200 ; 100 photos
  // de mises à jour sur un projet.
  'invalid_photos',
  'cannot_test_own',
  'not_testable',
  'testers_full',
  'update_photos_full',
  // Tranche R7b : écrire dans un coin fermé (projet retiré, privé, auteur suspendu) ; répondre dans
  // un fil fermé (ancien testeur, ou testeur qui n'a jamais écrit) ; une image citée qui n'est pas
  // une image en attente de ce membre et de ce projet ; un retour cité par une mise à jour qui n'est
  // plus à traiter ; 100 images sur un fil ou 100 photos d'appel sur un projet.
  'corner_closed',
  'thread_closed',
  'invalid_photo',
  'invalid_feedback',
  'tester_media_full',
  // Tranche R7b : le 6e appel d'un projet dans la journée (429). Le quota du membre (20 appels en
  // 24 h) garde `rate_limited` : l'appli distingue les deux pour dire lequel est atteint.
  'project_calls_limited',
  // Tranche R9 : retirer seule une partie qui ne se retire qu'avec tout le contenu (titre, pitch,
  // texte d'une mise à jour) ou qui se range (catégorie) ; retirer une partie qu'aucun signalement
  // ouvert ne vise.
  'part_whole_only',
  'part_not_reported',
  'internal',
])
export type ErrorCode = z.infer<typeof ErrorCode>

/** Toutes les erreurs renvoyées par l'API ont cette forme, quel que soit le problème. */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' })

export type ErrorResponse = z.infer<typeof ErrorResponse>
