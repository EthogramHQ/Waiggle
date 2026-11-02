// Deux boutons côte à côte (R5a) : « Tester la démo » et « Suivre ce projet » sur la page d'un
// projet, « Ouvrir le site » et « Rester sur Waiggle » sur la page de sortie. Chacun prend la
// moitié de la place, 360 points au plus (relecture du plan, ui-2 : plus de bouton de 720 points
// sur une tablette) ; quand ils ne tiennent plus côte à côte (téléphone étroit, texte agrandi à
// 200 %), ils s'empilent, chacun sur toute la largeur, toujours 360 points au plus. Les écrans
// n'écrivent ainsi ni largeur ni marge : c'est ce composant qui décide.
//
// Comment, sans mesurer la fenêtre : une rangée qui passe à la ligne (`flexWrap`). Chaque place a
// pour largeur de base celle de son bouton (`flexBasis: 'auto'`), puis grandit pour partager la
// place restante (`flexGrow`). Si les deux bases et l'écart ne tiennent pas sur une ligne, la
// seconde passe dessous, et chacune grandit alors jusqu'à la borne. Comme la base suit le texte,
// le texte agrandi empile aussi les boutons, sans régler de seuil (sur le web, la taille du texte
// de l'appareil ne se lit pas : seule la mise en page la voit).
import { space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode } from 'react'
import { View } from 'react-native'

/** La largeur d'un bouton de la paire, au plus (points). */
const PAIR_BUTTON_MAX = 360

type Props = {
  /**
   * Les deux boutons, dans l'ordre de lecture : l'action principale d'abord (à gauche, ou dessus
   * une fois empilés). Un enfant peut être un bouton seul, ou un bouton et sa légende dans une
   * `Stack` : la légende suit alors la largeur de son bouton.
   */
  children: ReactNode
  /**
   * Côte à côte, deux places de hauteurs différentes (un bouton et sa légende, à côté d'un bouton
   * seul) : centrées l'une par rapport à l'autre (par défaut), ou alignées en haut, pour que les
   * deux boutons restent sur la même ligne (la page d'un projet, planche R5a-Projet-Desktop).
   */
  align?: 'center' | 'start'
}

export function ButtonPair({ children, align = 'center' }: Props) {
  // Children.toArray retire les enfants vides (`cond && <Button/>` faux) : un bouton absent ne
  // laisse pas de place vide, l'autre reste seul, à la même largeur bornée.
  const items = Children.toArray(children)
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        // Les deux boutons d'une rangée ont parfois une hauteur différente (un libellé passé sur
        // deux lignes) : centrés l'un par rapport à l'autre, sauf demande contraire (`align`).
        alignItems: align === 'start' ? 'flex-start' : 'center',
        gap: space.md,
      }}
    >
      {items.map((child, index) => (
        <View
          key={isValidElement(child) && child.key !== null ? child.key : index}
          style={{
            flexGrow: 1,
            flexBasis: 'auto',
            // flexShrink et minWidth 0 : un bouton seul plus large que l'écran (320 points, 200 %)
            // rétrécit, et son libellé passe à la ligne au lieu de sortir de l'écran (sur le web,
            // une vue ne rétrécit pas d'elle-même).
            flexShrink: 1,
            minWidth: 0,
            maxWidth: PAIR_BUTTON_MAX,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  )
}
