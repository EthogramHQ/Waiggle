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
// Deux mises en page, choisies ici selon la largeur (les écrans n'ont pas à s'en soucier) :
// - téléphone et tablette : une bande de miel en haut (300 points au moins, plus si le décor est
//   plus grand), avec la barre de navigation et le décor (`scene`), puis la feuille, pleine largeur,
//   qui remonte de 40 points sur la bande et descend jusqu'au bas de la fenêtre ;
// - ordinateur : le miel couvre toute la page, la barre de navigation en haut, la scène (`hero`) à
//   gauche, la feuille en carte à droite (comme la maquette de la connexion sur ordinateur). Sans
//   `hero`, le décor passe en tête de la carte.
//
// Sur ordinateur, la carte est centrée en hauteur : si elle grandit par le bas (une ligne qui
// arrive avec la réponse de l'API), elle se recentre et tout ce qu'elle porte remonte, sous la
// souris. Un contenu qui sait ce qui peut encore s'ajouter à la fin de la carte en fait garder la
// place **sous** la carte, sur le miel, invisible (`useHoldUnderCard`, correction du 10/11 après
// R7a, page de sortie) : la carte se centre avec cette place, et ce qui arrive la reprend.
import { honeyLight, layout, radii, type Scheme, type Space, space } from '@ruche/brand'
import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from 'react'
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
/** La marge intérieure de la carte (ordinateur) et l'écart entre ses blocs. */
const CARD_PADDING: Space = 'xxl'
const CARD_GAP: Space = 'xl'

/**
 * Le canal par lequel le contenu de la carte confie à l'ambiance la place à garder sous elle. Un
 * contexte React transmet une valeur à tous les composants qu'il entoure, sans la passer de main en
 * main ; ici, la fonction qui pose (ou retire) la place. Il n'existe que dans la mise en page en
 * carte : sur téléphone, la feuille descend jusqu'en bas et ne se recentre jamais.
 */
const HoldUnderCard = createContext<((hold: ReactNode | null) => void) | null>(null)

/**
 * Fait garder sous la carte (ordinateur seulement) la place de ce qui peut encore s'ajouter à la
 * fin de la carte : `hold` est un gabarit de même forme, que l'ambiance pose sous la carte, à la
 * largeur du contenu et après le même écart que les autres blocs, invisible et caché aux lecteurs
 * d'écran. `null` : plus de place gardée (ce qui l'attendait est arrivé). Le gabarit doit être un
 * élément stable (une constante du module), et ne rien contenir qu'on atteigne au clavier.
 *
 * La place est posée avant que le navigateur dessine (`useLayoutEffect`) : la ligne qui arrive et
 * la place qui part changent dans la même image, la carte ne bouge pas.
 */
export function useHoldUnderCard(hold: ReactNode | null) {
  const setHold = useContext(HoldUnderCard)
  useLayoutEffect(() => {
    if (!setHold) return
    setHold(hold)
    return () => setHold(null)
  }, [setHold, hold])
}

type Props = {
  /** Le contenu de l'écran : il est posé sur la feuille claire. */
  children: ReactNode
  /**
   * La barre de navigation (`TopNav` : « Mon compte »), posée sur le miel, au-dessus de la feuille
   * (décision de Louis du 29/10/2026 pour la page introuvable). Elle porte sa propre matière (le
   * verre) : ce n'est pas un bouton encre posé à nu sur le miel.
   */
  header?: ReactNode
  /**
   * Le décor de l'écran (la constellation, l'enveloppe, le portail). Sur téléphone et tablette, il
   * flotte sur le miel, au-dessus de la feuille ; sur ordinateur, il passe en tête de la carte, sauf
   * si une scène `hero` le montre déjà à gauche. Toujours caché aux lecteurs d'écran : jamais un
   * bouton ni un texte à lire (rien n'y garantit le contraste).
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

export function BrandAmbiance({ children, header, scene, hero, size }: Props) {
  const { scheme } = useTheme()
  const window = useLayout()
  const insets = useSafeAreaInsets()
  const sizeClass = size ?? window.sizeClass
  const padding = layout.screenPadding[sizeClass]
  // La carte (scène à gauche, feuille en carte à droite) : dès 1 000 points (R2), avant la mise en
  // colonnes des autres écrans (1 100) ; le catalogue la choisit par `size`.
  const card = size ? size === 'wide' : window.card
  // La hauteur réelle de la bande (elle grandit avec le décor), pour que la feuille descende
  // jusqu'en bas de l'écran même quand son contenu est court : sinon la page s'arrêterait sous le
  // contenu, avec un bas de feuille arrondi au milieu de l'écran.
  const [band, setBand] = useState(BAND)
  const onBandLayout = (event: LayoutChangeEvent) => setBand(event.nativeEvent.layout.height)
  const decor = scene ? <Decor>{scene}</Decor> : null
  // La place gardée sous la carte, confiée par son contenu (voir useHoldUnderCard).
  const [hold, setHold] = useState<ReactNode | null>(null)

  if (card) {
    // RF (relecture design, n° 6) : la barre se pose où la posent les autres pages (ScreenTopBar :
    // la marge du haut de l'écran plus `space.lg`). Sous la grande marge de la carte, elle descendait
    // de 32 points en arrivant sur le miel depuis Explorer, puis remontait au retour. La carte, elle,
    // garde sa place : l'écart rendu à la barre passe sous elle (`barLift`).
    const withBar = header !== undefined && header !== null && header !== false
    const barLift = withBar ? space.huge - space.lg : 0
    return (
      <View
        style={{
          flexGrow: 1,
          // Le miel couvre toute la fenêtre (le catalogue, lui, n'a pas de fenêtre à remplir).
          minHeight: size ? undefined : window.height,
          alignItems: 'center',
          paddingTop: insets.top + space.huge - barLift,
          paddingBottom: insets.bottom + space.huge,
          paddingHorizontal: padding,
          gap: space.xl,
        }}
      >
        <HoneyGradient scheme={scheme} />
        {header === undefined ? null : (
          <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>{header}</View>
        )}
        <View
          style={{
            // La place qui reste sous la barre : la carte s'y centre en hauteur.
            flexGrow: 1,
            marginTop: barLift,
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
            <Surface
              variant="plain"
              radius="ambiance"
              padding={CARD_PADDING}
              gap={CARD_GAP}
              shadow="card"
            >
              {/* Pas de bande de miel ici : le décor passe en tête de la carte, sauf si la scène
                  de gauche le montre déjà (l'accueil). */}
              {hero ? null : decor}
              <HoldUnderCard.Provider value={setHold}>{children}</HoldUnderCard.Provider>
            </Surface>
            {hold ? (
              // La place gardée : centrée avec la carte, elle n'en change pas l'allure (le miel
              // reste visible dessous). À la largeur du contenu de la carte et après le même écart
              // que ses blocs : ce qui arrive y prend exactement la hauteur qu'elle libère.
              <View
                testID="card-hold"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
                pointerEvents="none"
                style={{
                  opacity: 0,
                  paddingTop: space[CARD_GAP],
                  paddingHorizontal: space[CARD_PADDING],
                }}
              >
                {hold}
              </View>
            ) : null}
          </View>
          {hero ? <View style={{ flex: 1, minWidth: 0 }}>{hero}</View> : null}
        </View>
      </View>
    )
  }

  return (
    <View style={{ flexGrow: 1, alignSelf: 'stretch' }}>
      {/* La bande de miel : la barre de navigation en haut, puis le décor. Sans décor, elle reste
          vide et la feuille remonte plus haut, pour que le formulaire arrive vite. */}
      <View
        onLayout={onBandLayout}
        style={{
          minHeight: scene ? BAND : BAND / 2,
          paddingTop: insets.top + space.lg,
          paddingBottom: OVERLAP + space.sm,
          paddingHorizontal: padding,
          gap: space.md,
        }}
      >
        {/* Le dégradé garde toujours au moins 300 points de haut, même quand la bande est plus
            courte : écrasé dans 150 points, il devenait une ellipse plate (surtout la nuit). La
            feuille, dessinée après lui, en cache le bas. */}
        <HoneyGradient scheme={scheme} height={Math.max(BAND, band)} />
        {header}
        <View style={{ flexGrow: 1, justifyContent: 'center' }}>{decor}</View>
      </View>
      {/* La feuille claire, en pleine largeur : elle remonte sur la bande (marge négative), et sa
          hauteur minimale la fait descendre jusqu'au bas de la fenêtre. Elle n'est arrondie qu'en
          haut, comme une feuille qui sort du bas de l'écran (`Surface variant="sheet"`) : arrondis,
          ses coins du bas laissaient voir le fond dans les deux coins de l'écran. Pour garder sa
          matière (`plain`), on la prolonge sous un cadre qui rogne (overflow: hidden) de la hauteur
          de son arrondi : les coins du bas passent sous le bord du cadre, hors de la vue. */}
      <View style={{ marginTop: -OVERLAP, overflow: 'hidden' }}>
        <View style={{ marginBottom: -OVERLAP }}>
          <Surface variant="plain" radius="ambiance">
            <View
              style={{
                // La partie rognée (OVERLAP) s'ajoute à la hauteur et à la marge du bas : la partie
                // visible garde sa taille, et le contenu ne passe jamais sous le bord du cadre.
                minHeight: size ? undefined : Math.max(0, window.height - band + OVERLAP) + OVERLAP,
                paddingTop: space.xxl,
                paddingBottom: insets.bottom + space.huge + OVERLAP,
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
    </View>
  )
}

/**
 * Le décor d'un écran de marque, caché aux lecteurs d'écran (iOS : accessibilityElementsHidden ;
 * Android : importantForAccessibility ; web : aria-hidden) et au doigt (pointerEvents) : la règle
 * « sur le miel, seulement du décor » est tenue ici, pas laissée à chaque écran.
 */
function Decor({ children }: { children: ReactNode }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
    >
      {children}
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
