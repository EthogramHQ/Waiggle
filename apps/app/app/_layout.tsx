// Mise en page racine de l'appli. Avec Expo Router, chaque fichier du dossier app/ est une page
// (app/index.tsx = la page d'accueil). _layout.tsx enveloppe toutes les pages : c'est l'endroit
// où l'on installe ce qui sert partout : les traductions, le cache des données de l'API, le thème
// (couleurs du jour ou de la nuit) et les polices.
import { defaultLanguage } from '@ruche/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Platform } from 'react-native'
import { queryClient } from '../src/api/query-client'
import { createI18n, detectLanguage } from '../src/i18n'
import { AppTabBar } from '../src/navigation/AppTabBar'
import { LanguageSync } from '../src/profile/LanguageSync'
import { AmbientHost, hostedNavigationTheme, hostedStackStyle } from '../src/ui/AmbientHost'
import { CoverTransitionProvider } from '../src/ui/coverTransition'
import { LaunchScreen } from '../src/ui/LoadingLogo'
import { TabBarHost } from '../src/ui/TabBar'
import { fontFiles } from '../src/ui/theme/fonts'
import { ThemeProvider, useTheme } from '../src/ui/theme/ThemeProvider'
import { ToastProvider } from '../src/ui/theme/toast'

const isWeb = Platform.OS === 'web'
// Sur le web, le thème de la navigation de l'hôte de la lumière (ui/AmbientHost.tsx).
const webNavigationTheme = hostedNavigationTheme(DefaultTheme)
// Les routes qui sont des feuilles (R6a) : voir ThemedChrome.
const sheetRoute = { presentation: 'transparentModal', animation: 'none' } as const

export default function RootLayout() {
  // Sur le web, les pages sont préparées à l'avance (« pré-rendues ») en français, puis passent à la
  // langue du visiteur une fois chargées. Ainsi le HTML préparé et le premier affichage concordent.
  // useState(() => …) ne crée l'instance qu'une seule fois, au premier affichage.
  const [i18n] = useState(() => createI18n(isWeb ? defaultLanguage : detectLanguage()))
  // Les polices de l'appli (voir src/ui/theme/fonts.ts). Sur le web, elles sont déclarées dans la
  // page dès sa préparation ; sur téléphone, on attend qu'elles soient prêtes avant d'afficher.
  const [fontsLoaded] = useFonts(fontFiles)

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
  // le web, rien de plus : la page est pré-rendue, ses polices déclarées dans la page.
  const launching = !fontsLoaded && !isWeb

  return (
    // Les « Provider » rendent une ressource disponible à tous les écrans placés à l'intérieur,
    // sans avoir à la passer de main en main : ici le cache de l'API, puis les traductions.
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          {/* Applique la langue enregistrée sur le compte du membre connecté */}
          <LanguageSync />
          {/* R3 : la barre d'onglets du téléphone, posée une seule fois au-dessus de toutes les pages,
              pour que sa goutte glisse d'un onglet à l'autre. AppTabBar décide où elle se montre ;
              TabBarHost mesure sa hauteur et la donne aux écrans (la place à réserver en bas) et
              aux toasts, qui vivent donc à l'intérieur pour ne jamais la couvrir. */}
          <TabBarHost bar={launching ? null : <AppTabBar />}>
            {/* Les toasts (« Projet publié ») : un seul à la fois, posé au-dessus de tous les écrans. */}
            <ToastProvider>
              {/* R4 : la carte qui devient la page. Le fournisseur garde le cadre de la photo
                  touchée, que la page du projet lit pour la faire grandir depuis la carte. */}
              <CoverTransitionProvider>
                {launching ? <LaunchScreen /> : <ThemedChrome />}
              </CoverTransitionProvider>
            </ToastProvider>
          </TabBarHost>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

/** La barre d'état (heure, batterie) et la navigation, aux couleurs du thème en cours. */
function ThemedChrome() {
  const { scheme, colors } = useTheme()
  // Stack : navigation en pile, chaque nouvelle page s'empile sur la précédente. Sur le web, les
  // pages sont transparentes : la lumière commune de l'hôte se voit derrière elles. Sur téléphone,
  // chaque page garde le fond de l'appli (et sa propre lumière, ui/Screen.tsx).
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: isWeb ? hostedStackStyle : { backgroundColor: colors.background },
      }}
    >
      {/* R6a : publier et modifier sont des feuilles posées sur la page d'où l'on vient. Une
          fenêtre transparente (`transparentModal`) garde cette page dessinée dessous ; la feuille
          anime elle-même son entrée (`animation: 'none'`). Ouverte sans page d'avant, la feuille
          pose le fil dessous (ProjectFormScreen) : pas d'`initialRouteName` ici, qui ferait
          croire à toutes les pages qu'elles ont une page d'avant (relecture du plan, ui-I1). */}
      <Stack.Screen name="projects/new" options={sheetRoute} />
      <Stack.Screen name="projects/[id]/edit" options={sheetRoute} />
      {/* R7a : la feuille « Nouvelle mise à jour », posée de même sur la page du projet. */}
      <Stack.Screen name="projects/[id]/update" options={sheetRoute} />
      {/* R7b : les feuilles « Nouvel appel » et « Ton retour », posées de même sur le coin des
          testeurs : leur adresse à elles, et donc le Retour du navigateur pour les fermer. */}
      <Stack.Screen name="projects/[id]/testers/new-call" options={sheetRoute} />
      <Stack.Screen name="projects/[id]/testers/new-feedback" options={sheetRoute} />
      {/* R9 : « Signaler » est une feuille posée sur la page du contenu signalé (le Retour du
          navigateur la ferme, la page d'où l'on vient reste dessinée dessous). */}
      <Stack.Screen name="report" options={sheetRoute} />
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
