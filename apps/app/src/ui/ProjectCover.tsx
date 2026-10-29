// La couverture d'un projet. Avec une photo : la photo, qui remplit le cadre (recadrée au centre),
// et son résumé flou (ThumbHash) affiché le temps qu'elle arrive. Sans photo : la lumière miel,
// avec le titre écrit dessus en grand, pour que chaque projet ait une couverture chaleureuse
// plutôt qu'un cadre vide.
import { borders, honeyLight, layout, type Radius, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { ImageSource } from './image'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Une photo à afficher en couverture. `source` peut manquer un instant (session pas prête). */
export type CoverImage = {
  source: ImageSource | null
  /** Le résumé flou de la photo ; absent pour une photo pas encore envoyée (aperçu). */
  thumbhash?: string | null
  /** Ce que les lecteurs d'écran annoncent (« Photo 1 sur 3 »). */
  label: string
}

/** hero : grande (ordinateur) ; band : bande basse (sans photo, téléphone) ; portrait : haute. */
export type CoverShape = keyof typeof layout.cover

type Props = {
  title?: string
  /** La hauteur, par une forme (jetons de @ruche/brand) ou en points (cartes, aperçus). */
  height: number | CoverShape
  radius?: Radius
  image?: CoverImage | null
  /** Ce qui se pose sur la couverture (boutons ronds, panneau de verre). */
  children?: ReactNode
  /**
   * `card` : la couverture est une carte posée sur la page (celle du fil), avec l'ombre d'une carte
   * et, la nuit, un fin liseré qui la détache du noir. Sans ombre par défaut (une couverture en tête
   * de page, une vignette dans une note).
   */
  shadow?: 'card' | 'none'
}

export function ProjectCover({
  title,
  height: size,
  radius = 'sheet',
  image,
  children,
  shadow = 'none',
}: Props) {
  const { scheme, colors, shadows } = useTheme()
  const height = typeof size === 'number' ? size : layout.cover[size]
  const id = `cover-${scheme}`
  const card = shadow === 'card'
  const cover = (
    <View
      style={{
        height,
        borderRadius: radii[radius],
        overflow: 'hidden',
        alignSelf: 'stretch',
        // Le liseré de nuit : une ombre noire ne se voit pas sur le fond de nuit, le trait si.
        // L'image, posée dans le cadre, s'arrête à l'intérieur du trait.
        ...(card && scheme === 'night'
          ? { borderWidth: borders.hairline, borderColor: colors.surfaceBorder }
          : null),
      }}
    >
      {image ? (
        <Image
          source={image.source}
          // Le résumé flou, affiché tout de suite, puis remplacé en fondu par la vraie photo.
          placeholder={image.thumbhash ? { thumbhash: image.thumbhash } : null}
          contentFit="cover"
          transition={200}
          accessibilityLabel={image.label}
          style={{ position: 'absolute', inset: 0, backgroundColor: colors.honeySoft }}
        />
      ) : (
        <Svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <Defs>
            <RadialGradient id={id} cx="30%" cy="25%" r="90%">
              {honeyLight[scheme].map((stop) => (
                <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      )}
      {title && !image ? (
        // Le titre décore la couverture : il est déjà lu ailleurs, on le cache aux lecteurs d'écran.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: space.xl, right: space.xl, bottom: space.xl }}
        >
          <Text variant="title1" numberOfLines={3}>
            {title}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  )
  if (!card) return cover
  // Deux boîtes : l'extérieure porte l'ombre, l'intérieure rogne la photo aux coins arrondis
  // (overflow: 'hidden'), ce qui rognerait aussi l'ombre si elles étaient ensemble.
  return (
    <View style={{ borderRadius: radii[radius], boxShadow: shadows.card, alignSelf: 'stretch' }}>
      {cover}
    </View>
  )
}
