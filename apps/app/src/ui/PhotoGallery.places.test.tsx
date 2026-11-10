// Tests ajoutés en U4 à ceux de PhotoGallery.test.tsx : ce qui se pose sur la galerie
// (`overlay`, les places de ProjectCover.tsx), la galerie sans photo, et le saut d'une photo à
// l'autre par une flèche, que les positions lues en chemin ne doivent pas défaire.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { IconButton } from './IconButton'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'
import { CoverControls, CoverStraddle } from './ProjectCover'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const label = fr.t(($) => $.gallery.label)
const next = fr.t(($) => $.gallery.next)
const countOf = (index: number, count: number) => fr.t(($) => $.gallery.count, { index, count })

const photos: GalleryPhoto[] = [1, 2, 3].map((n) => ({
  key: `visual-${n}`,
  source: { uri: `https://media.example.test/visual-${n}.webp` },
  thumbhash: null,
}))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** La bande horizontale (l'élément natif du ScrollView). */
const band = (): Record<string, unknown> => {
  let found: Node | null = null
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === 'RCTScrollView' && node.props.horizontal === true) found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error('no horizontal ScrollView rendered')
  return (found as Node).props
}

/** Ce que React Native enverrait pour une bande de 390 points arrêtée à `x`. */
const at = (x: number) => ({
  nativeEvent: {
    contentOffset: { x, y: 0 },
    layoutMeasurement: { width: 390, height: 300 },
    contentSize: { width: 390 * 3, height: 300 },
  },
})

describe('PhotoGallery, its places and its jumps', () => {
  it('lays the glass buttons and the straddling element over the photos', async () => {
    const back = jest.fn()
    await renderWithProviders(
      <PhotoGallery
        photos={photos}
        overlay={
          <>
            <CoverControls start={<IconButton icon="arrow-left" label="Retour" onPress={back} />} />
            <CoverStraddle>
              <IconButton icon="share-network" label="Partager" onPress={() => {}} />
            </CoverStraddle>
          </>
        }
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Retour' }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Partager' })).toBeTruthy()
  })

  it('keeps the honey light and its title when there is no photo, with nothing to adjust', async () => {
    await renderWithProviders(<PhotoGallery photos={[]} title="Décollage !" />)

    // Le titre décore la couverture (lu ailleurs sur la page) : caché au lecteur d'écran.
    expect(screen.getByText('Décollage !', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByLabelText(label)).toBeNull()
  })

  it('does not go back through skipped photos while sliding to the next one', async () => {
    const restore = setDesktopWindow()
    try {
      const onIndexChange = jest.fn()
      await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)
      await act(async () => {
        ;(band().onLayout as (e: object) => void)({
          nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 300 } },
        })
      })

      await fireEvent.press(screen.getByRole('button', { name: next }))
      // La bande glisse de 0 à 390 : une position lue en chemin (100) ne ramène pas à la 1re photo.
      await act(async () => {
        ;(band().onScroll as (e: object) => void)(at(100))
      })

      expect(screen.getByText(countOf(2, 3))).toBeTruthy()
      expect(onIndexChange.mock.calls).toEqual([[1]])
    } finally {
      restore()
    }
  })
})
