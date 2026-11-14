// Tests de la marque d'une photo de la galerie (R9) : la photo retirée par la modération reste dans
// la galerie de son auteur, marquée « Retiré par la modération ». La marque s'écrit sur la photo et
// s'entend dans son nom, après sa place ; une photo sans marque ne change pas.
import { screen, within } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const MARK = fr.t(($) => $.removal.banner)

/** Trois photos, la 2e marquée. */
const photos: GalleryPhoto[] = [1, 2, 3].map((n) => ({
  key: `visual-${n}`,
  source: { uri: `https://media.example.test/visual-${n}.webp` },
  thumbhash: null,
  mark: n === 2 ? MARK : null,
}))

const spoken = (index: number, count: number) => fr.t(($) => $.gallery.photoOf, { index, count })

describe('a marked photo in a PhotoGallery', () => {
  it('writes the mark on the photo, inside the gallery', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} />)

    const gallery = screen.getByRole('adjustable', { name: fr.t(($) => $.gallery.label) })
    expect(within(gallery).getAllByText(MARK)).toHaveLength(1)
  })

  it('says the mark after the place of the photo, and only for that photo', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} />)

    expect(
      screen.getByLabelText(fr.t(($) => $.gallery.marked, { photo: spoken(2, 3), mark: MARK })),
    ).toBeTruthy()
    // Témoins : les deux autres photos gardent leur nom.
    expect(screen.getByLabelText(spoken(1, 3))).toBeTruthy()
    expect(screen.getByLabelText(spoken(3, 3))).toBeTruthy()
  })

  it('names a single marked photo with its mark', async () => {
    const [, marked] = photos
    if (!marked) throw new Error('a marked photo expected')
    await renderWithProviders(<PhotoGallery photos={[marked]} />)

    expect(
      screen.getByRole('image', {
        name: fr.t(($) => $.gallery.marked, { photo: fr.t(($) => $.gallery.label), mark: MARK }),
      }),
    ).toBeTruthy()
  })
})
