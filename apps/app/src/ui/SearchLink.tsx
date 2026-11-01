// Un lien dessiné comme un champ de recherche (refonte, tranche R3) : le haut d'Explorer sur
// téléphone, et la barre du haut d'ordinateur hors de la page de recherche. Il ressemble au champ
// (la même pilule, une loupe, le texte d'attente « Un projet, une personne, un outil »), mais ce
// n'est pas un champ : le toucher ouvre la page de recherche, où le vrai champ prend le focus.
// Ainsi aucune lettre ne se perd au changement de page (relecture de l'interface de R3, ui-5 et
// « À noter » : le champ d'Explorer sur téléphone est un vrai lien, avec `href`).
// - Sur le web, c'est un vrai `<a href>` : ouvrir dans un nouvel onglet, Entrée (keyboard.ts).
// - Le nom lu commence par le nom du champ (« Rechercher »), puis le texte affiché : un lecteur
//   d'écran et une commande vocale (« toucher Un projet… ») retrouvent tous deux ce qui se voit
//   (charte : le nom lu contient le texte affiché).
// - Le texte d'attente passe à la ligne au lieu d'être coupé (texte agrandi, fenêtre étroite).
//
// Un seul composant pour les deux places (relecture de l'interface de R3, C4) : la barre du haut
// en avait une copie dans SearchField.tsx, qui lisait seulement « Rechercher » et coupait le texte
// d'attente sur une ligne à 200 %.
import { layout, radii, space } from '@ruche/brand'
import { useState } from 'react'
import { type LayoutChangeEvent, Pressable, View } from 'react-native'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import { usePill } from './SearchField'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le nom du champ qu'il remplace (« Rechercher »), en tête du nom lu. */
  label: string
  /** Le texte d'attente affiché (« Un projet, une personne, un outil »). */
  placeholder: string
  /** L'adresse de la page de recherche : sur le web, le lien est un vrai `<a href>`. */
  href: string
  /**
   * Le geste ordinaire, que l'appelant branche sur son routeur. Il reçoit l'événement du clic : sur
   * le web, l'appelant empêche le navigateur de recharger la page (`preventDefault`), comme ListRow.
   */
  onPress: (event?: { preventDefault?: () => void }) => void
  /** Prend la place qui reste dans une rangée (la barre du haut), comme `SearchField grow`. */
  grow?: boolean
}

/**
 * Au-delà de cette hauteur, le texte d'attente tient sur plusieurs lignes : la pilule devient un
 * panneau aux coins arrondis, dont la courbe ne passe plus sur les lettres (charte : un `pill` autour
 * d'un texte qui passe à la ligne coupe les lettres à 200 %). Une ligne de texte doublé tient dessous.
 */
const TALL = layout.touchTarget * 1.75

export function SearchLink({ label, placeholder, href, onPress, grow = false }: Props) {
  const { colors } = useTheme()
  const pill = usePill(false, grow)
  // Le texte passe-t-il sur plusieurs lignes ? Mesuré à chaque changement de taille : seul le texte
  // agrandi ou une fenêtre redimensionnée le changent, jamais un geste.
  const [tall, setTall] = useState(false)
  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height > TALL
    if (next !== tall) setTall(next)
  }
  const radius = tall ? radii.panel : radii.pill

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}, ${placeholder}`}
      // `href` manque aux types de React Native : ignoré sur téléphone, un vrai lien sur le web.
      {...{ href }}
      // Entrée ouvre la recherche sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(() => onPress())}
      onPress={onPress}
      onLayout={measure}
      // La pilule du champ (même fond, même bord, même hauteur), pour qu'on sache où chercher ; le
      // rayon suit aussi l'anneau du clavier (app/+html.tsx).
      style={({ pressed }) => ({
        ...pill,
        paddingRight: space.lg,
        paddingVertical: space.xs,
        borderRadius: radius,
        // Appuyé, le fond des pastilles touchées (comme Tag).
        ...(pressed ? { backgroundColor: colors.honeySoft } : null),
      })}
    >
      {/* La loupe décore : le nom lu dit déjà qu'on cherche. */}
      <View aria-hidden>
        <Icon name="magnifying-glass" size={20} tone="muted" />
      </View>
      {/* minWidth: 0 : à 200 % de texte, le texte d'attente passe à la ligne sans déborder. */}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text tone="muted" selectable={false}>
          {placeholder}
        </Text>
      </View>
    </Pressable>
  )
}
