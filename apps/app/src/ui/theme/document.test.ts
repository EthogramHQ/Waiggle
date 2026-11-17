// Tests de la feuille de style de la page web avant le démarrage de l'appli (tranche R13, « Le premier
// chargement », docs/scenarios/refonte.md ; plan, décisions 5 et 7, relecture du plan, décision 5).
//
// La page est pré-rendue sans connaître le visiteur : en mise en page de téléphone, et de jour. Tant
// que l'appli n'a pas démarré (`data-hydrated` posé sur <html> par le thème) :
// - sur ordinateur (plus de 700 points) et sur tout appareil en mode sombre, la page reste cachée,
//   et l'abeille d'attente se montre au centre, sur le fond du thème ;
// - sur un téléphone de jour, la page se montre tout de suite, sans abeille ;
// - le filet : sans démarrage, la page se montre et l'abeille part au bout de 10 secondes, que
//   « Réduire les animations » soit activé ou non (seul le vol de l'abeille s'arrête alors).
//
// L'abeille est un élément `[data-wait]` posé dans <body> par app/+html.tsx, avant la page ; son
// dessin (`waitBeeMarkup`) est fabriqué ici, dans le thème, qui seul lit les jetons. Jest ne dessine
// rien : on lit les règles de `documentCss` (src/testing/css.ts).
import { layout, palettes } from '@ruche/brand'
import { type CssRule, compactValue, parseCss, splitTopLevel, underMedia } from '../../testing/css'
import { bee, beeViewBox } from '../logo.generated'
import { documentCss, waitBeeMarkup } from './document'

const sheet = parseCss(documentCss)

const WIDE = `(min-width: ${layout.breakpoints.medium}px)`
const DARK = '(prefers-color-scheme: dark)'
const REDUCED = '(prefers-reduced-motion: reduce)'
const NOT_HYDRATED = 'html:not([data-hydrated])'

/** Un sélecteur qui vise les enfants directs de <body> : la page (et l'abeille, si rien ne l'exclut). */
const aimsAtPage = (selector: string) => /body\s*>\s*\*/.test(selector)

/** La dernière partie d'un sélecteur (après le dernier blanc ou `>`) : l'élément qu'il vise. */
const target = (selector: string) =>
  selector
    .trim()
    .split(/\s*[\s>+~]\s*/)
    .at(-1) ?? ''

/** Un sélecteur qui vise l'abeille elle-même (pas l'un de ses tracés). */
const aimsAtBee = (selector: string) => target(selector).includes('[data-wait]')

/** Les règles qui cachent la page : `visibility: hidden` sur les enfants de <body>. */
const hidingRules = sheet.rules.filter(
  (rule) => rule.declarations.visibility === 'hidden' && rule.selectors.some(aimsAtPage),
)

/** Les règles qui montrent l'abeille : un `display` autre que `none` sur l'abeille. */
const beeShowingRules = sheet.rules.filter(
  (rule) =>
    rule.selectors.some(aimsAtBee) &&
    rule.declarations.display !== undefined &&
    rule.declarations.display !== 'none',
)

/** Les animations d'une valeur `animation` (`a 1s, b 0s 10s forwards` en donne deux). */
const segments = (value: string | undefined) => splitTopLevel(value ?? '')

/** Les durées d'une animation, dans l'ordre : la première est sa durée, la seconde son attente. */
const timesOf = (segment: string) =>
  segment.split(/\s+/).filter((word) => /^\d+(\.\d+)?m?s$/.test(word))

/** Le nom d'une animation : le mot qui nomme l'un des `@keyframes` de la feuille. */
const nameOf = (segment: string) =>
  segment.split(/\s+/).find((word) => word in sheet.keyframes) ?? null

/** Une animation qui ne dure rien et part au bout de 10 s, et qui laisse son état final. */
const atTenSeconds = (segment: string) => {
  const [duration, delay] = timesOf(segment)
  return duration === '0s' && delay === '10s' && /\b(forwards|both)\b/.test(segment)
}

/** Des `@keyframes` qui font disparaître ce qu'ils animent. */
const hides = (keyframes: string | undefined) => {
  const body = compactValue(keyframes ?? '')
  return (
    body.includes('visibility:hidden') ||
    body.includes('display:none') ||
    body.includes('opacity:0')
  )
}

/** Vrai si la règle fait partir l'abeille au bout de 10 s (sa propre animation de sortie). */
const sendsBeeAwayAtTenSeconds = (rule: CssRule) =>
  rule.selectors.some(aimsAtBee) &&
  segments(rule.declarations.animation).some(
    (segment) => atTenSeconds(segment) && hides(sheet.keyframes[nameOf(segment) ?? '']),
  )

describe('the web page before the app starts', () => {
  it('hides the pre-rendered page above 700 px before hydration, by day too', () => {
    // Témoin : la règle de nuit, déjà là, cache la page sur tout appareil en mode sombre.
    expect(hidingRules.some((rule) => underMedia(rule, DARK))).toBe(true)
    // Au-dessus de 700 points, de jour comme de nuit : une règle sans condition de couleur.
    const wide = hidingRules.filter(
      (rule) => underMedia(rule, WIDE) && !underMedia(rule, 'prefers-color-scheme'),
    )
    expect(wide).not.toEqual([])
    for (const rule of wide) {
      expect(rule.selectors.some((selector) => selector.startsWith(NOT_HYDRATED))).toBe(true)
    }
  })

  it('never hides the wait element with the page-hiding rule', () => {
    expect(hidingRules).not.toEqual([]) // témoin
    for (const rule of hidingRules) {
      for (const selector of rule.selectors.filter(aimsAtPage)) {
        expect(selector).toContain(':not([data-wait])')
      }
    }
  })

  it('reveals the page and hides the waiting bee after 10 s, even with reduced motion', () => {
    // La page : chaque règle qui la cache la montre d'elle-même au bout de 10 s (le filet sans
    // script), par l'animation `reveal`, qui la rend visible et le reste.
    expect(hidingRules).not.toEqual([]) // témoin
    for (const rule of hidingRules) {
      const reveal = segments(rule.declarations.animation).find(
        (segment) => nameOf(segment) === 'reveal',
      )
      expect(reveal).toBeDefined()
      expect(atTenSeconds(reveal ?? '')).toBe(true)
    }
    expect(compactValue(sheet.keyframes.reveal ?? '')).toContain('visibility:visible')
    // L'abeille : sa propre sortie, au même moment.
    expect(sheet.rules.some(sendsBeeAwayAtTenSeconds)).toBe(true)

    // « Réduire les animations » n'arrête que le vol de l'abeille : ni la page, ni `reveal`, ni la
    // sortie de l'abeille (un `animation: none` trop large garderait la page cachée pour toujours).
    const calm = sheet.rules.filter((rule) => underMedia(rule, REDUCED))
    expect(calm).not.toEqual([]) // témoin : l'abeille vole, et s'arrête sous ce réglage
    for (const rule of calm) {
      expect(rule.selectors.every((selector) => selector.includes('[data-wait]'))).toBe(true)
      expect(rule.selectors.some(aimsAtPage)).toBe(false)
      expect(JSON.stringify(rule.declarations)).not.toContain('reveal')
      if (rule.selectors.some(aimsAtBee)) {
        // Sur l'abeille elle-même, une animation redéfinie garde la sortie à 10 s, jamais en pause.
        expect(rule.declarations['animation-play-state']).toBeUndefined()
        expect(rule.declarations['animation-name']).toBeUndefined()
        if (rule.declarations.animation !== undefined) {
          expect(sendsBeeAwayAtTenSeconds(rule)).toBe(true)
        }
      }
    }
  })

  it('keeps the wait bee out of the page flow', () => {
    // Posée par-dessus la page, au centre de la fenêtre : elle ne pousse rien, et ne prend aucun
    // clic (la page, montrée par le filet, reste utilisable dessous).
    const own = sheet.rules.filter(
      (rule) => rule.media.length === 0 && rule.selectors.some(aimsAtBee),
    )
    const declared = Object.assign({}, ...own.map((rule) => rule.declarations)) as Record<
      string,
      string
    >
    expect(declared.position).toBe('fixed')
    expect(declared['pointer-events']).toBe('none')
  })

  it('hides the wait bee on a day phone, where the page shows at once', () => {
    // Par défaut, sans condition : pas d'abeille.
    const base = sheet.rules.filter(
      (rule) =>
        rule.media.length === 0 &&
        rule.selectors.some((selector) => aimsAtBee(selector) && !selector.includes(':not(')),
    )
    expect(base.some((rule) => rule.declarations.display === 'none')).toBe(true)
    // Elle n'est montrée qu'au-dessus de 700 points ou en mode sombre, avant le démarrage.
    expect(beeShowingRules.some((rule) => underMedia(rule, WIDE))).toBe(true)
    expect(beeShowingRules.some((rule) => underMedia(rule, DARK))).toBe(true)
    for (const rule of beeShowingRules) {
      expect(underMedia(rule, WIDE) || underMedia(rule, DARK)).toBe(true)
    }
  })

  it('removes the wait bee once the page is hydrated or revealed by the 10 s net', () => {
    // Chaque règle qui la montre ne vaut qu'avant le démarrage : une fois `data-hydrated` posé (par
    // l'appli, ou par le filet de ThemeProvider), la règle de base la cache de nouveau.
    expect(beeShowingRules).not.toEqual([]) // témoin
    for (const rule of beeShowingRules) {
      for (const selector of rule.selectors.filter(aimsAtBee)) {
        expect(selector.startsWith(NOT_HYDRATED)).toBe(true)
      }
    }
    // Sans aucun script (ni appli ni filet de ThemeProvider), sa sortie à 10 s, comme la page.
    expect(sheet.rules.some(sendsBeeAwayAtTenSeconds)).toBe(true)
  })

  it('paints the wait bee from the day and night palettes', () => {
    // Les rôles du logo (ui/Logo.tsx) : l'encre `text`, le miel `honey`, les ailes `surface` ; de
    // jour par défaut, de nuit en mode sombre. Le dessin, lui, n'a aucune couleur (html.test.tsx).
    const valuesOf = (rules: CssRule[]) =>
      rules
        .filter((rule) => rule.selectors.some((selector) => selector.includes('[data-wait]')))
        .flatMap((rule) => Object.values(rule.declarations))
        .join(' ')
        .toLowerCase()
    const day = valuesOf(sheet.rules.filter((rule) => !underMedia(rule, DARK)))
    const night = valuesOf(sheet.rules.filter((rule) => underMedia(rule, DARK)))
    for (const role of ['text', 'honey', 'surface'] as const) {
      expect(day).toContain(palettes.day[role].toLowerCase())
      expect(night).toContain(palettes.night[role].toLowerCase())
    }
  })

  it('writes no colour by hand, only colours of the day and night palettes', () => {
    const known = new Set(
      [...Object.values(palettes.day), ...Object.values(palettes.night)].map((value) =>
        String(value).toLowerCase(),
      ),
    )
    const written = documentCss.match(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\([^)]*\)/g) ?? []
    expect(written.length).toBeGreaterThan(0) // témoin : le fond de la page est bien écrit
    for (const colour of written) expect(known).toContain(colour.toLowerCase())
  })
})

describe('the wait bee drawing', () => {
  it('draws the launch bee alone, without a word', () => {
    // L'abeille du lancement (décision du 28/10 : « l'abeille est gardée pour le lancement ») : ses
    // trois couches, dans son propre cadre, sans le « w ».
    expect(waitBeeMarkup).toContain('<svg')
    expect(waitBeeMarkup).toContain(beeViewBox)
    for (const path of [bee.ink, bee.honey, bee.wing]) expect(waitBeeMarkup).toContain(path)
    // Aucun texte : rien à lire pour un lecteur d'écran, rien à traduire.
    expect(waitBeeMarkup.replace(/<[^>]*>/g, '').trim()).toBe('')
  })
})
