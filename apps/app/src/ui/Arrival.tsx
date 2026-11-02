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
import { type ReactNode, type Ref, type RefObject, useCallback } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn, FadeInUp, ReduceMotion } from 'react-native-reanimated'
import { useCalmMotion } from './theme/motion'

type Props = {
  children: ReactNode
  /** L'élément vient d'arriver : il entre en scène ; sinon, il est simplement là. */
  arriving: boolean
  /** La vue de l'élément, pour qui veut la mesurer (`measureInWindow`). */
  ref?: Ref<View>
  /**
   * La même vue, pour la première carte arrivée avec la dernière page : `FeedEnd` y pose le focus
   * quand « Afficher la suite » disparaît (`useFirstArrived`, jur-RF2).
   */
  focusRef?: RefObject<View | null> | undefined
}

/** Donne la vue à un `ref`, qu'il soit une fonction (rappelée) ou un objet (`current`). */
const assign = (ref: Ref<View> | undefined, node: View | null) => {
  if (typeof ref === 'function') ref(node)
  else if (ref) ref.current = node
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

export function Arrival({ children, arriving, ref, focusRef }: Props) {
  const calm = useCalmMotion()
  // Une vue, deux `ref` : un seul rappel qui donne la vue aux deux. `useCallback` le garde d'un
  // affichage à l'autre (React ne le rappelle que si l'un des deux change).
  const both = useCallback(
    (node: View | null) => {
      assign(ref, node)
      assign(focusRef, node)
    },
    [ref, focusRef],
  )
  // Une carte déjà là reçoit `undefined` : rien ne se joue. Changer `entering` après l'apparition
  // ne rejoue rien non plus : seule compte la valeur au moment où la vue arrive.
  const entering = arriving ? (calm ? calmFade : drop) : undefined
  return (
    // flexGrow : la carte peut s'étirer à la hauteur de la case (voir ProjectGrid).
    <Animated.View entering={entering} style={{ flexGrow: 1 }}>
      <View ref={focusRef ? both : ref} style={{ flexGrow: 1 }}>
        {children}
      </View>
    </Animated.View>
  )
}
