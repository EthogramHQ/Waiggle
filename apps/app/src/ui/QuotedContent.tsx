// Le contenu visé par une action, rappelé en citation : sa sorte (« Commentaire »), puis son texte
// en trois lignes au plus, ou sa vignette quand c'est une image. Souligné d'un trait de miel à
// gauche, comme une citation. Il sert aux fenêtres et aux feuilles qui couvrent la carte qu'on vient
// de toucher (« Retirer ce contenu ? », « Retirer la photo 2 ? ») : on y vérifie qu'on agit sur le bon.
import { borders, space } from '@ruche/brand'
import { View } from 'react-native'
import type { ImageSource } from './image'
import { ProjectCover } from './ProjectCover'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Le nombre de lignes du texte rappelé : de quoi le reconnaître, sans pousser les boutons loin. */
export const QUOTE_LINES = 3

/** La hauteur au plus de la vignette rappelée : de quoi reconnaître l'image sans l'agrandir. */
const QUOTE_PICTURE_HEIGHT = 120

type Props = {
  /** La sorte de contenu, déjà traduite (« Commentaire »). */
  label: string
  /** Le texte, montré tel quel (texte brut, jamais de lien), trois lignes au plus. */
  text?: string | undefined
  /** Une image à montrer sous la sorte (la capture d'un message de testeur, la photo d'un appel). */
  picture?: { name: string; source: ImageSource } | undefined
}

export function QuotedContent({ label, text, picture }: Props) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        gap: space.xxs,
        borderLeftWidth: borders.quote,
        borderLeftColor: colors.honey,
        paddingLeft: space.md,
      }}
    >
      <Text variant="caption" weight={600} tone="muted">
        {label}
      </Text>
      {text ? (
        <Text numberOfLines={QUOTE_LINES} breakAnywhere>
          {text}
        </Text>
      ) : null}
      {picture ? (
        // Une image nommée ; l'image elle-même a un nom vide, sinon le navigateur lirait deux images
        // l'une dans l'autre.
        <View accessible accessibilityRole="image" accessibilityLabel={picture.name}>
          <ProjectCover
            height={QUOTE_PICTURE_HEIGHT}
            radius="small"
            image={{ source: picture.source, label: '', cachePolicy: 'memory' }}
          />
        </View>
      ) : null}
    </View>
  )
}
