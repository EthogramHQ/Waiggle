// L'inventaire des routes (tranche 7b, règle 18 de la relecture du plan) : chaque route de l'API est
// classée selon ce qu'elle fait d'un blocage. Une route ajoutée un jour sans être classée fait
// échouer ce test : quelqu'un doit alors décider si elle montre le geste d'un autre membre, et donc
// si elle doit cacher un membre bloqué (blocks/visibility.ts).
//
// Les classes :
// - hidesBlocked : montre le contenu ou le geste d'un autre membre ; un blocage, dans un sens ou
//   dans l'autre, le cache ; le test qui le prouve est cité dans PROOFS, et ce fichier vérifie
//   qu'il existe ;
// - own : ne touche qu'à ce qui est à soi (son compte, ses réglages, ses propres gestes) ;
// - admin : l'administration, qui ignore les blocages (précision 7 : sinon bloquer l'administrateur
//   ferait échapper à la modération) ;
// - public : sans contenu d'un membre (santé, contrat, connexion, fichiers à clé aléatoire).
//
// Tranche 7c (relecture de sécurité S2) : une seconde colonne dit si la route reste permise à un
// compte suspendu (`allowed`) ou s'il reçoit 403 `suspended` (`refused`). La garde laisse passer
// tout GET et tout DELETE (lire, supprimer ses contenus, ne plus suivre, débloquer), et quelques
// exceptions : signaler, bloquer, masquer un commentaire sur son projet, marquer ses
// notifications vues, régler ses e-mails, se désinscrire par le lien d'un e-mail, `PATCH /v1/me`
// (la route n'y accepte que la langue, S9). Better Auth (`/api/auth/*` : changer d'adresse,
// supprimer son compte, se déconnecter) n'est pas sous `/v1`. `POST /v1/moderation/decisions` est
// permise par la garde : un administrateur suspendu n'en est plus un (S19), et la garde de la
// modération lui répond le même 404 qu'à tout membre (S16). Une boucle sur chaque route, avec un
// membre suspendu et un corps invalide, prouve la colonne.
//
// R9 (relecture de sécurité du plan, P7) : deux écritures sont permises « en partie » (`partial`) :
// la garde les laisse entrer, et la route ne garde que quelques corps (`PATCH /v1/me` : la langue,
// vider sa bio ou ses outils, un nom ou un pseudo provisoires ; `PATCH /v1/projects/:id` :
// `{ visibility: 'private' }`). Chacune cite dans SUSPENSION_PROOFS les tests qui le prouvent. Et
// chaque route qui montre le contenu d'un autre membre cite dans PART_PROOFS le test qui prouve
// qu'une partie retirée par la modération n'y paraît plus (ou dit pourquoi elle n'en montre pas).
//
// R11 (relecture de sécurité du plan, S-B1) : une troisième colonne dit si la route reste permise à
// un membre qui n'a pas accepté la version des règles en vigueur (`allowed`), ou s'il reçoit 403
// `rules_required` (`refused`). La garde de l'accord (rules/guard.ts) laisse passer tout GET, HEAD
// et DELETE (décision D1), ses sorties (accepter, régler ses e-mails, se désinscrire par le lien
// d'un e-mail), et, décision D4 (15/11/2026), les écritures que la suspension permet entièrement
// (signaler, bloquer, masquer un commentaire sur son projet, marquer vu ou lu…). Celles qu'elle ne
// permet qu'en partie restent refusées : son profil, son projet (`partial`) et la décision de
// modération (une route d'administrateur). La colonne est comparée à la liste de la garde, et une
// boucle, avec un membre sans l'accord et un corps invalide, la prouve route par route. Accepter
// reste aussi permis
// à un compte suspendu (S-B1) : la colonne « suspension » le dit, et ALLOWED_WRITES le contient.
//
// R12 (relecture de sécurité du plan, B3) : une cinquième classe, `visitor`, pour les routes
// `/v1/public/*`, lues sans compte. Elles montrent le contenu d'un membre (un projet public, sa page
// publique) : ce n'est pas la classe `public`, qui veut dire « sans contenu d'un membre ». Elles ne
// lisent jamais la session : le blocage n'y joue pas (un visiteur n'a personne à bloquer), mais
// chacune cite dans VISITOR_PROOFS le test qui prouve qu'un projet ou une page qui n'est pas public
// y répond comme un identifiant inconnu. Leurs lectures entrent aussi dans les preuves des parties
// retirées et des ruches, comme celles des membres.
//
// R19 (la gamification ; relecture de sécurité du plan, B2) : cinq routes neuves. « Ma récolte » et
// les réglages du jeu ne touchent qu'à soi ; régler son jeu reste permis pendant une suspension
// (ALLOWED_WRITES, comme régler ses e-mails), donc aussi sans l'accord aux règles (décision D4).
// Décorer son rayon et offrir du miel sont refusés à un suspendu. Offrir du miel au projet d'un
// membre bloqué, dans un sens ou dans l'autre, répond le même 404 qu'un projet inconnu ; le
// classement ne montre jamais un membre bloqué, ni la photo retirée d'un membre classé.
import { existsSync, readFileSync } from 'node:fs'
import { ErrorResponse } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { ALLOWED_WRITES } from './suspension/guard'
import { activity } from './testing/activity'
import { createTestContext } from './testing/context'

type RouteClass = 'hidesBlocked' | 'own' | 'admin' | 'public' | 'visitor'
/** Ce que la garde des comptes suspendus fait de la route (tranche 7c). */
type DuringSuspension = 'allowed' | 'refused' | 'partial'
/** Ce que la garde de l'accord aux règles fait de la route (tranche R11). */
type WithoutRules = 'allowed' | 'refused'

/**
 * Chaque route, « MÉTHODE /chemin » tel que Hono l'écrit (`:id` pour un paramètre), avec ses trois
 * colonnes : ce qu'elle fait d'un blocage, si elle reste permise pendant une suspension, et si elle
 * reste permise sans l'accord aux règles en vigueur.
 */
const ROUTES: Record<string, readonly [RouteClass, DuringSuspension, WithoutRules]> = {
  'GET /health': ['public', 'allowed', 'allowed'],
  'GET /openapi.json': ['public', 'allowed', 'allowed'],
  // Better Auth : inscription, connexion, vérification, suppression du compte.
  'GET /api/auth/*': ['public', 'allowed', 'allowed'],
  'POST /api/auth/*': ['public', 'allowed', 'allowed'],
  // Les fichiers : une clé tirée au hasard, neuve à chaque photo (règle 11).
  'GET /media/:folder/:file': ['public', 'allowed', 'allowed'],
  // Mon compte.
  'GET /v1/me': ['own', 'allowed', 'allowed'],
  'PATCH /v1/me': ['own', 'partial', 'refused'],
  'POST /v1/me/avatar': ['own', 'refused', 'refused'],
  // R9 (jur-R5) : retirer sa photo de profil, permis pendant une suspension comme tout DELETE.
  'DELETE /v1/me/avatar': ['own', 'allowed', 'allowed'],
  'GET /v1/me/export': ['own', 'allowed', 'allowed'],
  'GET /v1/me/email-preferences': ['own', 'allowed', 'allowed'],
  'PATCH /v1/me/email-preferences': ['own', 'allowed', 'allowed'],
  'GET /v1/me/blocks': ['own', 'allowed', 'allowed'],
  // R11 : accepter les règles en vigueur (l'écran « Accepter »), la sortie de la garde de l'accord,
  // permise aussi pendant une suspension (S-B1) : accepter ne rend pas l'écriture.
  'POST /v1/me/rules': ['own', 'allowed', 'allowed'],
  // R11 : « Mes commentaires » et « Mes retours envoyés » (Mes données). Ses propres textes, mais
  // avec le projet d'un autre (titre, couverture, nom de l'auteur) : `null` à la place quand il ne le
  // voit plus, blocage compris. Supprimer un de ses commentaires d'ici est un DELETE, permis sans
  // l'accord et pendant une suspension (J1).
  'GET /v1/me/comments': ['hidesBlocked', 'allowed', 'allowed'],
  'DELETE /v1/me/comments/:commentId': ['own', 'allowed', 'allowed'],
  'GET /v1/me/tester-messages': ['hidesBlocked', 'allowed', 'allowed'],
  // Corriger son adresse avant de l'avoir vérifiée (tranche R2, A4) : sans session, l'adresse
  // actuelle et le mot de passe suffisent ; la route ne lit jamais la session (sec-S9).
  'POST /v1/account/unverified-email': ['public', 'allowed', 'allowed'],
  // Le lien de désinscription d'un e-mail : signé, sans session.
  'GET /v1/email/unsubscribe': ['public', 'allowed', 'allowed'],
  'POST /v1/email/unsubscribe': ['public', 'allowed', 'allowed'],
  // Les projets, leurs mises à jour, testeurs, visuels, réactions et commentaires.
  'POST /v1/projects': ['own', 'refused', 'refused'],
  'GET /v1/projects/:id': ['hidesBlocked', 'allowed', 'allowed'],
  // R9 (J14, décision L6) : un suspendu peut passer son projet en privé, et rien d'autre.
  'PATCH /v1/projects/:id': ['own', 'partial', 'refused'],
  'DELETE /v1/projects/:id': ['own', 'allowed', 'allowed'],
  'POST /v1/projects/:id/visuals': ['own', 'refused', 'refused'],
  'DELETE /v1/projects/:id/visuals/:visualId': ['own', 'allowed', 'allowed'],
  // Décrire une photo de son projet (R6a) : ne touche qu'à ce qui est à soi ; c'est écrire un
  // texte, refusé pendant une suspension comme les autres écritures du projet (POST …/visuals).
  'PATCH /v1/projects/:id/visuals/:visualId': ['own', 'refused', 'refused'],
  // R7a (relecture de sécurité A2) : les mises à jour remplacent les notes. Publier ne touche qu'à
  // son projet, refusé pendant une suspension ; la frise montre les contenus d'un autre, cachée à
  // un membre bloqué ; supprimer sa mise à jour reste permis. Rejoindre les testeurs est le geste
  // d'un membre vers le projet d'un autre (404 en cas de blocage, comme suivre) ; les quitter
  // reste permis, comme ne plus suivre.
  'POST /v1/projects/:id/updates': ['own', 'refused', 'refused'],
  'GET /v1/projects/:id/updates': ['hidesBlocked', 'allowed', 'allowed'],
  'DELETE /v1/projects/:id/updates/:updateId': ['own', 'allowed', 'allowed'],
  'POST /v1/projects/:id/testers': ['hidesBlocked', 'refused', 'refused'],
  'DELETE /v1/projects/:id/testers': ['own', 'allowed', 'allowed'],
  // R7b : le coin des testeurs. Entrer dans le coin montre l'inscription d'autres membres (l'auteur)
  // et un blocage défait l'accès du testeur (il n'a plus que son fil) ; retirer un testeur est un
  // geste de l'auteur sur son projet, permis pendant une suspension comme tout DELETE (le coin est
  // alors fermé : 409). Lancer un appel et envoyer une image écrivent : refusés à un suspendu.
  'GET /v1/projects/:id/testers': ['hidesBlocked', 'allowed', 'allowed'],
  'DELETE /v1/projects/:id/testers/:memberId': ['own', 'allowed', 'allowed'],
  'POST /v1/projects/:id/testers/media': ['own', 'refused', 'refused'],
  'GET /v1/projects/:id/calls': ['hidesBlocked', 'allowed', 'allowed'],
  'POST /v1/projects/:id/calls': ['own', 'refused', 'refused'],
  'DELETE /v1/projects/:id/calls/:callId': ['own', 'allowed', 'allowed'],
  // R7b : les fils de retours. Lire la liste ou un fil montre les messages d'un autre : un blocage
  // fait du testeur un ancien testeur, et son pseudo et sa photo disparaissent de la liste. Écrire un
  // message est refusé à un suspendu ; marquer lu et « Marquer comme réglé » restent permis (la
  // seconde répond elle-même 409 `corner_closed` : sécurité A7) ; les DELETE passent toujours.
  'GET /v1/projects/:id/threads': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/projects/:id/threads/:testerId/messages': ['hidesBlocked', 'allowed', 'allowed'],
  'POST /v1/projects/:id/threads/:testerId/messages': ['hidesBlocked', 'refused', 'refused'],
  'POST /v1/projects/:id/threads/:testerId/read': ['own', 'allowed', 'allowed'],
  'DELETE /v1/projects/:id/messages/:messageId': ['own', 'allowed', 'allowed'],
  'POST /v1/projects/:id/messages/:messageId/settled': ['own', 'allowed', 'allowed'],
  'DELETE /v1/projects/:id/messages/:messageId/settled': ['own', 'allowed', 'allowed'],
  'GET /v1/projects/:id/feedback/open': ['own', 'allowed', 'allowed'],
  'PUT /v1/projects/:id/reactions/:kind': ['hidesBlocked', 'refused', 'refused'],
  'DELETE /v1/projects/:id/reactions/:kind': ['own', 'allowed', 'allowed'],
  'GET /v1/projects/:id/comments': ['hidesBlocked', 'allowed', 'allowed'],
  'POST /v1/projects/:id/comments': ['hidesBlocked', 'refused', 'refused'],
  'PATCH /v1/projects/:id/comments/:commentId': ['hidesBlocked', 'refused', 'refused'],
  'DELETE /v1/projects/:id/comments/:commentId': ['own', 'allowed', 'allowed'],
  'PUT /v1/projects/:id/comments/:commentId/hide': ['hidesBlocked', 'allowed', 'allowed'],
  'DELETE /v1/projects/:id/comments/:commentId/hide': ['hidesBlocked', 'allowed', 'allowed'],
  // R8 : « Voir en contexte » depuis une notification, le fil du commentaire visé.
  'GET /v1/comments/:commentId/context': ['hidesBlocked', 'allowed', 'allowed'],
  // Suivre.
  'POST /v1/members/:id/follow': ['hidesBlocked', 'refused', 'refused'],
  'DELETE /v1/members/:id/follow': ['own', 'allowed', 'allowed'],
  'POST /v1/projects/:id/follow': ['hidesBlocked', 'refused', 'refused'],
  'DELETE /v1/projects/:id/follow': ['own', 'allowed', 'allowed'],
  // Les membres, les étiquettes, le fil.
  'GET /v1/members/mentionable': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/members/:id': ['hidesBlocked', 'allowed', 'allowed'],
  'PUT /v1/members/:id/block': ['hidesBlocked', 'allowed', 'allowed'],
  'DELETE /v1/members/:id/block': ['own', 'allowed', 'allowed'],
  'GET /v1/tags/:slug': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/feed/following': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/feed/discover': ['hidesBlocked', 'allowed', 'allowed'],
  // Le fil et « Proches à suivre » (tranche R4, relecture de sécurité sec-A8) : marquer son fil lu
  // ne touche qu'à soi ; les suggestions montrent d'autres membres, et écarter répond le même 404
  // que « Suivre » à un membre bloqué dans un sens ou l'autre (sec-B1). Lire son fil et écarter
  // restent permis pendant une suspension, comme marquer ses notifications vues.
  'PUT /v1/feed/read': ['own', 'allowed', 'allowed'],
  'GET /v1/suggestions/members': ['hidesBlocked', 'allowed', 'allowed'],
  'PUT /v1/suggestions/members/:id/dismissed': ['hidesBlocked', 'allowed', 'allowed'],
  // La recherche par mots et la liste des outils (tranche R3) : des lectures qui montrent les
  // contenus des autres, cachées à un membre bloqué dans un sens ou dans l'autre.
  'GET /v1/search': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/tools': ['hidesBlocked', 'allowed', 'allowed'],
  // Les notifications.
  'GET /v1/notifications': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/notifications/unread': ['hidesBlocked', 'allowed', 'allowed'],
  'PUT /v1/notifications/seen': ['own', 'allowed', 'allowed'],
  // Signaler : la cible d'un membre bloqué répond 404 (sauf les exceptions des règles 1 et 2).
  'POST /v1/reports': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/reports/target': ['hidesBlocked', 'allowed', 'allowed'],
  // La modération.
  'GET /v1/moderation/reports': ['admin', 'allowed', 'allowed'],
  'GET /v1/moderation/removed': ['admin', 'allowed', 'allowed'],
  'POST /v1/moderation/decisions': ['admin', 'allowed', 'refused'],
  // L'historique des décisions (tranche 7c).
  'GET /v1/moderation/decisions': ['admin', 'allowed', 'allowed'],
  // Les catégories (R6b) : leurs nombres de projets ne comptent pas ceux d'un membre bloqué.
  'GET /v1/categories': ['hidesBlocked', 'allowed', 'allowed'],
  // L'administration du catalogue (R6b, routes/moderation-catalogue.ts) : sans filtre de blocage
  // (décision 1). Les lectures restent permises pendant une suspension, comme tout GET ; un
  // administrateur suspendu n'en est plus un, et la garde de la modération lui répond 404. Les
  // écritures sont refusées (403 `suspended`) comme toute écriture non permise, adresse inconnue
  // comprise : un administrateur suspendu reçoit donc, sur chaque route, la même réponse que sur
  // une adresse qui n'existe pas (sec-B2, décision 13 ; moderation-catalogue.test.ts).
  'GET /v1/moderation/tools/pending': ['admin', 'allowed', 'allowed'],
  'GET /v1/moderation/tools': ['admin', 'allowed', 'allowed'],
  'POST /v1/moderation/tools': ['admin', 'refused', 'refused'],
  'POST /v1/moderation/tools/:slug/admit': ['admin', 'refused', 'refused'],
  'PATCH /v1/moderation/tools/:slug': ['admin', 'refused', 'refused'],
  'GET /v1/moderation/tools/:slug/impact': ['admin', 'allowed', 'allowed'],
  'POST /v1/moderation/tools/:slug/merge': ['admin', 'refused', 'refused'],
  'POST /v1/moderation/tools/:slug/dismiss': ['admin', 'refused', 'refused'],
  'GET /v1/moderation/categories/pending': ['admin', 'allowed', 'allowed'],
  'POST /v1/moderation/projects/:id/category': ['admin', 'refused', 'refused'],
  'POST /v1/moderation/categories': ['admin', 'refused', 'refused'],
  'GET /v1/moderation/catalogue-changes': ['admin', 'allowed', 'allowed'],
  // R10 : les ruches (routes/hives.ts, routes/hive-invitations.ts). Mes ruches, la page, l'actualité,
  // les projets et les membres montrent d'autres membres : un blocage les cache (Q3 : sauf, chez
  // l'animateur, le nom seul de qui l'a bloqué). Épingler (PATCH) refuse le projet d'un membre bloqué
  // dans un sens ou dans l'autre comme un projet inconnu ; inviter répond le même 404 qu'à un membre
  // inconnu, et la recherche « Inviter » ne le propose jamais. Retirer un membre (Q3 : même un membre
  // qui a bloqué l'animateur), confier l'animation, supprimer la ruche, rejoindre ou refuser une
  // invitation sont des gestes sur sa ruche ou son invitation.
  // Pendant une suspension (relecture de sécurité du plan, point 2) : rien de neuf (créer, renommer,
  // épingler, inviter, confier) ; la garde laisse passer tout DELETE, et la route refuse elle-même
  // de retirer un membre ou de supprimer la ruche (403 `suspended`) mais laisse quitter : ces deux
  // DELETE sont `partial`. Accepter une invitation est permis (ALLOWED_WRITES), refuser aussi.
  'GET /v1/hives': ['hidesBlocked', 'allowed', 'allowed'],
  'POST /v1/hives': ['own', 'refused', 'refused'],
  'GET /v1/hives/:id': ['hidesBlocked', 'allowed', 'allowed'],
  'PATCH /v1/hives/:id': ['hidesBlocked', 'refused', 'refused'],
  'DELETE /v1/hives/:id': ['own', 'partial', 'allowed'],
  'GET /v1/hives/:id/activity': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/hives/:id/projects': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/hives/:id/members': ['hidesBlocked', 'allowed', 'allowed'],
  'DELETE /v1/hives/:id/members/:userId': ['own', 'partial', 'allowed'],
  'POST /v1/hives/:id/animator': ['own', 'refused', 'refused'],
  'GET /v1/hives/:id/invitable': ['hidesBlocked', 'allowed', 'allowed'],
  'POST /v1/hives/:id/invitations': ['hidesBlocked', 'refused', 'refused'],
  'POST /v1/hive-invitations/:id/accept': ['own', 'allowed', 'allowed'],
  'DELETE /v1/hive-invitations/:id': ['own', 'allowed', 'allowed'],
  // R12 : les lectures sans compte (routes/public.ts et voisines). Aucune ne lit la session : la
  // garde d'une suspension ou de l'accord n'y voit personne, et les laisse passer. Le signalement
  // d'un visiteur est une écriture sans session (même origine exigée, quota par adresse IP).
  'GET /v1/public/projects/:id': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/projects/:id/updates': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/projects/:id/updates/:updateId': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/members/:id': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/showcase': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/reports/target': ['visitor', 'allowed', 'allowed'],
  'POST /v1/public/reports': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/head': ['visitor', 'allowed', 'allowed'],
  'GET /v1/public/sitemap': ['visitor', 'allowed', 'allowed'],
  // R12 : « Mon profil public ». Un membre suspendu peut seulement fermer sa page (Q6) : la garde
  // laisse entrer, la route refuse le reste (`partial`) ; sans l'accord aux nouvelles règles, rien.
  'GET /v1/me/public-page': ['own', 'allowed', 'allowed'],
  'PATCH /v1/me/public-page': ['own', 'partial', 'refused'],
  // R12 : la vitrine. « À la une » (Explorer) suit les règles de blocage d'Explorer ; la modération
  // la règle (ses écritures sont refusées à un administrateur suspendu, comme celles du catalogue) ;
  // l'auteur la quitte par « Retirer de l'accueil », un DELETE sur son projet.
  'GET /v1/showcase': ['hidesBlocked', 'allowed', 'allowed'],
  'GET /v1/moderation/showcase': ['admin', 'allowed', 'allowed'],
  'PUT /v1/moderation/showcase': ['admin', 'refused', 'refused'],
  'DELETE /v1/projects/:id/showcase': ['own', 'allowed', 'allowed'],
  // R19 : la récolte (routes/game.ts). Lire « Ma récolte » et régler son jeu ne touchent qu'à soi ;
  // décorer son rayon dépense son miel, refusé à un suspendu comme toute écriture neuve. Offrir du
  // miel est un geste vers le projet d'un autre (404 en cas de blocage, comme réagir) ; le
  // classement montre d'autres membres, jamais un membre bloqué.
  'GET /v1/me/harvest': ['own', 'allowed', 'allowed'],
  'PATCH /v1/me/game': ['own', 'allowed', 'allowed'],
  'PUT /v1/me/game/decoration': ['own', 'refused', 'refused'],
  'POST /v1/projects/:id/honey': ['hidesBlocked', 'refused', 'refused'],
  'GET /v1/rankings': ['hidesBlocked', 'allowed', 'allowed'],
}

/** Les routes lues sans compte (R12) : tout `/v1/public/*`, et rien d'autre. */
const isVisitorPath = (route: string) => (route.split(' ')[1] ?? '').startsWith('/v1/public/')

/** La classe « blocage » d'une route (première colonne). */
const blockClass = (route: string) => ROUTES[route]?.[0]

/**
 * Le test qui prouve chaque route « hidesBlocked » (relecture de la branche 7b, A5) : son fichier
 * (à côté de celui-ci) et son titre exact, tel qu'il est écrit dans `it('…')`. Sans cette liste, une
 * route classée « cache le membre bloqué » qui ne filtrerait rien passerait l'inventaire. Le test
 * cité doit montrer la différence : le membre bloqué (dans un sens ou dans l'autre) ne voit pas ou
 * ne peut pas, un témoin le peut.
 */
const PROOFS: Record<string, { file: string; test: string }> = {
  // R11 : « Mes commentaires » et « Mes retours envoyés » gardent ses textes, mais le projet d'un
  // membre bloqué, dans un sens ou dans l'autre, y devient `null` (titres fixés pour leurs fichiers).
  'GET /v1/me/comments': {
    file: 'me-comments.test.ts',
    test: 'shows the project as null once its author and the reader are blocked, either way',
  },
  'GET /v1/me/tester-messages': {
    file: 'me-tester-messages.test.ts',
    test: 'shows the project as null once its author and the sender are blocked, either way',
  },
  'GET /v1/projects/:id': {
    file: 'blocks-visibility.test.ts',
    test: 'answers the page of a project of the other one as an unknown project',
  },
  // R7a : les deux preuves sont dans les fichiers updates.test.ts et testers.test.ts, titres
  // recopiés du plan (relecture de sécurité A12 et B2).
  'GET /v1/projects/:id/updates': {
    file: 'updates.test.ts',
    test: 'refuses the updates of a private project of someone else like an unknown project',
  },
  'POST /v1/projects/:id/testers': {
    file: 'testers.test.ts',
    test: 'answers 404 to a blocked member who tries to become a tester, in both directions',
  },
  // R7b : un blocage fait de l'ancien testeur un lecteur de son seul fil (404 sur le reste).
  'GET /v1/projects/:id/testers': {
    file: 'tester-corner.test.ts',
    test: 'keeps a read-only corner after a block, in both directions',
  },
  'GET /v1/projects/:id/calls': {
    file: 'tester-calls.test.ts',
    test: 'refuses a former tester the calls',
  },
  'GET /v1/projects/:id/threads': {
    file: 'tester-threads.test.ts',
    test: 'hides the handle and photo of a blocked former tester in the thread list',
  },
  'GET /v1/projects/:id/threads/:testerId/messages': {
    file: 'tester-threads.test.ts',
    test: 'treats a block like a departure, in both directions',
  },
  'POST /v1/projects/:id/threads/:testerId/messages': {
    file: 'tester-threads.test.ts',
    test: 'treats a block like a departure, in both directions',
  },
  'PUT /v1/projects/:id/reactions/:kind': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'GET /v1/projects/:id/comments': {
    file: 'comments.test.ts',
    test: 'shows the comment of a member I blocked as "blocked", and mine as "unavailable" to her',
  },
  'POST /v1/projects/:id/comments': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'PATCH /v1/projects/:id/comments/:commentId': {
    file: 'blocks-visibility.test.ts',
    test: 'refuses to edit my comment on a project of the other one, as an unknown comment',
  },
  'PUT /v1/projects/:id/comments/:commentId/hide': {
    file: 'blocks-visibility.test.ts',
    test: 'answers « unknown » to who hides, or shows again, a comment of the other one',
  },
  'DELETE /v1/projects/:id/comments/:commentId/hide': {
    file: 'blocks-visibility.test.ts',
    test: 'answers « unknown » to who hides, or shows again, a comment of the other one',
  },
  'GET /v1/comments/:commentId/context': {
    file: 'comments-context.test.ts',
    test: 'answers the same 404 for a comment of a member blocked either way',
  },
  'POST /v1/members/:id/follow': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'POST /v1/projects/:id/follow': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'GET /v1/members/mentionable': {
    file: 'blocks-visibility.test.ts',
    test: 'takes the other one out of the suggestions after "@"',
  },
  'GET /v1/members/:id': {
    file: 'blocks.test.ts',
    test: 'answers the same 404 as an unknown member to who is blocked',
  },
  'PUT /v1/members/:id/block': {
    file: 'blocks.test.ts',
    test: 'answers the same 404 for an unknown member, an unverified one, and one who blocked me',
  },
  'GET /v1/tags/:slug': {
    file: 'blocks-visibility.test.ts',
    test: 'hides the projects of the other one from the discovery feed and the tag pages',
  },
  'GET /v1/feed/following': {
    file: 'blocks-visibility.test.ts',
    test: 'leaves out of the following feed a follow that slipped in during the block',
  },
  'GET /v1/feed/discover': {
    file: 'blocks-visibility.test.ts',
    test: 'hides the projects of the other one from the discovery feed and the tag pages',
  },
  'GET /v1/suggestions/members': {
    file: 'suggestions.test.ts',
    test: 'hides a member blocked either way from the suggestions, and his latest project with him',
  },
  'PUT /v1/suggestions/members/:id/dismissed': {
    file: 'suggestions.test.ts',
    test: 'answers the same 404 for an unknown member, an unverified one, and one blocked either way, as follow does',
  },
  'GET /v1/search': {
    file: 'search.test.ts',
    // R6b : le test a été réécrit pour les outils du catalogue, qui restent listés.
    test: 'hides a blocked member and its projects, and takes them out of the tool counts, in both directions',
  },
  'GET /v1/tools': {
    // R6b : le catalogue reste entier ; ce sont les nombres de projets qui changent.
    file: 'tools.test.ts',
    test: 'leaves the projects of a blocked member out of the counts, in both directions',
  },
  'GET /v1/categories': {
    file: 'tools.test.ts',
    test: 'leaves the projects of a blocked member out of the counts, in both directions',
  },
  'GET /v1/notifications': {
    file: 'blocks-visibility.test.ts',
    test: 'drops every notification coming from the other one, and keeps those of others',
  },
  'GET /v1/notifications/unread': {
    file: 'blocks-visibility.test.ts',
    test: 'drops every notification coming from the other one, and keeps those of others',
  },
  'POST /v1/reports': {
    file: 'reports.test.ts',
    test: 'answers 404 for a content of a member blocked either way, as for an unknown one',
  },
  'GET /v1/reports/target': {
    file: 'reports.test.ts',
    test: 'answers 404 for a content of a member blocked either way, as for an unknown one',
  },
  // R10 : les ruches. Mes ruches et la page : la pile des photos, l'animateur et l'épingle.
  'GET /v1/hives': {
    file: 'hives.blocks.test.ts',
    test: 'hides the pin, the faces and the animator name of a member blocked either way',
  },
  'GET /v1/hives/:id': {
    file: 'hives.blocks.test.ts',
    test: 'hides the pin, the faces and the animator name of a member blocked either way',
  },
  'PATCH /v1/hives/:id': {
    file: 'hives.test.ts',
    test: 'refuses with the same 422 a project of a member blocked either way to pin',
  },
  'GET /v1/hives/:id/activity': {
    file: 'hives.test.ts',
    test: 'hides from the activity, the projects and the members a member blocked either way',
  },
  'GET /v1/hives/:id/projects': {
    file: 'hives.test.ts',
    test: 'hides from the activity, the projects and the members a member blocked either way',
  },
  'GET /v1/hives/:id/members': {
    file: 'hives.test.ts',
    test: 'hides from the activity, the projects and the members a member blocked either way',
  },
  'GET /v1/hives/:id/invitable': {
    file: 'hives.invitations.test.ts',
    test: 'finds any member from three characters in the invite search, never one blocked either way',
  },
  'POST /v1/hives/:id/invitations': {
    file: 'hives.invitations.test.ts',
    test: 'answers the same 404 for an unknown, unverified or blocked invitee, before any 409',
  },
  // R12 : « À la une » ne montre pas un projet de la vitrine que le membre ne voit pas (scénario,
  // « À la une, pour les membres »).
  'GET /v1/showcase': {
    file: 'showcase.test.ts',
    test: 'leaves out of « À la une » a showcase project of a member blocked either way',
  },
  // R19 : titres recopiés du plan (relecture de sécurité B2, relecture juridique B1).
  'POST /v1/projects/:id/honey': {
    file: 'game.honey.test.ts',
    test: 'answers the same 404 to a honey gift on an unknown, private, removed, blocked or example project',
  },
  'GET /v1/rankings': {
    file: 'game.rankings.test.ts',
    test: 'leaves a member blocked either way out of the hive ranking',
  },
}

/**
 * R12 (relecture de sécurité du plan, B3) : chaque route `visitor` cite le test qui prouve qu'un
 * projet, une mise à jour ou une page qui n'est pas public y répond exactement comme un identifiant
 * inconnu, ou n'est pas dans la liste. La table état × surface les prouve presque toutes d'un coup.
 */
const VISITOR_MATRIX = {
  file: 'public-visibility.matrix.test.ts',
  test: 'hides a %s project from every visitor surface, with the response of an unknown id',
}
const VISITOR_PROOFS: Record<string, { file: string; test: string }> = {
  'GET /v1/public/projects/:id': VISITOR_MATRIX,
  'GET /v1/public/projects/:id/updates': VISITOR_MATRIX,
  'GET /v1/public/projects/:id/updates/:updateId': VISITOR_MATRIX,
  'GET /v1/public/members/:id': {
    file: 'public-members.test.ts',
    test: 'answers a closed page with the same 404 as an unknown, unverified or deleted member',
  },
  'GET /v1/public/showcase': VISITOR_MATRIX,
  'GET /v1/public/reports/target': VISITOR_MATRIX,
  'POST /v1/public/reports': VISITOR_MATRIX,
  'GET /v1/public/head': VISITOR_MATRIX,
  'GET /v1/public/sitemap': VISITOR_MATRIX,
}

/**
 * R9 (relecture de sécurité du plan) : chaque route qui montre le contenu d'un autre membre (toute
 * lecture classée « hidesBlocked », et les fichiers) cite le test qui prouve qu'une partie retirée
 * par la modération (photo, couverture, description, prompt, démo, outils, bio, outils favoris,
 * photo de profil) n'y paraît plus pour les autres ; ou, avec `none`, dit pourquoi elle n'en montre
 * aucune. Le test cité montre la différence : un témoin voit la partie avant le retrait.
 */
/** R12 : la vitrine, la tête des pages et la cible d'un signalement d'un visiteur, d'un coup. */
const VISITOR_PARTS = {
  file: 'public-visibility.matrix.test.ts',
  test: 'shows a visitor no removed photo or avatar in the showcase, the head of a page or the report sheet',
}
const PART_PROOFS: Record<string, { file: string; test: string } | { none: string }> = {
  // R11 : la couverture du projet d'un autre, retirée par la modération, n'y paraît plus.
  'GET /v1/me/comments': {
    file: 'me-comments.test.ts',
    test: 'never shows the removed cover of the project of a comment',
  },
  'GET /v1/me/tester-messages': {
    file: 'me-tester-messages.test.ts',
    test: 'never shows the removed cover of the project of a message',
  },
  'GET /media/:folder/:file': {
    file: 'parts-visibility.test.ts',
    test: 'serves a removed avatar, photo, portrait cover, update photo or capture to its author only, with the 404 of an unknown file',
  },
  'GET /v1/projects/:id': {
    file: 'parts-visibility.test.ts',
    test: 'hides a removed description and prompt from the page of the project, and gives them to its author only',
  },
  'GET /v1/projects/:id/updates': {
    file: 'parts-visibility.test.ts',
    test: 'hides a removed update photo from the timeline and the page of the project, and keeps it for its author',
  },
  'GET /v1/projects/:id/testers': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/projects/:id/calls': {
    file: 'parts-visibility.test.ts',
    test: 'hides a removed call photo from the testers, and keeps the call and its photo for its author',
  },
  'GET /v1/projects/:id/threads': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/projects/:id/threads/:testerId/messages': {
    file: 'parts-visibility.test.ts',
    test: 'hides a removed capture from the other person of the thread, and keeps it for its author',
  },
  'GET /v1/projects/:id/comments': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/comments/:commentId/context': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/members/mentionable': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/members/:id': {
    file: 'parts-visibility.test.ts',
    test: 'hides a removed bio and removed favorite tools from the page of the member, and gives them back to her in removedParts',
  },
  'GET /v1/tags/:slug': {
    file: 'parts-visibility.test.ts',
    test: 'does not list a project on the page of a tool removed from it',
  },
  'GET /v1/feed/following': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/feed/discover': {
    file: 'parts-visibility.test.ts',
    test: 'drops a project from the testable feed and refuses a new tester once its demo link is removed',
  },
  'GET /v1/suggestions/members': {
    file: 'parts-visibility.test.ts',
    test: 'never shows a removed avatar to another member, on any route that shows the member',
  },
  'GET /v1/search': {
    file: 'parts-visibility.test.ts',
    test: 'hides a removed description from the search, in the results and in the excerpt',
  },
  'GET /v1/tools': {
    file: 'parts-visibility.test.ts',
    test: 'does not list a project on the page of a tool removed from it',
  },
  'GET /v1/notifications': {
    file: 'parts-visibility.test.ts',
    test: 'shows the next photo as the cover of the card, the page and the notification when the cover is removed',
  },
  'GET /v1/reports/target': {
    file: 'parts-visibility.test.ts',
    test: 'does not offer a removed photo in the report sheet of another member',
  },
  'GET /v1/categories': {
    none: 'des nombres de projets par catégorie : la catégorie ne se retire pas seule, elle se range (R6b)',
  },
  'GET /v1/notifications/unread': { none: 'un nombre seul, sans aucun contenu' },
  // R10 : chaque route d'une ruche qui montre un membre (sa photo dans la pile, l'actualité, la
  // carte d'un projet, la liste des membres, la recherche « Inviter », l'invitation reçue).
  'GET /v1/hives': {
    file: 'hives.test.ts',
    test: 'never shows a removed avatar on any hive route that shows a member',
  },
  'GET /v1/hives/:id': {
    file: 'hives.test.ts',
    test: 'never shows a removed avatar on any hive route that shows a member',
  },
  'GET /v1/hives/:id/activity': {
    file: 'hives.test.ts',
    test: 'never shows a removed avatar on any hive route that shows a member',
  },
  'GET /v1/hives/:id/projects': {
    file: 'hives.test.ts',
    test: 'never shows a removed avatar on any hive route that shows a member',
  },
  'GET /v1/hives/:id/members': {
    file: 'hives.test.ts',
    test: 'never shows a removed avatar on any hive route that shows a member',
  },
  'GET /v1/hives/:id/invitable': {
    file: 'hives.test.ts',
    test: 'never shows a removed avatar on any hive route that shows a member',
  },
  // R12 : la vitrine des membres, et les lectures sans compte.
  'GET /v1/showcase': {
    file: 'showcase.test.ts',
    test: 'shows the next photo as the cover of a showcase card when the first one is removed',
  },
  'GET /v1/public/projects/:id': {
    file: 'public-projects.test.ts',
    test: 'hides a removed description, prompt, tools, demo link, photo and portrait cover from a visitor',
  },
  'GET /v1/public/projects/:id/updates': {
    file: 'public-projects.test.ts',
    test: 'hides a removed update photo from a visitor, in the list, by its id and on the project',
  },
  'GET /v1/public/projects/:id/updates/:updateId': {
    file: 'public-projects.test.ts',
    test: 'hides a removed update photo from a visitor, in the list, by its id and on the project',
  },
  'GET /v1/public/members/:id': {
    file: 'public-members.test.ts',
    test: 'never shows a removed bio, removed favorite tools or a removed avatar to a visitor',
  },
  'GET /v1/public/showcase': VISITOR_PARTS,
  'GET /v1/public/head': VISITOR_PARTS,
  'GET /v1/public/reports/target': VISITOR_PARTS,
  'GET /v1/public/sitemap': {
    none: 'des adresses et des dates de modification, sans texte ni image d’un membre',
  },
  // R19 : le classement montre le nom et la photo des membres classés.
  'GET /v1/rankings': {
    file: 'game.moderation.test.ts',
    test: 'never shows a removed avatar in a ranking',
  },
}

/**
 * R10 (relecture de sécurité du plan, point 1) : chaque route qui montre un projet (toute lecture
 * qui montre le contenu d'un autre membre, celles de l'administration, et l'export) cite le test qui
 * prouve qu'un projet réservé à une ruche n'y paraît pas pour qui n'en est pas membre ; ou, avec
 * `none`, dit pourquoi elle ne montre aucun projet, ou pourquoi elle le montre (la modération). Une
 * route ajoutée un jour sans preuve fait échouer « names a hive proof for every route that shows a
 * project ».
 */
const RESERVED_BY_ADDRESS = {
  file: 'hives.reserved.test.ts',
  test: 'answers a stranger, an invitee and a former member as an unknown project, on every route that reads it by its address',
}
const RESERVED_IN_LISTS = {
  file: 'hives.reserved.test.ts',
  test: 'leaves every list and count of a stranger, an invitee and a former member unchanged',
}
const RESERVED_IN_CATALOGUE = {
  file: 'hive-visibility.counts.test.ts',
  test: 'never lists a hive-reserved project in the admin catalogue pages, even to an admin who is a member',
}
const SEEN_BY_MODERATION = {
  none: 'la modération lit le projet signalé, réservé à une ruche ou non (contrat : « la modération quand il est signalé »)',
}
const HIVE_PROOFS: Record<string, { file: string; test: string } | { none: string }> = {
  // R11 : le projet d'un commentaire ou d'un retour, réservé à une ruche qu'il a quittée, devient `null`.
  'GET /v1/me/comments': {
    file: 'me-comments.test.ts',
    test: 'shows the project as null once the reader has left the hive it is reserved to',
  },
  'GET /v1/me/tester-messages': {
    file: 'me-tester-messages.test.ts',
    test: 'shows the project as null once the sender has left the hive it is reserved to',
  },
  'GET /media/:folder/:file': {
    file: 'hive-visibility.test.ts',
    test: 'hides a hive-reserved project from a member who left the hive, in the testers corner and its photos',
  },
  'GET /v1/me/export': {
    file: 'hive-visibility.counts.test.ts',
    test: 'exports the follow of a hive-reserved project the member can see',
  },
  'GET /v1/projects/:id': RESERVED_BY_ADDRESS,
  'GET /v1/projects/:id/updates': RESERVED_BY_ADDRESS,
  'GET /v1/projects/:id/testers': RESERVED_BY_ADDRESS,
  'GET /v1/projects/:id/calls': RESERVED_BY_ADDRESS,
  'GET /v1/projects/:id/threads': RESERVED_BY_ADDRESS,
  'GET /v1/projects/:id/threads/:testerId/messages': RESERVED_BY_ADDRESS,
  'GET /v1/projects/:id/comments': RESERVED_BY_ADDRESS,
  'GET /v1/comments/:commentId/context': RESERVED_BY_ADDRESS,
  'GET /v1/reports/target': RESERVED_BY_ADDRESS,
  'GET /v1/members/:id': RESERVED_IN_LISTS,
  'GET /v1/tags/:slug': RESERVED_IN_LISTS,
  'GET /v1/feed/following': RESERVED_IN_LISTS,
  'GET /v1/feed/discover': RESERVED_IN_LISTS,
  'GET /v1/suggestions/members': RESERVED_IN_LISTS,
  'GET /v1/search': RESERVED_IN_LISTS,
  'GET /v1/tools': RESERVED_IN_LISTS,
  'GET /v1/categories': RESERVED_IN_LISTS,
  'GET /v1/notifications': RESERVED_IN_LISTS,
  'GET /v1/notifications/unread': RESERVED_IN_LISTS,
  'GET /v1/members/mentionable': { none: 'des membres seulement, sans projet' },
  // Les routes d'une ruche : seuls ses membres les lisent (le 404 commun, hives.test.ts) ; ce qui
  // reste à prouver, c'est qu'elles ne montrent jamais un projet réservé à une autre ruche.
  'GET /v1/hives': { none: 'des ruches et des invitations, sans projet' },
  'GET /v1/hives/:id': {
    file: 'hives.test.ts',
    test: 'shows under looking for testers only the testable projects of members that the whole hive can see',
  },
  'GET /v1/hives/:id/activity': {
    file: 'hives.test.ts',
    test: 'lists, newest first, what members publish, reserved to the hive or for members, never another hive or a private project',
  },
  'GET /v1/hives/:id/projects': {
    file: 'hives.test.ts',
    test: 'lists in the projects tab the projects reserved to the hive, newest first, and nothing else',
  },
  'GET /v1/hives/:id/members': { none: 'des membres seulement, sans projet' },
  'GET /v1/hives/:id/invitable': { none: 'des membres seulement, sans projet' },
  // L'administration.
  'GET /v1/moderation/reports': SEEN_BY_MODERATION,
  'GET /v1/moderation/removed': SEEN_BY_MODERATION,
  'GET /v1/moderation/decisions': SEEN_BY_MODERATION,
  'GET /v1/moderation/tools/pending': RESERVED_IN_CATALOGUE,
  'GET /v1/moderation/tools': RESERVED_IN_CATALOGUE,
  'GET /v1/moderation/tools/:slug/impact': RESERVED_IN_CATALOGUE,
  'GET /v1/moderation/categories/pending': RESERVED_IN_CATALOGUE,
  'GET /v1/moderation/catalogue-changes': RESERVED_IN_CATALOGUE,
  // R12 : la vitrine ne garde que des projets publics (`web`), jamais réservés à une ruche ; un
  // projet qui devient réservé en sort dans la même transaction (visibility-web.test.ts).
  'GET /v1/showcase': {
    none: 'des projets publics (web) seulement ; passer en « Une ruche » sort de la vitrine',
  },
  'GET /v1/moderation/showcase': {
    none: 'des projets publics (web) seulement, en vitrine ou candidats ; jamais un projet réservé',
  },
  // R19 : des membres et leur pollen de la semaine, sans projet.
  'GET /v1/rankings': { none: 'des membres et leur pollen de la semaine, sans projet' },
  // Les lectures sans compte : l'état « ruche » de la table état × surface.
  'GET /v1/public/projects/:id': VISITOR_MATRIX,
  'GET /v1/public/projects/:id/updates': VISITOR_MATRIX,
  'GET /v1/public/projects/:id/updates/:updateId': VISITOR_MATRIX,
  'GET /v1/public/members/:id': VISITOR_MATRIX,
  'GET /v1/public/showcase': VISITOR_MATRIX,
  'GET /v1/public/reports/target': VISITOR_MATRIX,
  'GET /v1/public/head': VISITOR_MATRIX,
  'GET /v1/public/sitemap': VISITOR_MATRIX,
}

/**
 * Les routes qui peuvent montrer un projet : les lectures qui montrent le contenu d'un autre membre
 * (`showsOthers`, plus bas), les lectures de l'administration, et l'export (les projets suivis).
 */
const showsProjects = (route: string) =>
  showsOthers(route) ||
  route === 'GET /v1/me/export' ||
  (route.startsWith('GET ') && blockClass(route) === 'admin')

/**
 * Les routes qui montrent le contenu d'un autre membre : les lectures « hidesBlocked », les fichiers,
 * et (R12) les lectures d'un visiteur.
 */
const showsOthers = (route: string) =>
  route === 'GET /media/:folder/:file' ||
  (route.startsWith('GET ') &&
    (blockClass(route) === 'hidesBlocked' || blockClass(route) === 'visitor'))

/**
 * R9 (relecture de sécurité du plan, P7) : les tests qui prouvent chaque écriture permise « en
 * partie » à un compte suspendu : ce qu'il peut encore envoyer, et le refus du reste.
 */
const SUSPENSION_PROOFS: Record<string, readonly { file: string; test: string }[]> = {
  'PATCH /v1/me': [
    {
      file: 'suspension.r9.test.ts',
      test: 'lets a suspended member empty her bio and her tools, and refuses any other value',
    },
    {
      file: 'suspension.r9.test.ts',
      test: 'lets a suspended member choose a new name or handle only while it is provisional',
    },
    {
      file: 'suspension.r9.test.ts',
      test: 'judges a key sent twice on the value that would be written',
    },
  ],
  'PATCH /v1/projects/:id': [
    {
      file: 'suspension.r9.test.ts',
      test: 'lets a suspended member send only { visibility: private } on her own project',
    },
    {
      file: 'suspension.r9.test.ts',
      test: 'refuses with 403 suspended visibility public, another field, or both with private',
    },
    {
      file: 'suspension.r9.test.ts',
      test: 'judges a key sent twice on the value that would be written',
    },
  ],
  // R10 (relecture de sécurité du plan, point 2) : la garde laisse passer ces DELETE ; la route
  // refuse un animateur suspendu qui retire un membre ou supprime la ruche, et laisse quitter.
  'DELETE /v1/hives/:id': [
    {
      file: 'hives.suspension.test.ts',
      test: 'refuses a suspended animator deleting the hive, with 403 suspended',
    },
  ],
  'DELETE /v1/hives/:id/members/:userId': [
    {
      file: 'hives.suspension.test.ts',
      test: 'refuses a suspended animator removing a member, with 403 suspended',
    },
    {
      file: 'hives.suspension.test.ts',
      test: 'lets a suspended member leave a hive and accept an invitation',
    },
  ],
  // R12 (Q6) : un membre suspendu peut fermer sa page publique, jamais l'ouvrir ni en changer les
  // cases.
  'PATCH /v1/me/public-page': [
    {
      file: 'public-page.test.ts',
      test: 'lets a suspended member close her public page, and refuses with 403 suspended anything else',
    },
  ],
}

/** Échappe un texte pour qu'une expression régulière le lise mot pour mot (« ( », « . »…). */
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * « Le fichier `file` contient un test titré `title` » : un appel `it('…')` ou `it.each([…])('…')`,
 * avec le titre entre apostrophes, guillemets ou accents graves. `it.skip` et `it.todo` ne
 * comptent pas : un test sauté ne prouve rien. Le fichier est lu sur le disque, à côté de celui-ci
 * (`import.meta.url` : l'adresse de ce fichier-ci).
 */
const hasTest = (file: string, title: string) => {
  // Un fichier absent (pas encore écrit) ne contient aucun test : la preuve manque, et le test qui
  // la cherche le dit, au lieu de s'arrêter sur une erreur de lecture.
  const url = new URL(`./${file}`, import.meta.url)
  if (!existsSync(url)) return false
  const source = readFileSync(url, 'utf8')
  // R12 : `it.each(STATES)('…')` aussi, la table nommée d'une constante (la table état × surface).
  const call = new RegExp(
    String.raw`\bit(?:\.each\((?:\[[\s\S]*?\]|[A-Za-z_$][\w$]*)\))?\(\s*(['"\x60])${literally(title)}\1`,
  )
  return call.test(source)
}

/** Les routes de l'API, lues dans l'application elle-même (sans les intergiciels, méthode ALL). */
const appRoutes = async () => {
  const ctx = await createTestContext()
  try {
    return [
      ...new Set(
        ctx.app.routes
          .filter((route) => route.method !== 'ALL')
          .map((route) => `${route.method} ${route.path}`),
      ),
    ].sort()
  } finally {
    await ctx.close()
  }
}

describe('the inventory of routes', () => {
  it('classes every route of the API', async () => {
    const unclassified = (await appRoutes()).filter((route) => ROUTES[route] === undefined)

    expect(unclassified.join('\n')).toBe('')
  })

  it('lists no route that does not exist (the routes of this slice included)', async () => {
    const routes = new Set(await appRoutes())
    const missing = Object.keys(ROUTES).filter((route) => !routes.has(route))

    expect(missing.join('\n')).toBe('')
  })

  it('cites the test that proves each route hiding a blocked member, and only those', () => {
    const hiding = Object.keys(ROUTES).filter((route) => blockClass(route) === 'hidesBlocked')
    const withoutProof = hiding.filter((route) => PROOFS[route] === undefined)
    const notHiding = Object.keys(PROOFS).filter((route) => blockClass(route) !== 'hidesBlocked')

    expect(withoutProof.join('\n')).toBe('')
    expect(notHiding.join('\n')).toBe('')
  })

  it('classes every /v1/public route as visitor, with an existing proof', async () => {
    const routes = await appRoutes()
    const publicRoutes = routes.filter(isVisitorPath)
    // Toute route /v1/public est `visitor`, et seulement elles.
    const notVisitor = publicRoutes.filter((route) => blockClass(route) !== 'visitor')
    const visitorElsewhere = Object.keys(ROUTES).filter(
      (route) => blockClass(route) === 'visitor' && !isVisitorPath(route),
    )
    // Chacune cite sa preuve, et la preuve existe.
    const visitors = Object.keys(ROUTES).filter((route) => blockClass(route) === 'visitor')
    const withoutProof = visitors.filter((route) => {
      const proof = VISITOR_PROOFS[route]
      return proof === undefined || !hasTest(proof.file, proof.test)
    })
    const notVisitorProof = Object.keys(VISITOR_PROOFS).filter(
      (route) => blockClass(route) !== 'visitor',
    )

    expect(notVisitor.join('\n')).toBe('')
    expect(visitorElsewhere.join('\n')).toBe('')
    expect(withoutProof.join('\n')).toBe('')
    expect(notVisitorProof.join('\n')).toBe('')
    // Témoins : les routes du plan sont montées, et un titre d'`it.each(STATES)` est bien trouvé.
    expect(publicRoutes).toEqual(
      expect.arrayContaining([
        'GET /v1/public/projects/:id',
        'GET /v1/public/projects/:id/updates',
        'GET /v1/public/projects/:id/updates/:updateId',
        'GET /v1/public/members/:id',
        'GET /v1/public/showcase',
      ]),
    )
    expect(hasTest(VISITOR_MATRIX.file, VISITOR_MATRIX.test)).toBe(true)
    expect(hasTest(VISITOR_MATRIX.file, 'hides a project from every visitor surface')).toBe(false)
  })

  it('finds each cited test in its file, by its exact title', () => {
    const notFound = Object.entries(PROOFS)
      .filter(([, proof]) => !hasTest(proof.file, proof.test))
      .map(([route, proof]) => `${route}: ${proof.file} « ${proof.test} »`)

    expect(notFound.join('\n')).toBe('')
    // Témoin : un titre qui n'existe pas n'est pas trouvé, ni un titre de `describe`.
    expect(hasTest('blocks.test.ts', 'a test that does not exist')).toBe(false)
    expect(hasTest('blocks.test.ts', 'blocking a member')).toBe(false)
  })

  it('allows every GET and every DELETE during a suspension', () => {
    // Tout GET est permis ; la garde laisse aussi passer tout DELETE. R10 : deux DELETE des ruches
    // sont `partial` (la route refuse elle-même un animateur suspendu qui retire un membre ou
    // supprime la ruche) ; aucun n'est refusé par la garde.
    const refused = Object.entries(ROUTES)
      .filter(
        ([route, [, during]]) =>
          (route.startsWith('GET ') && during !== 'allowed') ||
          (route.startsWith('DELETE ') && during === 'refused'),
      )
      .map(([route]) => route)

    expect(refused).toEqual([])
  })

  it('allows every GET, HEAD and DELETE without the current rules', () => {
    // Décision D1 de la relecture du plan R11 : lire et retirer ce qui est à soi ne demandent pas
    // d'accepter les règles, comme pendant une suspension.
    const refused = Object.entries(ROUTES)
      .filter(([route, [, , withoutRules]]) => {
        const [method = ''] = route.split(' ')
        return ['GET', 'HEAD', 'DELETE'].includes(method) && withoutRules !== 'allowed'
      })
      .map(([route]) => route)

    expect(refused).toEqual([])
  })

  it('matches the rules column with the exits of the rules guard', async () => {
    // Les écritures que la colonne permet sans l'accord, sous /v1 et avec une session : ce sont
    // exactement celles de la liste de la garde. Corriger son adresse avant de l'avoir vérifiée
    // (POST /v1/account/unverified-email) ne lit jamais la session : la garde n'y voit personne.
    const { RULES_ALLOWED_WRITES } = await import('./rules/guard')
    // R12 : le signalement d'un visiteur non plus (`/v1/public/*` ne lit jamais la session).
    const withoutSession = new Set(['POST /v1/account/unverified-email', 'POST /v1/public/reports'])
    const exits = Object.entries(ROUTES)
      .filter(([route, [, , withoutRules]]) => {
        const [method = '', path = ''] = route.split(' ')
        return (
          !['GET', 'HEAD', 'DELETE'].includes(method) &&
          path.startsWith('/v1/') &&
          !withoutSession.has(route) &&
          withoutRules === 'allowed'
        )
      })
      .map(([route]) => route)
      .sort()

    expect([...RULES_ALLOWED_WRITES].sort()).toEqual(exits)
    // Témoin : les trois sorties du plan (accepter, régler ses e-mails, se désinscrire), et selon D4
    // les écritures entièrement permises pendant une suspension.
    // R19 : régler son jeu (PATCH /v1/me/game), permis pendant une suspension, l'est aussi ici.
    expect(exits).toEqual([
      'PATCH /v1/me/email-preferences',
      'PATCH /v1/me/game',
      'POST /v1/email/unsubscribe',
      'POST /v1/hive-invitations/:id/accept',
      'POST /v1/me/rules',
      'POST /v1/projects/:id/messages/:messageId/settled',
      'POST /v1/projects/:id/threads/:testerId/read',
      'POST /v1/reports',
      'PUT /v1/feed/read',
      'PUT /v1/members/:id/block',
      'PUT /v1/notifications/seen',
      'PUT /v1/projects/:id/comments/:commentId/hide',
      'PUT /v1/suggestions/members/:id/dismissed',
    ])
    // D4 : exactement les écritures permises pendant une suspension, sans les trois qu'une route ne
    // permet qu'en partie ou réserve aux administrateurs, plus l'accord lui-même.
    // R12 : fermer sa page publique pendant une suspension (`partial`), refusé sans l'accord.
    const partly = new Set([
      'PATCH /v1/me',
      'PATCH /v1/me/public-page',
      'PATCH /v1/projects/:id',
      'POST /v1/moderation/decisions',
    ])
    const fromSuspension = [...ALLOWED_WRITES]
      .filter((route) => !route.startsWith('DELETE ') && !partly.has(route))
      .concat('POST /v1/me/rules')
    expect([...new Set(fromSuspension)].sort()).toEqual(exits)
  })

  // Relecture de sécurité du plan R11, S-B1 (bloquant) : sans cela, un membre suspendu sans l'accord
  // ne pourrait jamais passer l'écran « Accepter », et l'appli lui fermerait tout.
  it('lets a suspended member accept the current rules', () => {
    expect(ALLOWED_WRITES.has('POST /v1/me/rules')).toBe(true)
    expect(ROUTES['POST /v1/me/rules']).toEqual(['own', 'allowed', 'allowed'])
  })

  it('names a hive proof for every route that shows a project', () => {
    const showing = Object.keys(ROUTES).filter(showsProjects)
    const withoutProof = showing.filter((route) => HIVE_PROOFS[route] === undefined)
    const notShowing = Object.keys(HIVE_PROOFS).filter((route) => !showsProjects(route))
    const notFound = Object.entries(HIVE_PROOFS).flatMap(([route, proof]) =>
      'none' in proof || hasTest(proof.file, proof.test)
        ? []
        : [`${route}: ${proof.file} « ${proof.test} »`],
    )

    expect(withoutProof.join('\n')).toBe('')
    expect(notShowing.join('\n')).toBe('')
    expect(notFound.join('\n')).toBe('')
    // Témoin : la page d'un projet, l'actualité d'une ruche, l'export et l'administration sont bien
    // comptés parmi ces routes.
    expect(showing).toEqual(
      expect.arrayContaining([
        'GET /v1/projects/:id',
        'GET /v1/hives/:id/activity',
        'GET /v1/me/export',
        'GET /v1/moderation/reports',
      ]),
    )
  })

  it('cites a removed-part proof for every route that shows the content of another member', () => {
    const showing = Object.keys(ROUTES).filter(showsOthers)
    const withoutProof = showing.filter((route) => PART_PROOFS[route] === undefined)
    const notShowing = Object.keys(PART_PROOFS).filter((route) => !showsOthers(route))
    const notFound = Object.entries(PART_PROOFS).flatMap(([route, proof]) =>
      'none' in proof || hasTest(proof.file, proof.test)
        ? []
        : [`${route}: ${proof.file} « ${proof.test} »`],
    )

    expect(withoutProof.join('\n')).toBe('')
    expect(notShowing.join('\n')).toBe('')
    expect(notFound.join('\n')).toBe('')
    // Témoin : la page d'un projet et les fichiers sont bien comptés parmi ces routes.
    expect(showing).toEqual(
      expect.arrayContaining(['GET /v1/projects/:id', 'GET /media/:folder/:file']),
    )
  })

  it('cites the tests of each write a suspended member may send only in part', () => {
    const partial = Object.entries(ROUTES)
      .filter(([, [, during]]) => during === 'partial')
      .map(([route]) => route)
    const notFound = Object.entries(SUSPENSION_PROOFS).flatMap(([route, proofs]) =>
      proofs
        .filter((proof) => !hasTest(proof.file, proof.test))
        .map((proof) => `${route}: ${proof.file} « ${proof.test} »`),
    )

    expect(partial.sort()).toEqual(Object.keys(SUSPENSION_PROOFS).sort())
    expect(notFound.join('\n')).toBe('')
  })
})

// ─── S2 : la garde des comptes suspendus, route par route ─────────────────────────────────────────

/** Un identifiant bien formé, qui ne désigne rien (un uuid convient aussi à l'id d'un membre). */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Une adresse concrète pour un modèle de route : chaque paramètre reçoit une valeur bien formée. */
const concrete = (path: string) =>
  path
    .replace(':folder{(?:avatars|visuals)}', 'avatars')
    .replace(':kind', 'bravo')
    .replace(':slug', 'mistral')
    .replace(/:\w+/g, UNKNOWN)
    // Toutes les « * » : replace avec un texte ne remplace que la première (alerte CodeQL).
    .replaceAll('*', 'zz-unknown')

describe('the guard of a suspended account', () => {
  it('refuses with 403 suspended every route it does not allow, before its validator and its quota', async () => {
    const ctx = await createTestContext()
    try {
      const act = activity(ctx)
      const louis = await ctx.verifiedMember({
        name: 'Louis',
        email: 'louis@example.com',
        password: 'louis-long-password',
      })
      const karim = await ctx.verifiedMember({
        name: 'Karim',
        email: 'karim@example.com',
        password: 'karim-long-password',
      })
      const lea = await ctx.verifiedMember({
        name: 'Léa',
        email: 'lea@example.com',
        password: 'lea-long-password',
      })
      await act.makeAdmin((await act.me(louis)).id)
      const karimId = (await act.me(karim)).id
      const suspended = await act.send('POST', '/v1/moderation/decisions', louis, {
        action: 'suspend',
        memberId: karimId,
        duration: '7d',
        ground: 'rules',
        explanation: 'Des messages insultants, plusieurs fois.',
      })
      expect(suspended.status).toBe(201)
      // Tous les compteurs de Karim au plafond : une route qui compterait avant la garde
      // répondrait 429, pas 403.
      await ctx.db.insert(schema.apiRateLimit).values(
        Object.values(memberCounterKeys(karimId)).map((key) => ({
          key,
          count: 1_000_000,
          windowStart: Date.now(),
        })),
      )

      const wrong: string[] = []
      for (const [route, [, during]] of Object.entries(ROUTES)) {
        // Une écriture permise en partie (R9) dépend de son corps : SUSPENSION_PROOFS la prouve.
        if (during === 'partial') continue
        const [method = 'GET', path = '/'] = route.split(' ')
        // Un corps invalide pour toute route : une chaîne JSON là où un objet est attendu.
        const body = method === 'GET' || method === 'DELETE' ? undefined : 'x'
        const res = await act.send(method, concrete(path), karim, body)
        const text = await res.text()
        const isSuspended = res.status === 403 && text.includes('"suspended"')
        if (during === 'refused') {
          if (!isSuspended || ErrorResponse.parse(JSON.parse(text)).error.code !== 'suspended') {
            wrong.push(`${route}: ${res.status} instead of 403 suspended`)
          }
        } else if (isSuspended) {
          wrong.push(`${route}: refused, but allowed during a suspension`)
        }
      }
      expect(wrong.join('\n')).toBe('')

      // Témoins : Léa, non suspendue, reçoit l'erreur de validation ; un anonyme, 401 (S14 : sans
      // session, la garde laisse passer, et la session obligatoire répond).
      expect((await act.send('POST', '/v1/projects', lea, 'x')).status).toBe(400)
      expect((await act.send('POST', '/v1/projects', null, 'x')).status).toBe(401)
    } finally {
      await ctx.close()
    }
  })
})

// ─── R11 : la garde de l'accord aux règles, route par route ──────────────────────────────────────

describe('the guard of the rules', () => {
  it('refuses with 403 rules_required every route it does not allow, before its validator and its quota', async () => {
    const ctx = await createTestContext()
    try {
      const act = activity(ctx)
      const karim = await ctx.verifiedMember({
        name: 'Karim',
        email: 'karim@example.com',
        password: 'karim-long-password',
      })
      const lea = await ctx.verifiedMember({
        name: 'Léa',
        email: 'lea@example.com',
        password: 'lea-long-password',
      })
      // Karim n'a pas accepté la version en vigueur (inscrit avant elle) : ses accords sont effacés
      // en base, aucune route ne retire un accord.
      const karimId = (await act.me(karim)).id
      await ctx.db.delete(schema.rulesAcceptance).where(eq(schema.rulesAcceptance.userId, karimId))
      // Tous ses compteurs au plafond : une route qui compterait avant la garde répondrait 429.
      await ctx.db.insert(schema.apiRateLimit).values(
        Object.values(memberCounterKeys(karimId)).map((key) => ({
          key,
          count: 1_000_000,
          windowStart: Date.now(),
        })),
      )

      const wrong: string[] = []
      for (const [route, [, , withoutRules]] of Object.entries(ROUTES)) {
        const [method = 'GET', path = '/'] = route.split(' ')
        // Un corps invalide pour toute route : une chaîne JSON là où un objet est attendu.
        const body = method === 'GET' || method === 'DELETE' ? undefined : 'x'
        const res = await act.send(method, concrete(path), karim, body)
        const text = await res.text()
        const isRefused = res.status === 403 && text.includes('"rules_required"')
        if (withoutRules === 'refused') {
          if (!isRefused || ErrorResponse.parse(JSON.parse(text)).error.code !== 'rules_required') {
            wrong.push(`${route}: ${res.status} instead of 403 rules_required`)
          }
        } else if (isRefused) {
          wrong.push(`${route}: refused, but allowed without the rules`)
        }
      }
      expect(wrong.join('\n')).toBe('')

      // Témoins : Léa, qui a accepté, reçoit l'erreur de validation ; un anonyme, 401 (sans
      // session, la garde laisse passer, et la session obligatoire répond).
      expect((await act.send('POST', '/v1/projects', lea, 'x')).status).toBe(400)
      expect((await act.send('POST', '/v1/projects', null, 'x')).status).toBe(401)
    } finally {
      await ctx.close()
    }
  })
})
