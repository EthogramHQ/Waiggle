// La couche du toast, sur téléphone : rendue sur place, en bas de l'écran racine (qui ne défile
// pas), puisque le fournisseur est posé autour de toute l'appli (app/_layout.tsx). Le web a sa
// propre version (toastLayer.web.tsx), qui la sort de la page.
import type { ReactNode } from 'react'

export function ToastLayer({ children }: { children: ReactNode }) {
  return children
}

/** Sur téléphone, la couche est posée en bas de l'écran racine. */
export const layerPosition = 'absolute'
