// La police de secours calibrée de chaque police livrée (R16, « La page ne bouge plus en arrivant ») :
// une police du système, réglée aux mesures de Funnel, pour que rien ne bouge quand Funnel arrive.

/** Une face de secours : son nom, la police locale qu'elle prend, et ses réglages. */
export type FontFallback = {
  /** Le nom de la face : celui de la police livrée, suivi de `-fallback` (« FunnelSans-600-fallback »). */
  name: string
  /** Les polices du système à prendre, dans l'ordre (`local("Arial")`, `local("Arial Bold")`). */
  local: readonly string[]
  // Les quatre réglages sont des rapports (1 = 100 %), écrits en pour cent dans la règle CSS.
  sizeAdjust: number
  ascentOverride: number
  descentOverride: number
  lineGapOverride: number
}

// R16, socle : pièce vide, écrite par la tranche (plan R16).
export const fontFallbacks: readonly FontFallback[] = []

// R16, socle : pièce vide, écrite par la tranche (plan R16).
/** La règle CSS des faces de secours, posée dans la page (app/+html.tsx). */
export const fontFallbackCss = ''
