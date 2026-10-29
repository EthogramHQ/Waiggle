// Le mouvement : « les choses bougent comme du miel ». Elles partent vite, ralentissent et dépassent
// à peine leur place avant de s'y poser.
//
// Un « ressort » décrit un mouvement par la physique plutôt que par une durée : la raideur dit à
// quel point le ressort tire (plus elle est grande, plus c'est vif), l'amortissement dit à quel point
// il freine (plus il est grand, moins ça rebondit). 170 et 18 donnent environ 5 % de dépassement.

export const springs = {
  honey: { stiffness: 170, damping: 18, mass: 1 }, // le mouvement par défaut
  firm: { stiffness: 320, damping: 30, mass: 1 }, // réponse immédiate à un appui, sans rebond visible
  drop: { stiffness: 190, damping: 20, mass: 1 }, // la goutte : un toast, une pastille qui tombe en place
  open: { stiffness: 150, damping: 19, mass: 1 }, // ce qui s'ouvre (un menu, un éventail)
  close: { stiffness: 170, damping: 21, mass: 1 }, // ce qui se referme, un peu plus vite
  sheetOpen: { stiffness: 160, damping: 17, mass: 1 }, // une feuille qui monte du bas
  sheetClose: { stiffness: 200, damping: 24, mass: 1 }, // et qui redescend, sans rebond
} as const
export type SpringName = keyof typeof springs

/**
 * Les courbes d'un mouvement à durée fixe (une « courbe de Bézier » : quatre nombres qui disent
 * comment la vitesse change en route). `honey` dépasse un peu sa cible (1,56 > 1) avant de revenir,
 * comme le ressort ; `exit` part vite et s'éteint en douceur, pour ce qui disparaît.
 */
export const easings = {
  honey: [0.34, 1.56, 0.64, 1],
  exit: [0.2, 0.8, 0.2, 1],
} as const

/** Durées en millisecondes, pour les fondus et ce qui n'est pas un ressort. */
export const durations = {
  quick: 160, // appui, survol
  base: 320, // apparition, changement d'état
  medium: 420, // un élément qui se déplace sur l'écran
  slow: 560, // transition entre deux écrans
  scheme: 600, // fondu entre le jour et la nuit
  long: 720, // une grande entrée (l'affiche d'un écran de marque)
  lightFade: 900, // la lumière d'ambiance qui passe d'une source à l'autre
  toast: 2400, // temps de lecture minimal d'un toast (un texte long reste plus longtemps)
  dance: 2300, // un tour de danse de l'abeille
  heart: 2600, // un battement de cœur de la mascotte
  portal: 4200, // le passage par le portail (un lien qui sort de l'appli)
  loadingLoop: 4600, // un vol complet de l'abeille au lancement
  breath: 20_000, // une « respiration » de la lumière d'ambiance
} as const
export type DurationName = keyof typeof durations

/** Échelle d'un bouton pendant l'appui : il s'enfonce légèrement sous le doigt. */
export const pressScale = 0.96
/** Le bouton rond flottant s'enfonce davantage : il est plus petit et plus « physique ». */
export const pressScaleFab = 0.92
