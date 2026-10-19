// La liste des commentaires d'un projet (tranche 5) : les fils, du plus récent au plus ancien,
// séparés par un trait fin, puis « Afficher la suite » tant qu'il en reste, et « C'est tout » au
// bout (FeedEnd, le même bas que les fils de l'accueil : pas de défilement sans fin). Sans
// commentaire, le message donné par l'écran (« Pas encore de commentaire. »), sans « C'est tout ».
// Les fils (CommentThread) sont donnés par l'écran ; la liste ne fait que les ranger.
import { borders, space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode } from 'react'
import { View } from 'react-native'
import { FeedEnd } from './FeedEnd'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Les fils, dans l'ordre d'affichage. */
  children?: ReactNode
  /** more : il reste des fils ; loading : la suite arrive ; end : tout est lu ; error : raté. */
  state: 'more' | 'loading' | 'end' | 'error'
  onMore: () => void
  moreLabel: string
  endLabel: string
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
  const { colors } = useTheme()
  // Children.toArray retire les « rien » (null, false) et donne une clé à chaque fil.
  const threads = Children.toArray(children)
  if (threads.length === 0) return <Text tone="secondary">{empty}</Text>
  return (
    <View style={{ gap: space.xl }}>
      {/* role « list » : les lecteurs d'écran annoncent une liste et son nombre de fils. */}
      <View role="list" style={{ gap: space.xl }}>
        {threads.map((thread, i) => (
          // Un trait fin au-dessus de chaque fil, sauf le premier.
          <View
            // La clé du fil (donnée par Children.toArray) : un fil publié en tête ne fait pas
            // redessiner tous les autres.
            key={isValidElement(thread) && thread.key !== null ? thread.key : i}
            role="listitem"
            style={
              i > 0
                ? {
                    borderTopWidth: borders.hairline,
                    borderTopColor: colors.line,
                    paddingTop: space.xl,
                  }
                : null
            }
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
        {...(errorLabel ? { errorLabel } : null)}
        {...(retryLabel ? { retryLabel } : null)}
      />
    </View>
  )
}
