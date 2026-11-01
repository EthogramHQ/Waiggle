// La carte immersive d'un projet, celle du fil : la couverture en plein cadre et, en bas, un panneau
// de verre avec l'auteur, la date, le titre, l'accroche, « Tester ↗ », le statut et le total des
// réactions (« ✦ 49 »). Elle ne connaît pas l'API : on lui donne des textes déjà prêts, ce qui permet
// de l'utiliser aussi comme aperçu pendant qu'on écrit un projet.
//
// Dans une liste, la carte mène au projet (`onPress`). R4 (relecture de l'interface ui-B1) : le
// panneau sort de ce lien. La carte est faite de calques posés l'un sur l'autre :
// - le lien du projet, un calque plein (la photo, le verre, le titre et l'accroche), nommé par le
//   titre : on peut toucher la carte presque partout ;
// - au-dessus, l'auteur (un lien vers sa page) et la date, en haut du verre ;
// - au-dessus, « Tester ↗ » (un lien vers la démo, annoncé comme un site externe), le statut et le
//   total, en bas du verre.
// Trois liens frères, jamais l'un dans l'autre (un lien dans un lien est ambigu pour un lecteur
// d'écran, et interdit sur le web), lus dans l'ordre auteur → projet → Tester. Le verre du lien
// garde, en haut et en bas, une place vide de la hauteur de ces deux rangées, mesurée.
//
// Un emplacement `overlay` pose un contrôle sur la photo, en haut (la pastille « Suivre Nora »
// d'Explorer, R3) : à côté du lien de la carte, jamais dedans (relecture de l'interface, ui-4).
import { layout, pressScale, radii, space } from '@ruche/brand'
import { type ReactNode, type Ref, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, Pressable, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Avatar } from './Avatar'
import { describedBy } from './aria'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** La hauteur d'une carte du fil, en points (le squelette du fil prend la même : `Skeleton`). */
export const PROJECT_CARD_HEIGHT = 476

type Props = {
  title: string
  pitch: string
  /** L'auteur ; avec `onPress`, son nom et sa photo mènent à sa page (un lien à part). */
  author: { name: string; avatar: ImageSource | null; onPress?: () => void }
  /** La photo de couverture ; sans elle, la lumière miel. */
  image?: CoverImage | null
  /**
   * Quand : un texte (« 12 oct. ») ou un nœud déjà prêt, `RelativeTime` dans le fil. Sur le web,
   * `RelativeTime` est une vue (un texte et sa version complète, cachée à l'œil) : il se pose ici,
   * à côté des autres textes, jamais dans un texte.
   */
  when: ReactNode
  status: { label: string; strong: boolean }
  /**
   * « Tester ↗ », s'il y a une démo : un lien vers un site externe, posé à côté du lien de la carte
   * (même quand la carte en est un), jamais dedans. `label` est le texte affiché (« Tester ») ; le
   * nom lu ajoute le projet (« Tester Carnet de cafés »).
   */
  tryIt?: { label: string; onPress: () => void }
  /** Une pastille de plus, à côté du statut (« Privé »). */
  badge?: string
  /** Le total des réactions (« ✦ 49 », lu « 49 réactions ») ; rien à 0. */
  reactionTotal?: number
  /** Toute la carte devient un lien vers le projet ; son nom est le titre du projet. */
  onPress?: () => void
  /** La hauteur de la carte ; elle grandit si le texte agrandi ne tient pas dedans. */
  height?: number
  /**
   * Un contrôle posé sur la photo, en haut à gauche (`FollowButton variant="chip"`). Il est rendu à
   * côté du lien de la carte, pas dedans : un bouton dans un lien serait ambigu pour les lecteurs
   * d'écran, et le toucher n'ouvre pas le projet.
   */
  overlay?: ReactNode
  /**
   * La vue qui entoure la photo, pour qui veut la mesurer (`measureInWindow`) : la photo de la carte
   * qui s'agrandit en page du projet (le mouvement de R4).
   */
  coverRef?: Ref<View>
}

/** La marge entre le bord de la carte et le verre, puis celle du verre autour de son contenu. */
const INSET = space.sm
const PANEL_PADDING = space.lg
/** L'écart entre les rangées du verre (`gap` du panneau). */
const ROW_GAP = space.sm

/**
 * Le cadre qui cache un texte à l'œil sans le cacher au lecteur d'écran (la recette « sr-only » du
 * web, comme `HiddenHeading` et `RelativeTime`) : une case d'un point, hors du flux, qui rogne tout.
 */
const hiddenFrame = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
  ...(Platform.OS === 'web' ? { clipPath: 'inset(50%)', whiteSpace: 'nowrap' } : null),
} as unknown as ViewStyle

/** Ce qui ne se lit pas : caché aux lecteurs d'écran, sur le web comme sur téléphone. */
const decorative = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const

/** Les hauteurs mesurées : les deux rangées posées sur le verre, le titre et la carte entière. */
type Measures = { author: number; bottom: number; title: number | null; card: number }

/** Hook : une mesure (`onLayout`) qui ne redessine que si la hauteur a changé. */
const useMeasures = (height: number) => {
  // Avant toute mesure, les rangées valent une zone à toucher (leur hauteur au texte ordinaire) :
  // le verre a déjà la bonne forme au pré-rendu du web, et rien ne saute ensuite.
  const [measures, setMeasures] = useState<Measures>({
    author: layout.touchTarget,
    bottom: layout.touchTarget,
    title: null,
    card: height,
  })
  const measure = (key: keyof Measures) => (event: LayoutChangeEvent) => {
    const value = Math.round(event.nativeEvent.layout.height)
    setMeasures((current) => (current[key] === value ? current : { ...current, [key]: value }))
  }
  return [measures, measure] as const
}

export function ProjectCard({
  title,
  pitch,
  author,
  image,
  when,
  status,
  tryIt,
  badge,
  reactionTotal = 0,
  onPress,
  height = PROJECT_CARD_HEIGHT,
  overlay,
  coverRef,
}: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const web = Platform.OS === 'web'
  const [measures, measure] = useMeasures(height)
  // Une garde commune aux trois liens : la seconde tape d'une double tape (« Tester », puis la
  // carte juste à côté) n'ouvre pas une deuxième page.
  const guard = useTapGuard()
  const open = onPress ? guard(onPress) : undefined
  const openAuthor = author.onPress ? guard(author.onPress) : undefined
  const test = tryIt ? guard(tryIt.onPress) : undefined
  // L'accroche décrit le lien de la carte sur le web (lue après son nom) : useId donne le même
  // identifiant au pré-rendu et dans le navigateur.
  const pitchId = useId()

  // La carte s'enfonce un peu sous le doigt, comme les boutons (`Pressed`), mais toute entière :
  // l'auteur et « Tester », posés dessus, s'enfoncent avec elle et restent à leur place.
  const scale = useSharedValue(1)
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // Les bords des rangées posées sur le verre : ceux du contenu du verre.
  const edge = INSET + PANEL_PADDING
  // La rangée de l'auteur se pose au-dessus du titre, qui est mesuré : elle attend sa mesure
  // (invisible le temps d'un rendu) pour ne jamais se dessiner sur le titre.
  const authorBottom = edge + measures.bottom + ROW_GAP + (measures.title ?? 0) + ROW_GAP

  // --- Le calque du lien : la photo, le verre, le titre et l'accroche -------------------------
  const body = (
    <View
      onLayout={measure('card')}
      style={{ minHeight: height, justifyContent: 'flex-end', padding: INSET }}
    >
      {/* La photo remplit la carte, même agrandie par le texte. Elle décore : le lien porte déjà
          le nom du projet. */}
      <View ref={coverRef} style={{ position: 'absolute', inset: 0 }} {...decorative}>
        <ProjectCover height={measures.card} image={image ?? null} shadow="card" />
      </View>
      <Surface variant="panel" padding="lg" gap="sm">
        {/* La place de la rangée de l'auteur, posée par-dessus. */}
        <View style={{ height: measures.author }} />
        <View onLayout={measure('title')} style={{ gap: ROW_GAP }}>
          <Text variant="title3" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="callout" tone="secondary" numberOfLines={2} nativeID={pitchId}>
            {pitch}
          </Text>
        </View>
        {/* La place de la rangée du bas (« Tester », statut, total), posée par-dessus. */}
        <View style={{ height: measures.bottom }} />
      </Surface>
    </View>
  )

  const cardLayer = open ? (
    // Le lien de la carte, nommé par le titre et décrit par l'accroche. L'anneau du clavier suit
    // le rayon de la couverture (« sheet »).
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      {...describedBy(pitchId)}
      // Entrée ouvre le projet sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(open)}
      onPress={open}
      onPressIn={() => {
        scale.value = spring(pressScale, 'firm')
      }}
      onPressOut={() => {
        scale.value = spring(1)
      }}
      style={{ borderRadius: radii.sheet }}
    >
      {body}
    </Pressable>
  ) : (
    body
  )

  // --- La rangée de l'auteur ------------------------------------------------------------------
  const who = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Avatar name={author.name} source={author.avatar} label={author.name} size={28} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="callout" weight={700} numberOfLines={1}>
          {author.name}
        </Text>
      </View>
    </View>
  )
  const authorRow = (
    <View
      onLayout={measure('author')}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space.sm,
        minHeight: layout.touchTarget,
        // box-none : la rangée laisse passer le doigt hors de ses liens, vers la carte dessous.
        pointerEvents: 'box-none',
      }}
    >
      {/* Le nom ne prend que sa place ; trop long, il rétrécit (une ligne, coupée). */}
      <View style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%' }}>
        {openAuthor ? (
          <Pressed label={author.name} role="link" onPress={openAuthor}>
            {who}
          </Pressed>
        ) : (
          who
        )}
      </View>
      {/* La date, à droite (marge automatique), ou sous le nom quand la place manque. */}
      <View style={{ marginLeft: 'auto' }}>
        {typeof when === 'string' ? (
          <Text variant="caption" tone="muted">
            {when}
          </Text>
        ) : (
          when
        )}
      </View>
    </View>
  )

  // --- Le total des réactions -----------------------------------------------------------------
  const reactionsLabel = t(($) => $.card.reactions, { count: reactionTotal })
  const drawnTotal = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <Icon name="sparkle-fill" size={space.lg} tone="honey" />
      <Text variant="callout" weight={700} tabular>
        {String(reactionTotal)}
      </Text>
    </View>
  )
  const total =
    reactionTotal > 0 ? (
      // À droite de la rangée (marge automatique). Le doigt passe au travers, vers la carte.
      <View style={{ marginLeft: 'auto', pointerEvents: 'none' }}>
        {web ? (
          // Sur le web, le nom d'un texte sans rôle n'est pas lu : le « 49 » dessiné est caché au
          // lecteur d'écran, et « 49 réactions » est écrit à côté, caché à l'œil (relecture ui-B3).
          <>
            <View aria-hidden>{drawnTotal}</View>
            <View style={hiddenFrame}>
              <Text variant="caption">{reactionsLabel}</Text>
            </View>
          </>
        ) : (
          // Sur téléphone, VoiceOver et TalkBack lisent le nom donné au groupe : « 49 réactions ».
          <View accessible accessibilityRole="text" accessibilityLabel={reactionsLabel}>
            {drawnTotal}
          </View>
        )}
      </View>
    ) : null

  // --- « Tester ↗ » ---------------------------------------------------------------------------
  // Le nom lu : « Tester Carnet de cafés » (le texte affiché en tête, puis le projet : plusieurs
  // cartes, plusieurs « Tester »). Il quitte l'appli : sur le web, où l'indice n'existe pas, le nom
  // le dit (« …, ouvre un site externe ») ; sur téléphone, l'indice lu après le nom.
  const testName = t(($) => $.explore.testProject, { title })
  const outside = t(($) => $.common.externalSite)
  // La pastille miel, recopiée de `TesterCard` et `TesterRow` (un composant commun est à décider) ;
  // ici à la hauteur d'une zone à toucher, comme sur la planche du fil.
  const tester =
    tryIt && test ? (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={web ? `${testName}, ${outside}` : testName}
        accessibilityHint={web ? undefined : outside}
        // Entrée ouvre la démo sur le web, comme un vrai lien (voir keyboard.ts).
        {...enterActivates(test)}
        onPress={test}
        style={{
          // 44 points à toucher ; le rayon suit la pastille, pour l'anneau du clavier, qui se
          // dessine autour (un anneau intérieur se perdrait sur le miel). Jamais plus large que la
          // rangée, même à 200 % de texte.
          minHeight: layout.touchTarget,
          minWidth: layout.touchTarget,
          maxWidth: '100%',
          flexShrink: 1,
          justifyContent: 'center',
          borderRadius: radii.pill,
        }}
      >
        {({ pressed }) => (
          // Son texte encre (onHoney) se lit sur le miel, opaque sur n'importe quelle photo.
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              minHeight: layout.controlHeight.compact,
              paddingHorizontal: space.lg,
              borderRadius: radii.pill,
              backgroundColor: pressed ? colors.honeyPressed : colors.honey,
              boxShadow: `${shadows.highlight}, ${shadows.honey}`,
            }}
          >
            <Text variant="callout" weight={700} tone="onHoney" numberOfLines={1}>
              {tryIt.label}
            </Text>
            {/* La flèche est décorative : le nom lu dit déjà que le lien sort de l'appli. */}
            <View aria-hidden>
              <Icon name="arrow-up-right" size={space.lg} tone="onHoney" />
            </View>
          </View>
        )}
      </Pressable>
    ) : null

  // --- La rangée du bas : « Tester », le statut, la pastille, le total -------------------------
  const bottomRow = (
    <View
      onLayout={measure('bottom')}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.touchTarget,
        pointerEvents: 'box-none',
      }}
    >
      {tester}
      {/* Les pastilles ne se touchent pas : le doigt passe au travers, vers la carte. */}
      <View style={{ flexDirection: 'row', gap: space.sm, pointerEvents: 'none' }}>
        <StatusPill label={status.label} strong={status.strong} />
        {badge ? <StatusPill label={badge} /> : null}
      </View>
      {total}
    </View>
  )

  return (
    // La carte et, par-dessus, ses rangées : des voisins dans un même cadre, qui s'enfoncent
    // ensemble sous le doigt. L'ordre de l'arbre est celui de la lecture (et du clavier) :
    // l'auteur, la carte, « Tester », puis l'emplacement (« Suivre Nora »).
    <Animated.View style={[{ alignSelf: 'stretch' }, pressStyle]}>
      {/* La rangée de l'auteur vient avant le lien dans l'arbre, mais se dessine au-dessus de lui
          (zIndex). box-none : le calque laisse passer le doigt hors de la rangée. */}
      <View
        style={{
          position: 'absolute',
          left: edge,
          right: edge,
          bottom: authorBottom,
          zIndex: 1,
          opacity: measures.title === null ? 0 : 1,
          pointerEvents: 'box-none',
        }}
      >
        {authorRow}
      </View>
      {cardLayer}
      <View
        style={{
          position: 'absolute',
          left: edge,
          right: edge,
          bottom: edge,
          zIndex: 1,
          pointerEvents: 'box-none',
        }}
      >
        {bottomRow}
      </View>
      {overlay ? (
        // box-none : la vue de l'emplacement laisse passer le doigt hors du contrôle, vers la carte
        // qui est dessous. Ses bords suivent ceux du panneau de verre du bas.
        <View
          style={{
            position: 'absolute',
            top: INSET,
            left: INSET,
            right: INSET,
            zIndex: 1,
            pointerEvents: 'box-none',
          }}
        >
          {overlay}
        </View>
      ) : null}
    </Animated.View>
  )
}
