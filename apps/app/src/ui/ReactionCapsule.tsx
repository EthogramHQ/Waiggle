// La capsule des réactions (R5a, scénario « La capsule », planches R5a-Projet et R5a-Eventail) : une
// pilule de verre qui flotte sur la page d'un projet, avec les cinq réactions (Bluffant, Inspirant,
// Utile, Drôle, « Waggle ! ») en icônes, chacune avec son nombre. Celles qu'on a posées sont en
// miel plein. Jamais qui a réagi : seulement combien.
//
// Les gestes :
// - toucher une icône pose la réaction, ou la retire si elle est déjà posée (`onToggle`) ; une
//   réaction posée fait tomber une goutte de miel, rouler le nombre, s'élargir un anneau, rebondir
//   le bouton, et danser l'abeille de « Waggle ! » (reactionMotion.tsx) ;
// - un appui long (430 ms), un clic droit, la touche Menu du clavier (ou Maj+F10) et l'action
//   « appui long » d'un lecteur d'écran ouvrent l'éventail, qui donne le nom de chaque réaction
//   (`onOpenFan`), sans rien poser. Sur Chrome Android, un appui long envoie aussi un « menu
//   contextuel » : l'éventail ne s'ouvre qu'une fois.
//
// Le composant ne se place pas lui-même : la page le pose (en bas de l'écran sur téléphone, à
// cheval sur la photo sur ordinateur). Il reprend les états de ReactionBar, qu'il remplace sur la
// page : un compte suspendu (réactions `locked` ou `disabled`), et une erreur avec son lien
// (« Me reconnecter »), affichée au-dessus de la capsule pour rester dans l'écran.
//
// Étroit (320 points) ou texte agrandi (200 %) : la capsule ne défile jamais de côté ; les nombres
// passent sous les icônes, dans chaque bouton.
//
// À partir de 1 000, le nombre s'écrit en court (« 1,2 k », `shortCount`), y compris celui qui roule ;
// le nom lu garde le nombre entier (« Utile, 1234 »).
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import type { ReactionKind } from '@ruche/contracts'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { describedBy, pressed } from './aria'
import { hiddenFrame } from './HiddenHeading'
import { Icon, type IconName } from './Icon'
import { bee, beeViewBox } from './logo.generated'
import { Notice, type NoticeAction } from './Notice'
import { BeeDance, ReactionBurst, RollingCount, useBounce } from './reactionMotion'
import { Surface } from './Surface'
import { useScreenFocused } from './screenFocus'
import { shortCount } from './shortCount'
import { Text } from './Text'
import { useTapGuard, useTapsAllowed } from './tapGuard'
import { spring, useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Une réaction telle que la page la donne : son nombre, et si c'est la sienne. */
export type CapsuleReaction = {
  kind: ReactionKind
  count: number
  /** Le membre qui regarde a posé cette réaction : miel plein. */
  mine: boolean
  /**
   * Cette réaction ne se pose pas (compte suspendu, tranche 7c) : son nombre seul, sans bouton.
   * Les autres restent des boutons, pour retirer une réaction déjà donnée.
   */
  locked?: boolean
  /**
   * Ce bouton ne répond plus (compte suspendu qui vient de retirer cette réaction) : il reste à sa
   * place, et le focus avec lui, mais il pâlit, se dit « désactivé » et n'envoie rien.
   */
  disabled?: boolean
}

/**
 * Une réaction avec ses textes, écrits par la capsule elle-même : son nom (« Waggle ! ») et le nom
 * lu, complet (« Waggle !, 21, ta réaction »).
 */
type Item = CapsuleReaction & { text: string; label: string }

type Props = {
  reactions: CapsuleReaction[]
  /** Pose ou retire cette réaction. */
  onToggle: (kind: ReactionKind) => void
  /**
   * Ouvre l'éventail (appui long, clic droit, touche Menu, action du lecteur d'écran). Facultatif :
   * sans lui (compte suspendu, qui ne pose plus rien), aucun de ces gestes n'existe, et les boutons
   * ne promettent ni indice ni action « appui long » ; le clic droit garde le menu du navigateur.
   */
  onOpenFan?: (() => void) | undefined
  /** Le dernier changement n'a pas pu être enregistré : le message, au-dessus de la capsule. */
  error?: string | undefined
  /** Un lien sous le message d'erreur (« Me reconnecter » quand la session a expiré). */
  errorAction?: NoticeAction | undefined
}

/** L'appui long qui ouvre l'éventail, en millisecondes (scénario R5a). */
export const FAN_LONG_PRESS_MS = 430
/**
 * Deux demandes d'ouverture plus proches que ce délai sont le même geste : l'appui long et le
 * « menu contextuel » qu'envoie Chrome Android pour ce même appui.
 */
const SAME_GESTURE_MS = 1000

// L'icône de chaque réaction : le contour, puis la version pleine une fois la réaction posée.
// « Waggle ! » n'est pas une icône Phosphor : c'est l'abeille du logo (ReactionIcon).
const icons: Record<Exclude<ReactionKind, 'bravo'>, { outline: IconName; filled: IconName }> = {
  amazing: { outline: 'sparkle', filled: 'sparkle-fill' },
  inspiring: { outline: 'lightbulb', filled: 'lightbulb-fill' },
  useful: { outline: 'wrench', filled: 'wrench-fill' },
  funny: { outline: 'smiley', filled: 'smiley-fill' },
}

/** La taille des icônes de la capsule, en points. */
const ICON_SIZE = 20

/**
 * L'icône d'une réaction : une icône Phosphor, ou l'abeille du logo pour « Waggle ! ». `onHoney` :
 * posée sur le miel plein (une réaction à soi), l'encre devient celle du miel et le corps de
 * l'abeille s'éclaircit pour se détacher du fond. Exportée pour l'éventail et le bloc de l'auteur.
 */
export function ReactionIcon({
  kind,
  filled = false,
  onHoney = false,
  size = ICON_SIZE,
}: {
  kind: ReactionKind
  filled?: boolean
  onHoney?: boolean
  size?: number
}) {
  const { colors } = useTheme()
  if (kind !== 'bravo') {
    const icon = icons[kind]
    return (
      <Icon
        name={filled ? icon.filled : icon.outline}
        size={size}
        tone={onHoney ? 'onHoney' : 'default'}
      />
    )
  }
  return (
    <Svg
      width={size}
      height={size}
      viewBox={beeViewBox}
      // Décorative : c'est le bouton qui porte le nom (« Waggle !, 21 »).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Path d={bee.honey} fill={onHoney ? colors.honeyLight : colors.honey} />
      <Path d={bee.wing} fill={onHoney ? colors.honeyLight : colors.surface} />
      <Path d={bee.ink} fill={onHoney ? colors.onHoney : colors.text} />
    </Svg>
  )
}

export function ReactionCapsule({ reactions, onToggle, onOpenFan, error, errorAction }: Props) {
  const { t } = useTranslation()
  const calm = useCalmMotion()
  const hintId = useId()
  // L'indice « Voir les réactions et leurs noms » n'existe que si l'éventail peut s'ouvrir.
  const hint = onOpenFan ? t(($) => $.reactions.fan.open) : undefined
  const label = t(($) => $.project.reactions.group)
  // Le nom affiché de chaque réaction et le nom lu, qui reprend ce qu'on voit (le nombre) et dit
  // si elle est la sienne.
  const items: Item[] = reactions.map((reaction) => {
    const text = t(($) => $.project.reactions[reaction.kind])
    const { count, mine } = reaction
    return {
      ...reaction,
      text,
      label: t(($) => (mine ? $.project.reactions.labelMine : $.project.reactions.label), {
        name: text,
        count,
      }),
    }
  })
  // Chaque réaction posée reçoit un numéro qui avance : la goutte, l'anneau, le rebond et la danse
  // partent quand il change. Au montage, aucun : rien ne bouge sans geste du membre.
  const [bursts, setBursts] = useState<Partial<Record<ReactionKind, number>>>({})
  // Le centre de chaque bouton, mesuré dans la rangée : la goutte y tombe.
  const [centers, setCenters] = useState<Partial<Record<ReactionKind, { x: number; y: number }>>>(
    {},
  )
  const lastOpen = useRef<number | null>(null)
  // RF (relecture de sécurité, A2) : sur le web, la capsule flotte hors du fondu du contenu
  // (ui/ScreenFade.tsx), qui coupe les tapes tant que la page n'est pas pleine. Elle prenait donc
  // les tapes dès la première image d'un retour sur la page : la seconde tape d'une double tape
  // posait une réaction. Elle les ignore pendant TAP_GUARD_MS à chaque fois que sa page devient
  // affichée, comme une fenêtre qui s'ouvre. Dans l'appli de téléphone, la pile glisse et la
  // capsule arrive avec la page : pas de garde.
  const focused = useScreenFocused()
  const tapsAllowed = useTapsAllowed(focused, Platform.OS === 'web')

  const openFan = onOpenFan
    ? () => {
        // Date.now() dans un geste, jamais pendant le rendu (la page web est pré-rendue).
        const now = Date.now()
        if (lastOpen.current !== null && now - lastOpen.current < SAME_GESTURE_MS) return
        lastOpen.current = now
        onOpenFan()
      }
    : undefined

  const press = (item: Item) => {
    if (!tapsAllowed) return
    // Poser (et non retirer) fait partir le mouvement.
    if (!item.mine) setBursts((all) => ({ ...all, [item.kind]: (all[item.kind] ?? 0) + 1 }))
    onToggle(item.kind)
  }

  const measure = (kind: ReactionKind) => (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout
    const center = { x: x + width / 2, y: y + height / 2 }
    setCenters((all) => {
      const known = all[kind]
      return known && known.x === center.x && known.y === center.y
        ? all
        : { ...all, [kind]: center }
    })
  }

  // Des réactions verrouillées parmi les autres (compte suspendu) : la rangée devient une liste,
  // chaque réaction un élément ; les verrouillées montrent leur nombre, les autres gardent leur
  // bouton (liste > élément > bouton, comme ReactionBar).
  const mixed = items.some((item) => item.locked)

  return (
    <View style={styles.column}>
      {/* Au-dessus de la capsule : en bas de l'écran, un message dessous sortirait de la vue.
          Notice est lue dès qu'elle apparaît (role « alert »). */}
      {error ? <Notice message={error} action={errorAction} /> : null}
      <View style={styles.capsule}>
        <Surface variant="glass" padding="none" fill={false}>
          <View
            role={mixed ? 'list' : 'group'}
            {...(label ? { accessibilityLabel: label } : null)}
            style={styles.row}
          >
            {items.map((item) => {
              const content = item.locked ? (
                <Locked item={item} />
              ) : (
                <ReactionButton
                  item={item}
                  burst={bursts[item.kind] ?? 0}
                  calm={calm}
                  hint={hint}
                  hintId={hintId}
                  onPress={() => press(item)}
                  onOpenFan={openFan}
                />
              )
              return (
                <View
                  key={item.kind}
                  onLayout={measure(item.kind)}
                  // Une réaction verrouillée est déjà un élément de liste (Locked) : la case qui
                  // l'entoure n'en est pas un, car un <li> dans un <li> est du HTML invalide, que
                  // le navigateur répare en lisant la page pré-rendue (erreur #418 de React).
                  {...(mixed && !item.locked ? { role: 'listitem' as const } : null)}
                  style={styles.slot}
                >
                  {content}
                </View>
              )
            })}
          </View>
        </Surface>
        {/* La goutte et l'anneau, hors du verre qui rognerait ce qui dépasse. La couche ne prend
            aucune tape (pointerEvents en propriété : sur le web, en style, elle les prendrait). */}
        <View pointerEvents="none" style={styles.motionLayer}>
          {items.map((item) => {
            const center = centers[item.kind]
            const play = bursts[item.kind] ?? 0
            return center && play > 0 ? (
              <ReactionBurst
                key={item.kind}
                play={play}
                x={center.x + LAYER_OFFSET}
                y={center.y + LAYER_OFFSET}
                calm={calm}
              />
            ) : null
          })}
        </View>
      </View>
      {/* L'indice lu sur chaque bouton, sur le web (aria-describedby) : « Voir les réactions et
          leurs noms ». Caché à l'œil ; sur téléphone, c'est accessibilityHint. */}
      {Platform.OS === 'web' && hint ? (
        <View style={hiddenFrame} pointerEvents="none">
          <Text nativeID={hintId}>{hint}</Text>
        </View>
      ) : null}
    </View>
  )
}

type ButtonProps = {
  item: Item
  burst: number
  calm: boolean
  /** L'indice de l'éventail ; absent quand la capsule n'a pas d'éventail. */
  hint: string | undefined
  hintId: string
  onPress: () => void
  onOpenFan: (() => void) | undefined
}

/** Une réaction qu'on peut poser ou retirer : un bouton qui reste enfoncé (miel plein). */
function ReactionButton({ item, burst, calm, hint, hintId, onPress, onOpenFan }: ButtonProps) {
  const { colors } = useTheme()
  // La garde contre la double tape, propre à cette réaction (un bouton, une garde) : deux tapes à
  // 180 ms posaient puis retiraient la réaction, soit deux écritures et une réaction perdue. Une
  // tape sur une autre réaction passe ; le même bouton se rouvre après TAP_GUARD_MS.
  const guard = useTapGuard()
  // La langue, pour l'écriture courte du nombre (« 1,2 k » / « 1.2K »).
  const { i18n } = useTranslation()
  // Comme les boutons : il s'enfonce légèrement sous le doigt, avec un ressort.
  const scale = useSharedValue(1)
  const sink = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  // Le rebond d'une réaction posée, sur une vue à part de l'enfoncement.
  const bounce = useBounce(calm)
  const playBounce = bounce.play
  // Le dernier numéro joué : seul un numéro neuf (une réaction posée) fait rebondir, pas le montage
  // ni un changement de réglage.
  const played = useRef(burst)
  useEffect(() => {
    if (burst === played.current) return
    played.current = burst
    playBounce()
  }, [burst, playBounce])
  const inactive = item.disabled === true
  // Les gestes de l'éventail, seulement si la capsule en a un : sans lui, rien n'est promis (ni
  // indice, ni action « appui long »), et le clic droit garde le menu du navigateur.
  const fanProps =
    onOpenFan && hint
      ? {
          onLongPress: onOpenFan,
          delayLongPress: FAN_LONG_PRESS_MS,
          // L'indice : « Voir les réactions et leurs noms ». Sur téléphone, accessibilityHint ; sur
          // le web, react-native-web ne le transmet pas : aria-describedby vers le texte caché de
          // la capsule.
          accessibilityHint: hint,
          // Le lecteur d'écran : l'action « appui long » ouvre l'éventail (VoiceOver, TalkBack).
          accessibilityActions: [{ name: 'longpress' as const, label: hint }],
          onAccessibilityAction: (event: AccessibilityActionEvent) => {
            if (event.nativeEvent.actionName === 'longpress') onOpenFan()
          },
          ...(Platform.OS === 'web'
            ? {
                // Clic droit, touche Menu, Maj+F10 : le menu du navigateur laisse la place à
                // l'éventail. preventDefault sur l'événement lui-même, sans détacher la fonction
                // (sur le web, la détacher lèverait « Illegal invocation »).
                onContextMenu: (event: { preventDefault: () => void }) => {
                  event.preventDefault()
                  onOpenFan()
                },
                ...describedBy(hintId),
              }
            : null),
        }
      : null
  return (
    <Animated.View style={[styles.grow, sink]}>
      <Animated.View style={[styles.grow, bounce.style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.label}
          {...pressed(item.mine)}
          // « Désactivé » pour les lecteurs d'écran : sur le web, react-native-web écrit
          // aria-disabled d'après `disabled` seul ; il coupe aussi l'appui.
          aria-disabled={inactive}
          disabled={inactive}
          // Mais `disabled` le sortirait du parcours au clavier, au moment où on vient de le
          // toucher : le focus se perdrait. Il y reste (comme ReactionBar).
          {...(Platform.OS === 'web' && inactive ? { tabIndex: 0 as const } : null)}
          {...fanProps}
          onPress={guard(() => {
            if (!inactive) onPress()
          })}
          onPressIn={() => {
            if (!inactive) scale.value = spring(pressScale, 'firm')
          }}
          onPressOut={() => {
            scale.value = spring(1)
          }}
          style={({ pressed: down }) => [
            styles.button,
            item.mine && { backgroundColor: colors.honey },
            down && !item.mine && !inactive && { backgroundColor: colors.surfaceGrouped },
            // Inactif : la même pâleur qu'un bouton blanc inactif.
            inactive && styles.inactive,
          ]}
        >
          {/* Le nom de la réaction (« Waggle ! »), écrit mais caché à l'œil : la planche ne montre
              que l'icône, et le nom lu du bouton (accessibilityLabel) le dit déjà. Il reste dans
              le texte de la page (une recherche dans la page le trouve). */}
          <View style={hiddenFrame} pointerEvents="none">
            <Text selectable={false}>{item.text}</Text>
          </View>
          {item.kind === 'bravo' ? (
            <BeeDance play={burst} calm={calm}>
              <ReactionIcon kind="bravo" onHoney={item.mine} />
            </BeeDance>
          ) : (
            <ReactionIcon kind={item.kind} filled={item.mine} onHoney={item.mine} />
          )}
          <RollingCount
            value={item.count}
            calm={calm}
            format={(value) => shortCount(value, i18n.language)}
            render={(value) => (
              // tabular : des chiffres de même largeur, le bouton ne tressaute pas quand il change.
              <Text
                variant="callout"
                weight={700}
                tone={item.mine ? 'onHoney' : 'default'}
                tabular
                selectable={false}
              >
                {shortCount(value, i18n.language)}
              </Text>
            )}
          />
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

/**
 * Une réaction verrouillée (compte suspendu) : l'icône et le nombre, pâlis, sans bouton. Un élément
 * de liste nommé (« Bluffant, 9 »), lu d'un seul tenant.
 */
function Locked({ item }: { item: Item }) {
  const { i18n } = useTranslation()
  return (
    <View
      // accessible : sur téléphone, l'élément est lu d'un seul tenant ; sur le web, le rôle suffit.
      accessible
      role="listitem"
      accessibilityLabel={item.label}
      style={[styles.button, styles.inactive]}
    >
      <ReactionIcon kind={item.kind} />
      <Text variant="callout" weight={700} tone="secondary" tabular selectable={false}>
        {shortCount(item.count, i18n.language)}
      </Text>
    </View>
  )
}

/** Le décalage entre la couche du mouvement et la rangée : la bordure du verre (aucune marge). */
const LAYER_OFFSET = borders.hairline

const styles = StyleSheet.create({
  // La colonne : le message d'erreur, puis la capsule, centrée sous lui. Jamais plus large que la
  // place donnée par la page, et elle rétrécit dans une rangée (sur le web, une vue ne rétrécit
  // pas sans flexShrink).
  column: { gap: space.sm, maxWidth: '100%', flexShrink: 1 },
  capsule: { alignSelf: 'center', maxWidth: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: space.xxs,
    padding: space.xs,
  },
  // Chaque place rétrécit si la rangée manque de largeur (base « auto » : sa largeur naturelle).
  slot: { flexShrink: 1, flexBasis: 'auto', minWidth: layout.touchTarget },
  grow: { flexGrow: 1, flexShrink: 1 },
  // Un bouton : l'icône et le nombre côte à côte, ou l'un sous l'autre quand la place manque
  // (flexWrap). Toujours 44 points au moins dans les deux sens.
  button: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // Avec flexWrap, les lignes se rangent selon alignContent (« stretch » par défaut), pas
    // alignItems : sur un bouton plus haut que son contenu, la ligne se collait en haut (icône et
    // nombre 9 px trop haut). Centrée, elle tient le milieu du bouton.
    alignContent: 'center',
    justifyContent: 'center',
    columnGap: space.xs,
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radii.pill,
  },
  inactive: { opacity: 0.55 },
  motionLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
})
