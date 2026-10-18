// Le thème de l'appli : les couleurs et les ombres du jour ou de la nuit, selon l'apparence choisie.
// Le ThemeProvider est posé une fois autour de toute l'appli (app/_layout.tsx) ; chaque composant
// lit le thème avec useTheme(). Quand l'apparence change, tous les composants se redessinent d'un coup.
import {
  type Palette,
  palettes,
  type Scheme,
  type ShadowName,
  shadows as shadowSets,
} from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Platform, useColorScheme } from 'react-native'
import { type Appearance, loadAppearance, saveAppearance } from './appearance'
import { useHydrated } from './hydration'

export type Theme = {
  scheme: Scheme // 'day' ou 'night' : ce qui est réellement affiché
  colors: Palette
  shadows: Record<ShadowName, string>
  appearance: Appearance // le choix du membre : 'auto', 'day' ou 'night'
  setAppearance: (appearance: Appearance) => void
}

// Un « contexte » React : une valeur accessible à tous les composants placés à l'intérieur du
// Provider, sans la passer de main en main. null tant qu'aucun ThemeProvider n'est posé.
const ThemeContext = createContext<Theme | null>(null)

const makeTheme = (
  scheme: Scheme,
  appearance: Appearance,
  setAppearance: (appearance: Appearance) => void,
): Theme => ({
  scheme,
  colors: palettes[scheme],
  shadows: shadowSets[scheme],
  appearance,
  setAppearance,
})

type Props = {
  children: ReactNode
  /** Pour les tests et le catalogue : impose une apparence sans lire ni écrire le stockage. */
  appearance?: Appearance
}

export function ThemeProvider({ children, appearance: forced }: Props) {
  // useColorScheme : le réglage clair / sombre de l'appareil, mis à jour s'il change en cours de route.
  const system = useColorScheme()
  const [chosen, setChosen] = useState<Appearance>(forced ?? 'auto')

  // Au démarrage, on relit le choix mémorisé sur cet appareil.
  useEffect(() => {
    if (forced) return
    let active = true // évite de modifier l'état si le composant a disparu entre-temps
    void loadAppearance().then((stored) => {
      if (active) setChosen(stored)
    })
    return () => {
      active = false
    }
  }, [forced])

  // useCallback garde la même fonction d'un affichage à l'autre : les composants qui la reçoivent
  // ne se redessinent pas pour rien.
  const setAppearance = useCallback(
    (next: Appearance) => {
      setChosen(next)
      if (!forced) void saveAppearance(next)
    },
    [forced],
  )

  const appearance = forced ?? chosen
  const wanted: Scheme = appearance === 'auto' ? (system === 'dark' ? 'night' : 'day') : appearance
  // Sur le web, la page préparée par le serveur est en jour : on l'affiche d'abord telle quelle,
  // puis on passe à la nuit si besoin, juste après (voir hydration.ts).
  const hydrated = useHydrated()
  const scheme: Scheme = hydrated || forced ? wanted : 'day'

  // useMemo : on ne refabrique le thème que si l'une de ces valeurs change.
  const theme = useMemo(
    () => makeTheme(scheme, appearance, setAppearance),
    [scheme, appearance, setAppearance],
  )

  // Sur le web, le fond de la page et les barres de défilement suivent aussi le thème
  // (on les voit quand on « tire » la page au-delà de son bord).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    document.documentElement.style.colorScheme = scheme === 'night' ? 'dark' : 'light'
    document.body.style.backgroundColor = theme.colors.background
    // La couleur de l'anneau de focus (dessiné par une seule règle CSS, dans app/+html.tsx) : une
    // « variable CSS » que la règle lit, et qui suit le thème choisi dans l'appli.
    document.documentElement.style.setProperty('--focus-ring', theme.colors.focusRing)
    // La page est dans son vrai thème : elle peut se montrer (voir documentCss, theme/document.ts).
    if (hydrated) document.documentElement.setAttribute('data-hydrated', '')
  }, [scheme, theme.colors.background, theme.colors.focusRing, hydrated])

  // Filet de sécurité : si une page ne signalait jamais son hydratation, elle ne doit pas rester
  // cachée de nuit (voir documentCss). Au bout de quelques secondes, on la montre quoi qu'il arrive.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const timer = setTimeout(() => document.documentElement.setAttribute('data-hydrated', ''), 3000)
    return () => clearTimeout(timer)
  }, [])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

const noop = () => {}

/**
 * Hook : le thème en cours. Sans ThemeProvider autour (un test qui affiche un seul composant),
 * on suit simplement le réglage de l'appareil.
 */
export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext)
  const system = useColorScheme()
  return theme ?? makeTheme(system === 'dark' ? 'night' : 'day', 'auto', noop)
}
