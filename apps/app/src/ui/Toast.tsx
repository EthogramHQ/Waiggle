// Le toast de Miel 2 (refonte, tranche R1) : une pilule de verre centrée en bas de l'écran, qui dit
// en quelques mots qu'un geste a réussi (« Projet publié », « Lien copié »), puis s'efface.
// Ce fichier ne fait que le dessiner. Quand il paraît, combien de temps il reste, et comment les
// lecteurs d'écran l'annoncent : c'est le fournisseur (theme/toast.tsx) qui le décide ; les écrans
// l'appellent par useToast().show(texte).
// - Il apparaît par un ressort (`open`) qui le fait monter un peu, et part en fondu ; avec « Réduire
//   les animations », il ne fait que des fondus (rien ne se déplace).
// - Il ne contient que du texte, rendu par Text : jamais de bouton ni de lien (un geste qui
//   disparaît tout seul serait perdu pour qui lit lentement, WCAG 2.2.1), jamais de focus.
// - Sur ordinateur, la souris posée dessus le retient (onHoverChange) : on a le temps de le lire.
import { durations, layout, space } from '@ruche/brand'
import { type ReactNode, useEffect } from 'react'
import { Platform, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Icon, type IconName } from './Icon'
import { Surface } from './Surface'
import { Text } from './Text'
import { fade, spring } from './theme/motion'

/** La hauteur de la pilule (maquette) ; elle grandit si le texte de l'appareil est agrandi. */
const HEIGHT = 46
/** D'où part la pilule en apparaissant : un peu plus bas, puis elle monte à sa place. */
const RISE = 16

type Props = {
  text: string
  /** Une icône devant le texte (« check » pour un geste réussi). Décorative : le texte dit tout. */
  icon?: IconName
  /**
   * Ce qui se pose devant le texte à la place de l'icône (la mascotte, préparée par le
   * fournisseur). Décoratif aussi.
   */
  leading?: ReactNode
  /** Le temps de lecture est fini : la pilule s'efface en fondu. */
  leaving: boolean
  /** « Réduire les animations » : des fondus seulement. */
  calm: boolean
  /** La souris entre (vrai) ou sort (faux) de la pilule, sur le web. */
  onHoverChange?: (hovered: boolean) => void
}

export function Toast({ text, icon, leading, leaving, calm, onHoverChange }: Props) {
  const opacity = useSharedValue(0)
  const offset = useSharedValue(calm ? 0 : RISE)

  // À l'arrivée : le fondu, et la montée par ressort si le mouvement est permis. Au départ : le
  // fondu seul, dans le temps que le fournisseur lui laisse (durations.base).
  useEffect(() => {
    if (leaving) {
      opacity.value = fade(0, 'base')
      return
    }
    opacity.value = fade(1, 'quick')
    offset.value = calm ? 0 : spring(0, 'open')
  }, [leaving, calm, opacity, offset])

  const motion = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }))

  // Les événements de pointeur n'existent que sur le web (souris) ; sur téléphone, rien.
  const hover =
    Platform.OS === 'web' && onHoverChange
      ? {
          onPointerEnter: () => onHoverChange(true),
          onPointerLeave: () => onHoverChange(false),
        }
      : null

  return (
    // maxWidth : sur un téléphone étroit, un texte long passe à la ligne dans la pilule.
    <Animated.View style={[{ maxWidth: '100%' }, motion]}>
      <View {...hover}>
        <Surface variant="glass" fill={false}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              minHeight: HEIGHT,
              paddingHorizontal: space.xl,
              paddingVertical: space.sm,
              maxWidth: layout.formWidth,
            }}
          >
            {leading ?? (icon ? <Icon name={icon} size={20} tone="default" /> : null)}
            <View style={{ flexShrink: 1 }}>
              <Text variant="callout" weight={600}>
                {text}
              </Text>
            </View>
          </View>
        </Surface>
      </View>
    </Animated.View>
  )
}

/** Combien de temps reste un toast : 2,4 s, plus 60 ms par caractère au-delà de 20 (règle J8). */
export const readingTime = (text: string): number =>
  durations.toast + Math.max(0, text.length - 20) * 60
