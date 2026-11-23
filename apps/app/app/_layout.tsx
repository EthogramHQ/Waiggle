// Mise en page racine de l'appli. Avec Expo Router, chaque fichier du dossier app/ est une page
// (app/index.tsx = la page d'accueil). _layout.tsx enveloppe toutes les pages : c'est l'endroit
// où l'on installe ce qui sert partout : les traductions, le cache des données de l'API, le thème
// (couleurs du jour ou de la nuit) et les polices.
import { defaultLanguage } from '@ruche/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Platform } from 'react-native'
import { useMemberMarkerSync } from '../src/accounts/memberMarker'
import { queryClient } from '../src/api/query-client'
import { PollenGainHost } from '../src/gamification/PollenGainHost'
import { createI18n, detectLanguage } from '../src/i18n'
import { AppTabBar } from '../src/navigation/AppTabBar'
import { EditorPreload } from '../src/navigation/chunks/preload'
import { sheetRoutes } from '../src/navigation/sheetRoutes'
import { LanguageSync } from '../src/profile/LanguageSync'
import { ProvisionalNameGate } from '../src/profile/ProvisionalNameGate'
import { RulesGate } from '../src/rules/RulesGate'
import {
  AmbientHost,
  hostedNavigationTheme,
  usePageStackOptions,
  useTabScreenOptions,
} from '../src/ui/AmbientHost'
import { CoverTransitionProvider } from '../src/ui/coverTransition'
import { HoneyWaveHost } from '../src/ui/HoneyWaveHost'
import { LaunchScreen } from '../src/ui/LoadingLogo'
import { TabBarHost } from '../src/ui/TabBar'
import { useAppFonts } from '../src/ui/theme/fonts'
import { ThemeProvider, useTheme } from '../src/ui/theme/ThemeProvider'
import { ToastProvider } from '../src/ui/theme/toast'

const isWeb = Platform.OS === 'web'
// Sur le web, le thème de la navigation de l'hôte de la lumière (ui/AmbientHost.tsx).
const webNavigationTheme = hostedNavigationTheme(DefaultTheme)
// Les routes qui sont des feuilles (R6a) : voir ThemedChrome.
const sheetRoute = { presentation: 'transparentModal', animation: 'none' } as const
// Les routes des quatre onglets (R17) : voir ThemedChrome.
const tabRoutes = ['feed', 'explore', 'hives', 'me'] as const

export default function RootLayout() {
  // Sur le web, les pages sont préparées à l'avance (« pré-rendues ») en français, puis passent à la
  // langue du visiteur une fois chargées. Ainsi le HTML préparé et le premier affichage concordent.
  // useState(() => …) ne crée l'instance qu'une seule fois, au premier affichage.
  const [i18n] = useState(() => createI18n(isWeb ? defaultLanguage : detectLanguage()))
  // Les polices de l'appli (voir useAppFonts dans src/ui/theme/fonts.ts). Sur le web, Funnel est
  // déclarée dans la page dès sa préparation, Geist Mono demandée après l'hydratation ; sur
  // téléphone, toutes d'emblée, et on attend qu'elles soient prêtes avant d'afficher.
  const fontsLoaded = useAppFonts()

  // useEffect s'exécute après l'affichage : c'est là qu'on peut toucher au navigateur.
  useEffect(() => {
    if (!isWeb) return
    // L'attribut lang de la page aide les lecteurs d'écran et les outils de traduction.
    const apply = (language: string) => {
      document.documentElement.lang = language
    }
    i18n.on('languageChanged', apply)
    // Le passage à la langue du navigateur se fait plus tard, une fois la page entière hydratée :
    // voir useBrowserLanguage dans src/i18n.ts.
    apply(i18n.language)
    // La fonction renvoyée « nettoie » : elle se désabonne si la mise en page disparaît.
    return () => i18n.off('languageChanged', apply)
  }, [i18n])

  // Sur téléphone, tant que les polices chargent : l'écran du lancement, le logo animé sur le fond
  // de l'appli (plutôt qu'un écran vide). Il a besoin des traductions (son nom pour les lecteurs
  // d'écran) et du thème : il se pose donc à la place de la navigation, dans les fournisseurs. Sur
  // le web, rien de plus : la page est pré-rendue, son texte s'écrit d'abord dans une police du
  // système (`font-display: swap`), puis dans celles de la marque à leur arrivée.
  const launching = !isWeb && !fontsLoaded

  return (
    // Les « Provider » rendent une ressource disponible à tous les écrans placés à l'intérieur,
    // sans avoir à la passer de main en main : ici le cache de l'API, puis les traductions.
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          {/* Applique la langue enregistrée sur le compte du membre connecté */}
          <LanguageSync />
          {/* R12 : sur le web, le marqueur `waiggle_member` suit la session (posé, effacé), pour
              que le serveur envoie au Fil un membre qui arrive sur `/`. */}
          <MemberMarkerSync />
          {/* R13 : le morceau de l'éditeur, demandé d'avance pour un membre (web). */}
          <EditorPreload />
          {/* R3 : la barre d'onglets du téléphone, posée une seule fois au-dessus de toutes les pages,
              pour que sa goutte glisse d'un onglet à l'autre. AppTabBar décide où elle se montre ;
              TabBarHost mesure sa hauteur et la donne aux écrans (la place à réserver en bas) et
              aux toasts, qui vivent donc à l'intérieur pour ne jamais la couvrir. */}
          {/* R17 : la vague de miel à l'entrée (connexion, « Continuer » après la vérification),
              posée une fois au-dessus de tout, barre d'onglets et toasts compris. */}
          <HoneyWaveHost>
            <TabBarHost bar={launching ? null : <AppTabBar />}>
              {/* Les toasts (« Projet publié ») : un seul à la fois, posé au-dessus de tous les écrans. */}
              <ToastProvider>
                {/* R4 : la carte qui devient la page. Le fournisseur garde le cadre de la photo
                  touchée, que la page du projet lit pour la faire grandir depuis la carte. */}
                <CoverTransitionProvider>
                  {/* R9 : la feuille du nom ou du pseudo provisoire, au-dessus de l'appli, après le
                    lancement. R11 : l'écran « Accepter » des règles, au-dessus de tout tant que le
                    membre n'a pas accepté la version en vigueur ; la feuille du pseudo l'attend. */}
                  {launching ? (
                    <LaunchScreen />
                  ) : (
                    <>
                      <ThemedChrome />
                      <RulesGate />
                      <ProvisionalNameGate />
                    </>
                  )}
                </CoverTransitionProvider>
                {/* R19 : la pastille « +3 pollen » des gestes sans place à eux (suivre, publier,
                    une ruche…), à la place du toast ; elle attend qu'un toast affiché parte. */}
                <PollenGainHost />
              </ToastProvider>
            </TabBarHost>
          </HoneyWaveHost>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

/**
 * Composant invisible : il ne fait que monter le hook du marqueur de membre. Un composant à part
 * plutôt qu'un appel dans RootLayout : un changement de session redessine ce seul composant, pas
 * toute l'appli.
 */
function MemberMarkerSync() {
  useMemberMarkerSync()
  return null
}

/** La barre d'état (heure, batterie) et la navigation, aux couleurs du thème en cours. */
function ThemedChrome() {
  const { scheme } = useTheme()
  // Stack : navigation en pile, chaque nouvelle page s'empile sur la précédente. Sur le web, les
  // pages sont transparentes : la lumière commune de l'hôte se voit derrière elles. Sur téléphone,
  // chaque page garde le fond de l'appli (et sa propre lumière, ui/Screen.tsx).
  const screenOptions = usePageStackOptions()
  const tabOptions = useTabScreenOptions()
  const stack = (
    <Stack screenOptions={screenOptions}>
      {/* R17 : sur iOS et Android, les quatre onglets se fondent l'un dans l'autre (des pages
          sœurs) ; les autres pages glissent comme le veut le système. */}
      {tabRoutes.map((name) => (
        <Stack.Screen key={name} name={name} options={tabOptions} />
      ))}
      {/* Les feuilles (R6a à R10) : publier, modifier, une mise à jour, un appel ou un retour de
          testeur, signaler, suspendre, créer une ruche, inviter. Chacune est posée sur la page d'où
          l'on vient : une fenêtre transparente (`transparentModal`) garde cette page dessinée
          dessous, et la feuille anime elle-même son entrée (`animation: 'none'`) ; son adresse à elle
          donne au Retour du navigateur de quoi la fermer. Ouverte sans page d'avant, la feuille pose
          le fil dessous (ProjectFormScreen) : pas d'`initialRouteName` ici, qui ferait croire à toutes
          les pages qu'elles ont une page d'avant (relecture du plan R6a, ui-I1). La liste vit dans
          navigation/sheetRoutes.ts : les passages de page (R17) la lisent aussi. */}
      {sheetRoutes.map((name) => (
        <Stack.Screen key={name} name={name} options={sheetRoute} />
      ))}
    </Stack>
  )
  return (
    <>
      {/* Texte clair sur fond de nuit, foncé sur fond de jour. */}
      <StatusBar style={scheme === 'night' ? 'light' : 'dark'} />
      {/* RF : sur le web, une seule lumière d'ambiance, posée sous toutes les pages : elle continue
          d'une page à l'autre au lieu de repartir de zéro (ui/AmbientHost.tsx). */}
      {isWeb ? (
        <AmbientHost>
          {/* Le thème de la navigation, au fond transparent : sinon la pile peint ses cadres de
              son gris par défaut, par-dessus la lumière et le fond de l'hôte. */}
          <NavigationThemeProvider value={webNavigationTheme}>{stack}</NavigationThemeProvider>
        </AmbientHost>
      ) : (
        stack
      )}
    </>
  )
}
