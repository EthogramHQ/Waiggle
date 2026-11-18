// La forme de la vague de miel à l'entrée dans l'appli (R17, prototype animé du 28/10) : le tracé
// SVG de la vague à l'instant `t` (de 0 à 1). Une fonction pure, partagée par le web
// (ui/HoneyWave.web.tsx) et le téléphone (ui/HoneyWave.tsx).
//
// Un tracé SVG (l'attribut `d` d'un `<path>`) est une suite d'ordres de dessin : `M x y` pose le
// crayon, `L x y` trace un trait jusqu'au point, `Z` referme la forme. La vague est une bande
// pleine : son bord avant (en haut), tracé de gauche à droite, puis son bord arrière (en bas),
// tracé de droite à gauche ; `Z` la referme. Chaque bord ondule : deux sinus de tailles et de
// vitesses différentes, qui glissent avec le temps, donnent une vague vivante plutôt qu'une
// ondulation régulière.
//
// Le rythme (celui du prototype) : le bord avant monte du milieu du bouton touché jusqu'à 140 points
// au-dessus de l'écran, sur les 58 premiers pour cent du temps ; le bord arrière attend sous l'écran
// jusqu'à la moitié (l'écran est alors entièrement couvert : c'est là que la page change), puis
// monte à son tour et découvre la nouvelle page.

/** Le point d'où part la vague : le centre du bouton touché, en points depuis le haut de l'écran. */
export type WaveOrigin = { y: number }

/** Ce que reçoit le dessin de la vague (ui/HoneyWave.tsx, ui/HoneyWave.web.tsx). */
export type HoneyWaveProps = {
  /** Le centre du bouton touché, en points depuis le haut de l'écran ; absent : le bas de l'écran. */
  originY?: number | null
  /**
   * Une image figée de la vague, à cet instant (de 0 à 1), sans animation : le catalogue montre
   * ainsi ses étapes. Absent : la vague joue, de 0 à 1 en `durations.wave`.
   */
  at?: number
  /** La taille du dessin ; par défaut, la fenêtre. */
  width?: number
  height?: number
}

/** Au-dessus de l'écran, où finissent les deux bords (une marge pour leurs ondulations). */
const TOP = -140
/** Sous l'écran, où attend le bord arrière. */
const BELOW = 80
/** La part du temps où le bord avant atteint le haut. */
const FRONT_END = 0.58
/** L'instant où le bord arrière se met en route : l'écran est couvert. */
const BACK_START = 0.5
/** Un point du tracé tous les 10 points de large. */
const STEP = 10
/** Le nombre de tours d'ondulation pendant la vague (la phase des sinus). */
const PHASE = 9

/** Entre `from` et `to`, à la part `k` (0 : `from`, 1 : `to`). */
const lerp = (from: number, to: number, k: number) => {
  'worklet'
  return from + (to - from) * k
}

/** Ramène `x` entre 0 et 1. */
const clamp01 = (x: number) => {
  'worklet'
  return Math.min(1, Math.max(0, x))
}

/**
 * La courbe « entrée-sortie » cubique du prototype : le bord part doucement, accélère, puis se pose
 * en douceur (une accélération au cube, puis son miroir).
 */
const io = (x: number) => {
  'worklet'
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * Le tracé (attribut `d` d'un `<path>`) de la vague à l'instant `t`, pour un écran de `width` sur
 * `height` points. Son bord avant monte depuis le bouton ; son bord arrière suit et découvre le Fil.
 */
export const wavePath = (t: number, width: number, height: number, origin: WaveOrigin): string => {
  // « worklet » : sur téléphone, le tracé se calcule à chaque image sur le fil des animations.
  'worklet'
  const time = clamp01(t)
  const phase = time * PHASE
  const front = lerp(origin.y, TOP, io(clamp01(time / FRONT_END)))
  const back =
    time < BACK_START
      ? height + BELOW
      : lerp(height + BELOW, TOP, io((time - BACK_START) / (1 - BACK_START)))
  // Les abscisses des points : tous les 10 points, et le bord droit exactement (une largeur qui
  // n'est pas un multiple de 10 laisserait sinon un coin découvert).
  const xs: number[] = []
  for (let x = 0; x < width; x += STEP) xs.push(x)
  xs.push(width)
  let d = ''
  // Le bord avant, de gauche à droite : deux sinus, de 22 et 9 points.
  for (const x of xs) {
    const y = front + 22 * Math.sin(x * 0.022 + phase) + 9 * Math.sin(x * 0.05 - phase * 1.3)
    d += `${d ? 'L' : 'M'}${x} ${y.toFixed(1)} `
  }
  // Le bord arrière, de droite à gauche : deux sinus plus calmes, de 18 et 7 points.
  for (let i = xs.length - 1; i >= 0; i -= 1) {
    const x = xs[i] ?? 0
    const y = back + 18 * Math.sin(x * 0.02 - phase) + 7 * Math.sin(x * 0.047 + phase)
    d += `L${x} ${y.toFixed(1)} `
  }
  return `${d}Z`
}
