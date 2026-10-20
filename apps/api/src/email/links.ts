// Aucun lien venu d'un membre dans un e-mail (tranche 6c, relecture de sécurité S-B1). Gmail ou
// Outlook transforment d'eux-mêmes « waiggle-login.com » en lien cliquable, dans le texte comme
// dans le HTML : un e-mail signé par notre domaine qui pointerait vers un faux site serait un
// hameçonnage parfait. Toute adresse ou tout nom de domaine écrit par un membre (extrait d'un
// commentaire, titre de projet, nom) devient donc « [lien] » avant d'entrer dans un e-mail.

/**
 * Ce qu'on reconnaît comme une adresse, en une seule expression régulière (un motif de texte) :
 * - avec un protocole (« https://… », « http://192.168.0.1/admin ») : tout jusqu'au prochain blanc ;
 * - sinon un nom de domaine : des mots de lettres, chiffres ou tirets séparés par des points, dont
 *   le dernier (l'extension : « com », « example ») a au moins deux lettres, suivi éventuellement
 *   d'un chemin (« /login »). « xn--… » (les domaines accentués encodés) en fait partie.
 *
 * Les nombres (« 2.0 », « 14.30 », « 3.14 ») ne sont pas touchés : leur dernière partie n'a pas de
 * lettre. Une adresse e-mail perd son domaine (« support@[lien] »).
 * Drapeaux : g (toutes les adresses du texte, pas seulement la première), i (majuscules comprises),
 * u (lettres accentuées : « \p{L} » veut dire « une lettre de n'importe quelle langue »).
 */
const ADDRESS =
  /\b[a-z][a-z0-9+.-]*:\/\/\S+|(?<![\p{L}\p{N}_-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}[\p{L}\p{N}-]*[\p{L}\p{N}](?:\/[^\s]*)?/giu

/** Remplace chaque adresse ou nom de domaine du texte par « [lien] ». */
export const defangLinks = (text: string) => text.replace(ADDRESS, '[lien]')
