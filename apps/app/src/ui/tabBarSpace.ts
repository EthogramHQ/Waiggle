// La place de la barre d'onglets du téléphone (tranche R3), partagée par un « contexte » React :
// une valeur que le cadre de la barre (TabBarHost, dans ui/TabBar.tsx) met à disposition de tout ce
// qu'il contient, sans la passer de main en main. Chaque écran (ui/Screen.tsx) y lit :
// - la hauteur à réserver en bas, pour que la fin d'une liste ne reste pas cachée sous la barre ;
// - le signal de remontée : toucher l'onglet déjà actif fait remonter l'écran affiché en haut.
// Ce fichier ne connaît ni les onglets ni les pages : src/ui n'importe jamais src/navigation.
import { createContext, useContext } from 'react'

export type TabBarSpace = {
  /**
   * La hauteur, en points, que la barre occupe en bas de l'écran, marge du bas de l'appareil
   * comprise (la zone du geste sur iPhone et Android). Mesurée par le cadre à chaque changement
   * (`onLayout`), jamais une constante : le texte agrandi ou l'appareil la font varier. 0 quand
   * aucune barre n'est affichée.
   */
  height: number
  /**
   * Le nombre de fois où l'onglet déjà actif a été touché. Il ne sert qu'à changer : un écran qui
   * voit ce nombre bouger remonte en haut (s'il est celui qui est affiché).
   */
  reselect: number
  /** À appeler quand l'onglet actif est touché de nouveau (TabBar le fait). */
  requestReselect: () => void
}

/** La valeur hors de tout cadre (un écran sans barre : la connexion, la page d'un projet). */
const noTabBar: TabBarSpace = { height: 0, reselect: 0, requestReselect: () => {} }

/** Le contexte lui-même ; `null` quand aucun TabBarHost n'entoure le composant. */
export const TabBarSpaceContext = createContext<TabBarSpace | null>(null)

/** Hook : la place de la barre, ou « aucune barre » hors d'un cadre. */
export const useTabBarSpace = (): TabBarSpace => useContext(TabBarSpaceContext) ?? noTabBar

/** Hook : y a-t-il un cadre de barre autour de ce composant ? */
export const useHasTabBarHost = (): boolean => useContext(TabBarSpaceContext) !== null
