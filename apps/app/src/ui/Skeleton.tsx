// Les squelettes (Miel 2, tranche R1) : des formes pleines à la place d'un contenu en cours de
// chargement (le fil, une page), plutôt que le mot « Chargement… » seul. Elles annoncent la forme de
// ce qui arrive : la page ne saute pas quand le contenu les remplace.
// - SkeletonCard : une carte, un grand bloc et deux lignes (à 80 % et 55 % de la largeur).
// - SkeletonList : plusieurs cartes l'une sous l'autre.
// Les formes « respirent » (leur opacité monte et descend doucement) pour dire que ça avance. Avec
// « Réduire les animations », elles restent immobiles : une animation sans fin à côté du contenu
// s'arrête à la demande (WCAG 2.2.2).
// Pour un lecteur d'écran, les formes ne disent rien : l'ensemble est nommé « Chargement… » et
// marqué occupé, une seule fois, même pour une liste de plusieurs cartes.
import { durations, radii, space } from '@ruche/brand'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** La hauteur du grand bloc d'une carte, puis celle d'une ligne, en points. */
const BLOCK = 90
const LINE = 14
/** Le creux de la respiration : les formes descendent à cette opacité, puis remontent. */
const LOW = 0.55
/** La durée d'une demi-respiration : un dixième de celle de la lumière d'ambiance (2 s). */
const BREATH = durations.breath / 10

/**
 * Hook : l'opacité qui respire, partagée par toutes les formes d'un squelette (elles battent
 * ensemble). withRepeat(…, -1, true) rejoue le fondu sans fin, aller puis retour.
 */
const useBreath = () => {
  const calm = useCalmMotion()
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (calm) {
      cancelAnimation(opacity)
      opacity.value = 1
      return
    }
    opacity.value = withRepeat(withTiming(LOW, { duration: BREATH }), -1, true)
    return () => cancelAnimation(opacity)
  }, [calm, opacity])
  return useAnimatedStyle(() => ({ opacity: opacity.value }))
}

/** Une forme pleine, de cette hauteur et de cette largeur (en part de la carte). */
function Shape({ height, width }: { height: number; width: `${number}%` }) {
  const { colors } = useTheme()
  return (
    <View
      style={{ height, width, borderRadius: radii.small, backgroundColor: colors.surfaceGrouped }}
    />
  )
}

/** Les formes d'une carte, sans nom : la carte nommée ou la liste les enveloppe. */
function CardShapes() {
  return (
    <View style={{ gap: space.sm }}>
      <Shape height={BLOCK} width="100%" />
      <Shape height={LINE} width="80%" />
      <Shape height={LINE} width="55%" />
    </View>
  )
}

/**
 * Le cadre qui nomme et marque occupé : « Chargement… », dans la langue de l'appli. Le rôle
 * « progressbar » (sans valeur : une attente dont on ne connaît pas la fin) fait lire ce nom sur le
 * web, où un bloc sans rôle serait ignoré. Occupé : `aria-busy` sur le web (react-native-web ignore
 * accessibilityState), l'état « busy » sur téléphone.
 */
function Loading({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const breath = useBreath()
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t(($) => $.common.loading)}
      {...(Platform.OS === 'web' ? { 'aria-busy': true } : { accessibilityState: { busy: true } })}
      style={[{ gap: space.xxl }, breath]}
    >
      {children}
    </Animated.View>
  )
}

export function SkeletonCard() {
  return (
    <Loading>
      <CardShapes />
    </Loading>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <Loading>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des formes identiques, jamais réordonnées.
        <CardShapes key={index} />
      ))}
    </Loading>
  )
}
