// Le thème de l'appli : les couleurs et les ombres du jour ou de la nuit, selon l'apparence choisie.
// Le ThemeProvider est posé une fois autour de toute l'appli (app/_layout.tsx) ; chaque composant
// lit le thème avec useTheme(). Quand l'apparence change, tous les composants se redessinent d'un
// coup ; sur le web, les fonds, bordures et ombres passent de l'un à l'autre en fondu (600 ms), le
// texte non (voir documentCss, theme/document.ts). Sur téléphone, le changement reste immédiat.
// Un ThemeProvider peut aussi se poser dans un autre, avec une apparence imposée (le catalogue
// montre une matière de nuit à côté de celle du jour) : celui du dedans ne touche pas à la page.
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Platform, useColorScheme } from 'react-native'
import { type Appearance, loadAppearance, saveAppearance } from './appearance'
import { focusHalo, SCHEME_FADE_MS, SCHEME_FADING } from './document'
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
  // Seul le ThemeProvider le plus extérieur règle la page web (fond, focus, fondu) : un autre, posé
  // dedans, ne colore que ce qu'il entoure.
  const nested = useContext(ThemeContext) !== null
  const ownsDocument = Platform.OS === 'web' && !nested && typeof document !== 'undefined'
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

  // Le fondu entre le jour et la nuit (web). On pose data-scheme-fading sur <html> le temps du
  // fondu, et seulement ce temps : posée en permanence, la règle ferait aussi fondre chaque survol.
  // useLayoutEffect, et non useEffect : il passe juste après que React a changé les couleurs dans
  // la page, avant que le navigateur ne la redessine. Le navigateur voit donc en même temps les
  // nouvelles couleurs et la règle du fondu, et lance les transitions (avec useEffect, il aurait
  // parfois déjà dessiné les nouvelles couleurs d'un coup).
  // Pas de fondu au démarrage : la page de nuit, cachée jusqu'à l'hydratation, se montre d'emblée
  // dans son thème (voir documentCss) ; la faire fondre depuis le jour serait un éclair blanc lent.
  const shown = useRef({ scheme, hydrated })
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useLayoutEffect(() => {
    const before = shown.current
    shown.current = { scheme, hydrated }
    if (!ownsDocument || !before.hydrated || before.scheme === scheme) return
    const root = document.documentElement
    root.setAttribute(SCHEME_FADING, '')
    // Un second changement pendant le fondu le prolonge : on repart pour une durée entière.
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      root.removeAttribute(SCHEME_FADING)
      fadeTimer.current = null
    }, SCHEME_FADE_MS)
  }, [scheme, hydrated, ownsDocument])
  // En partant (fin d'un test), on ne laisse ni minuteur ni fondu derrière soi.
  useEffect(
    () => () => {
      if (!fadeTimer.current) return
      clearTimeout(fadeTimer.current)
      document.documentElement.removeAttribute(SCHEME_FADING)
    },
    [],
  )

  // Sur le web, le fond de la page et les barres de défilement suivent aussi le thème
  // (on les voit quand on « tire » la page au-delà de son bord).
  useEffect(() => {
    if (!ownsDocument) return
    document.documentElement.style.colorScheme = scheme === 'night' ? 'dark' : 'light'
    document.body.style.backgroundColor = theme.colors.background
    // Les couleurs de l'anneau de focus et de son halo (dessinés par une seule règle CSS, dans
    // app/+html.tsx) : des « variables CSS » que la règle lit, et qui suivent le thème choisi.
    document.documentElement.style.setProperty('--focus-ring', theme.colors.focusRing)
    document.documentElement.style.setProperty('--focus-halo', focusHalo(theme.colors))
    // La page est dans son vrai thème : elle peut se montrer (voir documentCss, theme/document.ts).
    if (hydrated) document.documentElement.setAttribute('data-hydrated', '')
  }, [scheme, theme.colors, hydrated, ownsDocument])

  // Filet de sécurité : si une page ne signalait jamais son hydratation, elle ne doit pas rester
  // cachée de nuit (voir documentCss). Au bout de quelques secondes, on la montre quoi qu'il arrive.
  useEffect(() => {
    if (!ownsDocument) return
    const timer = setTimeout(() => document.documentElement.setAttribute('data-hydrated', ''), 3000)
    return () => clearTimeout(timer)
  }, [ownsDocument])

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
