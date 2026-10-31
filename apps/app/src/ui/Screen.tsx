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
import { type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBrowserLanguage } from '../i18n'
import { AmbientLight } from './AmbientLight'
import { BrandAmbiance } from './BrandAmbiance'
import { IconButton } from './IconButton'
import { NoticeScope } from './Notice'
import { Surface } from './Surface'
import { useScreenFocused } from './screenFocus'
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
}

export function Screen({
  title,
  pageTitle,
  subtitle,
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
  const backButton = onBack ? (
    <IconButton icon="arrow-left" label={t(($) => $.common.back)} onPress={onBack} />
  ) : null
  // R3 (« le Retour au même endroit », point des listes) : sur le miel, le retour se pose en tête de
  // la barre de BrandAmbiance, à gauche, et l'en-tête de l'écran (la langue) à droite. Dans la
  // feuille, sa place dépendait du décor (téléphone) et de la hauteur du contenu (la carte centrée
  // sur ordinateur) : il changeait de place d'une page du compte à l'autre. Mesuré par l'ui-dev R :
  // (16, 16) à 390 px et (32, 48) à 1280 px sur les quatre pages, premier arrêt de Tab partout.
  const brandHeader =
    brand && backButton ? (
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
        <View style={{ gap: space.sm }}>
          {title ? (
            // Le titre de la page : niveau 1 (ses sections sont de niveau 2).
            <Text variant="title2" heading={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
        </View>
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
        <AmbientSourceSync thumbhash={thumbhash} />
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
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              <BrandAmbiance header={brandHeader} scene={scene} hero={withHero ? hero : undefined}>
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
                contentContainerStyle={{
                  flexGrow: 1,
                  alignItems: 'center',
                  // Sous une barre fixe, l'encoche du téléphone est déjà dégagée par la barre.
                  paddingTop: (pinned ? 0 : insets.top) + space.lg,
                  // Au-dessus d'un pied collé, la marge du bas de l'écran est déjà prise par le pied.
                  // Sous la barre d'onglets, la fin du contenu dépasse d'elle : sa hauteur (marge du
                  // bas de l'appareil comprise) plus un peu d'air.
                  paddingBottom: pinnedFooter
                    ? space.xl
                    : tabBar.height > 0
                      ? tabBar.height + space.xl
                      : insets.bottom + space.huge,
                  paddingHorizontal: padding,
                  gap: space.xl,
                }}
                keyboardShouldPersistTaps="handled"
              >
                {/* La barre du haut a toujours la même largeur, quelle que soit celle du contenu : elle ne
            change pas de taille d'une page à l'autre. */}
                {header && !pinned ? (
                  <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>{header}</View>
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
        </View>
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
 * Passe le visuel de l'écran (`thumbhash`) à la lumière quand il change : un projet chargé après
 * l'ouverture de sa page fait glisser la lumière du miel vers ses couleurs. Au premier affichage,
 * le fournisseur l'a déjà (initialSource) : rien ne glisse.
 */
function AmbientSourceSync({ thumbhash }: { thumbhash: string | null }) {
  const { setSource } = useAmbient()
  useEffect(() => {
    setSource(thumbhash ? { thumbhash } : null)
  }, [setSource, thumbhash])
  return null
}

// Un onglet n'affiche qu'une trentaine de caractères : au-delà de 60, le titre est abrégé (« … »),
// pour qu'un titre de projet ou d'étiquette très long n'encombre pas l'historique du navigateur.
const TAB_TITLE_MAX = 60
const shorten = (text: string) =>
  text.length > TAB_TITLE_MAX ? `${text.slice(0, TAB_TITLE_MAX - 1).trimEnd()}…` : text

const maxWidthFor = (width: 'form' | 'page', withHero: boolean) =>
  width === 'page' || withHero ? layout.maxContentWidth : layout.formWidth
