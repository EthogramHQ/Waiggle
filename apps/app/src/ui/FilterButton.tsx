// Le bouton qui ouvre la feuille des catégories (R6b : page d'un outil sur téléphone, recherche).
// Il montre son état : « Toutes les catégories », ou le nom de la catégorie choisie (« Cuisine »).
// Un lecteur d'écran lit `spokenLabel` (« Catégorie : Cuisine ») : le nom seul ne dirait pas ce que
// le bouton filtre. Une pastille de 44 points de haut, avec son icône et un chevron qui dit qu'une
// liste s'ouvre.
//
// Relectures de R6b (design C1, interface S2 et S5) : le libellé passe à la ligne au lieu d'être
// coupé par « … » (à 320 points et texte à 200 %, « Toutes les ca… ») ; la pastille grandit alors en
// hauteur, et ses coins deviennent ceux d'un panneau, dont la courbe ne passe pas sur les lettres
// (comme SearchLink). Sur le web, elle annonce la fenêtre qu'elle ouvre (`aria-haspopup`).
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useState } from 'react'
import { type LayoutChangeEvent, Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Ce qu'on voit : « Toutes les catégories » ou « Cuisine ». */
  label: string
  /** Ce qu'on entend : « Catégorie : Cuisine » (identique à `label` tant que rien n'est choisi). */
  spokenLabel: string
  /** L'icône de la catégorie choisie, ou celle de « Toutes » (les formes). */
  icon: IconName
  onPress: () => void
  /** Le bouton, pour lui rendre le focus quand la feuille qu'il a ouverte se ferme (R6b). */
  ref?: Ref<View>
}

/**
 * Au-delà de cette hauteur, le libellé tient sur plusieurs lignes : la pilule devient un panneau
 * aux coins arrondis (le seuil de SearchLink : une ligne de texte doublé tient dessous).
 */
const TALL = layout.touchTarget * 1.75

export function FilterButton({ label, spokenLabel, icon, onPress, ref }: Props) {
  const { colors } = useTheme()
  // Le libellé passe-t-il sur plusieurs lignes ? Mesuré à chaque changement de taille : seuls le
  // texte agrandi, une fenêtre redimensionnée ou un autre nom de catégorie le changent.
  const [tall, setTall] = useState(false)
  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height > TALL
    if (next !== tall) setTall(next)
  }
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      // La feuille des catégories est une fenêtre : le lecteur d'écran l'annonce avant le geste.
      {...(Platform.OS === 'web' ? { 'aria-haspopup': 'dialog' } : null)}
      onPress={onPress}
      onLayout={measure}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        // Jamais plus large que la ligne : un nom long passe à la ligne dans la pastille.
        maxWidth: '100%',
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.touchTarget,
        paddingHorizontal: space.lg,
        // Sur deux lignes, le texte ne touche pas le bord du haut ni celui du bas.
        paddingVertical: space.xs,
        borderRadius: tall ? radii.panel : radii.pill,
        borderWidth: borders.strong,
        borderColor: colors.outline,
        backgroundColor: pressed ? colors.honeySoft : colors.surface,
      })}
    >
      <Icon name={icon} size={18} tone="muted" />
      {/* minWidth 0 : le libellé rétrécit et passe à la ligne ; les deux icônes gardent leur taille. */}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="callout" weight={600}>
          {label}
        </Text>
      </View>
      <Icon name="caret-down" size={14} tone="muted" />
    </Pressable>
  )
}
