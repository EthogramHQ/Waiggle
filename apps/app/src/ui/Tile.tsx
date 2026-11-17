// Les tuiles (Miel 2, tranche R1) : de petites cartes de 150 sur 200 points, rangées en rangée qui
// défile (les projets d'une ruche). Depuis R6b, elles servent aussi dans la mosaïque de la page
// d'un outil (`TileMosaic`) : là, une tuile prend la largeur de sa colonne, plus 150 points fixes.
// - ProjectTile : un projet, en miel, en crème ou en encre ; sa photo s'il en a une, son titre et
//   son auteur. C'est un lien vers sa page, nommé par son titre, comme la carte d'un projet. R10 :
//   la pastille de visibilité (`badge` : « Privé », « Réservé à Famille »), et un menu « … »
//   (`menu`) posé en haut à droite, à côté du lien, jamais dedans (« Épingler » dans une ruche).
// - AddTile : la tuile « + Ajouter », en pointillés de miel, au bout de la rangée ; un bouton (ou un
//   lien, quand elle mène à une autre page).
// Toutes deux s'enfoncent sous le doigt (jeton `pressScale`), comme les boutons.
// - TileSkeleton (R16) : la tuile vide qui tient la place d'une tuile pendant le chargement.
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import { createContext, type ReactNode, type Ref, useContext, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { describedBy } from './aria'
import { ExampleBadge } from './ExampleBadge'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import type { CoverImage } from './ProjectCover'
import { Shape, SkeletonSurface } from './Skeleton'
import { StatusPill } from './StatusPill'
import { Text, type TextTone } from './Text'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/**
 * La taille d'une tuile, en points : sa largeur dans une rangée qui défile, et sa hauteur au moins
 * (le texte agrandi l'allonge). `tall` : la hauteur des rangées hautes d'une mosaïque.
 */
const TILE = { width: 150, height: 200, tall: 240 }

/**
 * Où vit une tuile. Seule, dans une rangée qui défile, elle garde ses 150 points de large. Dans une
 * case de mosaïque (`TileMosaic`), elle prend la largeur de sa colonne et la hauteur de sa rangée,
 * au moins `minHeight` : la mosaïque alterne des rangées hautes et basses, comme la planche.
 */
export type TileCell = { minHeight: number } | null

/** Le contexte d'une case de mosaïque ; `null` hors d'une mosaïque. */
export const TileCellContext = createContext<TileCell>(null)

/** Les deux hauteurs des rangées d'une mosaïque : haute, puis basse, en alternance. */
export const mosaicRowHeights = [TILE.tall, TILE.height] as const

/** Les teintes d'une tuile de projet : le miel vif, la crème (le miel doux) ou l'encre. */
export type TileVariant = 'honey' | 'cream' | 'ink'

/**
 * Le cadre touchable commun aux deux tuiles : la taille, les coins arrondis et l'enfoncement. Le
 * `Pressable` porte lui-même les coins : le contour du focus clavier (une règle CSS commune, voir
 * app/+html.tsx) les suit, au lieu de dessiner un carré autour d'une tuile ronde.
 */
function TileFrame({
  label,
  role,
  onPress,
  style,
  children,
  frameRef,
  description,
}: {
  label: string
  role: 'button' | 'link'
  /** Sans lui, le cadre est seulement dessiné (un aperçu) : ni lien, ni bouton, ni enfoncement. */
  onPress?: (() => void) | undefined
  style: object
  children: ReactNode
  frameRef?: Ref<View> | undefined
  /**
   * Ce que le nom ne dit pas (la pastille « Privé ») : le `nativeID` du texte qui le dit, lu après
   * le nom sur le web (`aria-describedby`), et le même texte en indice sur téléphone.
   */
  description?: { id: string; text: string } | undefined
}) {
  const scale = useSharedValue(1)
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  // Dans une mosaïque, la tuile remplit sa case (la largeur de sa colonne, la hauteur de sa rangée) :
  // la vue qui s'enfonce et le cadre touchable s'étirent tous deux.
  const cell = useContext(TileCellContext)
  const frameStyle = {
    ...(cell
      ? { width: '100%' as const, flexGrow: 1, minHeight: cell.minHeight }
      : { width: TILE.width, minHeight: TILE.height }),
    borderRadius: radii.tile,
    overflow: 'hidden' as const,
    ...style,
  }
  if (!onPress) {
    // R12 : la tuile d'un aperçu (« Voir ma page comme un visiteur ») : le même cadre, sans rien à
    // toucher. Ni rôle ni nom : ses textes (titre, auteur, pastille) se lisent un à un, dans l'ordre.
    return (
      <View style={cell ? { flexGrow: 1 } : null}>
        <View ref={frameRef} style={frameStyle}>
          {children}
        </View>
      </View>
    )
  }
  return (
    <Animated.View style={[pressed, cell ? { flexGrow: 1 } : null]}>
      <Pressable
        ref={frameRef}
        accessibilityRole={role}
        accessibilityLabel={label}
        {...describedBy(description?.id)}
        {...(description && Platform.OS !== 'web' ? { accessibilityHint: description.text } : null)}
        // Un lien s'ouvre avec Entrée sur le web (react-native-web ne le fait que pour un bouton).
        {...(role === 'link' ? enterActivates(onPress) : null)}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        style={frameStyle}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

type ProjectTileProps = {
  title: string
  /** Le nom de la personne qui a publié le projet. */
  author: string
  /**
   * Ouvre le projet. R12 : absent, la tuile est seulement dessinée, sans lien (l'aperçu « Voir ma
   * page comme un visiteur », d'où rien ne doit faire sortir) ; ses textes se lisent un à un.
   */
  onPress?: (() => void) | undefined
  /** La teinte de la tuile (miel par défaut). Elle ne change rien à ce qui est lu. */
  variant?: TileVariant
  /** La photo de couverture ; sans elle, le titre prend la place, en plus grand. */
  image?: CoverImage | null
  /**
   * Le lien de la tuile, pour y poser le focus (R6b : la première tuile arrivée par « Afficher la
   * suite », quand le bouton disparaît).
   */
  ref?: Ref<View>
  /**
   * R10 : la pastille de visibilité, comme `ProjectCard badge` : « Privé » sur « Moi », « Réservé à
   * Famille » pour un projet réservé à une ruche. Posée au-dessus du titre, dans le lien, et lue
   * après son nom (le nom du lien reste le titre).
   */
  badge?: string | undefined
  /**
   * R12b : l'auteur est un compte d'exemples (`example: true` du contrat) ; « Exemple » se pose
   * alors au-dessus du titre, après la pastille de visibilité, et décrit le lien comme elle.
   * Absent ou faux : rien.
   */
  example?: boolean
  /**
   * R10 : un menu « … » (`ActionMenu`, « Épingler » sur la tuile d'une ruche), posé en haut à droite
   * de la tuile, à côté de son lien, jamais dedans (un bouton dans un lien ne se lit ni ne se touche
   * bien : relecture du plan R10, interface 13). Il est lu après le lien.
   */
  menu?: ReactNode
}

export function ProjectTile({
  title,
  author,
  onPress,
  variant = 'honey',
  image = null,
  ref,
  badge,
  example = false,
  menu,
}: ProjectTileProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const badgeId = useId()
  const exampleId = useId()
  // Ce qui décrit le lien : la pastille de visibilité, puis « Exemple » ; sur le web, leurs textes
  // désignés l'un après l'autre (`aria-describedby` en prend plusieurs), sur téléphone l'indice.
  const exampleLabel = example ? t(($) => $.common.example) : null
  const descriptionIds = [badge ? badgeId : null, example ? exampleId : null]
    .filter(Boolean)
    .join(' ')
  const descriptionText = [badge, exampleLabel].filter(Boolean).join('. ')
  const cell = useContext(TileCellContext)
  // Chaque teinte a son fond et ses deux couleurs de texte, toutes mesurées dans contrastPairs :
  // l'encre sur le miel, le brun sur le miel (onHoneyTile), l'encre et le brun de statut sur la
  // crème, et le fond de page sur l'encre (le même couple que l'encre sur la page).
  const looks: Record<TileVariant, { background: string; title: TextTone; author: TextTone }> = {
    honey: { background: colors.honey, title: 'onHoney', author: 'onHoneyTile' },
    cream: { background: colors.honeySoft, title: 'default', author: 'status' },
    ink: { background: colors.text, title: 'onInk', author: 'onInk' },
  }
  const look = looks[variant]
  const tile = (
    <TileFrame
      label={title}
      role="link"
      onPress={onPress}
      frameRef={ref}
      description={descriptionIds ? { id: descriptionIds, text: descriptionText } : undefined}
      style={{ backgroundColor: look.background, padding: space.sm, gap: space.sm }}
    >
      {/* Sans photo, le menu se pose sur le fond de la tuile : sa place est gardée en haut, pour
          qu'un long titre (texte agrandi) ne passe pas dessous. Avec photo, il se pose sur elle. */}
      {menu && !image ? <View style={{ height: layout.touchTarget }} /> : null}
      {image ? (
        // La photo remplit le haut de la tuile ; décorative ici, le nom du lien dit tout.
        <Image
          source={image.source}
          placeholder={image.thumbhash ? { thumbhash: image.thumbhash } : null}
          contentFit="cover"
          accessible={false}
          style={{
            flexGrow: 1,
            minHeight: TILE.width / 2,
            borderRadius: radii.small,
            backgroundColor: colors.honeySoft,
          }}
        />
      ) : null}
      <View
        style={{
          gap: space.xxs,
          paddingHorizontal: space.xs,
          paddingBottom: space.xs,
          // Sans photo, le titre se pose en bas, comme sous une photo : toutes les tuiles d'une
          // rangée lisent leur titre à la même hauteur.
          ...(image ? null : { flexGrow: 1, justifyContent: 'flex-end' }),
        }}
      >
        {badge || example ? (
          // Les pastilles, au-dessus du titre : le titre garde sa hauteur dans la rangée. Un
          // `nativeID` sur chaque texte, que le lien désigne comme sa description (voir
          // TileFrame). R12b : « Exemple » après la visibilité, dessous quand la tuile est étroite.
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.xxs,
              flexShrink: 1,
              maxWidth: '100%',
              marginBottom: space.xxs,
            }}
          >
            {badge ? <StatusPill label={badge} nativeID={badgeId} /> : null}
            {example ? <ExampleBadge nativeID={exampleId} /> : null}
          </View>
        ) : null}
        {/* R10 : ni le titre ni l'auteur ne se coupent par « … » : à 320 px et texte à 200 %, un
            titre de deux lignes perdait sa fin, et un nom de membre ne se coupe jamais (décision
            du 1/11). La tuile s'allonge (sa hauteur n'est qu'un minimum) ; dans une mosaïque, la
            rangée suit la plus haute, et la photo garde sa hauteur minimale. */}
        <Text variant={image ? 'callout' : 'headline'} weight={700} tone={look.title}>
          {title}
        </Text>
        <Text variant="caption" tone={look.author}>
          {author}
        </Text>
      </View>
    </TileFrame>
  )
  if (!menu) return tile
  return (
    // Le menu, frère du lien et non son enfant : il se dessine par-dessus, en haut à droite.
    // box-none : le calque laisse passer le doigt hors du bouton, vers la tuile dessous.
    <View style={cell ? { flexGrow: 1 } : null}>
      {tile}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: space.xs, right: space.xs, zIndex: 1 }}
      >
        {menu}
      </View>
    </View>
  )
}

type AddTileProps = {
  /** Le texte de la tuile, qui la nomme aussi (« Ajouter un projet »). */
  label: string
  onPress: () => void
  /** Un lien quand la tuile ouvre une autre page (« Publier »), un bouton sinon. */
  role?: 'button' | 'link'
}

export function AddTile({ label, onPress, role = 'button' }: AddTileProps) {
  const { colors } = useTheme()
  return (
    <TileFrame
      label={label}
      role={role}
      onPress={onPress}
      style={{
        // Les pointillés de miel : une place à remplir.
        borderWidth: borders.strong,
        borderStyle: 'dashed',
        borderColor: colors.dashed,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        padding: space.md,
      }}
    >
      <View
        style={{
          width: layout.touchTarget,
          height: layout.touchTarget,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.honeySoft,
        }}
      >
        {/* Le brun de statut sur la crème : l'ambre n'y ferait pas 3:1 de jour. */}
        <Icon name="plus" size={22} tone="status" />
      </View>
      <Text variant="callout" weight={600} tone="accent" align="center">
        {label}
      </Text>
    </TileFrame>
  )
}

/** Les formes de la tuile vide : la ligne du titre, puis celle de l'auteur, en points. */
const SKELETON_TITLE = 18
const SKELETON_LINE = 12

/**
 * R16 (« Les squelettes ») : la tuile vide, à la place d'une `ProjectTile` qui arrive, à ses mesures
 * (`TILE`, partagées avec la vraie tuile). Seule, 150 points sur 200 ; dans une case de mosaïque
 * (`TileCellContext`), la largeur de sa colonne et la hauteur de sa rangée. Une carte vide aux
 * coins d'une tuile (`SkeletonSurface`, avec sa lueur), et dedans ce que montre une tuile à photo :
 * la photo en haut, puis le titre et l'auteur en bas, aux marges de la vraie tuile.
 *
 * Ni rôle ni nom : le `Loading` de l'écran (« Chargement… ») enveloppe toute la mosaïque, une fois.
 * `column` : le rang de la tuile dans sa rangée, le retard de sa lueur (150 ms par colonne).
 */
export function TileSkeleton({ column = 0 }: { column?: number }): ReactNode {
  const cell = useContext(TileCellContext)
  const height = cell ? cell.minHeight : TILE.height
  // La photo prend tout le haut de la tuile, comme dans la vraie : la hauteur de la tuile, moins ses
  // marges, l'écart et le bloc du titre et de l'auteur (une forme a une hauteur fixe, elle ne
  // grandit pas seule).
  const textBlock = SKELETON_TITLE + space.xs + SKELETON_LINE + space.xs
  const photo = Math.max(TILE.width / 2, height - 2 * space.sm - space.sm - textBlock)
  return (
    <View style={cell ? { width: '100%' } : { width: TILE.width }}>
      <SkeletonSurface radius="tile" height={height} column={column}>
        <View style={{ padding: space.sm, gap: space.sm }}>
          <Shape height={photo} width="100%" />
          <View style={{ gap: space.xs, paddingHorizontal: space.xs, paddingBottom: space.xs }}>
            <Shape height={SKELETON_TITLE} width="80%" />
            <Shape height={SKELETON_LINE} width="55%" />
          </View>
        </View>
      </SkeletonSurface>
    </View>
  )
}
