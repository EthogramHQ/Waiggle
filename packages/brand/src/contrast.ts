// Calcul du contraste entre deux couleurs, selon la formule des règles d'accessibilité WCAG.
// Le résultat va de 1 (deux couleurs identiques) à 21 (noir sur blanc). Un texte courant doit
// atteindre 4,5 pour rester lisible par une personne qui voit mal ou en plein soleil.

type Rgba = { r: number; g: number; b: number; a: number }

/** Lit '#FFC21A' ou 'rgba(255,255,255,0.56)'. Refuse tout autre format plutôt que de deviner. */
export const parseColor = (color: string): Rgba => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (hex) {
    const [, r = '', g = '', b = ''] = hex
    return { r: Number.parseInt(r, 16), g: Number.parseInt(g, 16), b: Number.parseInt(b, 16), a: 1 }
  }
  const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(color.replaceAll(' ', ''))
  if (rgba) {
    const [, r = '', g = '', b = '', a = ''] = rgba
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
  }
  throw new Error(`Unsupported color: ${color}`)
}

/**
 * Pose une couleur transparente sur un fond opaque, comme le ferait l'écran : un verre blanc à 56 %
 * sur du noir donne un gris. Le contraste se mesure toujours sur ce résultat.
 */
const over = (top: Rgba, below: Rgba): Rgba => ({
  r: top.r * top.a + below.r * (1 - top.a),
  g: top.g * top.a + below.g * (1 - top.a),
  b: top.b * top.a + below.b * (1 - top.a),
  a: 1,
})

// Luminance relative : la quantité de lumière perçue, de 0 (noir) à 1 (blanc). L'œil est bien plus
// sensible au vert qu'au bleu, d'où les coefficients différents.
const luminance = ({ r, g, b }: Rgba) => {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Contraste d'un texte sur un fond. Si le fond est transparent, il est d'abord posé sur `base`
 * (le fond de page) ; si le texte est transparent, il est posé sur ce fond.
 */
export const contrastRatio = (text: string, background: string, base = '#FFFFFF'): number => {
  const bg = over(parseColor(background), parseColor(base))
  const fg = over(parseColor(text), bg)
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}
