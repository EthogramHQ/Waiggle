// Tests de la forme de la vague de miel (R17, scénario « La vague de miel à l'entrée » ; prototype
// animé du 28/10) : son bord avant monte du bouton touché jusqu'au-dessus de l'écran (−140 points)
// aux 58 % du temps ; son bord arrière reste sous l'écran jusqu'à la moitié, puis monte à son tour
// et découvre le Fil.
//
// Le tracé SVG se lit point par point : le bord avant d'abord, de gauche à droite, puis le bord
// arrière, de droite à gauche (le chemin fait le tour de la vague). Les deux bords ondulent (deux
// sinus chacun, d'une trentaine de points) : les bornes ci-dessous laissent 40 points de marge.
import { wavePath } from './wavePath'

const W = 390
const H = 844
// Le centre du bouton « Me connecter », vers le bas de l'écran.
const origin = { y: 620 }

/** Les points du tracé, pris deux nombres à deux nombres (x, y). */
const points = (d: string) => {
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const result: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    result.push({ x: numbers[i] ?? 0, y: numbers[i + 1] ?? 0 })
  }
  return result
}

/** Les deux bords : le bord avant va de gauche à droite, le bord arrière revient vers la gauche. */
const edges = (d: string) => {
  const all = points(d)
  // Le bord avant s'arrête au premier point le plus à droite ; le bord arrière part de là.
  const right = Math.max(...all.map((point) => point.x))
  const turn = all.findIndex((point) => point.x === right) + 1
  if (turn <= 0 || turn >= all.length) throw new Error(`no back edge in « ${d.slice(0, 80)}… »`)
  return { front: all.slice(0, turn), back: all.slice(turn) }
}

const ys = (edge: { y: number }[]) => edge.map((point) => point.y)

describe('wavePath', () => {
  it('draws a closed shape across the whole width', () => {
    const d = wavePath(0.3, W, H, origin)

    expect(d.trim().startsWith('M')).toBe(true)
    expect(d.trim().endsWith('Z')).toBe(true)
    const { front } = edges(d)
    expect(Math.min(...front.map((p) => p.x))).toBeLessThanOrEqual(0)
    expect(Math.max(...front.map((p) => p.x))).toBeGreaterThanOrEqual(W)
  })

  it('starts its front edge at the middle of the button', () => {
    const { front } = edges(wavePath(0, W, H, origin))

    for (const y of ys(front)) expect(Math.abs(y - origin.y)).toBeLessThanOrEqual(40)
  })

  it('has its front edge 140 points above the screen from 58 % of the time', () => {
    for (const t of [0.58, 0.75, 1]) {
      const { front } = edges(wavePath(t, W, H, origin))
      for (const y of ys(front)) expect(Math.abs(y + 140)).toBeLessThanOrEqual(40)
    }
  })

  it('keeps its back edge below the screen until half of the time', () => {
    for (const t of [0, 0.25, 0.5]) {
      const { back } = edges(wavePath(t, W, H, origin))
      for (const y of ys(back)) expect(y).toBeGreaterThanOrEqual(H)
    }
  })

  it('covers the whole screen at half of the time', () => {
    const { front, back } = edges(wavePath(0.5, W, H, origin))

    expect(Math.max(...ys(front))).toBeLessThanOrEqual(0)
    expect(Math.min(...ys(back))).toBeGreaterThanOrEqual(H)
  })

  it('uncovers the screen at the end', () => {
    for (const { y } of points(wavePath(1, W, H, origin))) expect(y).toBeLessThanOrEqual(0)
  })
})
