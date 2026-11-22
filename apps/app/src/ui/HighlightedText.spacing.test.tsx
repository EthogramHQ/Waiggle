// Tests de la ponctuation dans un texte surligné (R18, scénario « Les textes des membres bien
// ponctués ») : le surlignage d'une recherche est calculé sur le texte enregistré, puis reporté sur
// le texte affiché, où l'espace tapée devant ? ! : ; est devenue insécable. Comme cette espace ne
// change pas la longueur du texte, le surlignage tombe toujours sur les bonnes lettres.
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut des nœuds rendus.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { HighlightedText } from './HighlightedText'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Tout le texte d'un nœud rendu, ses enfants compris, sans rien ramener. */
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Les parties surlignées : les textes imbriqués dans le texte entier, dans l'ordre. */
const marks = (text: Node): string[] =>
  text.children.filter((child): child is Node => typeof child !== 'string').map(textOf)

describe('HighlightedText, the punctuation of a member', () => {
  it('highlights « marche ? » and keeps the space before ? non-breaking', async () => {
    await renderWithProviders(<HighlightedText text="Ça marche ? Oui" words={['marche ?']} />)

    // Le texte entier reste un seul nœud lu (trouvé malgré l'espace insécable : RNTL la ramène).
    const found = screen.getAllByText('Ça marche ? Oui')
    expect(found).toHaveLength(1)
    const whole = found[0] as unknown as Node
    expect(textOf(whole)).toBe(`Ça marche${NNBSP}? Oui`)
    // Le surlignage couvre « marche ? », espace insécable comprise, ni plus ni moins.
    expect(marks(whole)).toEqual([`marche${NNBSP}?`])
  })

  it('keeps the highlight in place after an emoji and a protected space', async () => {
    // Un emoji compte deux unités UTF-16, l'espace insécable une seule, comme l'espace tapée.
    await renderWithProviders(<HighlightedText text="🚀 Prêt ? Décollage" words={['decollage']} />)

    const whole = screen.getAllByText('🚀 Prêt ? Décollage')[0] as unknown as Node
    expect(textOf(whole)).toBe(`🚀 Prêt${NNBSP}? Décollage`)
    expect(marks(whole)).toEqual(['Décollage'])
  })
})
