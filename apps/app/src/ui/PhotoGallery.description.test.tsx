// Tests ajoutés par l'interface de R6a à la galerie de photos (PhotoGallery.test.tsx reste celui du
// test-writer) : une photo seule décrite n'est jamais lue « photo 1 sur 1 », ni par la galerie ni
// par l'image qu'elle contient (le navigateur expose les deux, vu dans `--explore`) ; une
// description faite de blancs ne décrit rien.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les noms et valeurs que l'arbre expose, cachés compris (le web peut les lire). */
const names = (): string[] => {
  const found: string[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    const { props } = node
    const value = (props.accessibilityValue as { text?: string } | undefined)?.text
    for (const text of [props.accessibilityLabel, props['aria-label'], value]) {
      if (typeof text === 'string') found.push(text)
    }
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

const photo = (description: string | null): GalleryPhoto => ({
  key: 'visual-1',
  source: { uri: 'https://media.example.test/visual-1.webp' },
  thumbhash: null,
  description,
})

const sky = 'Le ciel de ce soir, la Lune au-dessus des toits'

describe('PhotoGallery, a single photo (R6a)', () => {
  it('names a single described photo by its description, never « photo 1 sur 1 »', async () => {
    await renderWithProviders(<PhotoGallery photos={[photo(sky)]} />)

    expect(screen.getByLabelText(sky)).toBeTruthy() // témoin : la photo est nommée
    expect(names().filter((text) => /1\s+sur\s+1/.test(text))).toEqual([])
  })

  it('takes a description made of spaces as no description', async () => {
    await renderWithProviders(<PhotoGallery photos={[photo('   ')]} />)

    expect(screen.getByLabelText(fr.t(($) => $.gallery.label))).toBeTruthy()
  })
})
