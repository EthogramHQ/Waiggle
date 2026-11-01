// Tests du texte surligné (refonte, tranche R3, scénario « La recherche par mots » : « la partie du
// texte qui correspond est surlignée de miel »). Le composant reçoit le texte d'origine et les mots
// cherchés (repliés par `searchWords` : minuscules, sans accents) ; il retrouve chaque mot dans le
// texte replié (`foldWithMap` du contrat) et surligne la partie correspondante du texte d'origine :
// « Élève » pour « eleve », « Œu » de « Œuvre » pour « oeu ». Le texte reste un seul nœud lu d'un
// tenant par les lecteurs d'écran ; les parties surlignées sont des textes imbriqués dedans, le
// reste du texte nu.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { HighlightedText } from './HighlightedText'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[]; parent?: Node | null }

/** Tout le texte d'un nœud rendu, ses enfants compris. */
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/**
 * Les parties surlignées d'un texte rendu : ses enfants qui sont des éléments (des textes
 * imbriqués), dans l'ordre ; le texte nu entre eux n'est pas surligné. On ne lit aucun style.
 */
const marks = (text: Node): string[] =>
  text.children.filter((child): child is Node => typeof child !== 'string').map(textOf)

/** Le texte entier, trouvé une seule fois : un seul nœud le porte. */
const whole = (text: string): Node => {
  const found = screen.getAllByText(text)
  expect(found).toHaveLength(1)
  return found[0] as unknown as Node
}

describe('HighlightedText', () => {
  it('marks « Élève » for « eleve », and keeps the whole text in one node', async () => {
    await renderWithProviders(<HighlightedText text="Mon Élève préféré" words={['eleve']} />)

    expect(marks(whole('Mon Élève préféré'))).toEqual(['Élève'])
  })

  it('marks « Œu » of « Œuvre » for « oeu » (one letter folded into two)', async () => {
    await renderWithProviders(<HighlightedText text="Œuvre du matin" words={['oeu']} />)

    expect(marks(whole('Œuvre du matin'))).toEqual(['Œu'])
  })

  it('marks every word, wherever it appears', async () => {
    await renderWithProviders(
      <HighlightedText text="Carnet de cafés, le café du matin" words={['carn', 'cafe']} />,
    )

    expect(marks(whole('Carnet de cafés, le café du matin'))).toEqual(['Carn', 'café', 'café'])
  })

  it('marks nothing without words', async () => {
    await renderWithProviders(<HighlightedText text="Carnet de cafés" words={[]} />)

    expect(marks(whole('Carnet de cafés'))).toEqual([])
  })

  it('marks nothing when no word is in the text', async () => {
    await renderWithProviders(<HighlightedText text="Carnet de cafés" words={['carnaval']} />)

    expect(marks(whole('Carnet de cafés'))).toEqual([])
  })

  it('folds the words too: « ÉLÈVE » finds « Élève »', async () => {
    await renderWithProviders(<HighlightedText text="Mon Élève préféré" words={['ÉLÈVE']} />)

    expect(marks(whole('Mon Élève préféré'))).toEqual(['Élève'])
  })

  it('marks a whole text that is the word', async () => {
    await renderWithProviders(<HighlightedText text="Café" words={['cafe']} />)

    // Le texte entier est surligné : `getAllByText` (RNTL 14) rend le nœud le plus profond qui dit
    // « Café », c'est-à-dire la partie surlignée elle-même ; le texte qui la porte est son parent.
    // (Correction de la session, R3 : l'aide `whole` seule ne pouvait pas trouver ce parent.)
    const highlighted = whole('Café')
    expect(marks(highlighted.parent as Node)).toEqual(['Café'])
  })

  it('passes the other props of Text on (numberOfLines)', async () => {
    await renderWithProviders(
      <HighlightedText text="Carnet de cafés" words={['carn']} numberOfLines={1} />,
    )

    expect(whole('Carnet de cafés').props.numberOfLines).toBe(1)
  })

  // Relecture de design de R3 (point 9) : le miel pâle fait 1,25:1 contre la carte blanche ; la
  // couleur ne porte pas seule ce qui est trouvé (WCAG 1.4.1). La partie surlignée est plus grasse
  // que le texte autour, qu'il soit courant ou déjà semi-gras (un titre de résultat). La graisse
  // est dans le fichier de police : on compare les polices, pas une valeur précise.
  it.each([
    ['in a plain text', {}],
    ['in a semi-bold title', { weight: 600 as const }],
  ])('marks the found part in a bolder weight %s, not by colour alone', async (_, props) => {
    await renderWithProviders(
      <HighlightedText text="Carnet de cafés" words={['carn']} {...props} />,
    )

    const text = whole('Carnet de cafés')
    const mark = text.children.find((child): child is Node => typeof child !== 'string')
    // La graisse se lit à la fin du nom de la police (« FunnelSans-600 »).
    const weightOf = (node: Node | undefined) => {
      const family = (node?.props.style as { fontFamily?: string } | undefined)?.fontFamily
      return Number(family?.match(/-(\d+)$/)?.[1] ?? Number.NaN)
    }
    expect(weightOf(mark)).toBeGreaterThan(weightOf(text))
  })
})
