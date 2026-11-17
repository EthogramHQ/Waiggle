// Le corps d'une page légale (tranche R11, planches R11-Pages et R11-Pages-Desktop) : la date de la
// version, l'« En bref » en puces, puis « Le texte complet, qui fait foi », une partie par titre.
// Commun aux quatre pages (Règles, Confidentialité, Mentions légales, Accessibilité) : il reçoit
// des textes déjà traduits, et l'écran pose le titre de la page (niveau 1) au-dessus de lui.
//
// Les titres, pour qui parcourt la page par ses titres (lecteur d'écran) : « En bref » et « Le texte
// complet » sont des sections de la page (niveau 2), chaque partie est dans le texte complet
// (niveau 3).
//
// Sur ordinateur (`wide`), une navigation « Sommaire » à gauche du texte : une entrée par partie.
// Elle reste dans l'écran pendant qu'on lit (collée en haut, sur le web) et suit la partie lue ;
// toucher une entrée amène sa partie en haut de l'écran et lui donne le focus, pour que le clavier
// et le lecteur d'écran repartent de là, et non du sommaire.
import { layout, radii, readableWidth, space } from '@ruche/brand'
import { useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Platform, Pressable, View, type ViewStyle } from 'react-native'
import { type Focusable, focusWithoutScroll, moveReaderTo } from './focus'
import { Icon, type IconName } from './Icon'
import { KeyPoints } from './KeyPoints'
import { enterActivates } from './keyboard'
import { ListBlock, ListGroup } from './ListGroup'
import { Markdown } from './Markdown'
import { parisDay } from './parisTime'
import { ScreenScrollContext } from './scrollLight'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Une partie du texte complet : un identifiant stable, son titre, son corps en Markdown. */
export type LegalSection = { id: string; title: string; body: string }

type Props = {
  /** La date de la version, telle que le contrat l'écrit (`AAAA-MM-JJ`). */
  version: string
  /** Les puces de l'« En bref », chacune avec son icône (décorative : la phrase dit tout). */
  summary: { icon: IconName; text: string }[]
  /** Les parties du texte complet, dans l'ordre. */
  sections: LegalSection[]
  /** Ordinateur : le « Sommaire » à côté du texte. Téléphone : le texte seul. */
  wide: boolean
  /** Appelée avec l'adresse d'un lien du texte (l'écran ouvre la page d'avertissement). */
  onLinkPress: (url: string) => void
}

/** La largeur de la colonne du sommaire, sur ordinateur. */
const CONTENTS_WIDTH = 260

/**
 * La largeur du document sur ordinateur : le sommaire, l'écart, puis le texte à `readableWidth`.
 * L'écran la donne à `Screen`, pour que son retour et son titre s'alignent sur le bloc (R15) ; sans
 * le sommaire (`wide` faux), le texte seul, à `readableWidth`.
 */
export const legalDocumentWidth = (wide: boolean) =>
  wide ? CONTENTS_WIDTH + space.xxxl + readableWidth : readableWidth

/**
 * La partie lue est la dernière dont le titre est passé au-dessus de cette part de la fenêtre
 * (sous la barre fixe) : un titre qui arrive dans le premier tiers de l'écran est déjà « lu ».
 */
const READING_LINE = 0.3

export function LegalDocument({ version, summary, sections, wide, onLinkPress }: Props) {
  const { t, i18n } = useTranslation()
  const { colors } = useTheme()
  const scroll = useContext(ScreenScrollContext)
  // Les titres des parties, pour les mesurer (partie lue) et y poser le focus (sommaire).
  const headings = useRef<(Focusable | null)[]>([])
  // Où en est le défilement de l'écran : la mesure d'un titre se fait dans la fenêtre, le saut
  // jusqu'à lui dans la zone qui défile.
  const offset = useRef(0)
  // Après un saut demandé au sommaire, la partie choisie reste « en cours » tant que la page n'a
  // pas bougé d'elle-même : les dernières parties, trop courtes, n'atteignent jamais le haut.
  const jumpedTo = useRef<number | null>(null)
  const [current, setCurrent] = useState(0)
  // Le haut de la colonne collée : sous la barre fixe, quand il y en a une.
  const [stickTop, setStickTop] = useState(0)

  useEffect(() => {
    if (!wide || !scroll) return
    let frame = 0
    // Mesure les titres et garde le dernier passé au-dessus de la ligne de lecture.
    const follow = () => {
      frame = 0
      const covered = scroll.coveredTop.current
      setStickTop(covered)
      const line = covered + Dimensions.get('window').height * READING_LINE
      const nodes = headings.current
      const tops: (number | null)[] = nodes.map(() => null)
      let pending = nodes.length
      nodes.forEach((node, index) => {
        if (!node) {
          pending -= 1
          return
        }
        node.measureInWindow((_x, y) => {
          tops[index] = y
          pending -= 1
          if (pending > 0) return
          let reading = 0
          tops.forEach((top, at) => {
            if (top !== null && top <= line) reading = at
          })
          setCurrent(reading)
        })
      })
    }
    const unsubscribe = scroll.subscribe((event) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const y = contentOffset.y
      offset.current = y
      // Le défilement du saut lui-même : la partie choisie reste en cours. Le saut vers une des
      // dernières parties s'arrête au bas de la page, plus haut que la position demandée : on compare
      // donc à la position que la page pouvait atteindre (relecture de design de R11, à 1440 px).
      const end =
        contentSize && layoutMeasurement
          ? Math.max(0, contentSize.height - layoutMeasurement.height)
          : Number.POSITIVE_INFINITY
      if (jumpedTo.current !== null && Math.abs(y - Math.min(jumpedTo.current, end)) < 2) return
      jumpedTo.current = null
      // Une mesure par image au plus, quel que soit le nombre d'événements de défilement.
      if (!frame) frame = requestAnimationFrame(follow)
    })
    return () => {
      unsubscribe()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [wide, scroll])

  // Une entrée du sommaire touchée : sa partie vient en haut de l'écran (sous la barre fixe), d'un
  // saut, et prend le focus, sans second défilement.
  const goTo = (index: number) => {
    setCurrent(index)
    const node = headings.current[index]
    if (!node) return
    const settle = () => {
      if (!focusWithoutScroll(node)) moveReaderTo(node)
    }
    if (!scroll) {
      settle()
      return
    }
    node.measureInWindow((_x, y) => {
      const target = Math.max(0, offset.current + y - scroll.coveredTop.current - space.lg)
      jumpedTo.current = target
      scroll.jumpTo(target)
      settle()
    })
  }

  const text = (
    // Sur ordinateur, la colonne du texte prend la place que laisse le sommaire (une base nulle
    // dans une rangée). Jamais sur téléphone : en colonne, une base nulle qui rétrécit écrase la
    // hauteur du texte, qui déborde alors sur ce qui suit (vu au catalogue).
    // Toute la colonne s'arrête à `readableWidth`, la borne des paragraphes du Markdown : le cadre
    // de l'« En bref » s'aligne sur le texte complet, et ses puces gardent une ligne confortable
    // (relecture de design de R11 : à 1440 px, un cadre de 988 px, des puces de 105 caractères).
    // R15 (« Ce qui reste étroit ») : seule, la colonne est centrée dans la page. `width: '100%'`
    // avant `maxWidth` : centrée sans largeur, une colonne prendrait celle de son texte le plus
    // long ; ainsi elle remplit l'écran d'un téléphone comme avant, et s'arrête à `readableWidth`
    // au milieu d'un écran plus large.
    <View
      style={[
        { gap: space.xxl, maxWidth: readableWidth },
        wide
          ? { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }
          : { width: '100%', alignSelf: 'center' },
      ]}
    >
      <VersionBadge label={t(($) => $.legal.version, { date: parisDay(version, i18n.language) })} />
      <ListGroup title={t(($) => $.legal.summaryTitle)}>
        <ListBlock>
          <KeyPoints points={summary} />
        </ListBlock>
      </ListGroup>
      <View style={{ gap: space.xl }}>
        <Text variant="heading" heading={2}>
          {t(($) => $.legal.fullTextTitle)}
        </Text>
        {sections.map((section, index) => (
          <View key={section.id} style={{ gap: space.sm }}>
            <Text
              variant="headline"
              heading={3}
              focusRef={(node: Focusable | null) => {
                headings.current[index] = node
              }}
            >
              {section.title}
            </Text>
            <Markdown text={section.body} onLinkPress={onLinkPress} />
          </View>
        ))}
      </View>
    </View>
  )

  if (!wide) return text

  // Collée en haut de la zone qui défile, sur le web (react-native-web transmet `sticky`, que les
  // types de React Native ignorent) : le sommaire reste dans l'écran pendant la lecture.
  const stick =
    Platform.OS === 'web'
      ? ({ position: 'sticky', top: stickTop + space.lg } as unknown as ViewStyle)
      : null

  // R15 (« Ce qui reste étroit ») : le sommaire et le texte forment un seul bloc, centré dans la
  // page. Sa largeur ne dépend pas de l'écran : le sommaire, l'écart, puis le texte à
  // `readableWidth` ; à 1 920 ou 2 560 points, il reste le même, au milieu. `width: '100%'` le
  // laisse rétrécir dans une page plus étroite que lui (le texte cède alors sa place, comme avant).
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.xxxl,
        width: '100%',
        maxWidth: legalDocumentWidth(true),
        alignSelf: 'center',
      }}
    >
      <View
        role="navigation"
        aria-label={t(($) => $.legal.contents)}
        style={[
          {
            width: CONTENTS_WIDTH,
            flexShrink: 0,
            gap: space.xxs,
            padding: space.md,
            borderRadius: radii.group,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.groupBorder,
          },
          stick,
        ]}
      >
        {/* Le nom de la navigation, montré ; le lecteur d'écran l'entend déjà par aria-label. */}
        <View aria-hidden style={{ paddingHorizontal: space.md, paddingBottom: space.xs }}>
          <Text variant="caption" weight={600} tone="muted">
            {t(($) => $.legal.contents)}
          </Text>
        </View>
        {sections.map((section, index) => (
          <ContentsEntry
            key={section.id}
            title={section.title}
            current={index === current}
            onPress={() => goTo(index)}
          />
        ))}
      </View>
      {text}
    </View>
  )
}

/**
 * R11 : la même pastille de version, seule, pour l'écran « Accepter », qui reprend l'« En bref »
 * des Règles sans leur texte complet. Elle reçoit la date telle que le contrat l'écrit.
 */
export function LegalVersionBadge({ version }: { version: string }) {
  const { t, i18n } = useTranslation()
  return (
    <VersionBadge label={t(($) => $.legal.version, { date: parisDay(version, i18n.language) })} />
  )
}

/** La date de la version, dans une pastille discrète sous le titre de la page. */
function VersionBadge({ label }: { label: string }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        maxWidth: '100%',
        flexShrink: 1,
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        borderRadius: radii.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.groupBorder,
      }}
    >
      <View aria-hidden style={{ flexShrink: 0 }}>
        <Icon name="calendar-blank" size={14} tone="secondary" />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="caption" weight={600} tone="secondary">
          {label}
        </Text>
      </View>
    </View>
  )
}

type EntryProps = { title: string; current: boolean; onPress: () => void }

/**
 * Une entrée du sommaire : un lien vers une partie de la page. La partie en cours est dite par
 * `aria-current` sur le web (« emplacement actuel ») et par l'état « sélectionné » sur téléphone,
 * qui ignore les `aria-*` d'état ; à l'œil, un fond de miel pâle et un trait miel à gauche.
 */
function ContentsEntry({ title, current, onPress }: EntryProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      {...(Platform.OS === 'web'
        ? current
          ? { 'aria-current': 'location' }
          : null
        : { accessibilityState: { selected: current } })}
      // Sans adresse, ce n'est pas un vrai lien du navigateur : Entrée l'active (keyboard.ts).
      {...enterActivates(onPress)}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        minHeight: layout.touchTarget,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        borderRadius: radii.small,
        borderLeftWidth: 3,
        borderLeftColor: current ? colors.honey : 'transparent',
        backgroundColor: current
          ? colors.honeySoft
          : pressed || hovered
            ? colors.surfaceGrouped
            : 'transparent',
      })}
    >
      <Text variant="callout" weight={current ? 700 : 400} tone={current ? 'default' : 'secondary'}>
        {title}
      </Text>
    </Pressable>
  )
}
