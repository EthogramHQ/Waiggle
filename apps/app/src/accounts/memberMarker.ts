// Le marqueur de membre `waiggle_member` (tranche R12, plan, choix 9 et décision 14 de la relecture) :
// un petit cookie, non secret, que l'appli web pose sur son propre domaine quand une session existe.
//
// Pourquoi : le cookie de session est posé par l'API, sur son domaine à elle ; le serveur web de
// l'appli ne le voit jamais. Or c'est lui qui doit décider, dès la demande de `/`, d'envoyer un
// membre au Fil (`/feed`) plutôt que de lui montrer l'accueil un instant (scénario « Qui arrive
// où »). Le marqueur le lui dit. Il ne donne aucun droit : il vaut « 1 », n'importe qui peut
// l'écrire, et l'API ne le lit pas ; au pire, un visiteur qui le fabrique arrive sur « Réservé aux
// membres ».
//
// Sa vie : 7 jours, reposé à chaque session (relecture juridique : un ordinateur familial ne le
// garde pas des mois après la dernière visite) ; effacé quand il n'y a plus de session
// (déconnexion, refus 401, compte supprimé). Une lecture de la session qui échoue (réseau, « trop
// de demandes », serveur en panne) ne dit rien de la session : on n'y touche pas. Sur téléphone,
// rien : pas de serveur web à prévenir, l'appli s'ouvre elle-même sur le Fil.
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useMemberSession } from './session'

/** Le nom du cookie, que la configuration du serveur web (Caddy) lit aussi. */
export const MEMBER_MARKER = 'waiggle_member'

/** Sa durée de vie, en secondes : 7 jours. */
const LIFETIME_S = 7 * 24 * 60 * 60

// Les attributs communs à la pose et à l'effacement : un cookie ne s'efface que s'il est désigné
// avec le même chemin. `Path=/` : tout le site. `SameSite=Lax` : envoyé aussi quand on arrive par un
// lien depuis un autre site (un e-mail, un favori), sans quoi le serveur ne le verrait pas à
// l'arrivée, le seul moment où il sert. `Secure` : jamais envoyé en clair (HTTP).
const ATTRIBUTES = 'Path=/; SameSite=Lax; Secure'

/** Écrit un cookie, sur le web seulement (ailleurs, il n'y a pas de `document`). */
const writeCookie = (cookie: string) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  // `document.cookie = …` n'écrase pas les autres cookies : il pose ou remplace celui-ci seul. Le
  // texte est fixe (rien de ce qu'écrit un membre), il n'y a donc rien à échapper.
  // biome-ignore lint/suspicious/noDocumentCookie: l'API Cookie Store manque encore à une partie des navigateurs (Safari, Firefox anciens) ; une valeur fixe, sans échappement
  document.cookie = cookie
}

/** Pose le marqueur pour 7 jours à partir de maintenant (web seulement). */
export const setMemberMarker = (): void => {
  writeCookie(`${MEMBER_MARKER}=1; Max-Age=${LIFETIME_S}; ${ATTRIBUTES}`)
}

/** Efface le marqueur : une vie nulle le retire tout de suite (web seulement). */
export const clearMemberMarker = (): void => {
  writeCookie(`${MEMBER_MARKER}=; Max-Age=0; ${ATTRIBUTES}`)
}

/**
 * Hook, monté une seule fois à la racine (app/_layout.tsx) : le marqueur suit la session.
 * Connecté : posé (aussi pour une session d'avant R12, déjà là à l'ouverture). Personne de
 * connecté : effacé. En attente ou en erreur : rien. Un `useEffect` (lancé après l'affichage) :
 * c'est là qu'on touche au navigateur ; ses dépendances font qu'il ne se relance que quand l'état
 * change, ou quand un autre membre se connecte, et non à chaque rendu.
 */
export const useMemberMarkerSync = (): void => {
  const { state, session } = useMemberSession()
  const userId = session?.user.id ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: userId n'est pas lu, mais la session d'un autre membre repose le marqueur pour 7 jours
  useEffect(() => {
    if (state === 'signedIn') setMemberMarker()
    else if (state === 'signedOut') clearMemberMarker()
  }, [state, userId])
}
