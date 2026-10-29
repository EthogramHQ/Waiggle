// L'ambiance « miel vif » des moments de marque (l'accueil d'un visiteur, la connexion,
// l'inscription) : un dégradé de miel en haut de l'écran, et une feuille claire qui remonte dessus
// et porte tout le contenu. Les écrans ordinaires gardent la lumière d'ambiance (`AmbientLight`) ;
// ceux-ci la remplacent par ce miel franc, qui dit « tu entres chez Waiggle ».
//
// Deux règles de lisibilité, d'où la feuille :
// - jamais un bouton encre posé directement sur le miel : les boutons, les champs et les textes
//   vivent sur la feuille, dont les couples texte / fond sont ceux des surfaces pleines
//   (`contrastPairs`, @ruche/brand) ;
// - sur le miel, seulement du décor (la constellation de l'accueil), caché des lecteurs d'écran.
//
// Rien n'y bouge : le dégradé est fixe, il n'y a donc rien à calmer quand la personne a choisi
// « Réduire les animations ». (Le décor qu'un écran pose sur le miel, la constellation, suit déjà
// ce réglage de son côté.)
//
// Deux mises en page :
// - téléphone et tablette : une bande de miel en haut (300 points au moins, plus si le décor est
//   plus grand), puis la feuille, pleine largeur, qui remonte de 40 points sur la bande ;
// - ordinateur : le miel couvre toute la page, la scène (`hero`) à gauche, la feuille en carte à
//   droite (comme la maquette de la connexion sur ordinateur).
import { honeyLight, layout, radii, type Scheme, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Surface } from './Surface'
import { type SizeClass, useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/** La hauteur minimale de la bande de miel sur téléphone (plan R1, G1). */
const BAND = 300
/** De combien la feuille remonte sur la bande : son arrondi laisse voir le miel dans ses coins. */
const OVERLAP = radii.ambiance

type Props = {
  /** Le contenu de l'écran : il est posé sur la feuille claire. */
  children: ReactNode
  /**
   * Un décor posé sur le miel, au-dessus de la feuille (la constellation de l'accueil), sur
   * téléphone et tablette seulement. Jamais un bouton ni un texte à lire : rien n'y garantit le
   * contraste.
   */
  scene?: ReactNode
  /** Sur ordinateur : la scène de gauche, la feuille devenant une carte à droite. */
  hero?: ReactNode
  /**
   * La mise en page à prendre, quelle que soit la largeur de la fenêtre : le catalogue montre ainsi
   * côte à côte la version téléphone et la version ordinateur. Sans elle, celle de la fenêtre.
   */
  size?: SizeClass
}

export function BrandAmbiance({ children, scene, hero, size }: Props) {
  const { scheme } = useTheme()
  const window = useLayout()
  const insets = useSafeAreaInsets()
  const sizeClass = size ?? window.sizeClass
  const padding = layout.screenPadding[sizeClass]
  // La hauteur réelle de la bande (elle grandit avec le décor), pour que la feuille descende
  // jusqu'en bas de l'écran même quand son contenu est court : sinon la page s'arrêterait sous le
  // contenu, avec un bas de feuille arrondi au milieu de l'écran.
  const [band, setBand] = useState(BAND)
  const onBandLayout = (event: LayoutChangeEvent) => setBand(event.nativeEvent.layout.height)

  if (sizeClass === 'wide') {
    return (
      <View
        style={{
          flexGrow: 1,
          // Le miel couvre toute la fenêtre (le catalogue, lui, n'a pas de fenêtre à remplir).
          minHeight: size ? undefined : window.height,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: insets.top + space.huge,
          paddingBottom: insets.bottom + space.huge,
          paddingHorizontal: padding,
        }}
      >
        <HoneyGradient scheme={scheme} />
        <View
          style={{
            width: '100%',
            maxWidth: layout.maxContentWidth,
            // row-reverse : la feuille vient d'abord dans la page (lecteurs d'écran, touche Tab),
            // mais s'affiche à droite de la scène.
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: hero ? 'flex-start' : 'center',
            gap: space.huge,
          }}
        >
          <View style={{ width: layout.formWidth - 80 }}>
            <Surface variant="plain" radius="ambiance" padding="xxl" gap="xl" shadow="card">
              {children}
            </Surface>
          </View>
          {hero ? <View style={{ flex: 1, minWidth: 0 }}>{hero}</View> : null}
        </View>
      </View>
    )
  }

  return (
    <View style={{ flexGrow: 1, alignSelf: 'stretch' }}>
      {/* La bande de miel. Le décor y est posé ; sans décor, elle reste vide et la feuille remonte
          plus haut, pour que le formulaire arrive vite. */}
      <View
        onLayout={onBandLayout}
        style={{
          minHeight: scene ? BAND : BAND / 2,
          paddingTop: insets.top + space.lg,
          paddingBottom: OVERLAP + space.sm,
          paddingHorizontal: padding,
          justifyContent: 'center',
        }}
      >
        {/* Le dégradé garde toujours au moins 300 points de haut, même quand la bande est plus
            courte : écrasé dans 150 points, il devenait une ellipse plate (surtout la nuit). La
            feuille, dessinée après lui, en cache le bas. */}
        <HoneyGradient scheme={scheme} height={Math.max(BAND, band)} />
        {scene}
      </View>
      {/* La feuille claire, en pleine largeur : elle remonte sur la bande (marge négative). Sa
          hauteur minimale la fait descendre jusqu'au bas de la fenêtre ; ses coins du bas, arrondis
          eux aussi, s'y perdent dans les coins de l'écran. */}
      <View style={{ marginTop: -OVERLAP }}>
        <Surface variant="plain" radius="ambiance">
          <View
            style={{
              minHeight: size ? undefined : Math.max(0, window.height - band + OVERLAP),
              paddingTop: space.xxl,
              paddingBottom: insets.bottom + space.huge,
              paddingHorizontal: padding,
              alignItems: 'center',
            }}
          >
            <View style={{ width: '100%', maxWidth: layout.formWidth, gap: space.xl }}>
              {children}
            </View>
          </View>
        </Surface>
      </View>
    </View>
  )
}

/**
 * Le dégradé de miel, du canevas de la refonte : une ellipse plus large que haute, centrée en haut
 * à gauche (30 % de la largeur, 18 % de la hauteur), qui part du blanc (le cœur clair du miel) et
 * finit dans l'ambre ; la nuit, une lanterne de miel qui s'éteint dans le fond. Les couleurs sont
 * celles de la lumière miel (`honeyLight`, @ruche/brand) : un seul endroit pour les changer.
 *
 * Un dégradé SVG ne connaît que des cercles : on l'étire en ellipse par `gradientTransform`
 * (unités de la boîte : 1 = toute la largeur ou toute la hauteur), autour de son centre. L'identifiant
 * dépend du thème seulement (pas de useId) : la page préparée sur le serveur et le navigateur doivent
 * écrire le même ; deux dégradés identiques peuvent partager le même nom.
 */
function HoneyGradient({ scheme, height }: { scheme: Scheme; height?: number }) {
  const id = `brand-ambiance-${scheme}`
  // Le jour, l'ellipse fait 120 % de la largeur ; la nuit, 110 % (la lanterne est plus serrée).
  const width = scheme === 'night' ? 1.1 : 1.2
  return (
    <View
      // Du décor : ni le lecteur d'écran ni le doigt ne s'y arrêtent.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      // Sans hauteur donnée, toute la zone ; avec, depuis le haut, quitte à déborder dessous.
      style={
        height === undefined
          ? StyleSheet.absoluteFill
          : { position: 'absolute', top: 0, left: 0, right: 0, height }
      }
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient
            id={id}
            cx={0.3}
            cy={0.18}
            r={1}
            gradientTransform={`translate(0.3 0.18) scale(${width} 0.7) translate(-0.3 -0.18)`}
          >
            {honeyLight[scheme].map((stop) => (
              <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}
