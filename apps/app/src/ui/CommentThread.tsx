// Un fil de commentaires (tranche 5) : le commentaire « racine », puis ses réponses, du plus ancien
// au plus récent, en retrait derrière un trait fin qui les rattache à lui. Le champ d'une réponse
// en cours s'ouvre au bout du fil, là où la réponse viendra se ranger. Les réponses tiennent sur un
// seul niveau : répondre à une réponse ajoute au même fil.
// Le composant ne fait que la mise en page : les cartes (CommentCard) et le champ (NoteComposer)
// sont donnés par l'écran.
import { borders, space } from '@ruche/brand'
import { Children, type ReactNode } from 'react'
import { View } from 'react-native'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le commentaire racine (une CommentCard). */
  root: ReactNode
  /** Ses réponses, dans l'ordre (des CommentCard). */
  replies?: ReactNode
  /** Ce qui vient au bout du fil : le champ d'une réponse en cours, une confirmation. */
  footer?: ReactNode
}

export function CommentThread({ root, replies, footer }: Props) {
  const { colors } = useTheme()
  // Children.toArray retire les « rien » (null, false) : sans réponse ni champ, pas de retrait vide.
  const hasReplies = Children.toArray(replies).length > 0
  const hasFooter = Children.toArray(footer).length > 0
  return (
    <View style={{ gap: space.md }}>
      {root}
      {hasReplies || hasFooter ? (
        <View
          style={{
            // Le trait part sous la photo de la racine (36 points : son milieu est à 18).
            marginLeft: space.lg,
            paddingLeft: space.lg,
            borderLeftWidth: borders.focus,
            borderLeftColor: colors.line,
            gap: space.lg,
          }}
        >
          {replies}
          {footer}
        </View>
      ) : null}
    </View>
  )
}
