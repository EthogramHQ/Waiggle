// Tests de la mise en page d'une note du journal (relecture de design de R5a, C3) : sur un grand
// écran, le texte garde une longueur de ligne confortable (`readableWidth`), mais le bouton de la
// note (corbeille ou drapeau) reste calé au bord droit de la carte du journal, au lieu de flotter
// au bout de la ligne bornée, au milieu de la carte. Les autres tests du journal sont dans
// components.test.tsx.
import { readableWidth } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { NoteList } from './NoteList'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const body =
  'Une note très longue, pour voir la coupure. Une note très longue, pour voir la coupure.'
const notes = [{ id: 'n1', body, when: 'hier' }]

type Node = { props: Record<string, unknown>; parent: Node | null }

/** Les `maxWidth` posés sur l'élément et ses ancêtres, jusqu'à la note (son `listitem`) comprise. */
const boundsUpToNote = (element: Node) => {
  const bounds: unknown[] = []
  let node: Node | null = element
  while (node) {
    const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
    if (style?.maxWidth !== undefined) bounds.push(style.maxWidth)
    if (node.props.role === 'listitem') break
    node = node.parent
  }
  return bounds
}

describe('a note of the journal on a large screen', () => {
  it('keeps its text to a comfortable line length (readableWidth at most)', async () => {
    await renderWithProviders(<NoteList notes={notes} onDelete={() => {}} />)

    const text = screen.getByText(body) as unknown as Node
    const bounds = boundsUpToNote(text)
    expect(bounds.length).toBeGreaterThan(0)
    expect(bounds.every((bound) => typeof bound === 'number' && bound <= readableWidth)).toBe(true)
  })

  it('keeps « Supprimer la note » at the edge of the card, not at the end of the bounded line', async () => {
    await renderWithProviders(<NoteList notes={notes} onDelete={() => {}} />)

    const button = screen.getByRole('button', { name: 'Supprimer la note' }) as unknown as Node
    expect(boundsUpToNote(button)).toEqual([])
  })

  it('keeps « Signaler cette note » at the edge of the card too', async () => {
    await renderWithProviders(<NoteList notes={notes} onReport={() => {}} />)

    const button = screen.getByRole('button', { name: 'Signaler cette note' }) as unknown as Node
    expect(boundsUpToNote(button)).toEqual([])
  })
})
