// La vague de miel à l'entrée dans l'appli (R17, scénario « La vague de miel à l'entrée ») : l'hôte,
// monté une fois dans app/_layout.tsx, au-dessus de tout (barre d'onglets et toasts compris), et le
// hook qui la lance depuis la page de connexion ou « Adresse vérifiée ».
//
// Un « contexte » React rend une valeur accessible à tous les composants qu'il entoure, sans la
// passer de parent en enfant : ici, la fonction `play`.
import { createContext, type ReactNode, useContext } from 'react'

/** Ce qu'il faut pour lancer la vague. */
export type WavePlay = {
  /** Le bouton touché : la vague part de son centre (une mesure, ou l'élément lui-même). */
  from?: unknown
  /** La navigation vers le Fil, jouée quand la vague couvre l'écran (tout de suite sous réduction). */
  then: () => void
}

type HoneyWave = { play: (wave: WavePlay) => void }

// Sans hôte (un test qui ne le monte pas) : pas de vague, la navigation part tout de suite.
const WaveContext = createContext<HoneyWave>({ play: ({ then }) => then() })

/** L'hôte de la vague. */
export function HoneyWaveHost({ children }: { children: ReactNode }) {
  return (
    <WaveContext.Provider value={{ play: ({ then }) => then() }}>{children}</WaveContext.Provider>
  )
}

/** Hook : lance la vague de miel, puis la navigation qu'on lui donne. */
export const useHoneyWave = (): HoneyWave => useContext(WaveContext)
