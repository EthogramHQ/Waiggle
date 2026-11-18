// Les passages d'une page à l'autre (R17, scénario « Les passages de page ») : ce que le reste de
// l'appli connaît. Sur iOS et Android, la pile native anime elle-même les pages (ui/AmbientHost.tsx) :
// ce fichier n'y fait rien. Sur le web, `pageTransition.web.ts` le remplace (Metro choisit le fichier
// `.web.ts` pour le web) et anime le passage avec les View Transitions du navigateur, ou un fondu.

/**
 * La sorte d'un passage : vers une page plus profonde (`deeper`), le retour (`back`), d'un onglet à
 * un autre (`sibling`), ou aucun passage (`none` : une feuille, la même page, un préchargement).
 */
export type PassageKind = 'deeper' | 'back' | 'sibling' | 'none'

/**
 * Ce que doit faire la page qui arrive (lu par ui/ScreenFade.tsx) : rien, le navigateur anime
 * (`vt`) ; fondre en montant (`fade-up`) ; fondre sur place (`fade`) ; apparaître telle quelle
 * (`none` : la première page, le retour, le bouton retour du navigateur).
 */
export type ArrivalStyle = 'vt' | 'fade-up' | 'fade' | 'none'

/** La photo d'une carte qui devient la couverture de la page du projet (web, View Transitions). */
export type SharedCover = {
  /** L'élément de la photo de départ (la carte, ou la couverture au retour). */
  from: unknown
  /** L'identifiant du projet : la page d'arrivée porte `data-cover-target="<id>"`. */
  id: string
}

/** Joue la navigation `mutate`, entourée du passage de cette sorte. Hors du web : tout de suite. */
export const runPassage = (_kind: PassageKind, mutate: () => void): void => {
  mutate()
}

/** Dit la sorte du prochain passage, quand l'action seule ne suffit pas à la deviner. */
export const announcePassage = (_kind: PassageKind): void => {}

/** Appelée quand une page arrive (ui/screenFocus.ts) : le passage peut se terminer. */
export const passageArrived = (): void => {}

/** Ce que doit faire la page qui arrive. Hors du web : rien, la pile native s'en charge. */
export const arrivalStyle = (): ArrivalStyle => 'none'

/** Prépare le vol de la photo d'une carte pour le prochain passage. Hors du web : rien. */
export const shareCover = (_cover: SharedCover): void => {}
