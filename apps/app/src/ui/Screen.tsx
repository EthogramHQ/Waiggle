// La mise en page commune aux écrans : le fond, la lumière d'ambiance, les marges, la largeur
// maximale du contenu, le défilement et, en option, une barre en haut, un bouton de retour, un titre
// et un sous-titre.
// `children` désigne ce qu'on place entre <Screen> et </Screen> : le contenu propre à chaque écran.
//
// Sur un grand écran, un écran peut montrer une « scène » (`hero`) à gauche et son contenu dans une
// carte à droite : c'est la mise en page de l'accueil et de la connexion sur ordinateur.
import { appName, borders, layout, space } from '@ruche/brand'
// Head vient d'expo-router, mais ne navigue pas : il remplit seulement l'en-tête du document web
// (le titre de l'onglet). C'est la seule chose que src/ui prend à expo-router.
import Head from 'expo-router/head'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBrowserLanguage } from '../i18n'
import { AmbientLight } from './AmbientLight'
import { IconButton } from './IconButton'
import { NoticeScope } from './Notice'
import { Surface } from './Surface'
import { Text } from './Text'
import { markHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
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
  width = 'form',
  hero,
  ambient = true,
  thumbhash = null,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const { padding, sizeClass } = useLayout()
  // Les « marges de sécurité » : la place prise par l'encoche, l'heure, la barre du bas du téléphone.
  const insets = useSafeAreaInsets()
  // Une fois l'écran affiché dans le navigateur, la page peut passer au thème, à la largeur et à la
  // langue réels du visiteur (voir theme/hydration.ts).
  useEffect(() => markHydrated(), [])
  useBrowserLanguage()

  const withHero = hero !== undefined && sizeClass === 'wide'
  const pinned = header !== undefined && stickyHeader
  // Le contenu propre à l'écran, précédé du retour, du titre et du sous-titre.
  const body = (
    <>
      {onBack ? <IconButton icon="arrow-left" label={t('common.back')} onPress={onBack} /> : null}
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
      {/* overflow: 'hidden' : rien ne dépasse de l'écran sur les côtés (pas de défilement
          horizontal). */}
      <View style={{ flex: 1, backgroundColor: colors.background, overflow: 'hidden' }}>
        {/* Head place son contenu dans l'en-tête de la page web (la balise <title> de l'onglet). Sur
          téléphone, il n'y a pas d'onglet : rien à faire. */}
        {Platform.OS === 'web' ? (
          <Head>
            <title>{tabTitle}</title>
          </Head>
        ) : null}
        {ambient ? <AmbientLight thumbhash={thumbhash} /> : null}
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
            <View style={{ width: '100%', maxWidth: maxWidthFor(width, withHero), gap: space.sm }}>
              {header}
              {notice}
            </View>
          </View>
        ) : null}
        {/* ScrollView : l'écran défile si le contenu dépasse (petit téléphone, clavier ouvert). */}
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            // Sous une barre fixe, l'encoche du téléphone est déjà dégagée par la barre.
            paddingTop: (pinned ? 0 : insets.top) + space.lg,
            paddingBottom: insets.bottom + space.huge,
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
      </View>
    </NoticeScope>
  )
}

// Un onglet n'affiche qu'une trentaine de caractères : au-delà de 60, le titre est abrégé (« … »),
// pour qu'un titre de projet ou d'étiquette très long n'encombre pas l'historique du navigateur.
const TAB_TITLE_MAX = 60
const shorten = (text: string) =>
  text.length > TAB_TITLE_MAX ? `${text.slice(0, TAB_TITLE_MAX - 1).trimEnd()}…` : text

const maxWidthFor = (width: 'form' | 'page', withHero: boolean) =>
  width === 'page' || withHero ? layout.maxContentWidth : layout.formWidth
