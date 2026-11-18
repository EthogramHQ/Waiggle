// Un ressort des jetons (packages/brand, `springs`) traduit en courbe CSS `linear(...)` (R17) : le
// navigateur anime le vol de la photo partagée (View Transitions) en CSS, qui ne connaît pas les
// ressorts. On échantillonne le mouvement du ressort sur sa durée, et `linear()` relie les points.

/** Un ressort : sa raideur, son amortissement et sa masse (voir packages/brand/src/motion.ts). */
export type Spring = { stiffness: number; damping: number; mass: number }

/** La courbe CSS `linear(...)` de ce ressort, joué en `duration` millisecondes. */
export const springEasing = (_spring: Spring, _duration: number): string => 'linear'
