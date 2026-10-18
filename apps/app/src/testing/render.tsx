// Outils partagés par les tests d'écrans : affiche un écran avec tout ce dont il a besoin autour
// (traductions, cache des données de l'API), comme dans la vraie appli.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Dimensions } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSession } from '../accounts/api'
import { createI18n } from '../i18n'
import type { Appearance } from '../ui/theme/appearance'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

// Les dimensions d'un téléphone, sans encoche : les écrans n'ont pas d'appareil réel à mesurer.
const phone = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

/**
 * Affiche un écran dans une langue donnée (et, si besoin, une apparence). Renvoie aussi l'instance
 * i18n et le cache de requêtes (neufs à chaque test), pour que le test puisse les inspecter.
 */
export const renderWithProviders = async (
  ui: ReactElement,
  language: 'fr' | 'en' = 'fr',
  // Sans apparence imposée, le thème fait comme dans l'appli : « Automatique », qu'on peut changer.
  appearance?: Appearance,
) => {
  const i18n = createI18n(language)
  // retry: false : en test, une requête qui échoue ne doit pas être retentée trois fois.
  const queryClient = new QueryClient({
    // gcTime: Infinity : pas de minuterie de nettoyage du cache, qui empêcherait Jest de s'arrêter.
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const result = await render(
    <SafeAreaProvider initialMetrics={phone}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider {...(appearance ? { appearance } : null)}>{ui}</ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  )
  return { ...result, i18n, queryClient }
}

/** Ancien nom, gardé pour les tests de la tranche 1. */
export const renderWithI18n = renderWithProviders

/**
 * Fait croire aux écrans qu'un membre est connecté (ou personne, avec null).
 * À utiliser dans un fichier de test qui remplace '../accounts/api' par jest.mock.
 * Le « as unknown as » force le type : on ne fournit que les champs utiles au test.
 * Renvoie la fausse fonction refetch (relire la session), pour vérifier qu'elle a été appelée.
 */
export const mockSession = (data: { user: Record<string, unknown> } | null, isPending = false) => {
  const refetch = jest.fn().mockResolvedValue(undefined)
  jest
    .mocked(useSession)
    .mockReturnValue({ data, isPending, refetch } as unknown as ReturnType<typeof useSession>)
  return { refetch }
}

/**
 * Le temps d'un test, une fenêtre d'ordinateur (1440 × 900) au lieu du téléphone de jest.setup.ts :
 * pour vérifier ce qui n'existe que sur grand écran (barre du haut, colonnes). Renvoie la fonction
 * qui remet le téléphone, à appeler à la fin du test.
 */
export const setDesktopWindow = () => {
  const desktop = { width: 1440, height: 900, scale: 2, fontScale: 1 }
  const phoneWindow = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window: desktop, screen: desktop })
  return () => Dimensions.set({ window: phoneWindow, screen: phoneWindow })
}
