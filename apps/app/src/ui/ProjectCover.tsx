// La couverture d'un projet. Avec une photo : la photo, qui remplit le cadre (recadrée au centre),
// et son résumé flou (ThumbHash) affiché le temps qu'elle arrive. Sans photo : la lumière miel,
// avec le titre écrit dessus en grand, pour que chaque projet ait une couverture chaleureuse
// plutôt qu'un cadre vide.
//
// Ce fichier donne aussi les places de ce qui se pose sur une photo de page (R5a, planches
// `R5a-Projet` et `R5a-Projet-Desktop`), pour qu'un écran n'écrive aucune position :
// - `CoverControls` : les boutons de verre en haut de la photo (Retour à gauche ; Partager et « … »
//   à droite), sous la barre d'état quand la photo monte jusqu'au haut de l'écran ;
// - `CoverStraddle` : ce qui se pose à cheval sur le bas de la photo (la capsule des réactions, sur
//   ordinateur), la photo réservant sous elle la moitié qui dépasse ;
// - `CoverSheet` : la feuille de la page qui chevauche le bas de la photo, sur téléphone.
// `PhotoGallery` (la galerie de la page projet) s'en sert, et les donne à son `overlay`.
import { borders, honeyLight, layout, type Radius, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import { createContext, type ReactNode, useContext, useEffect, useId, useState } from 'react'
import { View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { ImageSource } from './image'
import { Text } from './Text'
import { useLayout } from './theme/layout'
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
  /** `none` : des coins droits (une photo de la galerie, que la galerie arrondit elle-même). */
  radius?: Radius | 'none'
  image?: CoverImage | null
  /** Ce qui se pose sur la couverture (boutons ronds, panneau de verre). */
  children?: ReactNode
  /**
   * `card` : la couverture est une carte posée sur la page (celle du fil), avec l'ombre d'une carte
   * et, la nuit, un fin liseré qui la détache du noir. Sans ombre par défaut (une couverture en tête
   * de page, une vignette dans une note).
   */
  shadow?: 'card' | 'none'
  /**
   * La couverture prend la hauteur que son parent lui laisse, `height` devenant sa hauteur minimale
   * (la couverture d'une carte de note étirée à la hauteur d'une carte de projet voisine, R4).
   */
  grow?: boolean
}

export function ProjectCover({
  title,
  height: size,
  radius = 'sheet',
  image,
  children,
  shadow = 'none',
  grow = false,
}: Props) {
  const { scheme, colors, shadows } = useTheme()
  const height = typeof size === 'number' ? size : layout.cover[size]
  // Le dégradé est nommé, puis cité par `url(#…)` : un nom propre à chaque couverture (useId, le même
  // au pré-rendu web et dans le navigateur). Avec un nom commun, le navigateur prenait le premier
  // dégradé de la page, parfois dans une page quittée et cachée (`display: none`) : la couverture du
  // projet ouvert depuis le fil ne se dessinait pas (relecture design R4, A4).
  const unique = useId()
  const id = `cover-${scheme}-${unique.replace(/[^\w-]/g, '')}`
  const card = shadow === 'card'
  const rounding = radius === 'none' ? 0 : radii[radius]
  // flexGrow : la couverture grandit dans la place libre de son parent, sans descendre sous sa
  // hauteur de base.
  const sizing = grow ? { minHeight: height, flexGrow: 1 } : { height }
  const cover = (
    <View
      style={{
        ...sizing,
        borderRadius: rounding,
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
    <View
      style={{
        borderRadius: rounding,
        boxShadow: shadows.card,
        alignSelf: 'stretch',
        ...(grow ? { flexGrow: 1 } : null),
      }}
    >
      {cover}
    </View>
  )
}

/**
 * La hauteur du bas de la photo que la feuille de la page recouvre, sur téléphone (le rayon de la
 * feuille : ses coins arrondis se dessinent sur la photo, comme sur la planche R5a-Projet). La
 * galerie remonte ses points et « 1 sur 3 » d'autant, pour qu'ils restent visibles.
 */
export const COVER_OVERLAP = radii.sheet

/**
 * L'écart que `Screen` met entre les morceaux d'un écran (son `gap`). La feuille le reprend pour
 * remonter juste de `COVER_OVERLAP` sur la photo posée avant elle.
 */
const SCREEN_GAP = space.xl

/**
 * Ce qu'une photo de page dit à ce qui se pose sur elle : la marge du haut à laisser libre (la barre
 * d'état, quand la photo monte jusqu'en haut de l'écran) et `reserve(points)`, par lequel
 * `CoverStraddle` demande la place de sa moitié qui dépasse sous la photo.
 */
export type CoverPlace = { top: number; reserve: (points: number) => void }

// Un contexte React : la photo (la galerie) le pose autour de sa couche `overlay`, et les places
// ci-dessous le lisent. Hors d'une photo (le catalogue), rien à laisser libre ni à réserver.
const CoverPlaceContext = createContext<CoverPlace | null>(null)

/** À poser autour de ce qui se pose sur une photo (la couche `overlay` de la galerie). */
export const CoverPlaceProvider = CoverPlaceContext.Provider

/**
 * Les boutons de verre en haut d'une photo : `start` à gauche (Retour), `end` à droite (Partager,
 * « … »). La rangée ne prend pas le doigt entre les boutons (`box-none`) : on peut encore faire
 * glisser la photo entre eux.
 */
export function CoverControls({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  const place = useContext(CoverPlaceContext)
  return (
    <View
      pointerEvents="box-none"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: space.sm,
        padding: space.lg,
        paddingTop: (place?.top ?? 0) + space.lg,
      }}
    >
      <View pointerEvents="box-none" style={{ flexDirection: 'row', gap: space.sm }}>
        {start}
      </View>
      <View pointerEvents="box-none" style={{ flexDirection: 'row', gap: space.sm }}>
        {end}
      </View>
    </View>
  )
}

/**
 * Ce qui se pose à cheval sur le bas d'une photo, centré (la capsule des réactions, sur ordinateur :
 * planche R5a-Projet-Desktop). Sa moitié basse dépasse sous la photo ; la photo réserve cette place
 * sous elle (`reserve`), pour que rien de la page ne passe dessous. La hauteur est mesurée : avant
 * la mesure, l'élément est posé dans la photo, au bas.
 */
export function CoverStraddle({ children }: { children: ReactNode }) {
  const place = useContext(CoverPlaceContext)
  const [height, setHeight] = useState(0)
  // La place réservée sous la photo suit la hauteur mesurée, et se rend quand l'élément disparaît.
  useEffect(() => {
    place?.reserve(height / 2)
  }, [place, height])
  useEffect(() => () => place?.reserve(0), [place])
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: -height / 2,
        alignItems: 'center',
        paddingHorizontal: space.lg,
      }}
    >
      {children}
    </View>
  )
}

/**
 * La feuille de la page, posée juste après une galerie bord à bord (`PhotoGallery bleed`) : sur
 * téléphone, elle remonte sur le bas de la photo (`COVER_OVERLAP`), va d'un bord à l'autre de
 * l'écran, coins du haut arrondis, et porte le reste de la page. Ailleurs, elle n'est qu'une colonne
 * (la photo a ses coins arrondis et rien ne la chevauche).
 */
export function CoverSheet({ children }: { children: ReactNode }) {
  const { sizeClass, padding } = useLayout()
  const { colors } = useTheme()
  if (sizeClass !== 'compact') return <View style={{ gap: SCREEN_GAP }}>{children}</View>
  return (
    <View
      style={{
        marginTop: -(COVER_OVERLAP + SCREEN_GAP),
        marginHorizontal: -padding,
        paddingHorizontal: padding,
        paddingTop: space.xxl,
        // La feuille va jusqu'en bas de la page, même courte : pas de bord visible sous elle.
        flexGrow: 1,
        gap: SCREEN_GAP,
        borderTopLeftRadius: radii.sheet,
        borderTopRightRadius: radii.sheet,
        backgroundColor: colors.sheet,
      }}
    >
      {children}
    </View>
  )
}
