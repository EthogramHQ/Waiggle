// L'éventail des réactions (R5a, scénario « L'éventail », planche `R5a-Eventail`) : ouvert par un
// appui long sur la capsule (ou un clic droit, la touche Menu, l'action d'un lecteur d'écran), il
// montre par-dessus la page floutée chaque réaction avec son icône, son nom et son nombre. Toucher
// une ligne pose sa réaction ; sur une réaction déjà posée, la ligne dit « Ta réaction » et un
// bouton « Retirer » à part la retire (relecture ui-6 : une ligne, un seul contrôle). L'éventail
// reste ouvert après un choix : on peut en poser plusieurs, ce que rappelle la phrase du bas.
// À partir de 1 000, le nombre s'écrit en court (« 1,2 k », `shortCount`) ; le nom lu garde le
// nombre entier.
//
// La première fois sur l'appareil, une aide en haut (« Touche une réaction pour la poser… ») avec
// « J'ai compris ». Elle est lue dans le stockage dès le montage, l'éventail encore fermé (ui-9) :
// lue à l'ouverture, elle arriverait un instant après les lignes et les pousserait sous le doigt.
// Sur téléphone, l'éventail est calé en bas, juste au-dessus de la capsule : ce qui paraît en haut
// ne déplace pas les lignes.
//
// Bâti comme `Sheet` (composant voisin, mêmes gardes) : un Modal, donc une boîte de dialogue modale
// nommée « Les réactions » ; il se ferme par un toucher à côté (le voile), Échap ou le bouton Retour
// d'Android, et rend alors le focus du clavier à la capsule qui l'a ouvert. Le voile et les lignes
// ont la garde de double tape (TAP_GUARD_MS) : l'éventail s'ouvre sous le doigt de l'appui long, et
// ce doigt qui se lève ne choisit rien (ui-5).
import { layout, pressScale, radii, space } from '@ruche/brand'
import type { ReactionKind } from '@ruche/contracts'
import { type Ref, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './Button'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import { hasSeen, noteSeen } from './oncePerDevice'
import { ReactionIcon } from './ReactionCapsule'
import { Surface } from './Surface'
import { shortCount } from './shortCount'
import { Text } from './Text'
import { holdPageTaps, TAP_GUARD_MS, useTapsAllowed } from './tapGuard'
import { useLayout } from './theme/layout'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Une réaction telle que la page la donne : son nombre, et si c'est la sienne. */
export type FanReaction = { kind: ReactionKind; count: number; mine: boolean }

type Props = {
  open: boolean
  reactions: FanReaction[]
  /** Pose ou retire cette réaction (la ligne pose, « Retirer » retire). */
  onToggle: (kind: ReactionKind) => void
  /** Ferme l'éventail : toucher à côté, Échap, Retour d'Android. */
  onClose: () => void
}

type KeyEvent = { key: string; repeat?: boolean; preventDefault: () => void }

/** L'élément qui a le focus dans la page, sur le web ; null ailleurs ou sans document. */
const activeElement = (): unknown =>
  (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement ?? null

/** La largeur de l'éventail, au plus : la planche sur téléphone, centrée sur ordinateur. */
const FAN_WIDTH = 380
/** Le décalage d'une ligne à la suivante, qui dessine l'éventail (la planche). */
const FAN_STEP = space.sm
/**
 * Sur téléphone, la place gardée sous l'éventail pour la capsule, posée par la page en bas de
 * l'écran : on la voit encore, floutée, sous les lignes.
 */
const CAPSULE_ROOM = layout.touchTarget + space.huge
/** Le rond qui porte l'icône d'une ligne. */
const DISK = 36

export function ReactionFan({ open, reactions, onToggle, onClose }: Props) {
  const { t } = useTranslation()
  const { sizeClass } = useLayout()
  const insets = useSafeAreaInsets()
  const phone = sizeClass === 'compact'
  const title = t(($) => $.reactions.fan.title)

  // L'aide de la première fois : `null` tant que le stockage n'a pas répondu, puis vrai si cet
  // appareil ne l'a jamais vue. useEffect au montage (l'éventail encore fermé), avec un drapeau
  // `cancelled` : une réponse arrivée après le départ du composant ne change rien.
  const [help, setHelp] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    hasSeen('reaction-fan-help').then((seen) => {
      if (!cancelled) setHelp(!seen)
    })
    return () => {
      cancelled = true
    }
  }, [])
  // « J'ai compris » touché : le focus va à la première ligne (ui-5), au lieu de retomber en haut.
  const [helpDismissed, setHelpDismissed] = useState(false)

  // La première chose à toucher dans l'éventail (la première ligne, ou son « Retirer ») et « J'ai
  // compris » : là où le focus du clavier se pose.
  const firstRef = useRef<View>(null)
  const helpOkRef = useRef<View>(null)
  // L'aide est-elle affichée au moment de l'ouverture ? Lu par l'effet d'ouverture, sans en faire
  // une dépendance (l'aide qui disparaît ne rouvre rien).
  const helpShown = useRef(false)
  helpShown.current = help === true

  // L'élément qui avait le focus avant l'ouverture (le bouton de la capsule) : il le retrouve à la
  // fermeture, sans faire défiler la page.
  const opener = useRef<unknown>(null)
  // Échap a deux voies sur le web, comme dans Sheet : l'onKeyDown (touche enfoncée) et l'écoute du
  // Modal (touche relâchée), qui appelle onRequestClose. Ce drapeau évite une seconde fermeture.
  const escapeHandled = useRef(false)

  // La garde de l'ouverture (celle de Dialog et Sheet) : pendant TAP_GUARD_MS, ni le voile ni les
  // lignes ne prennent de tape.
  const tapsAllowed = useTapsAllowed(open, true)
  // Le doigt de l'appui long, qui se lève sur une ligne : un relâché sans appui commencé sur ce
  // contrôle. On note quel contrôle a reçu l'appui (`down`) et lequel un relâché orphelin (`lifted`).
  // Une activation sans toucher (lecteur d'écran) n'a ni l'un ni l'autre : elle passe.
  const touch = useRef<{ down: string | null; lifted: string | null }>({ down: null, lifted: null })
  // Les réactions choisies il y a moins de TAP_GUARD_MS : la seconde tape d'une double tape, sur la
  // ligne ou sur le « Retirer » qui vient de paraître à sa place, ne fait rien. Un `ref` : la seconde
  // tape arrive avant que React ait redessiné.
  const recent = useRef(new Set<ReactionKind>())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  /** Les gestes d'un contrôle qui pose ou retire `kind`, gardés comme expliqué plus haut. */
  const choose = (id: string, kind: ReactionKind) => ({
    onPressIn: () => {
      touch.current = { down: id, lifted: null }
    },
    onPressOut: () => {
      if (touch.current.down !== id) touch.current.lifted = id
    },
    onPress: () => {
      const orphan = touch.current.lifted === id
      touch.current = { down: null, lifted: null }
      if (orphan || !tapsAllowed || recent.current.has(kind)) return
      recent.current.add(kind)
      timers.current.push(setTimeout(() => recent.current.delete(kind), TAP_GUARD_MS))
      onToggle(kind)
    },
  })

  // useEffect : à l'ouverture (web), on retient qui avait le focus et on le pose dans l'éventail
  // (« J'ai compris » s'il est là, sinon la première ligne) ; à la fermeture, on le rend.
  useEffect(() => {
    escapeHandled.current = false
    touch.current = { down: null, lifted: null }
    if (Platform.OS !== 'web') return
    if (open) {
      opener.current = activeElement()
      focusWithoutScroll(helpShown.current ? helpOkRef.current : firstRef.current)
      return
    }
    const back = opener.current
    opener.current = null
    if (back) focusWithoutScroll(back)
  }, [open])

  // Après « J'ai compris », une fois l'aide retirée de l'écran : le focus à la première ligne.
  useEffect(() => {
    if (helpDismissed) focusWithoutScroll(firstRef.current)
  }, [helpDismissed])

  const understood = () => {
    setHelp(false)
    setHelpDismissed(true)
    // Retenu sur l'appareil ; un refus du stockage n'empêche pas l'aide de disparaître.
    void noteSeen('reaction-fan-help')
  }

  // Les touches de l'éventail (web) : Échap ferme, une seule fois. Elles montent depuis l'élément
  // qui a le focus jusqu'à l'éventail.
  const keys =
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: KeyEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            escapeHandled.current = true
            if (!event.repeat) onClose()
          },
        }
      : null

  // Une tape sur le voile. Pendant la garde d'ouverture, elle ne ferme rien, mais sur le web elle a
  // pris le focus (le voile est une `div` focalisable) : on le rend à l'éventail, comme Sheet. Hors
  // garde, elle ferme, et la page dessous ignore les tapes un moment : la seconde tape d'une
  // double tape y tomberait (le « Retour » de la page, qui quittait la page : relecture R5a, C1).
  const onScrimPress = () => {
    if (!tapsAllowed) {
      if (web) focusWithoutScroll(helpShown.current ? helpOkRef.current : firstRef.current)
      return
    }
    onClose()
    holdPageTaps()
  }

  // Le Modal appelle onRequestClose au retour d'Android, et sur le web quand Échap est relâchée.
  const onRequestClose = () => {
    if (escapeHandled.current) {
      escapeHandled.current = false
      return
    }
    onClose()
  }

  // Sur le web, le Modal de react-native-web est déjà la boîte de dialogue modale : on le nomme, et
  // l'éventail ne s'en déclare pas une seconde à l'intérieur (comme Sheet). Ailleurs, c'est la vue
  // de l'éventail qui porte le rôle et le nom.
  const web = Platform.OS === 'web'
  const named = web ? ({ 'aria-label': title } as object) : null
  const dialog = web
    ? null
    : { role: 'dialog' as const, 'aria-modal': true, accessibilityLabel: title }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      {...named}
    >
      <View style={styles.layer}>
        {/* L'éventail d'abord, le voile ensuite : en s'ouvrant, la couche (web) pose le focus sur
            son premier élément atteignable, qui doit être dans l'éventail. zIndex le garde
            au-dessus du voile. pointerEvents « box-none » (en propriété, pas en style) : la vue
            elle-même laisse passer les tapes à côté des lignes, jusqu'au voile, qui ferme. */}
        <View
          {...dialog}
          accessibilityViewIsModal
          {...keys}
          pointerEvents="box-none"
          style={[
            styles.content,
            phone
              ? {
                  justifyContent: 'flex-end',
                  paddingTop: insets.top + space.lg,
                  paddingBottom: insets.bottom + CAPSULE_ROOM,
                }
              : { justifyContent: 'center', paddingVertical: space.xxxl },
          ]}
        >
          <ReactionFanPanel
            reactions={reactions}
            help={help === true}
            onToggle={onToggle}
            onUnderstood={understood}
            gesturesFor={choose}
            firstRef={firstRef}
            helpOkRef={helpOkRef}
          />
        </View>
        {/* Toucher le voile ferme l'éventail. Caché aux lecteurs d'écran (ils ont Échap et Retour)
            et hors de la touche Tab. Pendant la garde, la seconde tape d'une double tape n'y fait
            rien. Le voile floute la page dessous (Surface « veil »). */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onScrimPress}
          {...(web ? { tabIndex: -1 as const } : null)}
          style={StyleSheet.absoluteFill}
        >
          <Surface variant="veil" padding="none" fit="fill">
            {null}
          </Surface>
        </Pressable>
      </View>
    </Modal>
  )
}

type PanelProps = {
  reactions: FanReaction[]
  /** L'aide de la première fois, en haut. */
  help: boolean
  onToggle: (kind: ReactionKind) => void
  /** « J'ai compris ». */
  onUnderstood: () => void
  /** Pour ReactionFan : les gestes gardés de chaque contrôle (sans eux, une tape choisit). */
  gesturesFor?: (id: string, kind: ReactionKind) => Gestures
  /** Pour ReactionFan : le premier contrôle et « J'ai compris », où le focus se pose. */
  firstRef?: Ref<View>
  helpOkRef?: Ref<View>
}

/**
 * Le contenu de l'éventail, sans la couche qui le pose sur l'écran : l'aide, les lignes, la phrase
 * du bas. Exporté pour le catalogue, qui le montre dans la page, dans tous ses états ; les écrans
 * passent par ReactionFan.
 */
export function ReactionFanPanel({
  reactions,
  help,
  onToggle,
  onUnderstood,
  gesturesFor,
  firstRef,
  helpOkRef,
}: PanelProps) {
  const { t } = useTranslation()
  // Poser une réaction remplace sa ligne-bouton par une vue avec « Retirer », et retirer fait
  // l'inverse : le contrôle qui avait le focus disparaît (relecture R5a, C1). On garde donc le
  // contrôle de chaque réaction (`controls`) et la réaction que le membre vient de choisir
  // (`chosen`, avec son état d'avant) ; dès que la page l'a changée, le focus va au contrôle qui
  // a pris la place. Un `ref`, pas un état : le choix n'a rien à redessiner.
  const controls = useRef(new Map<ReactionKind, View | null>())
  const chosen = useRef<{ kind: ReactionKind; mine: boolean } | null>(null)
  // useEffect : après chaque changement des réactions, une fois les nouveaux contrôles montés.
  useEffect(() => {
    const choice = chosen.current
    if (!choice) return
    const now = reactions.find((reaction) => reaction.kind === choice.kind)
    if (!now || now.mine === choice.mine) return
    chosen.current = null
    focusWithoutScroll(controls.current.get(choice.kind) ?? null)
  }, [reactions])
  const gestures = (id: string, kind: ReactionKind, mine: boolean): Gestures => {
    const base = gesturesFor?.(id, kind) ?? {
      onPressIn: noop,
      onPressOut: noop,
      onPress: () => onToggle(kind),
    }
    return {
      ...base,
      onPress: () => {
        chosen.current = { kind, mine }
        base.onPress()
      },
    }
  }
  return (
    <View style={styles.column}>
      {help ? <Help onUnderstood={onUnderstood} okRef={helpOkRef} /> : null}
      <View style={styles.rows}>
        {reactions.map((reaction, index) => (
          <View
            key={reaction.kind}
            // L'éventail : chaque ligne un peu décalée de la précédente, comme sur la planche. Le
            // décalage se prend à gauche seulement : la dernière ligne, souvent la sienne avec
            // « Retirer », garde toute la largeur (à 320 points, « Retirer » passait dessous).
            style={{ marginLeft: (reactions.length - 1 - index) * FAN_STEP }}
          >
            <FanRow
              reaction={reaction}
              // Un nom par contrôle : la ligne qui pose, ou le « Retirer » d'une réaction posée.
              gestures={gestures(
                `${reaction.mine ? 'remove' : 'row'}-${reaction.kind}`,
                reaction.kind,
                reaction.mine,
              )}
              controlRef={(node: View | null) => {
                controls.current.set(reaction.kind, node)
                if (index === 0 && firstRef) setRef(firstRef, node)
              }}
            />
          </View>
        ))}
      </View>
      {/* « Tu peux en poser plusieurs, une de chaque. », en bas, sur une pilule de verre. Rayon de
          panneau : à 200 %, la phrase passe à la ligne sans rogner ses lettres. */}
      <Surface variant="glass" radius="panel" padding="md" fill={false}>
        <View style={styles.hint}>
          <Icon name="info" size={18} tone="secondary" />
          <View style={styles.shrink}>
            <Text variant="callout">{t(($) => $.reactions.fan.hint)}</Text>
          </View>
        </View>
      </Surface>
    </View>
  )
}

const noop = () => {}

/** Donne le nœud à une `ref`, qu'elle soit une fonction ou un objet (`useRef`). */
function setRef(ref: Ref<View>, node: View | null) {
  if (typeof ref === 'function') ref(node)
  else if (ref) ref.current = node
}

/** L'aide de la première fois : la main qui touche, la phrase, et « J'ai compris ». */
function Help({
  onUnderstood,
  okRef,
}: {
  onUnderstood: () => void
  okRef?: Ref<View> | undefined
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  return (
    <Surface variant="panel" padding="lg" gap="md">
      <View style={styles.helpRow}>
        <View style={[styles.disk, { backgroundColor: colors.honeySoft }]}>
          <Icon name="hand-tap" size={20} tone="accent" />
        </View>
        {/* En deux temps, comme sur la planche : la 1re phrase en gras, puis la suite. */}
        <View style={[styles.shrink, styles.helpText]}>
          <Text variant="callout" weight={700}>
            {t(($) => $.reactions.fan.helpLead)}
          </Text>
          <Text variant="callout">{t(($) => $.reactions.fan.help)}</Text>
        </View>
      </View>
      <View style={styles.end}>
        <Button
          label={t(($) => $.reactions.fan.helpOk)}
          variant="secondary"
          size="small"
          onPress={onUnderstood}
          {...(okRef ? { ref: okRef } : null)}
        />
      </View>
    </Surface>
  )
}

type Gestures = { onPressIn: () => void; onPressOut: () => void; onPress: () => void }

/**
 * Une ligne de l'éventail. Pas posée : toute la ligne est un bouton qui la pose (« Utile, 5 »).
 * Posée : la ligne en miel plein dit « Ta réaction » et n'est pas un bouton ; seul « Retirer » à
 * droite la retire.
 */
function FanRow({
  reaction,
  gestures,
  controlRef,
}: {
  reaction: FanReaction
  gestures: Gestures
  controlRef?: Ref<View>
}) {
  const { t, i18n } = useTranslation()
  const { colors } = useTheme()
  const name = t(($) => $.project.reactions[reaction.kind])
  const { count } = reaction
  // Comme les boutons : la ligne s'enfonce légèrement sous le doigt, avec un ressort.
  const scale = useSharedValue(1)
  const sink = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const disk = (
    <View
      style={[styles.disk, { backgroundColor: reaction.mine ? colors.surface : colors.honeySoft }]}
    >
      <ReactionIcon kind={reaction.kind} />
    </View>
  )
  const number = (
    // tabular : des chiffres de même largeur, comme dans la capsule.
    <Text variant="body" weight={700} tabular tone={reaction.mine ? 'onHoney' : 'default'}>
      {shortCount(count, i18n.language)}
    </Text>
  )

  if (reaction.mine) {
    return (
      <View style={[styles.row, styles.mineRow, { backgroundColor: colors.honey }]}>
        {disk}
        <View style={styles.names}>
          <Text variant="body" weight={700} tone="onHoney">
            {name}
          </Text>
          <Text variant="caption" weight={600} tone="onHoney">
            {t(($) => $.reactions.fan.mine)}
          </Text>
        </View>
        {number}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(($) => $.reactions.fan.removeNamed, { name })}
          {...gestures}
          {...(controlRef ? { ref: controlRef } : null)}
          // Le cadre de 44 points que touche le doigt ; la pilule blanche dessinée dedans.
          style={styles.removeFrame}
        >
          {({ pressed: down }) => (
            <View
              style={[
                styles.removePill,
                { backgroundColor: down ? colors.surfaceGrouped : colors.surface },
              ]}
            >
              <Text variant="callout" weight={700} selectable={false}>
                {t(($) => $.reactions.fan.remove)}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    )
  }

  return (
    <Animated.View style={sink}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(($) => $.project.reactions.label, { name, count })}
        {...gestures}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
          gestures.onPressIn()
        }}
        onPressOut={() => {
          scale.value = spring(1)
          gestures.onPressOut()
        }}
        {...(controlRef ? { ref: controlRef } : null)}
        // Le contour du focus clavier (commun, app/+html.tsx) suit l'arrondi de la ligne.
        style={styles.rowFrame}
      >
        <Surface variant="glass" radius="tile" padding="none">
          <View style={styles.row}>
            {disk}
            <View style={styles.names}>
              <Text variant="body" weight={700} selectable={false}>
                {name}
              </Text>
            </View>
            {number}
          </View>
        </Surface>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  // L'éventail couvre l'écran (au-dessus du voile), ses lignes calées en bas ou au centre.
  content: { flex: 1, zIndex: 1, paddingHorizontal: space.lg, alignItems: 'center' },
  column: { width: '100%', maxWidth: FAN_WIDTH, gap: space.lg },
  rows: { gap: space.sm },
  // Une ligne : le rond de l'icône, le nom (qui prend la place), le nombre, et « Retirer » sur la
  // sienne. Elle passe à la ligne quand la place manque (texte agrandi). Rayon de tuile : sur deux
  // lignes, une pilule rognerait les lettres des coins.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.md,
    rowGap: space.xs,
    minHeight: layout.touchTarget + space.md,
    paddingVertical: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.xl,
    borderRadius: radii.tile,
  },
  mineRow: { paddingRight: space.sm },
  rowFrame: { borderRadius: radii.tile },
  names: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  disk: {
    width: DISK,
    height: DISK,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeFrame: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  removePill: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.small,
  },
  helpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  helpText: { gap: space.xs },
  end: { alignItems: 'flex-end' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shrink: { flexShrink: 1 },
})
