// L'avatar d'un membre avec une pastille dans son coin (R9, planche R9-Bloquer) : le petit rond rouge
// barré de « Bloquer Léa Martin (@lea) ? », qui montre d'un coup d'œil ce que deviendra la personne.
//
// La pastille se lit : elle a son propre nom (« bloqué »), une image à part, à côté de celle de
// l'avatar et pas dedans (une image nommée dans une image nommée ferait deux noms mêlés). La couleur
// seule ne dirait rien à qui ne la voit pas.
import { borders } from '@ruche/brand'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { useTheme } from './theme/ThemeProvider'

/** La taille de la pastille, à côté d'un avatar de 64 : assez pour lire l'icône, sans le cacher. */
const MARK = 24

type Props = {
  /** Le nom du membre : ses initiales quand il n'a pas de photo. */
  name: string
  /** Sa photo, ou null (les initiales sur du miel). */
  source: ImageSource | null
  /** Le nom lu de l'avatar (en général, son nom). */
  label: string
  /** Le diamètre de l'avatar, en points. */
  size?: number
  /** La pastille : son icône, et le mot qui la nomme (« bloqué »). */
  mark: { icon: IconName; label: string }
}

export function MarkedAvatar({ name, source, label, size = 64, mark }: Props) {
  const { colors } = useTheme()
  return (
    // Une boîte à la taille de l'avatar : la pastille se pose sur son coin, en bas à droite, et
    // déborde un peu, comme sur la planche.
    <View style={{ width: size, height: size }}>
      <Avatar name={name} source={source} label={label} size={size} />
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={mark.label}
        style={{
          position: 'absolute',
          right: -borders.badge,
          bottom: -borders.badge,
          width: MARK,
          height: MARK,
          borderRadius: MARK / 2,
          alignItems: 'center',
          justifyContent: 'center',
          // Le rouge du bouton « Bloquer », l'icône en blanc (contrastPairs : onDanger sur danger).
          backgroundColor: colors.danger,
          // Un liseré de la couleur de la fenêtre détache la pastille de la photo.
          borderWidth: borders.badge,
          borderColor: colors.sheet,
        }}
      >
        <Icon name={mark.icon} size={MARK - 2 * borders.badge - 4} tone="onDanger" />
      </View>
    </View>
  )
}
