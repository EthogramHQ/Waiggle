// La mise en page commune aux écrans : le fond, la lumière d'ambiance, les marges, la largeur
// maximale du contenu, le défilement et, en option, une barre en haut, un bouton de retour, un titre
// et un sous-titre.
// `children` désigne ce qu'on place entre <Screen> et </Screen> : le contenu propre à chaque écran.
//
// Sur un grand écran, un écran peut montrer une « scène » (`hero`) à gauche et son contenu dans une
// carte à droite : c'est la mise en page de l'accueil et de la connexion sur ordinateur.
//
// La tranche RF (« la fluidité ») assemble ici trois pièces, chacune dans son fichier :
// - la lumière (theme/ambient.tsx, ScreenAmbient) : sur le web, une seule lumière derrière toutes
//   les pages (ui/AmbientHost.tsx), à laquelle l'écran s'inscrit ; hors de l'hôte (téléphone,
//   tests, catalogue), chaque écran pose la sienne, comme avant ;
// - la barre du haut (ui/ScreenTopBar.tsx) : posée par-dessus la zone qui défile, fixe sur tablette
//   et ordinateur, et qui suit le contenu sur téléphone ;
// - le fondu des pages (ui/ScreenFade.tsx), autour du contenu seul : ni la barre, ni la lumière, ni
//   la place flottante ne s'effacent d'une page à l'autre.
import { appName, borders, layout, space } from '@ruche/brand'
// Head vient d'expo-router, mais ne navigue pas : il remplit seulement l'en-tête du document web
// (le titre de l'onglet). C'est, avec ui/screenFocus.ts (la page est-elle affichée, combien de fois
// l'est-elle devenue), la seule chose que src/ui prend à expo-router.
import Head from 'expo-router/head'
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
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
import type { Focusable } from './focus'
import { IconButton } from './IconButton'
import { NoticeScope } from './Notice'
import { ScreenFade } from './ScreenFade'
import { ScreenTopBar, type TopBarSpace } from './ScreenTopBar'
import { Surface } from './Surface'
import { useScreenFocused, useScreenShownCount } from './screenFocus'
import { type ScreenScroll, ScreenScrollContext, useScreenScrollChannel } from './scrollLight'
import { Text } from './Text'
import { useHasTabBarHost, useTabBarSpace } from './tabBarSpace'
import { ScreenAmbient, useAmbient, useHasAmbientHost } from './theme/ambient'
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
   * RF (ui-5) : garder `titleAside` en vue. Quand la barre est fixe (tablette, ordinateur) et que la
   * rangée du titre est passée dessous, l'élément quitte le titre pour la place sous la barre
   * (`belowBar`) ; il revient à côté du titre quand celui-ci redescend. Il n'existe qu'une fois dans
   * l'arbre : il est déplacé, pas copié. La rangée du titre garde sa hauteur pendant son absence :
   * rien ne remonte sous le doigt. Pour une page sans scène (`hero`).
   */
  keepAsideInView?: boolean
  /**
   * RF (ui-5) : la vue du titre, pour y poser le focus (après le bouton des nouveautés touché sous
   * la barre, le focus va au titre « Fil »).
   */
  titleRef?: Ref<Focusable>
  /**
   * RF : ce qui se pose sous la barre fixe, centré, par-dessus le contenu. Montré seulement quand la
   * barre est fixe ; quand elle suit le contenu (téléphone), rien.
   */
  belowBar?: ReactNode
  /**
   * RF : le contenu apparaît en fondu quand la page devient affichée, sur le web (vrai par défaut,
   * ui/ScreenFade.tsx). Faux : la page a son propre passage (un projet ouvert depuis une carte).
   */
  fade?: boolean
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
  keepAsideInView = false,
  titleRef,
  belowBar,
  fade = true,
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
  // « Réduire les animations » : un grand déplacement (remonter en haut) devient un saut.
  const calm = useCalmMotion()
  const toTop = useCallback(() => scroller.current?.scrollTo({ y: 0, animated: !calm }), [calm])
  // Le canal du défilement : `onScroll` de l'écran, et les composants posés dedans qui l'écoutent
  // (la lumière au défilement du fil, ui/scrollLight.ts) ; `toTop()` pour remonter en haut (RF).
  const scroll = useScreenScrollChannel(onScroll, toTop)
  // Une fois l'écran affiché dans le navigateur, la page peut passer au thème, à la largeur et à la
  // langue réels du visiteur (voir theme/hydration.ts).
  useEffect(() => markHydrated(), [])
  useBrowserLanguage()

  const brand = ambiance === 'brand'
  // Sur le miel, la carte arrive dès 1 000 points (`card`) ; ailleurs, avec la mise en colonnes.
  const withHero = hero !== undefined && (brand ? card : sizeClass === 'wide')
  // La barre « collée » d'un formulaire (`stickyHeader`) : hors de la zone qui défile, sur son fond
  // « feuille » opaque (ui-2). Sur le miel, pas de barre fixe : elle se poserait sur le dégradé,
  // hors de la feuille.
  const pinned = header !== undefined && stickyHeader && !brand
  // RF : toute autre barre du haut, hors du miel, passe par ScreenTopBar, posée par-dessus la zone
  // qui défile : fixe sur tablette et ordinateur, elle suit le contenu sur téléphone. Elle rend sa
  // place (`barSpace`) : sa hauteur, réservée en haut du contenu, et si elle est fixe.
  const hasHeader = header !== undefined && header !== null && header !== false
  const topBar = hasHeader && !stickyHeader && !brand
  const [barSpace, setBarSpace] = useState<TopBarSpace>(NO_BAR_SPACE)
  const barPinned = topBar && barSpace.pinned
  // Ce que la barre fixe couvre en haut de la fenêtre : la lumière qui suit le défilement cherche
  // son « milieu de l'écran » dessous (ui-15).
  useEffect(() => {
    scroll.channel.coveredTop.current = barPinned ? barSpace.height : 0
  }, [scroll.channel, barPinned, barSpace.height])
  // La place réservée en haut du contenu : sous la barre de ScreenTopBar, sa hauteur mesurée plus
  // l'écart d'avant entre la barre et le titre. Tant qu'elle n'est pas mesurée (le pré-rendu, la
  // première image), la place d'une barre vide : la marge du haut, et le même écart.
  const contentTop = topBar
    ? (barSpace.height > 0 ? barSpace.height : insets.top + space.lg) + space.xl
    : (pinned ? 0 : insets.top) + space.lg
  // ui-5 : `titleAside` passé sous la barre fixe, une fois le titre passé dessous.
  const aside = useAsideBelowBar({
    enabled: keepAsideInView && barPinned && Boolean(title) && Boolean(titleAside),
    scroll: scroll.channel,
    contentTop,
    covered: barSpace.height,
  })
  const asideAway = aside.below
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
  // RF : combien de fois la route de l'écran est devenue affichée (ui/screenFocus.ts). Chaque
  // arrivée date l'écran auprès de l'hôte de la lumière : la lumière dessinée est celle de l'écran
  // devenu affiché en dernier (ui-11).
  const shown = useScreenShownCount()
  // Sur le web, une lumière commune derrière toutes les pages (ui/AmbientHost.tsx) ?
  const lightHosted = useHasAmbientHost()
  // Sous la barre fixe : `titleAside` une fois le titre passé dessous (ui-5), sinon `belowBar`.
  const shownBelowBar = asideAway ? titleAside : belowBar
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
        <PageHeading
          title={title}
          aside={asideAway ? undefined : titleAside}
          subtitle={subtitle}
          titleRef={titleRef}
          {...(keepAsideInView
            ? {
                onLayout: aside.onHeadingLayout,
                onRowLayout: aside.onRowLayout,
                rowMinHeight: asideAway ? aside.rowHeight : undefined,
              }
            : null)}
        />
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
          de l'écran choisit par useAmbient()) et ses impulsions. Sur le web, dans l'hôte
          (ui/AmbientHost.tsx), l'écran s'inscrit à la lumière commune, qui prend la source de
          l'écran affiché ; un écran caché (la page restée montée sous la nouvelle) ne la change
          plus. Hors de l'hôte (téléphone, tests, catalogue), un fournisseur par écran, comme avant. */}
      <ScreenAmbient
        light={ambient && !brand}
        initialSource={thumbhash ? { thumbhash } : null}
        focused={focused}
        shown={shown}
      >
        <ScreenScrollContext.Provider value={scroll.channel}>
          <AmbientSourceSync thumbhash={thumbhash} held={scroll.channel.lightHeld} />
          {/* overflow: 'hidden' : rien ne dépasse de l'écran sur les côtés (pas de défilement
          horizontal). */}
          <View
            style={{
              flex: 1,
              // Sur le miel, le fond est celui de la feuille : ses coins du bas, arrondis, se fondent
              // dans le bas de l'écran. Dans l'hôte de la lumière, l'hôte pose le fond de l'appli,
              // sous la lumière commune : l'écran est transparent, sinon il la cacherait.
              backgroundColor: brand
                ? colors.surface
                : lightHosted
                  ? 'transparent'
                  : colors.background,
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
            {/* Le miel vif remplace la lumière d'ambiance : les deux ensemble se mêleraient. Dans
                l'hôte, la lumière est la sienne : l'écran n'en pose pas. */}
            {ambient && !brand && !lightHosted ? <AmbientLight /> : null}
            {topBar ? (
              // La barre du haut (RF), avant la zone qui défile dans l'arbre : lue et atteinte par
              // Tab d'abord (ui-4). Toujours à cette place, fixe ou non : passer de l'un à l'autre
              // ne la remonte pas (ui-10). `belowBar` seulement quand elle est fixe.
              <ScreenTopBar belowBar={barPinned ? shownBelowBar : undefined} onSpace={setBarSpace}>
                {header}
              </ScreenTopBar>
            ) : null}
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
                ref={scroller}
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                onScroll={scroll.handleScroll}
                scrollEventThrottle={SCROLL_EVENT_MS}
              >
                {/* Le fondu des pages : tout le miel est le contenu de la page. */}
                <ScreenFade fade={fade} style={styles.grow}>
                  <BrandAmbiance
                    header={brandHeader}
                    scene={scene}
                    hero={withHero ? hero : undefined}
                  >
                    {body}
                  </BrandAmbiance>
                </ScreenFade>
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
                  // Sur le web, le navigateur fait défiler le contrôle qui reçoit le focus (Tab,
                  // Maj+Tab) jusqu'entre ces marges : il ne finit caché ni sous la place flottante
                  // (`scroll-padding-bottom`), ni sous la barre fixe et ce qui se pose dessous
                  // (`scroll-padding-top`, jur-RF3). Les types de React Native ignorent ces deux
                  // propriétés ; react-native-web les transmet.
                  style={scrollPadding(floatingTop, barPinned ? barSpace.scrollPaddingTop : 0)}
                  contentContainerStyle={{
                    flexGrow: 1,
                    alignItems: 'center',
                    // Sous la barre de ScreenTopBar, sa hauteur mesurée (voir `contentTop`) ; sous
                    // une barre collée, l'encoche du téléphone est déjà dégagée par la barre.
                    paddingTop: contentTop,
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
                  {/* Le fondu des pages (RF) : autour du contenu seul, dans la zone qui défile. Il
                      prend la largeur du contenu, que la colonne de la zone qui défile centre ; il
                      s'étire en hauteur pour qu'un formulaire seul reste au milieu de l'écran. */}
                  <ScreenFade
                    fade={fade}
                    style={{
                      width: '100%',
                      maxWidth: withHero ? layout.maxContentWidth : maxWidthFor(width, false),
                      flexGrow: 1,
                    }}
                  >
                    {withHero ? (
                      // Grand écran avec une scène : la scène prend la place, la carte garde une largeur fixe.
                      <View
                        style={{
                          width: '100%',
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
                  </ScreenFade>
                </ScrollView>
                {pinnedFooter ? (
                  // Les boutons de la page font partie de son contenu : ils apparaissent avec lui,
                  // et ne prennent aucun clic tant qu'il n'est pas plein (S1).
                  <ScreenFade fade={fade}>
                    <ScreenFooter width={maxWidthFor(width, false)}>{footer}</ScreenFooter>
                  </ScreenFade>
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
      </ScreenAmbient>
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
  onLayout,
  onRowLayout,
  rowMinHeight,
  titleRef,
}: {
  title?: string | undefined
  /** La vue du titre, pour y poser le focus. */
  titleRef?: Ref<Focusable> | undefined
  aside?: ReactNode
  subtitle?: string | undefined
  /** Le niveau du titre : 1 dans une page ; 2 au catalogue, sous le titre de la page. */
  level?: 1 | 2
  /** RF (ui-5) : la place de l'en-tête dans la page, pour Screen (`keepAsideInView`). */
  onLayout?: ((event: LayoutChangeEvent) => void) | undefined
  /** RF (ui-5) : la place de la rangée du titre (le titre et ce qui est à côté), en tête de l'en-tête. */
  onRowLayout?: ((event: LayoutChangeEvent) => void) | undefined
  /**
   * RF (ui-5) : la hauteur gardée à la rangée du titre quand l'élément d'à côté est parti sous la
   * barre fixe : rien de ce qui suit ne remonte.
   */
  rowMinHeight?: number | undefined
}) {
  // La rangée du titre : avec l'élément d'à côté, ou sans lui mais à sa hauteur gardée.
  const row = Boolean(title) && (Boolean(aside) || rowMinHeight !== undefined)
  return (
    // L'écart entre le titre et le sous-titre est le seul `gap` de cette colonne (point des listes
    // R4 : 32 points sur le Fil, 8 ailleurs, quand le Fil avait son en-tête à lui).
    <View style={{ gap: space.sm }} onLayout={onLayout}>
      {row ? (
        // Le titre et l'élément posé à côté, sur une rangée : centrés l'un sur l'autre (le bouton
        // de 44 points dépasse de 3 points le titre de chaque côté), et sans marge ni remplissage
        // en haut ou en bas, pour ne rien ajouter à l'écart du sous-titre. `flexWrap` : à 320
        // points ou en grand texte, le bouton passe sous le titre au lieu de sortir de l'écran.
        <View
          onLayout={onRowLayout}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: space.md,
            ...(rowMinHeight !== undefined ? { minHeight: rowMinHeight } : null),
          }}
        >
          {/* Le titre peut rétrécir et passer à la ligne (sur le web, une vue ne rétrécit pas
              d'elle-même : flexShrink 0 par défaut). */}
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>
            <Text variant="title2" heading={level} focusRef={titleRef}>
              {title}
            </Text>
          </View>
          {/* L'élément à côté se replie lui aussi dans la largeur de l'écran quand il passe à la
              ligne (à 320 points et 200 % de texte, le bouton des nouveautés sortait à droite). */}
          {aside ? <View style={{ flexShrink: 1, maxWidth: '100%' }}>{aside}</View> : null}
        </View>
      ) : title ? (
        <Text variant="title2" heading={level} focusRef={titleRef}>
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

/**
 * Hook (RF, ui-5) : la rangée du titre est-elle passée sous la barre fixe ? Il lit la place de
 * l'en-tête dans la page et la hauteur de sa rangée (`onLayout`, rendus par PageHeading), puis
 * compare, à chaque défilement, le bas de la rangée au bas de la barre. Seul un changement redessine
 * l'écran. `contentTop` : la place réservée en haut du contenu ; `covered` : la hauteur de la barre.
 */
function useAsideBelowBar({
  enabled,
  scroll,
  contentTop,
  covered,
}: {
  enabled: boolean
  scroll: ScreenScroll
  contentTop: number
  covered: number
}) {
  // Les mesures et le dernier défilement : des refs, lues au défilement sans redessiner.
  const headingY = useRef(0)
  const lastScroll = useRef(0)
  const [rowHeight, setRowHeight] = useState(0)
  const [below, setBelow] = useState(false)
  // Le bas de la rangée du titre, compté depuis le haut du contenu : la place réservée, la place de
  // l'en-tête dans la colonne du contenu, puis la rangée (en tête de l'en-tête).
  const geometry = useRef({ contentTop, covered, rowHeight })
  geometry.current = { contentTop, covered, rowHeight }

  const decide = useCallback(() => {
    const { contentTop: top, covered: bar, rowHeight: height } = geometry.current
    // La rangée sort de la page par le haut quand son bas passe le bas de la barre. Sans mesure de
    // la rangée, rien ne bouge.
    const passed = height > 0 && lastScroll.current + bar >= top + headingY.current + height
    setBelow(passed)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setBelow(false)
      return
    }
    decide()
    return scroll.subscribe((event) => {
      lastScroll.current = Math.max(0, event.nativeEvent.contentOffset.y)
      decide()
    })
  }, [enabled, scroll, decide])

  // La rangée ne garde que sa dernière mesure non nulle : une page cachée mesure 0, et la rangée
  // sans l'élément d'à côté garde déjà la hauteur qu'elle avait avec lui.
  const onRowLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height)
    if (height > 0) setRowHeight((current) => (current === height ? current : height))
  }, [])
  const onHeadingLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout
      if (height <= 0) return
      headingY.current = y
      if (enabled) decide()
    },
    [enabled, decide],
  )
  // Une nouvelle mesure de la rangée ou de la barre peut changer la décision.
  // biome-ignore lint/correctness/useExhaustiveDependencies: les mesures relancent la décision
  useEffect(() => {
    if (enabled) decide()
  }, [enabled, decide, rowHeight, contentTop, covered])

  return { below: enabled && below, rowHeight, onRowLayout, onHeadingLayout }
}

/** La place de la barre du haut, avant sa première mesure. */
const NO_BAR_SPACE: TopBarSpace = { pinned: false, height: 0, scrollPaddingTop: 0 }

/**
 * Le style web de la zone qui défile : les marges du défilement au clavier, sous la barre fixe et
 * au-dessus de la place flottante (`scroll-padding-*`, que les types de React Native ignorent).
 */
const scrollPadding = (bottom: number, top: number): ViewStyle | undefined => {
  if (Platform.OS !== 'web' || (bottom <= 0 && top <= 0)) return undefined
  return {
    ...(bottom > 0 ? { scrollPaddingBottom: bottom + space.sm } : null),
    ...(top > 0 ? { scrollPaddingTop: top } : null),
  } as ViewStyle
}

const styles = StyleSheet.create({
  // Le fondu du miel : il prend toute la hauteur, comme le miel lui-même.
  grow: { flexGrow: 1 },
})

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
