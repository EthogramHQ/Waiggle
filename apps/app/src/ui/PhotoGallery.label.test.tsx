// Tests du nom de la galerie de photos (R7a, relecture du plan, interface B1) : la page projet
// montre deux galeries, celle du projet et celle de sa dernière mise à jour. Avec un seul nom fixe,
// « Photos du projet », un lecteur d'écran entendait deux fois la même chose. La galerie prend donc
// le nom qu'on lui donne (`label`, « Photos de la mise à jour »), et garde « Photos du projet » sans.
//
// L'interface attendue de `src/ui/PhotoGallery.tsx` (plan R7a, « API fixées au lancement ») :
// une prop `label?: string`, par défaut `gallery.label`. À part de PhotoGallery.test.tsx : U1b la
// pose, et seul ce fichier échoue tant qu'elle manque.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Deux photos d'une mise à jour, comme les donne l'API (adresse et résumé flou). */
const photos: GalleryPhoto[] = [1, 2].map((n) => ({
  key: `visual-${n}`,
  source: { uri: `https://media.example.test/visual-${n}.webp` },
  thumbhash: null,
}))

const updatePhotos = fr.t(($) => $.project.updates.photosLabel)
const projectPhotos = fr.t(($) => $.gallery.label)

describe('the name of a PhotoGallery', () => {
  // Relecture du plan, interface B1 : `it('takes the name it is given')` →
  // `getByLabelText('Photos de la mise à jour')`.
  it('takes the name it is given', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} label={updatePhotos} />)

    expect(screen.getByLabelText(updatePhotos)).toBeTruthy()
    expect(screen.queryByLabelText(projectPhotos)).toBeNull()
  })

  // Témoin : l'usage d'aujourd'hui (la page projet) ne change pas.
  it('keeps « Photos du projet » when given no name', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} />)

    expect(screen.getByLabelText(projectPhotos)).toBeTruthy()
  })
})
