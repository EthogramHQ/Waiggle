// Une ligne de « La recette » d'un projet (R6a) : « Commencé en septembre 2026 », « Facile à
// refaire : À la portée de tous ». Devant la phrase, une petite icône (le calendrier) ou un rond de
// couleur (vert, jaune ou rouge pour la difficulté, les mêmes que les choix de « Facile à refaire ? »
// dans la feuille de publication : `DIFFICULTY_DOTS`, `Choices`).
//
// Le dessin n'est qu'un repère pour l'œil : il est caché aux lecteurs d'écran, et la phrase dit tout
// (la couleur n'est jamais seule à porter le sens). La phrase passe à la ligne à côté du dessin quand
// le texte est agrandi ; le dessin garde sa taille.
import { type ColorName, layout, radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La phrase entière, déjà traduite : c'est elle qu'on lit. */
  label: string
  /** Une icône devant la phrase (le calendrier de « Commencé en »). */
  icon?: IconName
  /** Ou un rond de couleur devant la phrase (la difficulté) ; ignoré si `icon` est donné. */
  dot?: ColorName
}

/** La taille de l'icône : celle d'une ligne de texte courant. */
const ICON_SIZE = 18

export function RecipeFact({ label, icon, dot }: Props) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {icon ? (
        <Icon name={icon} size={ICON_SIZE} tone="muted" />
      ) : dot ? (
        // Le rond, caché aux lecteurs d'écran (iOS, Android, web). Il est centré dans une boîte
        // de la largeur d'une icône : les phrases de la recette commencent toutes au même bord.
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: ICON_SIZE, alignItems: 'center', flexShrink: 0 }}
        >
          <View
            style={{
              width: layout.choiceDot,
              height: layout.choiceDot,
              borderRadius: radii.pill,
              backgroundColor: colors[dot],
            }}
          />
        </View>
      ) : null}
      {/* La phrase rétrécit et passe à la ligne à côté du dessin (texte agrandi à 200 %). */}
      <View style={{ flexShrink: 1 }}>
        <Text>{label}</Text>
      </View>
    </View>
  )
}
