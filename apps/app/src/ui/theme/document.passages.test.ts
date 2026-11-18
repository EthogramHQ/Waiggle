// Tests des règles des passages de page dans la feuille de style de la page web (R17, `documentCss`,
// ui/theme/document.ts) : le navigateur anime les passages (View Transitions) d'après ces règles,
// écrites depuis les jetons. La lumière d'ambiance (la racine) ne bouge pas ; le contenu de la page
// (`wg-page`) s'efface en 160 ms pendant que le nouveau monte de 12 points en 320 ms ; le retour fait
// l'inverse ; les onglets se fondent en 180 ms ; les barres et les toasts restent au-dessus, sans
// animation ; la photo partagée (`wg-cover`) vole en 420 ms sur la courbe du ressort `open`.
// Jest ne dessine rien : on lit les règles (src/testing/css.ts).
import { durations, easings, space, springs } from '@ruche/brand'
import { type CssRule, compactValue, parseCss, underMedia } from '../../testing/css'
import { documentCss } from './document'
import { springEasing } from './springEasing'

const sheet = parseCss(documentCss)
const REDUCED = '(prefers-reduced-motion: reduce)'

/** Les règles hors « Réduire les animations » dont un sélecteur contient ce morceau. */
const rulesFor = (fragment: string, { reduced = false } = {}): CssRule[] =>
  sheet.rules.filter(
    (rule) =>
      underMedia(rule, REDUCED) === reduced &&
      rule.selectors.some((selector) => compactValue(selector).includes(compactValue(fragment))),
  )

/** Toutes les déclarations de ces règles, en un texte compact (sans blancs, en minuscules). */
const declared = (rules: CssRule[]) =>
  compactValue(
    rules
      .flatMap((rule) =>
        Object.entries(rule.declarations).map(([key, value]) => `${key}:${value};`),
      )
      .join(''),
  )

/** Les images clés nommées dans ces déclarations, mises bout à bout. */
const keyframesOf = (rules: CssRule[]) =>
  compactValue(
    Object.entries(sheet.keyframes)
      // Le nom entier : `wg-in` ne doit pas ramasser les images de `wg-in-back`.
      .filter(([name]) =>
        new RegExp(`(^|[^a-z0-9-])${name.toLowerCase()}([^a-z0-9-]|$)`).test(declared(rules)),
      )
      .map(([, body]) => body)
      .join(''),
  )

const exitCurve = compactValue(`cubic-bezier(${easings.exit.join(', ')})`)

describe('documentCss, the layers of a passage', () => {
  it('names the page content, the top bar, the tab bar and the toasts during a passage', () => {
    for (const [mark, name] of [
      ['[data-passage-page]', 'wg-page'],
      ['[data-passage-bar]', 'wg-bar'],
      ['[data-passage-tabbar]', 'wg-tabbar'],
      ['[data-passage-toast]', 'wg-toast'],
    ] as const) {
      const rules = rulesFor(mark).filter((rule) =>
        rule.selectors.some((selector) => selector.includes('html[data-passage]')),
      )
      expect(declared(rules)).toContain(`view-transition-name:${name}`)
    }
  })

  it('never animates the root, where the ambient light lives', () => {
    expect(declared(rulesFor('::view-transition-old(root)'))).toContain('animation:none')
    expect(declared(rulesFor('::view-transition-new(root)'))).toContain('animation:none')
  })

  it('keeps the bars and the toasts above the page, without animation', () => {
    for (const name of ['wg-bar', 'wg-tabbar', 'wg-toast']) {
      const group = declared(rulesFor(`::view-transition-group(${name})`))
      expect(group).toContain('z-index:2')
      expect(group).toContain('animation:none')
    }
  })

  it('never stops the clicks on the passage layer (S3)', () => {
    const passageRules = sheet.rules.filter((rule) =>
      rule.selectors.some((selector) => selector.includes('::view-transition')),
    )
    expect(declared(passageRules)).not.toContain('pointer-events:none')
  })
})

describe('documentCss, going deeper and back', () => {
  it('fades the old page out in 160 ms and the new one in, rising 12 points in 320 ms', () => {
    const old = rulesFor('::view-transition-old(wg-page)')
    const fresh = rulesFor('::view-transition-new(wg-page)')

    expect(declared(old)).toContain(`${durations.quick}ms`)
    expect(declared(fresh)).toContain(`${durations.base}ms`)
    expect(declared(fresh)).toContain(exitCurve)
    expect(keyframesOf(fresh)).toContain(`translatey(${space.md}px)`)
  })

  it('makes the way back the reverse: the page before comes down 12 points', () => {
    const back = rulesFor('::view-transition-new(wg-page)').filter((rule) =>
      rule.selectors.some((selector) => /data-passage="?back"?\]/.test(selector)),
    )

    expect(back.length).toBeGreaterThan(0)
    expect(keyframesOf(back)).toContain(`translatey(-${space.md}px)`)
  })

  it('cross-fades sibling tabs in 180 ms, without moving', () => {
    const sibling = [
      ...rulesFor('::view-transition-old(wg-page)'),
      ...rulesFor('::view-transition-new(wg-page)'),
    ].filter((rule) =>
      rule.selectors.some((selector) => /data-passage="?sibling"?\]/.test(selector)),
    )

    expect(sibling.length).toBeGreaterThan(0)
    expect(declared(sibling)).toContain(`${durations.page}ms`)
    expect(keyframesOf(sibling)).not.toContain('translate')
  })
})

describe('documentCss, the shared cover', () => {
  it('flies the cover in 420 ms on the curve of the open spring, above everything', () => {
    const group = declared(rulesFor('::view-transition-group(wg-cover)'))

    expect(group).toContain(`${durations.medium}ms`)
    expect(group).toContain(compactValue(springEasing(springs.open, durations.medium)))
    expect(group).toContain('z-index:3')
  })

  it('keeps the photo cropped like the card while it flies', () => {
    expect(declared(rulesFor('::view-transition-image-pair(wg-cover)'))).toContain('overflow:clip')
    expect(declared(rulesFor('::view-transition-old(wg-cover)'))).toContain('object-fit:cover')
    expect(declared(rulesFor('::view-transition-new(wg-cover)'))).toContain('object-fit:cover')
  })
})

describe('documentCss, with reduced motion', () => {
  it('turns every passage into a 180 ms cross-fade, without moving', () => {
    const reduced = sheet.rules.filter(
      (rule) =>
        underMedia(rule, REDUCED) &&
        rule.selectors.some((selector) => selector.includes('::view-transition')),
    )

    expect(reduced.length).toBeGreaterThan(0)
    expect(declared(reduced)).toContain(`${durations.page}ms`)
    expect(keyframesOf(reduced)).not.toContain('translate')
    expect(keyframesOf(reduced)).not.toContain('scale')
  })
})
