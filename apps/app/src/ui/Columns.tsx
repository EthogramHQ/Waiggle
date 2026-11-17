// Deux colonnes côte à côte sur un grand écran : une principale, large, et une latérale, plus
// étroite. Quand la place manque (téléphone, fenêtre étroite), la latérale passe dessous.
// Le passage se fait tout seul, par la largeur disponible, sans mesurer la fenêtre : chaque colonne
// a une largeur de base et peut grandir ; quand les deux bases ne tiennent plus sur une ligne,
// la seconde va à la ligne (flexWrap).
//
// Des rangées (R5a, la page d'un projet sur ordinateur) : plusieurs paires de colonnes l'une sous
// l'autre, séparées au besoin par un trait. En haut, la galerie | l'en-tête et ses actions ; en
// bas, la description | les commentaires. Pourquoi pas deux longues colonnes : l'ordre de la page
// (lecteurs d'écran, touche Tab) suit alors l'ordre de lecture, rangée par rangée (rangée 1 à
// gauche, rangée 1 à droite, puis rangée 2), au lieu de parcourir toute la colonne de gauche avant
// de revenir en haut à droite (point des listes de R5a : « Suivre » venait après tout le contenu).
// Les colonnes de chaque rangée ont les mêmes bases : elles restent alignées d'une rangée à l'autre.
//
// R15 (« L'ordinateur en grand ») :
// - deux largeurs fixes pour la colonne de côté, `panel` (le panneau du Fil et d'Explorer) et
//   `profile` (la colonne du profil d'un membre) ; la principale prend tout le reste ;
// - chaque colonne dit à son contenu la largeur qu'elle lui donne (`ContentWidthContext`) : les
//   grilles y comptent leurs colonnes sans mesurer la fenêtre ;
// - `sticky` : la colonne de côté reste en place pendant que la page défile (sur le web).
import { borders, layout, type Space, space } from '@ruche/brand'
import { Fragment, type ReactNode, useState } from 'react'
import { type LayoutChangeEvent, Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { useTopBarCover } from './ScreenTopBar'
import { ContentWidthContext, useContentWidth, useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/**
 * Une rangée : sa colonne principale (à gauche) et sa colonne latérale (à droite). `continues` :
 * la rangée prolonge la précédente, sans trait au-dessus d'elle, même avec `divided` (le pied de
 * la page d'un projet : « Signaler ce projet », en bas à gauche, lu après les commentaires).
 */
export type ColumnsRow = { main: ReactNode; side: ReactNode; continues?: boolean }

/**
 * La largeur de la colonne latérale. `regular` : elle garde sa base (`sideColumn`), la principale
 * prend toute la place gagnée. `wide` (la page d'un projet) : même base, donc même moment de passage
 * en pile, mais la place gagnée se partage entre les deux colonnes, jusqu'à `sideColumnWide` pour la
 * latérale ; au-delà, tout revient à la principale.
 *
 * R15 : `panel` (`layout.sidePanel`, 340) et `profile` (`layout.profileColumn`, 360) : la latérale
 * garde exactement cette largeur tant que les deux colonnes tiennent côte à côte, et la principale
 * prend tout le reste ; quand la place manque, chacune prend toute la largeur, l'une sous l'autre.
 */
export type SideWidth = 'regular' | 'wide' | 'panel' | 'profile'

type Props = { gap?: Space; sideWidth?: SideWidth } & (
  | {
      main: ReactNode
      side: ReactNode
      /**
       * La latérale à gauche, lue d'abord (R7b, le coin des testeurs : la liste des fils à gauche,
       * le fil ouvert à droite, qui prend la place gagnée). Quand la place manque, elle passe
       * au-dessus.
       */
      sideFirst?: boolean
      /**
       * R15 : la latérale reste en place pendant que la page défile (le panneau du Fil, la colonne
       * du profil), sur le web seulement (sur téléphone, elle passe sous la principale). Collée un
       * peu sous la barre du haut quand celle-ci est fixe, un peu sous le haut de la fenêtre quand
       * elle suit le contenu. Plus haute que la place qui reste, elle se colle par le bas : elle
       * défile avec la page jusqu'à son pied, puis reste en place (sinon son bas ne se montrerait
       * jamais, ni le contrôle qui y reçoit le focus du clavier).
       */
      sticky?: boolean
      /**
       * Une troisième colonne (R9, la modération : l'historique récent), à droite du détail. Trois
       * colonnes seulement sur un grand écran (`wide`) ; en dessous, elle est lue juste après la
       * colonne principale, dans la même colonne : rien n'est perdu, rien ne se met à la ligne seul.
       */
      aside?: ReactNode
      rows?: never
      divided?: never
    }
  | {
      /** Les rangées, dans l'ordre de lecture. */
      rows: readonly ColumnsRow[]
      /** Un trait fin entre deux rangées (la page d'un projet : sous la galerie). */
      divided?: boolean
      main?: never
      side?: never
      sideFirst?: never
      aside?: never
      sticky?: never
    }
)

export function Columns(props: Props) {
  const gap = props.gap ?? 'xxl'
  const sideWidth = props.sideWidth ?? 'regular'
  if (props.rows === undefined) {
    return (
      <ColumnPair
        main={props.main}
        side={props.side}
        aside={props.aside}
        gap={gap}
        sideWidth={sideWidth}
        sideFirst={props.sideFirst ?? false}
        sticky={props.sticky ?? false}
      />
    )
  }
  return (
    // Les rangées l'une sous l'autre, avec le même écart que les colonnes (et autour du trait).
    <View style={{ gap: space[gap] }}>
      {props.rows.map((row, index) => (
        // Le rang suffit comme clé : les rangées d'une page ne changent pas d'ordre.
        // biome-ignore lint/suspicious/noArrayIndexKey: l'ordre des rangées est fixe.
        <Fragment key={index}>
          {props.divided && index > 0 && !row.continues ? <RowDivider /> : null}
          <ColumnPair main={row.main} side={row.side} gap={gap} sideWidth={sideWidth} />
        </Fragment>
      ))}
    </View>
  )
}

/** Une paire de colonnes : la principale, puis la latérale, qui passe dessous quand la place manque. */
function ColumnPair({
  main,
  side,
  aside,
  gap,
  sideWidth,
  sideFirst = false,
  sticky = false,
}: {
  main: ReactNode
  side: ReactNode
  aside?: ReactNode
  gap: Space
  sideWidth: SideWidth
  sideFirst?: boolean
  sticky?: boolean
}) {
  const wide = sideWidth === 'wide'
  // Trois colonnes : seulement avec un `aside` et sur un grand écran. Sinon `aside` suit le détail
  // dans la colonne principale (lu après lui) ; sans `aside`, rien ne change.
  const { sizeClass, height: windowHeight } = useLayout()
  const hasAside = aside !== undefined && aside !== null
  const three = hasAside && sizeClass === 'wide'
  // R15 : la place de la paire (celle que l'écran, ou la colonne qui la porte, donne à son contenu),
  // et ce qu'il en revient à chaque colonne.
  const room = useContentWidth()
  const widths = columnWidths(room, sideWidth, space[gap], three)
  // Une latérale de largeur fixe (`panel`, `profile`) : côte à côte, exactement sa largeur, et la
  // rangée ne passe jamais à la ligne ; l'une sous l'autre, chacune sur toute la largeur. Le choix
  // vient du calcul (`widths.beside`), pas du passage à la ligne du navigateur : une base fixe ne
  // s'étirerait pas sur toute la largeur une fois passée dessous.
  const fixed = sideWidth === 'panel' || sideWidth === 'profile'
  const fixedBeside = fixed && widths.beside

  // La latérale collée (R15, relecture du plan B1, B2). Sa hauteur, mesurée par une vue vide qui
  // l'épouse (un `onLayout` sur la colonne serait pris par une mesure de son contenu) ; posée dès le
  // premier rendu quand `sticky` est demandé : sur le web, une mesure ajoutée après l'hydratation
  // n'est jamais appelée. Le haut collé : ce que la barre du haut couvre quand elle est fixe, 0
  // quand elle suit le contenu, lu dans un contexte que Screen redonne à chaque mesure de la barre
  // (un `ref` lu au rendu garderait la valeur d'avant la mesure).
  const coveredTop = useTopBarCover()
  const [sideHeight, setSideHeight] = useState(0)
  const measureSide = (event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height)
    // Une page quittée reste montée, cachée, et mesure 0 : la dernière vraie mesure reste.
    if (height > 0) setSideHeight(height)
  }
  // Relecture de design de R15 (17/11/2026) : la colonne colle dès qu'elle est mesurée, quelle que
  // soit sa hauteur (avant, plus haute que la place sous la barre, elle renonçait : le panneau du Fil,
  // 940 points, ne collait ni à 1 440 × 900 ni à 1 920 × 940). Tant qu'elle ne l'est pas, elle reste
  // dans le flux, comme avant : rien ne saute, puisque la page n'a pas encore défilé.
  const stuck = sticky && Platform.OS === 'web' && widths.beside && sideHeight > 0
  // Où elle colle (le `top` du CSS, compté depuis le haut de la zone qui défile) :
  // - si elle tient, `space.xl` sous la barre, le même air que celui du contenu sous la barre
  //   (`ScreenTopBar`) ; collée au bord, son titre passait sous le voile dégradé et pâlissait ;
  // - sinon, par le bas : la hauteur de la fenêtre, moins la sienne, moins le même air sous son pied.
  //   Ce nombre est négatif : son haut reste au-dessus de la fenêtre. Elle défile avec la page
  //   jusqu'à ce que son bas apparaisse, puis reste en place (la technique habituelle des colonnes
  //   de côté). Le plus petit des deux suffit : quand la colonne grandit, on passe de l'un à
  //   l'autre sans saut, à la hauteur où les deux valent autant.
  const stuckTop = Math.min(coveredTop + space.xl, windowHeight - sideHeight - space.xl)

  const mainContent =
    hasAside && !three ? (
      <>
        {main}
        {aside}
      </>
    ) : (
      main
    )
  const sideStyle: ViewStyle = fixed
    ? fixedBeside
      ? { width: widths.side, flexGrow: 0, flexShrink: 0, minWidth: 0 }
      : { flexGrow: 1, flexShrink: 1, flexBasis: '100%', minWidth: 0 }
    : {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: layout.sideColumn,
        ...(wide ? { maxWidth: layout.sideColumnWide } : null),
        minWidth: 0,
      }
  const sideColumn = (
    <View
      style={[
        sideStyle,
        { gap: space[gap] },
        // `position: sticky` : react-native-web le transmet au navigateur, qui garde la colonne en
        // place dans la zone qui défile, tant que sa rangée est à l'écran. Les types de React Native
        // ne le connaissent pas (le téléphone n'en a pas besoin : la colonne y passe dessous).
        stuck ? ({ position: 'sticky', top: stuckTop } as unknown as ViewStyle) : null,
      ]}
    >
      <ContentWidthContext.Provider value={widths.side}>{side}</ContentWidthContext.Provider>
      {sticky ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={measureSide} />
      ) : null}
    </View>
  )
  return (
    <View
      style={{
        flexDirection: 'row',
        // Trois colonnes : jamais à la ligne (la pile est déjà décidée par `wide`). Une latérale
        // fixe côte à côte non plus (le calcul a déjà dit qu'elles tiennent).
        flexWrap: three || fixedBeside ? 'nowrap' : 'wrap',
        gap: space[gap],
        alignItems: 'flex-start',
      }}
    >
      {sideFirst ? sideColumn : null}
      {/* flexGrow 999 : la colonne principale prend presque toute la place gagnée. En `wide`, les
          deux colonnes grandissent autant l'une que l'autre, et la latérale s'arrête à sa largeur
          maximale (maxWidth) : le reste revient à la principale. */}
      <View
        style={{
          flexGrow: wide ? 1 : 999,
          flexShrink: 1,
          flexBasis: fixed && !fixedBeside ? '100%' : layout.mainColumn,
          minWidth: 0,
          gap: space[gap],
        }}
      >
        <ContentWidthContext.Provider value={widths.main}>
          {mainContent}
        </ContentWidthContext.Provider>
      </View>
      {sideFirst ? null : sideColumn}
      {three ? (
        <View
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: layout.sideColumn,
            minWidth: 0,
            gap: space[gap],
          }}
        >
          <ContentWidthContext.Provider value={widths.side}>{aside}</ContentWidthContext.Provider>
        </View>
      ) : null}
    </View>
  )
}

/**
 * R15 : ce qu'une paire de colonnes donne à chacune, dans `room` points (relecture du plan, C2).
 * Le même calcul que le navigateur : les deux bases et l'écart tiennent-ils sur une ligne ? Puis la
 * place gagnée se partage comme les `flexGrow` des colonnes (999 contre 1 : presque tout à la
 * principale ; en `wide`, à parts égales, jusqu'à `sideColumnWide`). L'une sous l'autre, chacune a
 * toute la place. Arrondi vers le bas : une grille ne compte jamais une colonne de trop.
 */
const columnWidths = (
  room: number,
  sideWidth: SideWidth,
  gap: number,
  three: boolean,
): { beside: boolean; main: number; side: number } => {
  const whole = Math.max(0, Math.floor(room))
  if (three) {
    // Trois colonnes : les deux étroites gardent à peu près leur base, la principale le reste.
    const main = Math.max(0, whole - 2 * (layout.sideColumn + gap))
    return { beside: true, main, side: layout.sideColumn }
  }
  const base =
    sideWidth === 'panel'
      ? layout.sidePanel
      : sideWidth === 'profile'
        ? layout.profileColumn
        : layout.sideColumn
  const beside = whole >= layout.mainColumn + base + gap
  if (!beside) return { beside, main: whole, side: whole }
  const gained = whole - layout.mainColumn - base - gap
  const side =
    sideWidth === 'wide'
      ? Math.min(base + gained / 2, layout.sideColumnWide)
      : sideWidth === 'regular'
        ? base + gained / 1000
        : base
  const shown = Math.floor(side)
  return { beside, main: whole - gap - shown, side: shown }
}

/**
 * Le trait entre deux rangées, sur toute la largeur. Décoratif : caché aux lecteurs d'écran (les
 * titres des sections suffisent à dire qu'on change de partie). `testID` : un trait n'a ni rôle ni
 * nom, et le test de l'ordre doit pouvoir le situer entre les rangées.
 */
function RowDivider() {
  const { colors } = useTheme()
  return (
    <View
      testID="columns-divider"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: borders.hairline, alignSelf: 'stretch', backgroundColor: colors.line }}
    />
  )
}
