// La session du membre, lue par les écrans réservés aux membres, en quatre états : en attente,
// en erreur, personne de connecté, connecté. `useSession` de Better Auth rend `data: null` aussi
// bien quand personne n'est connecté que quand la lecture a échoué (un 429 « trop de demandes »,
// un serveur en panne, pas de réseau) : un écran qui ne regardait que `data` disait alors
// « Réservé aux membres » à un membre bien connecté. Ce hook fait la différence à un seul endroit,
// pour que chaque écran affiche « Réessayer » plutôt que « Me connecter » quand c'est la lecture
// qui a échoué.
import { useRef, useState } from 'react'
import { useSession } from './api'

/** Le membre connecté et sa session, tels que Better Auth les rend. */
export type SessionData = NonNullable<ReturnType<typeof useSession>['data']>

/**
 * Ce que l'écran doit afficher. Un « type union » TypeScript : selon `state`, `session` est la
 * session (connecté) ou `null` (les trois autres états), et TypeScript le sait après un `if`.
 * `retry` relit la session (le bouton « Réessayer » de l'état d'erreur).
 */
export type MemberSession =
  | { state: 'pending'; session: null; retry: () => void }
  | { state: 'error'; session: null; retry: () => void }
  | { state: 'signedOut'; session: null; retry: () => void }
  | { state: 'signedIn'; session: SessionData; retry: () => void }

/**
 * Un hook React (une fonction qui suit l'état de l'écran et le redessine quand il change) :
 * la session du membre et l'état à afficher. Une session déjà lue reste valable si une relecture
 * échoue ensuite : seul un échec sans aucune session donne l'état d'erreur.
 */
export function useMemberSession(): MemberSession {
  const { data, isPending, error, refetch } = useSession()
  // Pendant que « Réessayer » relit la session, Better Auth repasse `isPending` à vrai (il n'a
  // aucune session à montrer) : sans ce drapeau, l'écran d'erreur laisserait la place au
  // chargement puis reviendrait, et le focus du clavier, posé sur « Réessayer », se perdrait.
  // On garde donc l'état d'erreur jusqu'à la réponse. Le `useRef` ignore une seconde tape tant
  // que la première n'a pas abouti : une seule relecture à la fois.
  const [retrying, setRetrying] = useState(false)
  const busy = useRef(false)
  const retry = () => {
    if (busy.current) return
    busy.current = true
    setRetrying(true)
    void Promise.resolve(refetch()).finally(() => {
      busy.current = false
      setRetrying(false)
    })
  }
  if (isPending)
    return retrying
      ? { state: 'error', session: null, retry }
      : { state: 'pending', session: null, retry }
  if (data) return { state: 'signedIn', session: data, retry }
  // Un 401 veut dire « pas de session » (Better Auth vide alors `data`) : se connecter, pas
  // réessayer, qui redonnerait le même refus.
  if (error && error.status !== 401) return { state: 'error', session: null, retry }
  return { state: 'signedOut', session: null, retry }
}
