// La carte d'un outil (tranche R16, « Ruches, Recherche et Outils en grand » ; planches
// R16-Outils-1920 et R16-Outils-1440) : sur un grand écran, « Les plus utilisés » de la page Outils
// range ses dix outils en cartes, cinq par rangée, au lieu d'une colonne de lignes. La carte dit la
// même chose que la ligne d'aujourd'hui (la `ListRow` de « De A à Z ») : la tuile à l'initiale, le
// nom, puis « Assistant IA · 41 projets ».
//
// Toute la carte est un seul lien vers la page de l'outil, nommé comme la ligne (« Claude,
// Assistant IA · 41 projets », `tools.withCount`) : le nom d'un lien cache le texte qu'il contient,
// il dit donc tout ce qui se voit. Les textes viennent de `useToolText`, partagé avec la ligne de
// l'écran : la carte et la ligne d'un même outil ne peuvent pas dire deux choses différentes.
//
// Aussi dans ce fichier :
// - `ToolCardSkeleton`, la carte vide (planche R16-Outils-Squelette-1920), sans rôle ni nom ;
// - `ToolCardGrid`, la grille des cartes : cinq par rangée à 1 440 comme à 1 920 ;
// - `ToolSearchBar`, le champ « Chercher un outil » et les familles : sur une ligne quand la place
//   le permet (1 920), les familles sous le champ sinon (1 440, et toute page plus étroite).
import { borders, radii, readableWidth, type Space, space } from '@ruche/brand'
import type { CatalogueTool } from '@ruche/contracts'
import { type ReactNode, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View, type ViewStyle } from 'react-native'
import { CardGrid, useCardColumns } from './CardGrid'
import { InitialTile } from './InitialTile'
import { type PressEvent, TextLineShape } from './ListGroup'
import { GridColumnContext } from './ProjectGrid'
import { Shape, SkeletonSurface } from './Skeleton'
import { Text } from './Text'
import { useLargeText } from './textScale'
import { useContentWidth } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/**
 * Hook : les textes d'un outil, ceux de sa carte et de sa ligne. `detail` : « Assistant IA ·
 * 41 projets », ou « … · Aucun projet pour l'instant » (« 0 projet » serait faux en français) ;
 * `label` : le nom lu du lien, « Claude, Assistant IA · 41 projets ».
 */
export function useToolText(tool: CatalogueTool) {
  const { t } = useTranslation()
  const code = tool.family
  const projects =
    tool.projectCount === 0
      ? t(($) => $.tools.noProjects)
      : t(($) => $.tools.projects, { count: tool.projectCount })
  const detail = t(($) => $.tools.detail, { family: t(($) => $.tools.family[code]), projects })
  return { detail, label: t(($) => $.tools.withCount, { label: tool.name, projects: detail }) }
}

/** La tuile (40 points, celle de la ligne) et l'écart jusqu'au texte. */
const TILE = 40

/** L'intérieur de la carte, partagé avec la carte vide : ses marges, la tuile à gauche du texte. */
const inner: ViewStyle = {
  flexGrow: 1,
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.md,
  paddingHorizontal: space.md,
  paddingVertical: space.md,
}
/** Le texte : il prend la place qui reste (jamais `flex: 1`, une base nulle sur le web). */
const text: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }

type Props = {
  tool: CatalogueTool
  /** L'adresse de la page de l'outil : sur le web, la carte est un vrai lien (nouvel onglet). */
  href: string
  /**
   * Le geste. Il reçoit l'événement du clic : l'écran qui navigue par son routeur empêche le
   * navigateur de recharger la page (`preventDefault`), comme sur une ligne-lien.
   */
  onPress: (event?: PressEvent) => void
}

export function ToolCard({ tool, href, onPress }: Props) {
  const { colors, shadows } = useTheme()
  const { detail, label } = useToolText(tool)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      // `href` manque aux types de React Native : sur téléphone il est ignoré ; sur le web,
      // react-native-web dessine un vrai `<a>`.
      {...{ href }}
      onPress={onPress}
      // La carte prend la hauteur de sa case, celle de la plus haute de la rangée (un nom long sur
      // deux lignes) : les cartes d'une rangée ont le même bas.
      style={({ pressed }) => ({
        flexGrow: 1,
        minHeight: TILE + 2 * space.md,
        backgroundColor: pressed ? colors.surfaceGrouped : colors.surface,
        borderWidth: borders.hairline,
        borderColor: colors.surfaceBorder,
        // Le rayon d'un groupe blanc ; l'anneau du focus du clavier le suit sur le web.
        borderRadius: radii.group,
        boxShadow: shadows.soft,
      })}
    >
      <View style={inner}>
        {/* Décorative : le nom est écrit à côté, et le lien le lit déjà. */}
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <InitialTile name={tool.name} />
        </View>
        <View style={text}>
          {/* En entier, sur deux lignes s'il le faut : un nom ne se coupe jamais par « … ». */}
          <Text weight={600} breakAnywhere>
            {tool.name}
          </Text>
          <Text variant="callout" tone="muted">
            {detail}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

/**
 * La carte vide d'un outil (planche R16-Outils-Squelette-1920) : la matière d'une carte vide
 * (`SkeletonSurface`, sa lueur comprise), la tuile vide, puis le nom et la précision, aux marges de
 * la vraie carte. Son rang dans la rangée vient de la grille (`GridColumnContext`) : sa lueur passe
 * après celle de sa voisine de gauche. Sans rôle ni nom : le `Loading` autour dit « Chargement… ».
 */
export function ToolCardSkeleton() {
  const column = useContext(GridColumnContext)
  return (
    <SkeletonSurface radius="group" column={column}>
      <View style={inner}>
        <Shape height={TILE} width={TILE} />
        <View style={text}>
          <TextLineShape variant="body" width="45%" />
          <TextLineShape variant="callout" width="75%" />
        </View>
      </View>
    </SkeletonSurface>
  )
}

/**
 * La grille de « Les plus utilisés » (planches R16-Outils) : cinq cartes par rangée, à 1 440 comme à
 * 1 920. Une carte demande pourtant 220 points au moins : la grille en met moins de cinq quand ils
 * ne tiennent pas (texte très agrandi, où la carte en demande une fois et demie plus).
 */
const MOST_USED_COLUMNS = 5
const toolCardGrid = { minWidth: 220, gap: 'lg' } as const satisfies {
  minWidth: number
  gap: Space
}

export function ToolCardGrid({
  children,
  list = true,
}: {
  /** Les cartes (ou les cartes vides), dans l'ordre de lecture. */
  children: ReactNode
  /** Une liste pour les lecteurs d'écran (vrai par défaut) ; faux pour les cartes vides. */
  list?: boolean
}) {
  const { columns, probe } = useCardColumns(toolCardGrid.minWidth, toolCardGrid.gap)
  return (
    <>
      <CardGrid {...toolCardGrid} columns={Math.min(MOST_USED_COLUMNS, columns)} list={list}>
        {children}
      </CardGrid>
      {/* La ligne cachée qui mesure le texte agrandi sur le web (posée hors du flux) : sans elle,
          la grille ne saurait pas que le texte est à 200 % et garderait cinq cartes serrées. */}
      {probe}
    </>
  )
}

/**
 * La largeur de contenu dès laquelle le champ (560 points) et les familles (environ 900 points)
 * tiennent sur une ligne : 1 500, atteinte à 1 920 (1 728 de contenu), pas à 1 440 (1 376).
 */
const ONE_LINE_FROM = 1500

/**
 * Le champ « Chercher un outil » et les familles (choix 7 des planches R16-Outils) : sur une ligne
 * quand la place le permet, les familles à droite du champ ; sinon, sous le champ. Le champ garde
 * la largeur d'une colonne de lecture (560 points au plus). Les deux places ne changent que le
 * style, jamais l'arbre : le champ garde son focus et son texte quand la fenêtre change de taille.
 */
export function ToolSearchBar({ field, filters }: { field: ReactNode; filters: ReactNode }) {
  const room = useContentWidth()
  const { large, probe } = useLargeText()
  // Le texte très agrandi élargit les pastilles : elles restent sous le champ.
  const oneLine = !large && room >= ONE_LINE_FROM
  return (
    <View
      style={{
        flexDirection: oneLine ? 'row' : 'column',
        alignItems: oneLine ? 'center' : 'stretch',
        gap: space.md,
      }}
    >
      <View
        style={
          oneLine
            ? { flexGrow: 1, flexShrink: 1, flexBasis: readableWidth, maxWidth: readableWidth }
            : { alignSelf: 'stretch', maxWidth: readableWidth }
        }
      >
        {field}
      </View>
      <View style={oneLine ? { flexShrink: 1, minWidth: 0 } : null}>{filters}</View>
      {/* La ligne cachée qui mesure le texte agrandi (sur le web seulement). */}
      {probe}
    </View>
  )
}
