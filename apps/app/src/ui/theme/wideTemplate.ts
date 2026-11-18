// Le seuil du gabarit large des pages de résultats (tranche R16, « Ruches, Recherche et Outils en
// grand ») : dès 1 280 points (`layout.maxContentWidth`, la largeur où une page ordinaire cesse de
// grandir), la page prend le gabarit large de R15 (`Screen width="wide"`) et range ses résultats en
// colonnes ; en dessous, elle reste la colonne d'aujourd'hui. Le seuil est lu ici, jamais dans un
// écran (règle des trois étages : un écran ne connaît aucune taille).
import { layout } from '@ruche/brand'
import { useLayout } from './layout'

/**
 * Hook : vrai dès 1 280 points de fenêtre, une fois la page hydratée. Avant l'hydratation du web,
 * `useLayout` donne une largeur de 0 : la page pré-rendue, qui ne connaît pas la fenêtre, est celle
 * d'une colonne, et le navigateur la reprend sans écart avant de passer au gabarit large.
 */
export const useWideTemplate = () => useLayout().width >= layout.maxContentWidth
