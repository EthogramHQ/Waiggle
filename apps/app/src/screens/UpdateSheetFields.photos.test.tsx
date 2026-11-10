// Test de la relecture juridique R7a, C1 : sous « Photos », la feuille « Nouvelle mise à jour » dit
// les formats et le poids (`photosRules`) et le droit à l'image (`photosConsent`), comme le
// formulaire de publication ; et sous le champ de description d'une photo, l'aide qui dit que la
// description est lue à voix haute et qu'on ne nomme personne sans son accord
// (`updates.photoDescriptionHint`, version « mise à jour »).
import { screen } from '@testing-library/react-native'
import type { PhotoActions } from '../projects/usePhotoTiles'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import type { PhotoTile } from '../ui/PhotoTiles'
import { emptyLine, type UpdateFormValues } from '../updates/form'
import { UpdateSheetFields } from './UpdateSheetFields'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const RULES = fr.t(($) => $.project.form.photosRules)
const CONSENT = fr.t(($) => $.project.form.photosConsent)
const HINT = fr.t(($) => $.project.updates.photoDescriptionHint)
const PUBLICATION_HINT = fr.t(($) => $.project.form.photoDescriptionHint)

const form: UpdateFormValues = {
  title: '',
  version: '',
  lines: [emptyLine()],
  beforeAfter: false,
}
const actions: PhotoActions = {
  onAdd: () => {},
  onDropFiles: () => {},
  onMove: () => {},
  onRemove: () => {},
}
const tile = (key: string): PhotoTile => ({
  key,
  state: 'ready',
  image: { source: null, label: '' },
})

const render = (tiles: PhotoTile[], selectedKey: string | null) =>
  renderWithProviders(
    <UpdateSheetFields
      project={{ title: 'Quiz de la fusée', image: null, latestAt: null, version: null }}
      announce={null}
      form={form}
      onChange={() => {}}
      linesError={null}
      photos={{
        tiles,
        actions,
        selectedKey,
        select: () => {},
        descriptionOf: () => '',
        describe: () => {},
        count: tiles.length,
      }}
      busy={false}
    />,
  )

const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0

describe('the photos of the update sheet', () => {
  it('tells the formats and the right to the image under « Photos », even with no photo', async () => {
    await render([], null)

    expect(shown(RULES)).toBe(true)
    expect(shown(CONSENT)).toBe(true)
  })

  it('tells that the description is read aloud, under the description field of a photo', async () => {
    await render([tile('a'), tile('b')], 'a')

    expect(
      screen.getByLabelText(fr.t(($) => $.project.form.photoDescription, { number: 1 })),
    ).toBeTruthy()
    expect(shown(HINT)).toBe(true)
    // Le texte de la publication parle « du projet » : ici, c'est celui de la mise à jour.
    expect(shown(PUBLICATION_HINT)).toBe(false)
  })

  it('shows no description hint while no photo is selected (témoin)', async () => {
    await render([tile('a')], null)

    expect(shown(HINT)).toBe(false)
  })
})
