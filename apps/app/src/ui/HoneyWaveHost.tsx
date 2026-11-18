// La vague de miel à l'entrée dans l'appli (R17, scénario « La vague de miel à l'entrée ») : l'hôte,
// monté une fois dans app/_layout.tsx, au-dessus de tout (barre d'onglets et toasts compris), et le
// hook qui la lance depuis la page de connexion ou « Adresse vérifiée ».
//
// Un « contexte » React rend une valeur accessible à tous les composants qu'il entoure, sans la
// passer de parent en enfant : ici, la fonction `play`.
//
// Le déroulé d'une vague (1 200 ms, `durations.wave`) :
// 1. `play({ from, then })` : la couche se pose tout de suite au-dessus de tout, et prend les
//    touchers (rien ne se touche pendant la vague) ; muette pour les lecteurs d'écran, qui n'ont
//    rien à en dire. Le bouton `from` est mesuré : la vague part de son centre.
// 2. À la moitié (600 ms), la vague couvre l'écran : l'hôte annonce un passage `none` (la vague est
//    déjà le passage : pas de fondu par-dessus, ui/pageTransition), lève l'impulsion d'entrée de la
//    lumière (theme/ambient.tsx, `entrancePulse`), puis appelle `then`, la navigation de l'écran.
//    Seul l'hôte annonce (relecture de l'interface du plan, U1) : les écrans ne font que naviguer.
// 3. À 1 200 ms, la vague a découvert la nouvelle page : la couche disparaît.
//
// Sous « Réduire les animations » : pas de couche ; l'hôte annonce un passage `sibling` (un fondu
// croisé vers le Fil) et navigue tout de suite. Le temps est tenu par des minuteries JavaScript, pas
// par le dessin : la navigation part à l'heure même si le dessin perd des images.
import { durations } from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { View, type ViewStyle } from 'react-native'
import type { Measurable } from './coverTransition'
import { HoneyWave } from './HoneyWave'
import { announcePassage } from './pageTransition'
import { entrancePulse } from './theme/ambient'
import { useCalmMotion } from './theme/motion'
import { layerPosition, ToastLayer } from './theme/toastLayer'

/**
 * Le bouton d'où part la vague, tel qu'un écran le tient (`useRef<WaveButton>(null)`, donné au
 * `ref` d'un `Button`) : les écrans n'importent pas `react-native` eux-mêmes.
 */
export type WaveButton = View

/** Ce qu'il faut pour lancer la vague. */
export type WavePlay = {
  /**
   * Le bouton touché : la vague part de son centre (mesuré dans la fenêtre). Absent ou `null` : du
   * bas de l'écran.
   */
  from?: Measurable | null
  /** La navigation vers le Fil, jouée quand la vague couvre l'écran (tout de suite sous réduction). */
  then: () => void
}

/** Ce que rend `useHoneyWave()`. Un second `play` pendant une vague est ignoré. */
export type HoneyWaveControl = { play: (wave: WavePlay) => void }

// Sans hôte (un test qui ne le monte pas) : pas de vague, la navigation part tout de suite.
const WaveContext = createContext<HoneyWaveControl>({ play: ({ then }) => then() })

/** La vague en cours : son numéro (une clé neuve par vague) et le centre du bouton, une fois mesuré. */
type Running = { id: number; originY: number | null }

// Au-dessus de tout ce que l'appli pose (barres, feuilles, toasts) : sur le web, la couche est dans
// <body>, fixée à la fenêtre (comme les toasts, theme/toastLayer.web.tsx), et passe devant eux.
const layer = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  position: layerPosition,
  zIndex: 1,
} as ViewStyle

/** L'hôte de la vague. */
export function HoneyWaveHost({ children }: { children: ReactNode }) {
  const calm = useCalmMotion()
  const [running, setRunning] = useState<Running | null>(null)
  // Une vague à la fois, su sans attendre un nouveau rendu (une touche Entrée juste après le clic).
  const busy = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const count = useRef(0)
  // `calm` lu au moment du geste, sans refaire `play` (et le contexte) à chaque changement.
  const calmNow = useRef(calm)
  calmNow.current = calm

  // Au démontage de l'hôte, les minuteries en attente s'arrêtent.
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  const play = useCallback(({ from, then }: WavePlay) => {
    if (busy.current) return
    if (calmNow.current) {
      // Sous réduction : un fondu croisé vers la page, tout de suite, sans vague.
      announcePassage('sibling')
      entrancePulse.raise()
      then()
      return
    }
    busy.current = true
    count.current += 1
    const id = count.current
    setRunning({ id, originY: null })
    // Le centre du bouton dans la fenêtre ; la mesure peut répondre plus tard (web) : la vague
    // monte déjà depuis le bas, puis repart du bouton dès qu'il est connu.
    from?.measureInWindow((_x, y, _width, height) => {
      setRunning((current) => (current?.id === id ? { id, originY: y + height / 2 } : current))
    })
    timers.current = [
      setTimeout(() => {
        // L'écran est couvert : la page change dessous, sans passage de plus.
        announcePassage('none')
        entrancePulse.raise()
        then()
      }, durations.wave / 2),
      setTimeout(() => {
        busy.current = false
        setRunning(null)
      }, durations.wave),
    ]
  }, [])

  const value = useMemo(() => ({ play }), [play])

  return (
    <WaveContext.Provider value={value}>
      {children}
      {running ? (
        <ToastLayer>
          <View
            key={running.id}
            testID="honey-wave"
            // Muette : un décor, que les lecteurs d'écran ne lisent pas (web et téléphone).
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            // Elle prend les touchers : rien ne passe à la page dessous pendant la vague.
            pointerEvents="auto"
            style={layer}
          >
            <HoneyWave originY={running.originY} />
          </View>
        </ToastLayer>
      ) : null}
    </WaveContext.Provider>
  )
}

/** Hook : lance la vague de miel, puis la navigation qu'on lui donne. */
export const useHoneyWave = (): HoneyWaveControl => useContext(WaveContext)
