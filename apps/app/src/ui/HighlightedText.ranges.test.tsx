// Tests ajoutés par l'interface (R3, ui-dev C3) : les positions surlignées, reportées du texte replié
// vers le texte d'origine (emoji avant le mot, « œ » coupé en deux, mots qui se chevauchent), et le
// cas d'un texte entièrement surligné, lu par un autre chemin que `getAllByText` : RNTL 14 n'y
// garde que le texte le plus profond qui correspond (`matchDeepestOnly`), c'est-à-dire la partie
// surlignée elle-même quand elle couvre tout le texte.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { HighlightedText, highlightRanges } from './HighlightedText'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les morceaux surlignés, lus dans le texte d'origine. */
const pieces = (text: string, words: string[]) =>
  highlightRanges(text, words).map(([start, end]) => text.slice(start, end))

describe('highlightRanges', () => {
  it('finds the word after an emoji (two UTF-16 units for one character)', () => {
    expect(pieces('🐝 Notion', ['ot'])).toEqual(['ot'])
  })

  it('takes the whole « œ » when a match ends in its middle', () => {
    // « o » est la première des deux lettres de « œ » : on ne coupe pas le caractère en deux.
    expect(pieces('Œuvre', ['o'])).toEqual(['Œ'])
    expect(pieces('cœur', ['eu'])).toEqual(['œu'])
  })

  it('merges matches that overlap or touch', () => {
    expect(pieces('Carnet', ['carn', 'net'])).toEqual(['Carnet'])
    expect(pieces('aaaa', ['aa'])).toEqual(['aaaa'])
  })

  it('ignores an empty word', () => {
    expect(highlightRanges('Carnet', [''])).toEqual([])
  })
})

describe('HighlightedText, a text that is the word', () => {
  it('marks the whole text inside the one text node', async () => {
    await renderWithProviders(<HighlightedText text="Café" words={['cafe']} />)

    // Le texte le plus profond qui dit « Café » est la partie surlignée ; son parent est le texte
    // entier, qui n'a qu'elle pour enfant.
    const mark = screen.getByText('Café') as unknown as {
      parent: { children: unknown[] } | null
    }
    // Des valeurs simples, jamais une instance dans `expect` : un écart sur une instance s'écrit
    // sans fin (code-appli.md).
    expect(mark.parent?.children.length).toBe(1)
    expect(mark.parent?.children[0] === mark).toBe(true)
  })
})
