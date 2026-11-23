// La pastille de gain (R19, planche R19-Gain) : « +2 pollen » naît près du bouton du geste qui l'a
// rapporté (une réaction posée, « Envoyer » d'un commentaire, le coin des testeurs), monte un peu,
// se tient, puis monte encore en s'effaçant. Elle ne prend aucune tape et ne pousse rien : elle est
// posée par-dessus la page, à côté de son bouton (`placement`), jamais dans le flux.
//
// Elle se voit sans être lue : la pastille est cachée aux lecteurs d'écran, qui entendent à la place
// une phrase entière, poliment, après ce qu'ils lisent déjà (« 2 pollen gagnés. »). Sur iOS, c'est
// une annonce demandée à VoiceOver en file (`queue: true`, relecture d'interface UI-5) : jamais par-
// dessus l'annonce du geste lui-même. Sur le web et Android, c'est la région polie de LiveStatus.
//
// `trigger` est la clé de rejeu : la pastille joue (mouvement et annonce) à son arrivée, puis chaque
// fois que la clé change ; un écran qui se redessine avec la même clé ne rejoue rien. L'écran (ou
// l'hôte de `src/gamification/`) ne la monte que quand il y a un gain à montrer.
//
// « Réduire les animations » (useCalmMotion) : un fondu sur place, sans montée ni grossissement.
import { durations, layout, radii, space } from '@ruche/brand'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, Platform, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { LiveStatus } from './LiveStatus'
import { Text } from './Text'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le pollen gagné, un entier plus grand que zéro (lu de l'en-tête `Waiggle-Pollen`). */
  amount: number
  /** La clé de rejeu : un nouveau nombre à chaque gain (même montant, nouveau geste). */
  trigger: number
  /**
   * Où naît la pastille, par rapport à la boîte qui la porte : `above`, centrée au-dessus (une
   * réaction, « Envoyer ») ; `end`, à droite, à mi-hauteur (le coin des testeurs).
   */
  placement: 'above' | 'end'
  /**
   * Un point d'ancrage, en points, depuis le coin haut gauche de la boîte qui la porte. Sans lui,
   * la pastille s'ancre au bord de cette boîte (le bouton lui-même, enveloppé dans une vue). Avec
   * lui, elle s'ancre en ce point : pour une couche posée par-dessus un verre qui rogne ce qui
   * dépasse (la capsule des réactions, comme sa goutte, ui/reactionMotion.tsx). `above` : le point
   * est le milieu du bas de la pastille ; `end` : le milieu de son bord gauche.
   */
  at?: { x: number; y: number }
}

/** Le temps où la pastille se tient, après sa naissance et avant son départ (planche R19-Gain). */
const HOLD_UNTIL = 900
/** Une durée de quelques millisecondes : le saut au point de départ, avant chaque mouvement. */
const JUMP = 1
const never = ReduceMotion.Never

/** Une durée fixe qui joue même en mode calme : c'est la pastille qui décide de ce qui reste. */
const timing = (to: number, duration: number, easing = Easing.out(Easing.quad)) => {
  'worklet'
  return withTiming(to, { duration, easing, reduceMotion: never })
}

// La goutte de pollen devant le nombre : la même forme que la goutte d'une réaction, en petit.
const DROP_WIDTH = 9
const DROP_HEIGHT = 12
const dropPath =
  'M6 0 C6 0 0 7.2 0 10.2 C0 13.4 2.7 16 6 16 C9.3 16 12 13.4 12 10.2 C12 7.2 6 0 6 0 Z'

/**
 * La boîte qui porte la pastille, posée hors du flux. Sur le web, elle prend la largeur de son
 * texte (une seule ligne, `numberOfLines`) : une boîte plus large dépasserait du bord de la page
 * près d'un bouton au bord, et ferait défiler la page de côté. Sur téléphone, le moteur de mise en
 * page mesurerait le texte à la largeur du bouton (44 points) et le couperait : la boîte y a une
 * largeur fixe, assez grande pour « +25 pollen » à 200 %, centrée sur son ancre.
 */
const boxStyle = (placement: Props['placement']): ViewStyle => {
  const box = layout.pollenGain.box
  if (placement === 'above') {
    return Platform.OS === 'web'
      ? { position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'center' }
      : {
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          width: box,
          marginLeft: -box / 2,
          alignItems: 'center',
        }
  }
  return {
    position: 'absolute',
    left: '100%',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: space.sm,
    ...(Platform.OS === 'web' ? null : { width: box }),
  }
}

export function PollenGain({ amount, trigger, placement, at }: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const calm = useCalmMotion()
  const message = t(($) => $.game.gained, { count: amount })

  // Ce que dit la région polie (web, Android). Vide au premier rendu : une région qui apparaît
  // déjà pleine est muette ; elle se remplit juste après (l'effet plus bas).
  const [spoken, setSpoken] = useState('')
  // La clé déjà jouée : `null` tant que rien n'a joué (le montage joue aussi).
  const played = useRef<number | null>(null)
  // Le message du moment, lu par l'effet sans le relancer quand seul le texte change (langue).
  const latest = useRef(message)
  latest.current = message

  const opacity = useSharedValue(0)
  const scale = useSharedValue(1)
  const lift = useSharedValue(0)

  useEffect(() => {
    if (played.current === trigger) return
    const replay = played.current !== null
    played.current = trigger

    // Le mouvement, en trois temps (planche R19-Gain, option b17) : la naissance (`quick`, de 0,6
    // à 1 en taille et en opacité), la tenue jusqu'à 900 ms après une montée de 12 points, puis le
    // départ (`medium`) : 24 points plus haut, en s'effaçant. En mode calme : le même fondu
    // d'entrée, la même tenue, un fondu de sortie (`base`), et rien ne bouge.
    const { rise, leave } = layout.pollenGain
    if (calm) {
      scale.value = 1
      lift.value = 0
      opacity.value = withSequence(
        timing(0, JUMP),
        timing(1, durations.quick),
        withDelay(HOLD_UNTIL - durations.quick, timing(0, durations.base)),
      )
    } else {
      opacity.value = withSequence(
        timing(0.6, JUMP),
        timing(1, durations.quick),
        withDelay(HOLD_UNTIL - durations.quick, timing(0, durations.medium)),
      )
      scale.value = withSequence(timing(0.6, JUMP), timing(1, durations.quick))
      lift.value = withSequence(
        timing(0, JUMP),
        withDelay(durations.quick, timing(-rise, durations.base)),
        withDelay(
          HOLD_UNTIL - durations.quick - durations.base,
          timing(-(rise + leave), durations.medium, Easing.in(Easing.quad)),
        ),
      )
    }

    // L'annonce : une seule façon par plateforme, jamais deux lectures du même gain.
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(latest.current, { queue: true })
      return
    }
    if (!replay) {
      setSpoken(latest.current)
      return
    }
    // Un nouveau gain dit la même phrase : la région ne lit que ce qui change ; on la vide, puis
    // on la remplit un instant plus tard pour qu'elle relise.
    setSpoken('')
    const refill = setTimeout(() => setSpoken(latest.current), durations.quick)
    return () => clearTimeout(refill)
  }, [trigger, calm, opacity, scale, lift])

  const pillStyle = useAnimatedStyle(() =>
    // Mode calme : l'opacité seule, aucune transformation (rien ne se déplace).
    calm
      ? { opacity: opacity.value }
      : {
          opacity: opacity.value,
          transform: [{ translateY: lift.value }, { scale: scale.value }],
        },
  )

  const content = (
    <View pointerEvents="none" style={boxStyle(placement)}>
      <Animated.View
        // Cachée aux lecteurs d'écran, sur chaque plateforme : l'annonce dit déjà la même chose.
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            gap: space.xs,
            paddingHorizontal: space.md,
            paddingVertical: space.xs,
            borderRadius: radii.pill,
            backgroundColor: colors.honeyLight,
            boxShadow: `${shadows.highlight}, ${shadows.honey}`,
          },
          pillStyle,
        ]}
      >
        <Svg width={DROP_WIDTH} height={DROP_HEIGHT} viewBox="0 0 12 16">
          <Path d={dropPath} fill={colors.honey} stroke={colors.honeyPressed} strokeWidth={1} />
        </Svg>
        {/* Une seule ligne : la pastille ne se replie jamais, même à 200 %. */}
        <Text variant="button" tone="onHoney" tabular numberOfLines={1}>
          {t(($) => $.game.gain, { amount })}
        </Text>
      </Animated.View>
    </View>
  )

  return (
    <>
      {at ? (
        // L'ancre : une vue sans taille en ce point ; la boîte se pose contre elle.
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: at.x, top: at.y, width: 0, height: 0 }}
        >
          {content}
        </View>
      ) : (
        content
      )}
      {/* La phrase lue, hors de la pastille cachée. Sur iOS, elle reste vide : l'annonce en file
          y est demandée directement (LiveStatus, lui, l'annoncerait une seconde fois). */}
      <LiveStatus message={Platform.OS === 'ios' ? '' : spoken} visible={false} />
    </>
  )
}
