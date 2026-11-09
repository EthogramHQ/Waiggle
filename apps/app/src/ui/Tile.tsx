// Les tuiles (Miel 2, tranche R1) : de petites cartes de 150 sur 200 points, rangées en rangée qui
// défile (les projets d'une ruche). Depuis R6b, elles servent aussi dans la mosaïque de la page
// d'un outil (`TileMosaic`) : là, une tuile prend la largeur de sa colonne, plus 150 points fixes.
// - ProjectTile : un projet, en miel, en crème ou en encre ; sa photo s'il en a une, son titre et
//   son auteur. C'est un lien vers sa page, nommé par son titre, comme la carte d'un projet.
// - AddTile : la tuile « + Ajouter », en pointillés de miel, au bout de la rangée ; un bouton (ou un
//   lien, quand elle mène à une autre page).
// Toutes deux s'enfoncent sous le doigt (jeton `pressScale`), comme les boutons.
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import { createContext, type ReactNode, useContext } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import type { CoverImage } from './ProjectCover'
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
}: {
  label: string
  role: 'button' | 'link'
  onPress: () => void
  style: object
  children: ReactNode
}) {
  const scale = useSharedValue(1)
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  // Dans une mosaïque, la tuile remplit sa case (la largeur de sa colonne, la hauteur de sa rangée) :
  // la vue qui s'enfonce et le cadre touchable s'étirent tous deux.
  const cell = useContext(TileCellContext)
  return (
    <Animated.View style={[pressed, cell ? { flexGrow: 1 } : null]}>
      <Pressable
        accessibilityRole={role}
        accessibilityLabel={label}
        // Un lien s'ouvre avec Entrée sur le web (react-native-web ne le fait que pour un bouton).
        {...(role === 'link' ? enterActivates(onPress) : null)}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        style={{
          ...(cell
            ? { width: '100%', flexGrow: 1, minHeight: cell.minHeight }
            : { width: TILE.width, minHeight: TILE.height }),
          borderRadius: radii.tile,
          overflow: 'hidden',
          ...style,
        }}
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
  onPress: () => void
  /** La teinte de la tuile (miel par défaut). Elle ne change rien à ce qui est lu. */
  variant?: TileVariant
  /** La photo de couverture ; sans elle, le titre prend la place, en plus grand. */
  image?: CoverImage | null
}

export function ProjectTile({
  title,
  author,
  onPress,
  variant = 'honey',
  image = null,
}: ProjectTileProps) {
  const { colors } = useTheme()
  // Chaque teinte a son fond et ses deux couleurs de texte, toutes mesurées dans contrastPairs :
  // l'encre sur le miel, le brun sur le miel (onHoneyTile), l'encre et le brun de statut sur la
  // crème, et le fond de page sur l'encre (le même couple que l'encre sur la page).
  const looks: Record<TileVariant, { background: string; title: TextTone; author: TextTone }> = {
    honey: { background: colors.honey, title: 'onHoney', author: 'onHoneyTile' },
    cream: { background: colors.honeySoft, title: 'default', author: 'status' },
    ink: { background: colors.text, title: 'onInk', author: 'onInk' },
  }
  const look = looks[variant]
  return (
    <TileFrame
      label={title}
      role="link"
      onPress={onPress}
      style={{ backgroundColor: look.background, padding: space.sm, gap: space.sm }}
    >
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
        <Text
          variant={image ? 'callout' : 'headline'}
          weight={700}
          tone={look.title}
          numberOfLines={image ? 2 : 4}
        >
          {title}
        </Text>
        <Text variant="caption" tone={look.author} numberOfLines={1}>
          {author}
        </Text>
      </View>
    </TileFrame>
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
