// La mise en page commune aux écrans : le fond, la lumière d'ambiance, les marges, la largeur
// maximale du contenu, le défilement et, en option, une barre en haut, un bouton de retour, un titre
// et un sous-titre.
// `children` désigne ce qu'on place entre <Screen> et </Screen> : le contenu propre à chaque écran.
//
// Sur un grand écran, un écran peut montrer une « scène » (`hero`) à gauche et son contenu dans une
// carte à droite : c'est la mise en page de l'accueil et de la connexion sur ordinateur.
import { appName, borders, layout, space } from '@ruche/brand'
// Head vient d'expo-router, mais ne navigue pas : il remplit seulement l'en-tête du document web
// (le titre de l'onglet). C'est, avec useScreenFocused (ui/screenFocus.ts), la seule chose que
// src/ui prend à expo-router.
import Head from 'expo-router/head'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBrowserLanguage } from '../i18n'
import { AmbientLight } from './AmbientLight'
import { BrandAmbiance } from './BrandAmbiance'
import { Button } from './Button'
import { useFloatingClaim } from './floatingSpace'
import { IconButton } from './IconButton'
import { NoticeScope } from './Notice'
import { Surface } from './Surface'
import { useScreenFocused } from './screenFocus'
import { ScreenScrollContext, useScreenScrollChannel } from './scrollLight'
import { Text } from './Text'
import { useHasTabBarHost, useTabBarSpace } from './tabBarSpace'
import { AmbientProvider, useAmbient } from './theme/ambient'
import { markHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  title?: string
  /**
   * Le nom de la page dans l'onglet du navigateur (« Carnet de cafés | Waiggle »), quand il diffère
   * du titre affiché ou que l'écran n'a pas de titre (la page d'un projet, d'un membre). null : le
   * seul nom de l'appli (l'accueil).
   */
  pageTitle?: string | null
  /** Une phrase sous le titre. */
  subtitle?: string
  /**
   * Un élément à côté du titre, sur sa rangée (le bouton des nouveautés du Fil, R4) : après lui dans
   * l'ordre de lecture, et sans rien changer à l'écart entre le titre et le sous-titre, le même sur
   * toutes les pages. Sans titre, il n'est pas affiché.
   */
  titleAside?: ReactNode
  /**
   * Chaque défilement de la zone qui défile de l'écran. Un composant posé dans l'écran (le fil)
   * écoute plutôt par le canal de Screen (ui/scrollLight.ts).
   */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  children: ReactNode
  /** Une barre tout en haut (la navigation sur ordinateur, l'en-tête d'un formulaire). */
  header?: ReactNode
  /**
   * La barre du haut reste en place pendant que le contenu défile (l'en-tête « Annuler / Publier »
   * d'un formulaire sur téléphone : l'action reste à portée de pouce).
   */
  stickyHeader?: boolean
  /**
   * Un message à garder en vue, sous la barre fixe (le résultat de « Publier », une erreur) : il
   * apparaît là où se trouve le bouton, même si le membre a appuyé depuis le haut d'un long
   * formulaire. Sans barre fixe, il se place en tête du contenu.
   */
  notice?: ReactNode
  /** Affiche un bouton « Retour » en haut à gauche. */
  onBack?: () => void
  /**
   * Une action en haut à droite, sur la rangée du « Retour » (la roue des réglages de « Moi », R3) :
   * à la même hauteur que lui, qu'il soit là ou non, au lieu d'une rangée à elle sous le retour.
   * Hors du miel seulement (sur le miel, la droite de la barre est à `header`).
   */
  topAction?: ReactNode
  /**
   * form : une colonne étroite et centrée (connexion, formulaires) ;
   * page : toute la largeur, jusqu'à 1 280 points (pages en colonnes sur ordinateur).
   */
  width?: 'form' | 'page'
  /** Sur un grand écran : une scène à gauche, le contenu dans une carte à droite. */
  hero?: ReactNode
  /** La lumière d'ambiance derrière l'écran (vrai par défaut). */
  ambient?: boolean
  /** Le résumé flou du visuel qui colore la lumière (sinon : lumière miel). */
  thumbhash?: string | null
  /**
   * L'ambiance de l'écran :
   * - light (par défaut) : la lumière d'ambiance derrière le contenu ;
   * - brand : le « miel vif » des moments de marque (accueil d'un visiteur, connexion,
   *   inscription) : un dégradé de miel en haut, et le contenu sur une feuille claire qui remonte
   *   dessus (ui/BrandAmbiance.tsx). La lumière d'ambiance est alors coupée, et la barre du haut
   *   ne reste pas fixe : elle se pose sur le miel, au-dessus de la feuille.
   */
  ambiance?: 'brand' | 'light'
  /**
   * Avec l'ambiance « brand » : le décor de l'écran (la constellation, l'enveloppe), caché aux
   * lecteurs d'écran. BrandAmbiance le place selon la largeur : sur le miel (téléphone, tablette)
   * ou en tête de la carte (ordinateur, sans `hero`). Jamais un bouton ni un texte à lire.
   */
  scene?: ReactNode
  /**
   * Les boutons de la page (l'action principale, puis « Annuler »). Sur téléphone, ils restent
   * collés en bas de l'écran, au-dessus du clavier quand il s'ouvre, sans cacher le champ actif
   * (le contenu défile dans la place qui reste : WCAG 2.4.11, relecture juridique R2) ; sur
   * ordinateur, et sur le miel (ambiance « brand »), ils suivent le contenu.
   */
  footer?: ReactNode
  /**
   * Ce qui flotte en bas de l'écran pendant que la page défile (la capsule des réactions de la page
   * d'un projet, R5a). Screen le pose hors de la zone qui défile, centré, au-dessus de la zone sûre
   * du téléphone (et au-dessus de la barre d'onglets quand il y en a une) ; il mesure sa hauteur et
   * la réserve sous le contenu, pour que la fin de la page remonte au-dessus de lui et que, sur le
   * web, un contrôle qui reçoit le focus au clavier ne passe jamais dessous (WCAG 2.4.11). Un toast
   * monte au-dessus de lui (ui/floatingSpace.ts). Hors du miel seulement (ambiance « light »).
   */
  floating?: ReactNode
  /**
   * Le nom du bouton du haut (avec `onBack`), quand il diffère de « Retour » ou doit se lire en
   * entier (la page d'un projet, R5a). Sur ordinateur et tablette, l'icône et ce texte dans une
   * pilule de verre ; sur téléphone, l'icône seule, nommée par ce texte. Sans lui, l'icône seule
   * nommée « Retour », partout, comme avant.
   */
  backLabel?: string
}

export function Screen({
  title,
  pageTitle,
  subtitle,
  titleAside,
  onScroll,
  children,
  header,
  stickyHeader = false,
  notice,
  onBack,
  topAction,
  width = 'form',
  hero,
  ambient = true,
  thumbhash = null,
  ambiance = 'light',
  scene,
  footer,
  floating,
  backLabel,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const { padding, sizeClass, card } = useLayout()
  // Les « marges de sécurité » : la place prise par l'encoche, l'heure, la barre du bas du téléphone.
  const insets = useSafeAreaInsets()
  // La barre d'onglets du téléphone (R3), quand elle est là : la place qu'elle prend en bas, à
  // réserver sous le contenu, et son cadre, qui porte le signal de remontée (tabBarSpace.ts).
  const tabBar = useTabBarSpace()
  const hosted = useHasTabBarHost()
  // La zone qui défile, pour la faire remonter en haut quand l'onglet actif est touché de nouveau.
  const scroller = useRef<ScrollView | null>(null)
  // Le canal du défilement : `onScroll` de l'écran, et les composants posés dedans qui l'écoutent
  // (la lumière au défilement du fil, ui/scrollLight.ts).
  const scroll = useScreenScrollChannel(onScroll)
  // Une fois l'écran affiché dans le navigateur, la page peut passer au thème, à la largeur et à la
  // langue réels du visiteur (voir theme/hydration.ts).
  useEffect(() => markHydrated(), [])
  useBrowserLanguage()

  const brand = ambiance === 'brand'
  // Sur le miel, la carte arrive dès 1 000 points (`card`) ; ailleurs, avec la mise en colonnes.
  const withHero = hero !== undefined && (brand ? card : sizeClass === 'wide')
  // Sur le miel, pas de barre fixe : elle se poserait sur le dégradé, hors de la feuille.
  const pinned = header !== undefined && stickyHeader && !brand
  // Le pied collé en bas : sur téléphone et tablette, hors du miel. Ailleurs, il suit le contenu.
  const pinnedFooter = footer !== undefined && sizeClass !== 'wide' && !brand
  // La place flottante (R5a) : sa hauteur mesurée (0 tant qu'elle ne l'est pas, ou sans place), la
  // distance entre elle et le bas de l'écran, et la réserve à laisser sous le contenu.
  const [measuredFloating, setMeasuredFloating] = useState(0)
  const hasFloating = floating !== undefined && floating !== null && floating !== false && !brand
  const floatingHeight = hasFloating ? measuredFloating : 0
  // Au-dessus de la barre d'onglets quand elle est là (sa hauteur comprend déjà la marge du bas de
  // l'appareil) ; sinon au-dessus de la zone sûre, avec un peu d'air.
  const floatingLift = tabBar.height > 0 ? tabBar.height + space.sm : insets.bottom + space.lg
  // Du bas de l'écran au haut de la place flottante : ce que le contenu et le toast doivent dégager.
  const floatingTop = floatingHeight > 0 ? floatingLift + floatingHeight : 0
  // Seul l'écran affiché soulève le toast : sur le web, la page quittée reste montée, cachée.
  const focused = useScreenFocused()
  useFloatingClaim(focused ? floatingTop : 0)
  // R5a (ui-11) : « Retour » écrit en toutes lettres sur ordinateur et tablette, quand l'écran le
  // demande (`backLabel`) ; sinon, et sur téléphone, l'icône seule, nommée.
  const backButton = onBack ? (
    <BackButton
      label={backLabel ?? t(($) => $.common.back)}
      withText={backLabel !== undefined && sizeClass !== 'compact'}
      onPress={onBack}
    />
  ) : null
  // R3 (« le Retour au même endroit », point des listes) : sur le miel, le retour se pose en tête de
  // la barre de BrandAmbiance, à gauche, et l'en-tête de l'écran (la langue) à droite. Dans la
  // feuille, sa place dépendait du décor (téléphone) et de la hauteur du contenu (la carte centrée
  // sur ordinateur) : il changeait de place d'une page du compte à l'autre. Mesuré par l'ui-dev R :
  // (16, 16) à 390 px et (32, 48) à 1280 px sur les quatre pages, premier arrêt de Tab partout.
  //
  // Exception, R5a (`backLabel`, la page introuvable d'un projet, barre « Mon compte » connectée) :
  // le retour écrit en toutes lettres ne tient pas sur la rangée de la barre (à 768 points, « Publier »
  // sortait de l'écran ; de 1 024 à 1 440, le retour était 10 points plus haut que la barre). Il
  // passe donc sous la barre, à gauche, comme sur la page d'un projet (où il est sous la barre).
  const brandHeader =
    brand && backButton && backLabel !== undefined ? (
      <View style={{ gap: space.md }}>
        {header}
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>{backButton}</View>
      </View>
    ) : brand && backButton ? (
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        {backButton}
        {header}
      </View>
    ) : (
      header
    )
  // La rangée du haut, hors du miel : le retour à gauche, l'action de la page à droite (R3, la roue
  // de « Moi » : avant, elle prenait une rangée sous le retour, 64 points plus bas). Sans action, le
  // retour seul, comme avant ; sans retour, l'action reste à droite.
  const topRow =
    !brand && topAction ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: backButton ? 'space-between' : 'flex-end',
          gap: space.sm,
        }}
      >
        {backButton}
        {topAction}
      </View>
    ) : brand ? null : (
      backButton
    )
  // Le contenu propre à l'écran, précédé de la rangée du haut (hors du miel), du titre et du
  // sous-titre.
  const body = (
    <>
      {topRow}
      {title || subtitle ? (
        <PageHeading title={title} aside={titleAside} subtitle={subtitle} />
      ) : null}
      {pinned ? null : notice}
      {children}
      {footer !== undefined && !pinnedFooter ? (
        <View style={{ gap: space.md }}>{footer}</View>
      ) : null}
    </>
  )

  // Le nom de l'onglet : « Page | Waiggle », ou le seul nom de l'appli (l'accueil). Assemblé ici
  // plutôt que par t() : le titre d'un projet est écrit par un membre, et t() interpréterait un
  // « {{appName}} » glissé dedans. Le séparateur « | » n'a pas à être traduit.
  const tabPage = pageTitle === null ? undefined : (pageTitle ?? title)
  const tabTitle = tabPage ? `${shorten(tabPage)} | ${appName}` : appName

  return (
    // NoticeScope : les messages d'un même groupe (une seule « session expirée ») se comptent par
    // écran ; la page restée montée sous celle-ci a les siens (ui/Notice.tsx).
    <NoticeScope>
      {/* La lumière de cet écran : sa source (le visuel donné par `thumbhash`, ou ce qu'un composant
          de l'écran choisit par useAmbient()) et ses impulsions. Un fournisseur par écran : sur le
          web, la page précédente reste montée sous la nouvelle et garde sa propre lumière. */}
      <AmbientProvider initialSource={thumbhash ? { thumbhash } : null}>
        <ScreenScrollContext.Provider value={scroll.channel}>
          <AmbientSourceSync thumbhash={thumbhash} held={scroll.channel.lightHeld} />
          {/* overflow: 'hidden' : rien ne dépasse de l'écran sur les côtés (pas de défilement
          horizontal). */}
          <View
            style={{
              flex: 1,
              // Sur le miel, le fond est celui de la feuille : ses coins du bas, arrondis, se fondent
              // dans le bas de l'écran.
              backgroundColor: brand ? colors.surface : colors.background,
              overflow: 'hidden',
            }}
          >
            {/* Head place son contenu dans l'en-tête de la page web (la balise <title> de l'onglet). Sur
          téléphone, il n'y a pas d'onglet : rien à faire. */}
            {Platform.OS === 'web' ? (
              <Head>
                <title>{tabTitle}</title>
              </Head>
            ) : null}
            {/* Le miel vif remplace la lumière d'ambiance : les deux ensemble se mêleraient. */}
            {ambient && !brand ? <AmbientLight /> : null}
            {pinned ? (
              // La barre fixe, hors de la zone qui défile. Son fond « feuille » est presque opaque : il
              // cache le contenu qui passe dessous, mais laisse transparaître la lumière d'ambiance, qui ne
              // s'arrête plus net sous la barre.
              <View
                style={{
                  paddingTop: insets.top + space.sm,
                  paddingBottom: space.sm,
                  paddingHorizontal: padding,
                  alignItems: 'center',
                  backgroundColor: colors.sheet,
                  borderBottomWidth: borders.hairline,
                  borderBottomColor: colors.line,
                }}
              >
                <View
                  style={{ width: '100%', maxWidth: maxWidthFor(width, withHero), gap: space.sm }}
                >
                  {header}
                  {notice}
                </View>
              </View>
            ) : null}
            {/* ScrollView : l'écran défile si le contenu dépasse (petit téléphone, clavier ouvert). */}
            {brand ? (
              // Le miel vif : BrandAmbiance pose le dégradé, ses marges, la barre du haut (sur le
              // miel), le décor et la feuille qui porte le contenu.
              <ScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                onScroll={scroll.handleScroll}
                scrollEventThrottle={SCROLL_EVENT_MS}
              >
                <BrandAmbiance
                  header={brandHeader}
                  scene={scene}
                  hero={withHero ? hero : undefined}
                >
                  {body}
                </BrandAmbiance>
              </ScrollView>
            ) : (
              // KeyboardAvoidingView : sur iOS, la zone se raccourcit de la hauteur du clavier quand
              // il s'ouvre, si bien que le pied collé remonte au-dessus de lui et que le contenu
              // défile dans la place qui reste (Android le fait de lui-même, le web aussi). Sans
              // pied collé, rien ne change : la zone qui défile reste seule.
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                enabled={pinnedFooter}
                {...(Platform.OS === 'ios' ? { behavior: 'padding' as const } : null)}
              >
                <ScrollView
                  ref={scroller}
                  // Sur le web, le navigateur fait défiler le contrôle qui reçoit le focus (Tab)
                  // jusqu'au-dessus de cette marge : il ne finit pas caché sous la place flottante
                  // (`scroll-padding-bottom`, que les types de React Native ignorent).
                  style={
                    Platform.OS === 'web' && floatingTop > 0
                      ? ({ scrollPaddingBottom: floatingTop + space.sm } as ViewStyle)
                      : undefined
                  }
                  contentContainerStyle={{
                    flexGrow: 1,
                    alignItems: 'center',
                    // Sous une barre fixe, l'encoche du téléphone est déjà dégagée par la barre.
                    paddingTop: (pinned ? 0 : insets.top) + space.lg,
                    // Au-dessus d'un pied collé, la marge du bas de l'écran est déjà prise par le pied.
                    // Sous la barre d'onglets, la fin du contenu dépasse d'elle : sa hauteur (marge du
                    // bas de l'appareil comprise) plus un peu d'air.
                    // Une place flottante mesurée : la fin du contenu remonte au-dessus d'elle (barre
                    // d'onglets ou zone sûre comprises, dans `floatingTop`), plus le même air.
                    paddingBottom: pinnedFooter
                      ? space.xl
                      : floatingTop > 0
                        ? floatingTop + space.xl
                        : tabBar.height > 0
                          ? tabBar.height + space.xl
                          : insets.bottom + space.huge,
                    paddingHorizontal: padding,
                    gap: space.xl,
                  }}
                  keyboardShouldPersistTaps="handled"
                  onScroll={scroll.handleScroll}
                  scrollEventThrottle={SCROLL_EVENT_MS}
                >
                  {/* La barre du haut a toujours la même largeur, quelle que soit celle du contenu : elle ne
            change pas de taille d'une page à l'autre. */}
                  {header && !pinned ? (
                    <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
                      {header}
                    </View>
                  ) : null}
                  {withHero ? (
                    // Grand écran avec une scène : la scène prend la place, la carte garde une largeur fixe.
                    <View
                      style={{
                        width: '100%',
                        maxWidth: layout.maxContentWidth,
                        flexGrow: 1,
                        // row-reverse : la carte vient d'abord dans la page (lecteurs d'écran, touche Tab),
                        // mais s'affiche à droite de la scène.
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        gap: space.huge,
                      }}
                    >
                      <View style={{ width: layout.formWidth - 80 }}>
                        <Surface variant="panel" radius="sheet" padding="xxl" gap="xl">
                          {body}
                        </Surface>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>{hero}</View>
                    </View>
                  ) : (
                    <View
                      style={{
                        width: '100%',
                        maxWidth: maxWidthFor(width, false),
                        gap: space.xl,
                        // Un formulaire seul se place au milieu de la hauteur de l'écran.
                        ...(width === 'form' && !onBack && !header
                          ? { flexGrow: 1, justifyContent: 'center' }
                          : null),
                      }}
                    >
                      {body}
                    </View>
                  )}
                </ScrollView>
                {pinnedFooter ? (
                  <ScreenFooter width={maxWidthFor(width, false)}>{footer}</ScreenFooter>
                ) : null}
                {/* Seulement dans le cadre de la barre : hors de lui (la connexion, les tests d'un
                  écran seul), rien n'écoute, et le composant n'a pas besoin de la navigation. */}
                {hosted ? <ScrollToTopOnReselect scroller={scroller} /> : null}
              </KeyboardAvoidingView>
            )}
            {hasFloating ? (
              <ScreenFloating
                lift={floatingLift}
                width={maxWidthFor(width, false)}
                onHeight={setMeasuredFloating}
              >
                {floating}
              </ScreenFloating>
            ) : null}
          </View>
        </ScreenScrollContext.Provider>
      </AmbientProvider>
    </NoticeScope>
  )
}

/**
 * Remonte l'écran en haut quand l'onglet déjà actif est touché de nouveau (le signal `topSignal`
 * du cadre de la barre, tabBarSpace.ts). Seulement l'écran affiché (`useScreenFocused`) : sur le
 * web, les pages quittées restent montées sous la page ouverte, et toutes recevraient le signal.
 * Un signal reçu pendant qu'un écran est caché est oublié : il ne remonte pas plus tard, à son
 * retour.
 */
function ScrollToTopOnReselect({ scroller }: { scroller: RefObject<ScrollView | null> }) {
  const { topSignal } = useTabBarSpace()
  const focused = useScreenFocused()
  const calm = useCalmMotion()
  // Le dernier signal vu : au premier affichage, rien à faire.
  const seen = useRef(topSignal)
  useEffect(() => {
    if (topSignal === seen.current) return
    seen.current = topSignal
    // Sans animation avec « Réduire les animations » : un grand déplacement devient un saut.
    if (focused) scroller.current?.scrollTo({ y: 0, animated: !calm })
  }, [topSignal, focused, calm, scroller])
  return null
}

/**
 * L'en-tête de la page, le même partout (Fil, Explorer, Outils) : le titre (niveau 1, ses sections
 * sont de niveau 2), ce qui se pose à côté de lui (`aside`, le bouton des nouveautés du Fil, R4) et
 * le sous-titre. Exporté pour le catalogue, qui le montre dans la page ; les écrans passent par les
 * props `title`, `titleAside` et `subtitle` de Screen.
 */
export function PageHeading({
  title,
  aside,
  subtitle,
  level = 1,
}: {
  title?: string | undefined
  aside?: ReactNode
  subtitle?: string | undefined
  /** Le niveau du titre : 1 dans une page ; 2 au catalogue, sous le titre de la page. */
  level?: 1 | 2
}) {
  return (
    // L'écart entre le titre et le sous-titre est le seul `gap` de cette colonne (point des listes
    // R4 : 32 points sur le Fil, 8 ailleurs, quand le Fil avait son en-tête à lui).
    <View style={{ gap: space.sm }}>
      {title && aside ? (
        // Le titre et l'élément posé à côté, sur une rangée : centrés l'un sur l'autre (le bouton
        // de 44 points dépasse de 3 points le titre de chaque côté), et sans marge ni remplissage
        // en haut ou en bas, pour ne rien ajouter à l'écart du sous-titre. `flexWrap` : à 320
        // points ou en grand texte, le bouton passe sous le titre au lieu de sortir de l'écran.
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: space.md,
          }}
        >
          {/* Le titre peut rétrécir et passer à la ligne (sur le web, une vue ne rétrécit pas
              d'elle-même : flexShrink 0 par défaut). */}
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>
            <Text variant="title2" heading={level}>
              {title}
            </Text>
          </View>
          {/* L'élément à côté se replie lui aussi dans la largeur de l'écran quand il passe à la
              ligne (à 320 points et 200 % de texte, le bouton des nouveautés sortait à droite). */}
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>{aside}</View>
        </View>
      ) : title ? (
        <Text variant="title2" heading={level}>
          {title}
        </Text>
      ) : null}
      {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
    </View>
  )
}

/**
 * Le pied collé en bas de l'écran (téléphone) : une bande sur fond « feuille », bordée d'un trait
 * fin, qui porte les boutons de la page, dégagée de la barre du bas de l'appareil. Exporté pour le
 * catalogue, qui le montre dans la page ; les écrans passent par la prop `footer` de Screen.
 */
export function ScreenFooter({
  children,
  width = layout.formWidth,
}: {
  children: ReactNode
  /** La largeur maximale des boutons : celle du contenu de la page. */
  width?: number
}) {
  const { colors } = useTheme()
  const { padding } = useLayout()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        paddingTop: space.md,
        paddingBottom: insets.bottom + space.md,
        paddingHorizontal: padding,
        alignItems: 'center',
        backgroundColor: colors.sheet,
        borderTopWidth: borders.hairline,
        borderTopColor: colors.line,
      }}
    >
      <View style={{ width: '100%', maxWidth: width, gap: space.md }}>{children}</View>
    </View>
  )
}

/**
 * Le bouton du haut : l'icône seule, nommée par `label` ; ou, avec `withText` (R5a, ordinateur et
 * tablette), l'icône et le texte dans une pilule de verre, que toute la pilule se touche et que le
 * nom ne soit pas lu deux fois. Exporté pour le catalogue ; les écrans passent par les props
 * `onBack` et `backLabel` de Screen.
 */
export function BackButton({
  label,
  withText = false,
  onPress,
}: {
  label: string
  withText?: boolean
  onPress: () => void
}) {
  if (!withText) return <IconButton icon="arrow-left" label={label} onPress={onPress} />
  return (
    // La pilule garde la largeur de son texte, à gauche (sans ce cadre, la colonne l'étirerait).
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Button variant="glass" size="compact" icon="arrow-left" label={label} onPress={onPress} />
    </View>
  )
}

/**
 * La place flottante en bas de l'écran (R5a) : une couche posée sur le bas de l'écran, à `lift`
 * points de son bord, qui centre son contenu dans la largeur de la page. Elle laisse passer les
 * touchers à côté de son contenu vers la page dessous (`box-none`). Sa hauteur est mesurée par une
 * vue vide qui la couvre (et non par un `onLayout` sur la couche : le contenu, la capsule, peut
 * mesurer lui aussi, et une mesure remontée s'arrêterait à lui) puis rendue par `onHeight`.
 * Exporté pour le catalogue, qui la montre dans un cadre ; les écrans passent par la prop `floating`
 * de Screen.
 */
export function ScreenFloating({
  children,
  lift,
  width = layout.maxContentWidth,
  onHeight,
}: {
  children: ReactNode
  /** La distance entre le bas de l'écran (ou du cadre) et la place, en points. */
  lift: number
  /** La largeur maximale du contenu : celle de la page. */
  width?: number
  onHeight?: (height: number) => void
}) {
  const { padding } = useLayout()
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: lift,
        alignItems: 'center',
        paddingHorizontal: padding,
      }}
    >
      <View
        pointerEvents="box-none"
        style={{ width: '100%', maxWidth: width, alignItems: 'center' }}
      >
        {children}
      </View>
      {onHeight ? (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}
        />
      ) : null}
    </View>
  )
}

/**
 * Passe le visuel de l'écran (`thumbhash`) à la lumière quand il change : un projet chargé après
 * l'ouverture de sa page fait glisser la lumière du miel vers ses couleurs. Au premier affichage,
 * le fournisseur l'a déjà (initialSource) : rien ne glisse. Quand le fil tient la lumière (la
 * carte au milieu de l'écran, `held`), la source de l'écran ne la lui reprend pas (ui-B5).
 */
function AmbientSourceSync({
  thumbhash,
  held,
}: {
  thumbhash: string | null
  held: RefObject<boolean>
}) {
  const { setSource } = useAmbient()
  useEffect(() => {
    if (held.current) return
    setSource(thumbhash ? { thumbhash } : null)
  }, [setSource, thumbhash, held])
  return null
}

// Un défilement est signalé au plus toutes les 16 ms (une image) : sur iOS, sans ce réglage,
// `onScroll` ne serait appelé qu'une fois au début du geste.
const SCROLL_EVENT_MS = 16

// Un onglet n'affiche qu'une trentaine de caractères : au-delà de 60, le titre est abrégé (« … »),
// pour qu'un titre de projet ou d'étiquette très long n'encombre pas l'historique du navigateur.
const TAB_TITLE_MAX = 60
const shorten = (text: string) =>
  text.length > TAB_TITLE_MAX ? `${text.slice(0, TAB_TITLE_MAX - 1).trimEnd()}…` : text

const maxWidthFor = (width: 'form' | 'page', withHero: boolean) =>
  width === 'page' || withHero ? layout.maxContentWidth : layout.formWidth
