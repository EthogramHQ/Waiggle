// La zone de dépôt des photos n'existe que sur une largeur d'ordinateur (R6a, correction C4, D4) :
// plus étroit (téléphone, tablette), « Ajouter » et « choisis-les » feraient la même chose, la
// tuile « + Ajouter » reste seule. Le dépôt de fichiers lui-même est testé dans PhotoTiles.test.tsx.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { lendWebPage } from '../testing/arrivedFocus'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { PhotoTiles, type PhotoTilesLabels } from './PhotoTiles'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const labels: PhotoTilesLabels = {
  list: fr.t(($) => $.project.form.photosList),
  add: fr.t(($) => $.project.form.addPhotos),
  addLabel: fr.t(($) => $.project.form.addPhotosLabel),
  cover: fr.t(($) => $.project.form.cover),
  tile: (number: number) => fr.t(($) => $.project.form.photoTile, { number }),
  uploading: (number: number) => fr.t(($) => $.project.form.photoUploading, { number }),
  failed: (number: number, reason: string) =>
    fr.t(($) => $.project.form.photoFailed, { number, reason }),
  move: (number: number) => fr.t(($) => $.project.form.movePhoto, { number }),
  makeCover: fr.t(($) => $.project.form.makeCover),
  earlier: fr.t(($) => $.project.form.movePhotoEarlier),
  later: fr.t(($) => $.project.form.movePhotoLater),
  moved: (place: number) => fr.t(($) => $.project.form.photoMoved, { place }),
  remove: (number: number) => fr.t(($) => $.project.form.removePhoto, { number }),
  dropZone: fr.t(($) => $.project.form.dropZone),
  dropZoneChoose: fr.t(($) => $.project.form.dropZoneChoose),
}

const sample = () => (
  <PhotoTiles
    tiles={[]}
    max={6}
    labels={labels}
    selectedKey={null}
    onSelect={jest.fn()}
    onAdd={jest.fn()}
    onDropFiles={jest.fn()}
    onMove={jest.fn()}
    onRemove={jest.fn()}
  />
)

describe('PhotoTiles, where the drop zone shows (web)', () => {
  it('shows the drop zone at desktop width, beside the "Add" tile', async () => {
    const restorePage = lendWebPage()
    const restoreWindow = setDesktopWindow()
    try {
      await renderWithProviders(sample())
      expect(screen.getByText(labels.dropZone)).toBeTruthy()
      expect(screen.getByRole('button', { name: labels.dropZoneChoose })).toBeTruthy()
      expect(screen.getByRole('button', { name: labels.addLabel })).toBeTruthy()
    } finally {
      restoreWindow()
      restorePage()
    }
  })

  it('shows only the "Add" tile on a phone-width web page: no drop zone, no "choose" link', async () => {
    const restorePage = lendWebPage()
    try {
      expect(Platform.OS).toBe('web')
      await renderWithProviders(sample())
      // Témoin : la tuile « Ajouter » est là ; la zone, non.
      expect(screen.getByRole('button', { name: labels.addLabel })).toBeTruthy()
      expect(screen.queryByText(labels.dropZone)).toBeNull()
      expect(screen.queryByRole('button', { name: labels.dropZoneChoose })).toBeNull()
    } finally {
      restorePage()
    }
  })
})
