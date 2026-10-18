// La mise en page commune aux écrans : le fond, la lumière d'ambiance, les marges, la largeur
// maximale du contenu, le défilement et, en option, une barre en haut, un bouton de retour, un titre
// et un sous-titre.
// `children` désigne ce qu'on place entre <Screen> et </Screen> : le contenu propre à chaque écran.
//
// Sur un grand écran, un écran peut montrer une « scène » (`hero`) à gauche et son contenu dans une
// carte à droite : c'est la mise en page de l'accueil et de la connexion sur ordinateur.
import { borders, layout, space } from '@ruche/brand'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBrowserLanguage } from '../i18n'
import { AmbientLight } from './AmbientLight'
import { IconButton } from './IconButton'
import { Surface } from './Surface'
import { Text } from './Text'
import { markHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  title?: string
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
  subtitle,
  children,
  header,
  stickyHeader = false,
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
  // Le contenu propre à l'écran, précédé du retour, du titre et du sous-titre.
  const body = (
    <>
      {onBack ? <IconButton icon="arrow-left" label={t('common.back')} onPress={onBack} /> : null}
      {title || subtitle ? (
        <View style={{ gap: space.sm }}>
          {title ? (
            <Text variant="title2" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  )

  const pinned = header !== undefined && stickyHeader
  return (
    // overflow: 'hidden' : rien ne dépasse de l'écran sur les côtés (pas de défilement horizontal).
    <View style={{ flex: 1, backgroundColor: colors.background, overflow: 'hidden' }}>
      {ambient ? <AmbientLight thumbhash={thumbhash} /> : null}
      {pinned ? (
        // La barre fixe, hors de la zone qui défile. Son fond plein cache le contenu qui passe dessous.
        <View
          style={{
            paddingTop: insets.top + space.sm,
            paddingBottom: space.sm,
            paddingHorizontal: padding,
            alignItems: 'center',
            backgroundColor: colors.background,
            borderBottomWidth: borders.hairline,
            borderBottomColor: colors.line,
          }}
        >
          <View style={{ width: '100%', maxWidth: maxWidthFor(width, withHero) }}>{header}</View>
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
        {header && !pinned ? (
          <View style={{ width: '100%', maxWidth: maxWidthFor(width, withHero) }}>{header}</View>
        ) : null}
        {withHero ? (
          // Grand écran avec une scène : la scène prend la place, la carte garde une largeur fixe.
          <View
            style={{
              width: '100%',
              maxWidth: layout.maxContentWidth,
              flexGrow: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.huge,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>{hero}</View>
            <View style={{ width: layout.formWidth - 80 }}>
              <Surface variant="panel" radius="sheet" padding="xxl" gap="xl">
                {body}
              </Surface>
            </View>
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
  )
}

const maxWidthFor = (width: 'form' | 'page', withHero: boolean) =>
  width === 'page' || withHero ? layout.maxContentWidth : layout.formWidth
