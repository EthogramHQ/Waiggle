// Le mouvement : « les choses bougent comme du miel ». Elles partent vite, ralentissent et dépassent
// à peine leur place avant de s'y poser.
//
// Un « ressort » décrit un mouvement par la physique plutôt que par une durée : la raideur dit à
// quel point le ressort tire (plus elle est grande, plus c'est vif), l'amortissement dit à quel point
// il freine (plus il est grand, moins ça rebondit). 170 et 18 donnent environ 5 % de dépassement.

export const springs = {
  honey: { stiffness: 170, damping: 18, mass: 1 }, // le mouvement par défaut
  firm: { stiffness: 320, damping: 30, mass: 1 }, // réponse immédiate à un appui, sans rebond visible
} as const
export type SpringName = keyof typeof springs

/** Durées en millisecondes, pour les fondus et ce qui n'est pas un ressort. */
export const durations = {
  quick: 160, // appui, survol
  base: 320, // apparition, changement d'état
  slow: 560, // transition entre deux écrans
  breath: 20_000, // une « respiration » de la lumière d'ambiance
} as const
export type DurationName = keyof typeof durations

/** Échelle d'un bouton pendant l'appui : il s'enfonce légèrement sous le doigt. */
export const pressScale = 0.97
