// Une image d'un membre dans le coin des testeurs, entière et qu'on ouvre en grand (R7b, relecture
// de design B1 et B2) : la capture d'un retour (`MessageBubble`) et la photo d'un appel
// (`CallCard`). Rognées dans un cadre fixe, elles ne montraient qu'une bande (32 % d'une capture de
// téléphone, 6 % d'une photo en hauteur sur ordinateur), et rien ne permettait de les voir entières.
//
// - Le cadre prend **les proportions de l'image** : jamais rognée. Elles viennent du contrat
//   (`TesterMedia.width` et `height`) quand l'écran les donne ; sinon de l'image chargée
//   (`onLoad`), avec 4:3 en attendant.
// - Sa taille a deux bornes : `maxHeight` (une capture de téléphone ne mange pas l'écran) et
//   `maxWidth` (la bulle) ; sans `maxWidth`, toute la largeur de la colonne au plus (la carte).
//   Une image en hauteur reste donc étroite, une image en largeur basse : les deux entières.
// - Un appui (doigt, clic, Entrée ou Espace) l'ouvre en entier dans la visionneuse (`ImageViewer`).
//   Le bouton dit ce qu'il fait (« Voir en grand : … ») ; l'image qu'il porte garde son nom.
//
// En mémoire seulement (`cachePolicy="memory"`, sécurité A4), en vignette comme en grand.
import { radii } from '@ruche/brand'
import { Image, type ImageLoadEventData } from 'expo-image'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { moveReaderTo } from './focus'
import { ImageViewer } from './ImageViewer'
import type { ImageSource } from './image'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

/**
 * La hauteur d'une image du coin, au plus (240 points) : une capture de téléphone se lit dans la
 * bulle, une photo d'appel en largeur garde la carte lisible. Reprise par la modération
 * (`ReportCard`), qui montre les mêmes images.
 */
export const PICTURE_MAX_HEIGHT = 240

/** Les proportions supposées tant qu'on ne connaît pas celles de l'image (celles d'une photo). */
const UNKNOWN_RATIO = 4 / 3

type Size = { width: number; height: number }

type Props = {
  source: ImageSource
  /** Le nom lu de l'image (fixe pour une capture, la description de l'auteur pour une photo). */
  label: string
  /** Les dimensions de l'image, tirées du contrat ; absentes : lues au chargement. */
  size?: Partial<Size> | null
  /** La hauteur au plus, en points. */
  maxHeight?: number
  /** La largeur au plus, en points ; absente : toute la largeur de la colonne. */
  maxWidth?: number
  /** L'arrondi des coins (jeton `radii`). */
  radius?: keyof typeof radii
}

/** Des dimensions utilisables : deux nombres positifs. */
const usable = (size: Partial<Size> | null | undefined): Size | null =>
  size && (size.width ?? 0) > 0 && (size.height ?? 0) > 0
    ? { width: size.width as number, height: size.height as number }
    : null

export function OpenableImage({
  source,
  label,
  size,
  maxHeight = PICTURE_MAX_HEIGHT,
  maxWidth,
  radius = 'code',
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [loaded, setLoaded] = useState<Size | null>(null)
  const [open, setOpen] = useState(false)
  const opener = useRef<View>(null)

  const known = usable(size) ?? loaded
  const ratio = known ? known.width / known.height : UNKNOWN_RATIO
  // Le cadre : ses proportions sont celles de l'image (aspectRatio), sa largeur la plus grande qui
  // respecte les deux bornes. Dans la bulle, une largeur en points (la bulle prend celle de son
  // contenu) ; dans la carte, toute la largeur, bornée par ce que permet la hauteur au plus. La
  // hauteur suit la largeur réelle, même rétrécie par `maxWidth: '100%'`.
  const frame: ViewStyle =
    maxWidth === undefined
      ? { width: '100%', maxWidth: maxHeight * ratio }
      : { width: Math.min(maxWidth, maxHeight * ratio), maxWidth: '100%' }

  // Les dimensions de l'image chargée (natif : l'évènement ; web : le même, sans `nativeEvent`).
  const onLoad = (event: ImageLoadEventData | { nativeEvent?: ImageLoadEventData }) => {
    const data = 'source' in event ? event : event.nativeEvent
    const measured = usable(data?.source)
    if (measured && !usable(size)) setLoaded(measured)
  }

  const close = () => {
    setOpen(false)
    // Sur téléphone, le lecteur d'écran revient à la vignette (le web le fait par le Modal).
    if (Platform.OS !== 'web') moveReaderTo(opener.current)
  }

  return (
    <>
      <Pressable
        ref={opener}
        accessibilityRole="button"
        accessibilityLabel={t(($) => $.gallery.enlarge, { description: label })}
        onPress={() => setOpen(true)}
        // L'anneau du clavier dessiné à l'intérieur : le cadre rogne ce qui dépasse.
        {...insetFocus}
        style={{
          ...frame,
          aspectRatio: ratio,
          alignSelf: 'flex-start',
          borderRadius: radii[radius],
          overflow: 'hidden',
          backgroundColor: colors.surfaceGrouped,
        }}
      >
        {/* L'image garde son nom (une image nommée dans le bouton) ; le bouton dit ce qu'il fait. */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          style={StyleSheet.absoluteFill}
        >
          <Image
            source={source}
            // En mémoire seulement : jamais écrite sur le disque de l'appareil (sécurité A4).
            cachePolicy="memory"
            contentFit="contain"
            onLoad={onLoad}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Pressable>
      {open ? <ImageViewer visible source={source} label={label} onDismiss={close} /> : null}
    </>
  )
}
