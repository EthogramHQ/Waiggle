// Tests de l'outil qui pose la typographie française (pnpm typo:fix). Les espaces insécables
// seraient invisibles dans le code : on les écrit ${N} (fine insécable) et ${B} (insécable).
import { describe, expect, it } from 'vitest'
import { resources } from '../src/index'
import { fixSource, fixText } from './typography-fix'

const N = String.fromCodePoint(0x202f)
const B = String.fromCodePoint(0x00a0)

type Tree = { [key: string]: string | Tree }
const texts = (tree: Tree): string[] =>
  Object.values(tree).flatMap((value) => (typeof value === 'string' ? [value] : texts(value)))

describe('typo:fix', () => {
  it('puts the right space before ? ! ; and :', () => {
    expect(fixText('Où en est-il ?').text).toBe(`Où en est-il${N}?`)
    expect(fixText('Bravo!').text).toBe(`Bravo${N}!`)
    expect(fixText('Un ; deux').text).toBe(`Un${N}; deux`)
    expect(fixText('Outils: facultatif').text).toBe(`Outils${B}: facultatif`)
    expect(fixText(`Privé${N}: visible`).text).toBe(`Privé${B}: visible`)
  })

  it('puts no-break spaces inside quotation marks', () => {
    expect(fixText('« Publier »').text).toBe(`«${B}Publier${B}»`)
    expect(fixText('«Publier»').text).toBe(`«${B}Publier${B}»`)
  })

  it('uses the typographic apostrophe and leaves addresses and parameters alone', () => {
    expect(fixText("L'IA").text).toBe('L’IA')
    expect(fixText('Voir https://exemple.org').count).toBe(0)
    expect(fixText('{{name}}!').text).toBe(`{{name}}${N}!`)
  })

  it('changes texts only, never the code, the comments or the keys', () => {
    const source = [
      "// Un commentaire : n'y touche pas !",
      'export const fr = {',
      "  'clé:avec': 'Bonjour {{name}} !',",
      "  intro: 'C\\'est prêt: «ok»',",
      '  ask: "Tu viens ?",',
      '} as const',
      '',
    ].join('\n')
    const { source: fixed, count, lines } = fixSource(source)
    expect(fixed).toBe(
      [
        "// Un commentaire : n'y touche pas !",
        'export const fr = {',
        `  'clé:avec': 'Bonjour {{name}}${N}!',`,
        `  intro: 'C’est prêt${B}: «${B}ok${B}»',`,
        `  ask: 'Tu viens${N}?',`,
        '} as const',
        '',
      ].join('\n'),
    )
    expect(count).toBe(6)
    expect(lines).toEqual([3, 4, 5])
  })

  it('changes nothing the second time', () => {
    const first = fixSource("export const fr = { a: 'Prêt ? Oui: « go » !' }")
    expect(first.count).toBe(5)
    expect(fixSource(first.source)).toEqual({ source: first.source, count: 0, lines: [] })
  })

  it('agrees with the typography test: the current French texts need no fix', () => {
    for (const text of texts(resources.fr.translation)) {
      expect(fixText(text), text).toEqual({ text, count: 0 })
    }
  })
})
