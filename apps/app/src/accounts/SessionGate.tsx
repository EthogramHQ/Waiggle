// La garde de session commune aux écrans réservés aux membres (R16, « La garde de session ») :
// l'attente, l'erreur, la page réservée aux membres et l'écran connecté, en un seul endroit.
//
// Avant R16, une quarantaine d'écrans recopiaient les mêmes quatre lignes (`useMemberSession`, puis
// un `if` par état). Une garde recopiée finit par diverger : un écran oublie l'état d'erreur et dit
// « Me connecter » à un membre bien connecté dont la session ne se lit pas (un 429, une panne).
// Ici, chaque état a sa page, la même partout :
// - en attente : le squelette de la page (`loading`), et rien d'autre de l'écran ;
// - en erreur : « Réessayer » (`SessionErrorScreen`), jamais « Me connecter » ;
// - sans session (un 401 compris, voir session.ts) : « Réservé aux membres » (`SignedOutScreen`),
//   dont « Me connecter » ramène ici ensuite (`next`, calculé au toucher par `nextAfterSignIn`) ; ou
//   ce que l'écran donne à la place (`signedOut` : une feuille, une « Page introuvable ») ;
// - connecté : l'écran, à qui la garde passe la session.
//
// Le repère `waiggle_member` (memberMarker.ts) ne décide de rien ici : seule la session lue compte.
// Un 401 reçu plus tard, pendant la visite (une action refusée), reste l'affaire de l'écran (« Ta
// session a expiré », navigation/signInAgain.ts) : la garde ne lit que la session.
//
// Emploi, dans le fichier de route ou l'écran parent :
//   <SessionGate loading={<LoadingScreen shape="list" />}>
//     {(session) => <BlockedMembers session={session} />}
//   </SessionGate>
// La fonction enfant ne fait que rendre un composant, sans appeler de hook elle-même (relecture de
// sécurité du plan R16, A1) : appelée seulement quand la session existe, un hook qu'elle appellerait
// apparaîtrait et disparaîtrait avec la session, et React mélangerait les hooks de la garde.
import type { ComponentProps, ReactNode } from 'react'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from '../screens/states'
import { type SessionData, useMemberSession } from './session'

/** La largeur des pages d'état, celle de l'écran gardé (form, page, wide ; `form` par défaut). */
type Width = ComponentProps<typeof SignedOutScreen>['width']

type Props = {
  /**
   * Le squelette de la page, pendant la lecture de la session : celui de l'écran qui arrive, pour
   * que rien ne saute quand l'écran prend sa place. Sans lui, le squelette générique de `width`.
   */
  loading?: ReactNode
  /**
   * Ce qu'un visiteur voit à la place de « Réservé aux membres » : rien pour une feuille (`null`
   * est une valeur donnée : la feuille ne s'ouvre pas), « Page introuvable » pour les pages qui ne
   * disent pas à un visiteur qu'elles existent (coin et fil des testeurs, R7b). Sans elle
   * (`undefined`), « Réservé aux membres ».
   */
  signedOut?: ReactNode
  /** La largeur des pages d'état (erreur, réservé aux membres, squelette par défaut). */
  width?: Width
  /**
   * « Revenir » sur la page d'erreur (vrai par défaut) ; faux là où il ramènerait à la même page
   * (le Fil, page d'arrivée d'un membre).
   */
  withBack?: boolean
  /** L'écran connecté. La fonction rend un composant, sans hook (voir en tête du fichier). */
  children: (session: SessionData) => ReactNode
}

export function SessionGate({
  loading,
  signedOut,
  width = 'form',
  withBack = true,
  children,
}: Props): ReactNode {
  const { state, session, retry } = useMemberSession()
  if (state === 'pending') return loading ?? <LoadingScreen width={width} />
  if (state === 'error')
    return <SessionErrorScreen onRetry={retry} width={width} withBack={withBack} />
  // `signedOut !== undefined` et non `??` : une feuille passe `null` pour ne rien montrer du tout.
  if (state === 'signedOut')
    return signedOut !== undefined ? signedOut : <SignedOutScreen width={width} />
  return children(session)
}
