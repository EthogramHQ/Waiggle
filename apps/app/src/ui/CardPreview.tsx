// L'aperçu de la carte (tranche R6a, scénario « L'aperçu de la carte », planche
// `R6-Publier-Desktop`) : sur ordinateur, à droite du formulaire de publication, la carte du fil
// telle qu'elle sera (l'écran la donne en `children`), posée sur une scène sombre éclairée par la
// première photo. Change la photo : la lumière change aussi.
//
// La lumière suit la mécanique de la lumière d'ambiance (`AmbientLightSoft`, son `Glow`) : une image
// floue et ravivée derrière la carte, ou, sans photo, le dégradé rond du miel de nuit. Pour une photo
// déjà envoyée, son résumé flou (ThumbHash) suffit : une image minuscule agrandie, floue par nature,
// qui ne coûte rien à dessiner. Une photo tout juste choisie n'a pas encore de résumé (le serveur le
// calcule à l'envoi) : on dessine alors la photo elle-même, floutée.
//
// L'aperçu n'est qu'une image de ce que le formulaire contient déjà : rien n'y est atteignable.
// - Au clavier (web) : la couche est `inert`. React Native Web ne transmet pas cet attribut : on le
//   pose sur la balise elle-même, par sa `ref` (comme les copies mesurées de `ReadMore`). Aucun arrêt
//   de Tab dans la carte, et le navigateur la retire de ce qu'il donne aux lecteurs d'écran.
// - Au doigt et à la souris : `pointerEvents="none"` ; « Tester » de la carte n'ouvre rien.
// - Aux lecteurs d'écran : caché (`aria-hidden`, et ses équivalents d'iOS et d'Android), pour qu'ils
//   ne lisent pas deux fois le titre et l'accroche. Ce qui présente l'aperçu (« Aperçu dans le
//   fil », la phrase sur la lumière) reste dans l'écran, hors de ce composant.
import { honeyLight, palettes, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { CoverImage } from './ProjectCover'

type Props = {
  /** La première photo du projet, qui éclaire la scène ; null : la lumière miel. */
  image: CoverImage | null
  /** La carte du fil, telle qu'elle sera publiée. */
  children: ReactNode
}

// La scène est toujours de nuit, quel que soit le thème de l'appli : une lanterne dans le noir, la
// carte posée dessus garde, elle, le thème du membre (planche : carte de jour sur scène de nuit).
const night = palettes.night
// La lumière déborde de la scène de tous côtés : on ne voit jamais son bord (comme `BLEED` de la
// lumière d'ambiance).
const BLEED = '-15%'
// L'intensité de la lumière derrière la carte (planche : 0,8).
const STRENGTH = 0.8
// Le flou d'une photo sans résumé, en points (planche : 40 px).
const BLUR = 40

export function CardPreview({ image, children }: Props) {
  // La couche entière, pour y poser `inert` sur le web.
  const layer = useRef<View>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = layer.current as unknown as HTMLElement | null
    node?.setAttribute?.('inert', '')
  }, [])

  return (
    <View
      ref={layer}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        borderRadius: radii.tile,
        overflow: 'hidden',
        backgroundColor: night.background,
        // L'air autour de la carte : la lumière se voit de chaque côté.
        paddingHorizontal: space.xxxxl,
        paddingVertical: space.xxl,
      }}
    >
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <View style={{ position: 'absolute', inset: BLEED, opacity: STRENGTH }}>
          <Light image={image} />
        </View>
      </View>
      {children}
    </View>
  )
}

/** La lumière : la photo floue et ravivée, ou le miel de nuit sans photo. */
function Light({ image }: { image: CoverImage | null }) {
  // Le dégradé est nommé, puis cité par `url(#…)` : un nom propre à chaque aperçu (useId), sinon le
  // navigateur peut prendre celui d'une autre page restée dans le document.
  const id = `preview-${useId().replace(/[^\w-]/g, '')}`
  if (image?.thumbhash || image?.source) {
    return (
      // Les couleurs d'une image floue sont un peu ternes : on les ravive (web et Android ; iOS
      // garde les couleurs telles quelles), comme la lumière d'ambiance.
      <View style={[StyleSheet.absoluteFill, { filter: 'saturate(1.7)' }]}>
        <Image
          source={image.thumbhash ? { thumbhash: image.thumbhash } : image.source}
          {...(image.thumbhash ? null : { blurRadius: BLUR })}
          contentFit="cover"
          accessible={false}
          style={StyleSheet.absoluteFill}
        />
      </View>
    )
  }
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id={id} cx="30%" cy="25%" r="75%">
          {honeyLight.night.map((stop) => (
            <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  )
}
