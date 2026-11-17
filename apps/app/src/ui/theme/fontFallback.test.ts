// Tests des polices de secours calibrées (R16, « La page ne bouge plus en arrivant ») : sur le web,
// le texte s'écrit d'abord dans une police du système (`font-display: swap`, R13), puis Funnel
// arrive et prend sa place. Sans réglage, la barre glissait de 10 points et les cartes du Fil
// grandissaient de 52. Chaque fichier de police livré a donc sa face de secours, `<nom>-fallback` :
// une police du système (`local(...)`) agrandie ou réduite à la largeur de Funnel (`size-adjust`),
// avec les hauteurs de Funnel (`ascent-`, `descent-`, `line-gap-override`).
//
// La graisse est dans le nom de chaque police (« FunnelSans-600 ») et le texte est écrit en
// `fontWeight: 'normal'` (ui/Text.tsx) : une face de secours par famille écrirait les titres en
// Arial normal, plus étroit. D'où une face par fichier, et une police grasse du système pour les
// fichiers gras (dès 600).
//
// Les hauteurs se vérifient contre les fichiers eux-mêmes : on lit, dans chaque TTF livré, la
// taille de la grille (`head.unitsPerEm`) et les hauteurs que le navigateur prend (`hhea`). Une
// police mise à jour sans recalculer ses réglages fait échouer ce test.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fontFallbackCss, fontFallbacks } from './fontFallback'
import { fontFiles } from './fonts'

/** Les noms des polices livrées (« FunnelSans-600 », « GeistMono-400 »…). */
const shipped = Object.keys(fontFiles)

/** La graisse écrite dans un nom de police : « FunnelSans-600-fallback » → 600. */
const weightOf = (name: string): number => Number(/-(\d{3})(?:-fallback)?$/.exec(name)?.[1])

/** Les blocs `@font-face { … }` de la règle CSS, chacun avec sa famille. */
const faces = (): { family: string; body: string }[] =>
  [...fontFallbackCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
    const body = match[1] ?? ''
    const family = /font-family\s*:\s*["']?([\w-]+)["']?/.exec(body)?.[1] ?? ''
    return { family, body }
  })

/** Une valeur en pour cent d'un bloc (`size-adjust: 104.2%` → 104.2), absente : `undefined`. */
const percent = (body: string, property: string): number | undefined => {
  const match = new RegExp(`${property}\\s*:\\s*(-?[\\d.]+)%`).exec(body)
  return match ? Number(match[1]) : undefined
}

/** Les polices locales d'un bloc, dans l'ordre : `src: local("Arial"), local(Helvetica)`. */
const locals = (body: string): string[] =>
  [...body.matchAll(/local\(\s*["']?([^"')]+?)["']?\s*\)/g)].map((match) => match[1] ?? '')

/**
 * Les mesures d'un fichier TTF livré : la grille (`unitsPerEm`, table `head`) et les trois
 * hauteurs de la table `hhea` (au-dessus de la ligne, en dessous, et l'interligne ajouté). Un TTF
 * commence par un sommaire de ses tables : leur nom sur 4 lettres et leur position dans le fichier.
 */
const metricsOf = (name: string) => {
  const [prefix = '', weight = ''] = name.split('-')
  // « FunnelSans » → le paquet `@expo-google-fonts/funnel-sans`, dossier « 600SemiBold ».
  const pkg = prefix.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const root = join(__dirname, '..', '..', '..', 'node_modules', '@expo-google-fonts', pkg)
  const folder = readdirSync(root).find((dir) => dir.startsWith(weight) && !dir.includes('Italic'))
  if (!folder) throw new Error(`no folder for ${name} in ${root}`)
  const file = readdirSync(join(root, folder)).find((one) => one.endsWith('.ttf'))
  if (!file) throw new Error(`no TTF for ${name}`)
  const data = readFileSync(join(root, folder, file))
  const tables = new Map<string, number>()
  const count = data.readUInt16BE(4)
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16
    tables.set(data.toString('latin1', at, at + 4), data.readUInt32BE(at + 8))
  }
  const head = tables.get('head')
  const hhea = tables.get('hhea')
  if (head === undefined || hhea === undefined) throw new Error(`no head or hhea in ${file}`)
  return {
    unitsPerEm: data.readUInt16BE(head + 18),
    ascender: data.readInt16BE(hhea + 4),
    descender: data.readInt16BE(hhea + 6),
    lineGap: data.readInt16BE(hhea + 8),
  }
}

describe('fontFallbacks, the calibrated fallback of every shipped font (R16)', () => {
  it('declares one measured fallback for every shipped brand font, with its size and line overrides', () => {
    // Une face par fichier livré, nommée d'après lui ; ni plus, ni moins.
    expect(fontFallbacks.map((face) => face.name).sort()).toEqual(
      shipped.map((name) => `${name}-fallback`).sort(),
    )
    const written = faces()
    expect(written.map((face) => face.family).sort()).toEqual(
      fontFallbacks.map((face) => face.name).sort(),
    )

    for (const face of fontFallbacks) {
      // Une police du système à prendre, et des réglages vraisemblables (des rapports : 1 = 100 %).
      expect(face.local.length).toBeGreaterThan(0)
      expect(face.sizeAdjust).toBeGreaterThan(0.5)
      expect(face.sizeAdjust).toBeLessThan(1.5)

      // Mesurées : les hauteurs de Funnel (ou de Geist Mono), ramenées à la taille ajustée
      // (`ascent-override = ascender / unitsPerEm / sizeAdjust`, plan R16, choix 15).
      const source = metricsOf(face.name.replace(/-fallback$/, ''))
      const scale = source.unitsPerEm * face.sizeAdjust
      expect(face.ascentOverride).toBeCloseTo(source.ascender / scale, 2)
      expect(face.descentOverride).toBeCloseTo(Math.abs(source.descender) / scale, 2)
      expect(face.lineGapOverride).toBeCloseTo(source.lineGap / scale, 2)

      // La règle CSS écrit ces mêmes réglages, en pour cent, et ces mêmes polices locales.
      const body = written.find((one) => one.family === face.name)?.body ?? ''
      expect(locals(body)).toEqual([...face.local])
      expect(percent(body, 'size-adjust')).toBeCloseTo(face.sizeAdjust * 100, 1)
      expect(percent(body, 'ascent-override')).toBeCloseTo(face.ascentOverride * 100, 1)
      expect(percent(body, 'descent-override')).toBeCloseTo(face.descentOverride * 100, 1)
      expect(percent(body, 'line-gap-override')).toBeCloseTo(face.lineGapOverride * 100, 1)
    }
  })

  it('draws the bold brand fonts from a bold system font', () => {
    // Témoin : il y a bien des fichiers gras et des fichiers normaux livrés.
    expect(shipped.some((name) => weightOf(name) >= 600)).toBe(true)
    expect(shipped.some((name) => weightOf(name) <= 500)).toBe(true)
    expect(fontFallbacks).toHaveLength(shipped.length)

    for (const face of fontFallbacks) {
      const bold = weightOf(face.name) >= 600
      // Dès 600, une police grasse du système (« Arial Bold ») ; jusqu'à 500, une police normale.
      for (const local of face.local) {
        expect({ face: face.name, local, bold: /bold/i.test(local) }).toEqual({
          face: face.name,
          local,
          bold,
        })
      }
    }
  })
})
