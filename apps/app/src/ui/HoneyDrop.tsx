// La Goutte des Éclaireuses (tranche R20, planches R20-Goutte et R20-Goutte-Nuit) : un bouton rond de
// 56 points, une goutte de miel pointe en haut avec une bulle de discussion, posé en bas à droite de
// l'écran. Il ouvre la feuille « Ton retour ». Une pastille dit le nombre de missions de la semaine
// qui restent (encre sur la cire de la page, jamais rouge : rien ne presse). Un appui long la replie
// en languette au bord droit, sans pastille, qui la rouvre d'un geste.
//
// Ce composant ne lit ni l'API ni la navigation : son nom lu (`label`), son nombre et ce qu'il fait
// lui viennent de ses propriétés (scout/ScoutDrop le branche). Il se pose lui-même dans le coin :
// au-dessus de la barre d'onglets du téléphone (ui/tabBarSpace), et il réserve sa hauteur pour que
// les toasts et le gain de pollen passent au-dessus de lui (ui/floatingSpace), jamais dessous.
// `inline` le dessine sur place (le catalogue).
//
// Il part dans le premier paquet de l'appli (il est monté dans app/_layout.tsx) : rien de lourd ici.
import { borders, layout, pressScaleFab, radii, space } from '@ruche/brand'
import { type ReactNode, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AccessibilityActionEvent,
  Platform,
  Pressable,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { BADGE_SIZE, badgeText } from './CountBadge'
import { useFloatingClaim } from './floatingSpace'
import { focusWithoutScroll, moveReaderTo } from './focus'
import { Icon } from './Icon'
import { Text } from './Text'
import { useTabBarSpace } from './tabBarSpace'
import { useLayout } from './theme/layout'
import { fade, spring, useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'
import { layerPosition, ToastLayer } from './theme/toastLayer'

type Props = {
  /** Le nom lu du bouton (« Faire un retour sur Waiggle, 2 missions à faire »). */
  label: string
  /** Les missions de la semaine qui restent : une pastille au-dessus de 0, rien sinon. */
  count?: number
  /** Repliée : la languette au bord droit, à la place de la goutte. */
  folded: boolean
  /** Un appui sur la goutte (ouvrir la feuille). */
  onPress: () => void
  /** Un appui long sur la goutte, sa touche Menu ou l'action d'un lecteur d'écran (la replier). */
  onLongPress: () => void
  /** Un appui sur la languette (la rouvrir). */
  onUnfold: () => void
  /** Dessinée sur place, sans se poser dans le coin de l'écran (le catalogue). */
  inline?: boolean
  /** Sans son arrivée animée (le catalogue, les captures). */
  still?: boolean
}

/** Le côté du bouton, comme le rond « Publier » de la barre d'onglets (planche R20-Goutte). */
export const DROP_SIZE = layout.tabBar.publish
/** La languette repliée : étroite, collée au bord, mais touchable sur 44 points vers l'intérieur. */
const TAB = { width: space.xxl, height: 60 } as const
/** Le délai d'un appui long, comme celui des réactions (ReactionCapsule). */
const LONG_PRESS_MS = 450

/**
 * La goutte, pointe en haut, dans un carré de 56 : le rond du bas (centre 28, 34 ; rayon 20) et
 * deux courbes qui montent jusqu'à la pointe (28, 3). Le reflet : un petit arc clair en haut à
 * gauche du rond, comme sur les alvéoles de R19.
 */
const DROP_PATH = 'M28 3C34 11 48 22 48 34A20 20 0 0 1 8 34C8 22 22 11 28 3Z'
const GLARE_PATH = 'M15 31C15.5 26 18 22.5 21.5 20'
/** Le centre du rond, sous le centre du carré : la bulle s'y pose. */
const BUBBLE_OFFSET = 6

export function HoneyDrop({
  label,
  count,
  folded,
  onPress,
  onLongPress,
  onUnfold,
  inline = false,
  still = false,
}: Props) {
  const content = folded ? (
    <FoldedTab onUnfold={onUnfold} />
  ) : (
    <DropButton
      label={label}
      count={count}
      onPress={onPress}
      onLongPress={onLongPress}
      still={still}
    />
  )
  if (inline) return content
  return <CornerPlace folded={folded}>{content}</CornerPlace>
}

/**
 * La place dans le coin bas droit : au-dessus de la barre d'onglets (12 points d'air), sinon au-dessus
 * de la zone du geste de l'appareil ; à la marge de l'écran du bord droit, ou collée au bord pour la
 * languette. Elle réserve sa hauteur (`useFloatingClaim`) : un toast ou le gain de pollen se posent
 * au-dessus d'elle. Sur le web, elle vit dans la couche du toast (`ToastLayer`, dans <body>) : elle
 * reste collée à la fenêtre quand la page défile.
 */
function CornerPlace({ folded, children }: { folded: boolean; children: ReactNode }) {
  const tabBar = useTabBarSpace()
  const insets = useSafeAreaInsets()
  const { padding } = useLayout()
  const bottom = tabBar.height > 0 ? tabBar.height + space.md : insets.bottom + padding
  useFloatingClaim(bottom + (folded ? TAB.height : DROP_SIZE))
  const place: ViewStyle = {
    position: layerPosition as ViewStyle['position'],
    bottom,
    right: folded ? 0 : padding,
  }
  return (
    <ToastLayer>
      <View pointerEvents="box-none" style={place}>
        {children}
      </View>
    </ToastLayer>
  )
}

function DropButton({
  label,
  count,
  onPress,
  onLongPress,
  still,
}: {
  label: string
  count: number | undefined
  onPress: () => void
  onLongPress: () => void
  still: boolean
}) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const calm = useCalmMotion()
  // L'enfoncement sous le doigt (0,92, comme le rond « Publier »), et l'arrivée : la goutte tombe
  // en place avec le ressort « goutte » ; « Réduire les animations » : un fondu, rien ne grandit.
  const scale = useSharedValue(1)
  const arrival = useSharedValue(still ? 1 : 0)
  const sink = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const enter = useAnimatedStyle(() =>
    calm
      ? { opacity: arrival.value }
      : {
          opacity: Math.min(1, arrival.value * 2),
          transform: [{ scale: 0.6 + 0.4 * arrival.value }],
        },
  )
  useEffect(() => {
    arrival.value = calm ? fade(1) : spring(1, 'drop')
  }, [arrival, calm])
  const button = useRef<View>(null)
  // Repliée par un geste ici, puis rouverte : la goutte qui revient reprend le focus du clavier
  // (la languette qui l'avait disparaît). Rien au premier montage : pas de focus sans geste.
  useRefocusAfterGesture(button)
  const fold = t(($) => $.scout.drop.fold)
  const shown = count !== undefined && count > 0
  return (
    <Animated.View style={enter}>
      <Animated.View style={sink}>
        <Pressable
          ref={button}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          onLongPress={() => {
            markGesture()
            onLongPress()
          }}
          delayLongPress={LONG_PRESS_MS}
          // Les lecteurs d'écran : l'action « appui long » replie la goutte (VoiceOver, TalkBack).
          accessibilityActions={[{ name: 'longpress', label: fold }]}
          onAccessibilityAction={(event: AccessibilityActionEvent) => {
            if (event.nativeEvent.actionName !== 'longpress') return
            markGesture()
            onLongPress()
          }}
          {...(Platform.OS === 'web'
            ? {
                // Clic droit, touche Menu, Maj+F10 : la goutte se replie (le menu du navigateur
                // n'apprendrait rien ici). preventDefault sur l'événement lui-même : détachée, la
                // fonction lèverait « Illegal invocation ».
                onContextMenu: (event: { preventDefault: () => void }) => {
                  event.preventDefault()
                  markGesture()
                  onLongPress()
                },
              }
            : null)}
          onPressIn={() => {
            scale.value = spring(pressScaleFab, 'firm')
          }}
          onPressOut={() => {
            scale.value = spring(1)
          }}
          style={{
            width: DROP_SIZE,
            height: DROP_SIZE,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* La goutte : décorative, le bouton porte le nom. Son ombre suit la forme sur le web
              (`drop-shadow`) ; une ombre de boîte y dessinerait un carré. */}
          <View
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              ...(Platform.OS === 'web'
                ? ({ filter: `drop-shadow(${shadows.honey})` } as ViewStyle)
                : null),
            }}
          >
            <Svg width={DROP_SIZE} height={DROP_SIZE} viewBox="0 0 56 56">
              <Path
                d={DROP_PATH}
                fill={colors.honey}
                stroke={colors.honeyPressed}
                strokeWidth={1}
              />
              <Path
                d={GLARE_PATH}
                fill="none"
                stroke={colors.glassBorder}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </Svg>
          </View>
          <View pointerEvents="none" style={{ marginTop: BUBBLE_OFFSET * 2 }}>
            <Icon name="chat-circle-dots" size={24} tone="onHoney" />
          </View>
          {shown ? <MissionBadge count={count} /> : null}
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

/**
 * La pastille des missions, en haut à droite de la goutte : le chiffre de la couleur de la page sur
 * l'encre, bordée de la page (de nuit, claire sur sombre). Cachée aux lecteurs d'écran : le nom du
 * bouton dit déjà le nombre.
 */
function MissionBadge({ count }: { count: number }) {
  const { colors } = useTheme()
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: space.xs,
        right: 0,
        minWidth: BADGE_SIZE,
        minHeight: BADGE_SIZE,
        paddingHorizontal: space.xs,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.text,
        borderWidth: borders.badge,
        borderColor: colors.background,
      }}
    >
      <Text variant="micro" weight={700} tone="onInk" tabular maxScale={1.2}>
        {badgeText(count)}
      </Text>
    </View>
  )
}

/** La languette repliée : miel, coins gauches arrondis, un chevron vers l'intérieur de l'écran. */
function FoldedTab({ onUnfold }: { onUnfold: () => void }) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const tab = useRef<View>(null)
  useRefocusAfterGesture(tab)
  return (
    <Pressable
      ref={tab}
      accessibilityRole="button"
      accessibilityLabel={t(($) => $.scout.drop.unfold)}
      onPress={() => {
        markGesture()
        onUnfold()
      }}
      // La zone à toucher fait 44 de large : la languette dessinée (24) plus 20 vers l'intérieur.
      style={{
        width: layout.touchTarget,
        height: TAB.height,
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            width: TAB.width,
            height: TAB.height,
            borderTopLeftRadius: radii.code,
            borderBottomLeftRadius: radii.code,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? colors.honeyPressed : colors.honey,
            boxShadow: shadows.honey,
          }}
        >
          <Icon name="caret-left" size={16} tone="onHoney" />
        </View>
      )}
    </Pressable>
  )
}

// --- Le focus d'un repli à l'autre ---

// Replier ou rouvrir remplace l'élément touché par un autre (la languette, la goutte) : le focus
// du clavier, et le lecteur d'écran, tomberaient sur toute la page. Un geste fait ici lève ce
// drapeau ; l'élément qui apparaît ensuite le baisse et prend le focus. Une variable du module,
// pas un état : la goutte et la languette ne vivent jamais en même temps.
let gestureMade = false
const markGesture = () => {
  gestureMade = true
}

function useRefocusAfterGesture(ref: { current: View | null }) {
  useEffect(() => {
    if (!gestureMade) return
    gestureMade = false
    focusWithoutScroll(ref.current)
    moveReaderTo(ref.current)
  }, [ref])
}
