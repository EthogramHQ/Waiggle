// La liste des commentaires d'un projet (tranche 5) : les fils, du plus récent au plus ancien, puis « Afficher la suite » tant qu'il en reste (FeedEnd, le même bas
// que les fils de l'accueil : pas de défilement sans fin) ; depuis RF, rien au bout (T4). Sans
// commentaire, le message donné par l'écran (« Pas encore de commentaire. »).
// Les fils (CommentThread) sont donnés par l'écran ; la liste ne fait que les ranger.
import { space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode } from 'react'
import { View } from 'react-native'
import { FeedEnd, useFirstArrived } from './FeedEnd'
import { Text } from './Text'

type Props = {
  /** Les fils, dans l'ordre d'affichage. */
  children?: ReactNode
  /** more : il reste des fils ; loading : la suite arrive ; end : tout est lu ; error : raté. */
  state: 'more' | 'loading' | 'end' | 'error'
  onMore: () => void
  moreLabel: string
  /** La fin discrète ; sans elle, la liste finit sans rien dire (RF, T4). */
  endLabel?: string
  /** Le message d'une liste vide. */
  empty: string
  /** Le message quand la suite n'a pas pu se charger, et le bouton pour réessayer. */
  errorLabel?: string
  retryLabel?: string
}

export function CommentList({
  children,
  state,
  onMore,
  moreLabel,
  endLabel,
  empty,
  errorLabel,
  retryLabel,
}: Props) {
  // Children.toArray retire les « rien » (null, false) et donne une clé à chaque fil.
  const threads = Children.toArray(children)
  // Le premier fil arrivé avec la dernière page : le focus du clavier y va quand « Afficher la
  // suite » disparaît, la liste n'ayant plus de phrase de fin (jur-RF2).
  const arrived = useFirstArrived(threads.length, state === 'loading')
  if (threads.length === 0) return <Text tone="secondary">{empty}</Text>
  return (
    <View style={{ gap: space.xl }}>
      {/* role « list » : les lecteurs d'écran annoncent une liste et son nombre de fils. */}
      {/* L'écart est celui que « Répondre » laisse dépasser sous sa carte (CommentCard, ACTION_HANG) :
          sa zone de 44 points touche celle du nom suivant, sans la chevaucher (décision 18). */}
      <View role="list" style={{ gap: space.md }}>
        {threads.map((thread, i) => (
          // Depuis R5b, aucun trait entre les fils : l'espace les sépare (planche `R5b-Commentaires`).
          <View
            // La clé du fil (donnée par Children.toArray) : un fil publié en tête ne fait pas
            // redessiner tous les autres.
            key={isValidElement(thread) && thread.key !== null ? thread.key : i}
            role="listitem"
            ref={i === arrived.index ? arrived.ref : undefined}
          >
            {thread}
          </View>
        ))}
      </View>
      <FeedEnd
        state={state}
        moreLabel={moreLabel}
        endLabel={endLabel}
        onMore={onMore}
        firstArrived={arrived.ref}
        {...(errorLabel ? { errorLabel } : null)}
        {...(retryLabel ? { retryLabel } : null)}
      />
    </View>
  )
}
