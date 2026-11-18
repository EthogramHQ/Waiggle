// Un ressort des jetons (packages/brand, `springs`) traduit en courbe CSS `linear(...)` (R17) : le
// navigateur anime le vol de la photo partagée (View Transitions) en CSS, qui ne connaît pas les
// ressorts. On échantillonne le mouvement du ressort sur sa durée, et `linear()` relie les points.
//
// `linear(0, 0.42, 0.8, …, 1)` est une courbe CSS faite de points également espacés dans le temps :
// chaque nombre dit où en est le mouvement (0 au départ, 1 à l'arrivée) à cet instant. Avec assez de
// points, l'œil voit une courbe lisse, rebond compris.

/** Un ressort : sa raideur, son amortissement et sa masse (voir packages/brand/src/motion.ts). */
export type Spring = { stiffness: number; damping: number; mass: number }

/** Un point toutes les 16 ms environ (une image à 60 Hz), et jamais moins de 10. */
const FRAME_MS = 16
const MIN_POINTS = 10
/** Le pas du calcul, plus fin que les points : le ressort reste juste même s'il est raide. */
const STEP_MS = 1
/** Le plus loin qu'un léger rebond peut aller : au-delà, ce serait un saut. */
const MAX_OVERSHOOT = 1.1

/** La courbe CSS `linear(...)` de ce ressort, joué en `duration` millisecondes. */
export const springEasing = (spring: Spring, duration: number): string => {
  const points = Math.max(MIN_POINTS, Math.ceil(duration / FRAME_MS))
  // Le ressort part de 0, immobile, et tire vers 1. À chaque pas : la force du ressort (raideur ×
  // l'écart) moins le frein (amortissement × la vitesse), divisée par la masse, change la vitesse ;
  // la vitesse change la place (la méthode d'Euler « semi-implicite », stable pour un ressort).
  let place = 0
  let speed = 0
  let time = 0
  const samples: number[] = [0]
  for (let point = 1; point <= points; point++) {
    const until = (point / points) * duration
    while (time < until) {
      const dt = Math.min(STEP_MS, until - time) / 1000
      const force = -spring.stiffness * (place - 1) - spring.damping * speed
      speed += (force / spring.mass) * dt
      place += speed * dt
      time += dt * 1000
    }
    samples.push(Math.min(MAX_OVERSHOOT, Math.max(0, place)))
  }
  // L'arrivée est toujours la place finale : le ressort, coupé à sa durée, n'y est peut-être pas
  // tout à fait.
  samples[samples.length - 1] = 1
  return `linear(${samples.map((value) => Number(value.toFixed(4))).join(', ')})`
}
