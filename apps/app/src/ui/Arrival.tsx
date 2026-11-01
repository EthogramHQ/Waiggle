// L'arrivée d'un élément dans une liste déjà affichée (R4, le fil) : les cartes qui arrivent en haut
// du fil, après « 3 nouveaux projets », tombent à leur place, comme une goutte de miel (le ressort
// `drop` de @ruche/brand). Avec « Réduire les animations », elles apparaissent en fondu, sans
// déplacement. Ce qui était déjà là au premier affichage ne bouge pas : c'est la liste qui dit quels
// éléments arrivent (`arriving`).
//
// Le cadre remplit aussi la case qui le reçoit (une case de grille étirée à la hauteur de sa
// voisine), pour que la carte puisse s'étirer avec elle, et c'est la vue que la liste mesure (`ref`,
// la lumière qui suit la carte du milieu de l'écran).
import { durations, springs } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn, FadeInUp, ReduceMotion } from 'react-native-reanimated'
import { useCalmMotion } from './theme/motion'

type Props = {
  children: ReactNode
  /** L'élément vient d'arriver : il entre en scène ; sinon, il est simplement là. */
  arriving: boolean
  /** La vue de l'élément, pour qui veut la mesurer (`measureInWindow`). */
  ref?: Ref<View>
}

// `entering` : l'animation que Reanimated joue quand la vue apparaît à l'écran (et seulement à ce
// moment-là). FadeInUp (« fondu depuis le haut » : le nom dit d'où elle vient, pas où elle va ;
// FadeInDown, lui, monterait du bas) part 25 points au-dessus de sa place, en transparence, et
// descend s'y poser ; `springify` remplace sa durée par un ressort, celui de la goutte (sur le web,
// Reanimated joue une animation CSS de 300 ms à la place). Créées une fois pour toutes : la même
// animation sert à chaque carte.
const drop = FadeInUp.springify()
  .stiffness(springs.drop.stiffness)
  .damping(springs.drop.damping)
  .mass(springs.drop.mass)
// Le fondu du mode calme : sans déplacement, il reste permis (seuls les grands déplacements
// s'effacent). `ReduceMotion.Never` : sans lui, Reanimated sauterait aussi le fondu quand l'appareil
// demande moins d'animations, et la carte apparaîtrait d'un coup.
const calmFade = FadeIn.duration(durations.base).reduceMotion(ReduceMotion.Never)

export function Arrival({ children, arriving, ref }: Props) {
  const calm = useCalmMotion()
  // Une carte déjà là reçoit `undefined` : rien ne se joue. Changer `entering` après l'apparition
  // ne rejoue rien non plus : seule compte la valeur au moment où la vue arrive.
  const entering = arriving ? (calm ? calmFade : drop) : undefined
  return (
    // flexGrow : la carte peut s'étirer à la hauteur de la case (voir ProjectGrid).
    <Animated.View entering={entering} style={{ flexGrow: 1 }}>
      <View ref={ref} style={{ flexGrow: 1 }}>
        {children}
      </View>
    </Animated.View>
  )
}
