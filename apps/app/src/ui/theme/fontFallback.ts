// La police de secours calibrée de chaque police livrée (R16, « La page ne bouge plus en arrivant ») :
// une police du système, réglée aux mesures de Funnel, pour que rien ne bouge quand Funnel arrive.
//
// Sur le web, le texte s'écrit tout de suite dans une police du système, puis dans Funnel dès que
// son fichier est arrivé (`font-display: swap`, R13 : jamais de texte caché). Arial n'a ni la largeur
// ni les hauteurs de Funnel : à l'arrivée de Funnel, chaque ligne s'allongeait ou se raccourcissait,
// et la barre glissait de 10 points, les cartes du Fil grandissaient de 52. La règle `@font-face`
// permet de « déguiser » une police du système : `size-adjust` l'agrandit ou la réduit (ses lettres
// prennent la largeur de Funnel), `ascent-override`, `descent-override` et `line-gap-override` lui
// donnent les hauteurs de Funnel (la ligne de base tombe au même endroit).
//
// Une face par fichier livré, nommée d'après lui (« FunnelSans-600-fallback ») : la graisse est dans
// le nom de chaque police et le texte est écrit en `fontWeight: 'normal'` (ui/Text.tsx), une face par
// famille écrirait donc les titres en Arial normal, plus étroit. Dès 600, la police du système est
// grasse (« Arial Bold »). `fontStack` (ui/theme/fonts.ts) nomme la face juste après la police de
// la marque ; la règle CSS, plus bas, est posée dans la page par app/+html.tsx.
import type { fontFiles } from './fonts'

/** Une face de secours : son nom, la police locale qu'elle prend, et ses réglages. */
export type FontFallback = {
  /** Le nom de la face : celui de la police livrée, suivi de `-fallback` (« FunnelSans-600-fallback »). */
  name: string
  /** Les polices du système à prendre, dans l'ordre (`local("Arial")`, `local("Arial Bold")`). */
  local: readonly string[]
  // Les quatre réglages sont des rapports (1 = 100 %), écrits en pour cent dans la règle CSS.
  sizeAdjust: number
  ascentOverride: number
  descentOverride: number
  lineGapOverride: number
}

/**
 * Les hauteurs d'une famille, lues dans ses fichiers TTF (`node_modules/@expo-google-fonts/*`) :
 * la grille de dessin (`head.unitsPerEm`) et les trois hauteurs que le navigateur prend dans la
 * table `hhea` (au-dessus de la ligne de base, en dessous, et l'interligne ajouté). Les graisses
 * d'une même famille ont les mêmes (relevé du 17/11/2026, Funnel Sans 400 à 800, Funnel Display
 * 700, Geist Mono 400 et 500 ; leur table `OS/2` dit la même chose, avec `USE_TYPO_METRICS`).
 * Le test (fontFallback.test.ts) relit les fichiers : une police mise à jour sans relever ces
 * nombres le fait échouer.
 */
type Heights = { unitsPerEm: number; ascender: number; descender: number; lineGap: number }
const funnel: Heights = { unitsPerEm: 1200, ascender: 1200, descender: 300, lineGap: 0 }
const geistMono: Heights = { unitsPerEm: 1000, ascender: 1005, descender: 295, lineGap: 0 }

// Les polices du système, dans l'ordre où on les cherche. `local()` prend le nom complet ou le nom
// PostScript d'une police installée (« Arial Bold », « Arial-BoldMT »). Liberation Sans, sous
// Linux, a les largeurs d'Arial (elle a été dessinée pour) : le même réglage lui va.
const sans = ['Arial', 'ArialMT', 'Liberation Sans'] as const
const sansBold = ['Arial Bold', 'Arial-BoldMT', 'Liberation Sans Bold'] as const
// Geist Mono, à chasse fixe : une police du système à chasse fixe aussi, sinon les colonnes d'un
// prompt ou d'un bout de code se décaleraient. Consolas (Windows) d'abord : c'est sur elle que la
// largeur est mesurée ; Courier New et Menlo (macOS) sont un peu plus larges (0,6 de chasse contre
// 0,55), le réglage y est donc moins juste, mais l'écart reste dans la seule ligne de code.
const mono = ['Consolas', 'Courier New', 'Menlo'] as const

/**
 * La mesure de chaque fichier livré : sa famille, ses polices locales et son `size-adjust`, le
 * rapport entre la largeur d'un texte écrit dans la police livrée et celle du même texte dans la
 * police locale. Mesuré le 17/11/2026 dans Chromium (Playwright, `measureText` d'un canevas, à
 * 100 px), sur les 2 654 textes de `packages/i18n/src/locales/fr.ts` mis bout à bout (115 489
 * caractères) : Funnel contre Arial (jusqu'à 500) ou Arial Bold (dès 600), Geist Mono contre
 * Consolas. Une moyenne sur de vrais textes : un mot isolé peut s'écarter d'un ou deux pour cent.
 *
 * `Record<keyof typeof fontFiles, …>` : un fichier ajouté à fontFiles sans sa mesure ne se compile
 * plus.
 */
const measured: Record<
  keyof typeof fontFiles,
  { heights: Heights; local: readonly string[]; sizeAdjust: number }
> = {
  'FunnelDisplay-700': { heights: funnel, local: sansBold, sizeAdjust: 1.0052 },
  'FunnelSans-400': { heights: funnel, local: sans, sizeAdjust: 0.9998 },
  'FunnelSans-500': { heights: funnel, local: sans, sizeAdjust: 1.0072 },
  'FunnelSans-600': { heights: funnel, local: sansBold, sizeAdjust: 0.9427 },
  'FunnelSans-700': { heights: funnel, local: sansBold, sizeAdjust: 0.9478 },
  'FunnelSans-800': { heights: funnel, local: sansBold, sizeAdjust: 0.953 },
  'GeistMono-400': { heights: geistMono, local: mono, sizeAdjust: 1.0901 },
  'GeistMono-500': { heights: geistMono, local: mono, sizeAdjust: 1.0901 },
}

/**
 * Les faces de secours, une par fichier livré. Les hauteurs se divisent par `size-adjust` : le
 * navigateur les multiplie ensuite par lui, comme tout le reste de la police (règle de CSS Fonts 5) ;
 * on retombe ainsi exactement sur celles de Funnel. Seul `size-adjust` compte vraiment pour la
 * largeur ; les hauteurs de ligne sont fixées par Text (`lineHeight`), les hauteurs placent la ligne
 * de base dans la ligne.
 */
export const fontFallbacks: readonly FontFallback[] = Object.entries(measured).map(
  ([name, { heights, local, sizeAdjust }]) => {
    const scale = heights.unitsPerEm * sizeAdjust
    return {
      name: `${name}-fallback`,
      local,
      sizeAdjust,
      ascentOverride: heights.ascender / scale,
      descentOverride: heights.descender / scale,
      lineGapOverride: heights.lineGap / scale,
    }
  },
)

/** Un rapport écrit en pour cent, à deux décimales (0,9427 → « 94.27% »). */
const percent = (ratio: number) => `${(ratio * 100).toFixed(2)}%`

/**
 * La règle CSS des faces de secours, posée dans la page (app/+html.tsx). Un texte fixe, tiré des
 * constantes ci-dessus : aucun contenu de membre n'y passe.
 */
export const fontFallbackCss = fontFallbacks
  .map((face) =>
    [
      '@font-face{',
      `font-family:"${face.name}";`,
      `src:${face.local.map((one) => `local("${one}")`).join(',')};`,
      `size-adjust:${percent(face.sizeAdjust)};`,
      `ascent-override:${percent(face.ascentOverride)};`,
      `descent-override:${percent(face.descentOverride)};`,
      `line-gap-override:${percent(face.lineGapOverride)}`,
      '}',
    ].join(''),
  )
  .join('\n')
