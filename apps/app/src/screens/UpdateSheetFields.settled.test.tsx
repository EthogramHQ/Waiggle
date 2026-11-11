// Tests du contenu de la feuille « Nouvelle mise à jour » pour la partie « Retours réglés » (R7b) :
// la partie se pose sous les photos, comme la planche « MAJ-Règles » ; si la liste des retours à
// traiter n'a pas pu se charger, la phrase `settledField.loadError` prend sa place, avec
// « Réessayer » (décision du 11/11/2026 : jamais tue, publier sans le savoir réglerait moins que
// voulu). Sans partie (`settled` absent), rien ne parle de retours.
import { fireEvent, screen } from '@testing-library/react-native'
import type { PhotoActions } from '../projects/usePhotoTiles'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { emptyLine, type UpdateFormValues } from '../updates/form'
import { UpdateSheetFields, type UpdateSheetSettled } from './UpdateSheetFields'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const T = {
  title: fr.t(($) => $.project.testers.settledField.title),
  loadError: fr.t(($) => $.project.testers.settledField.loadError),
  retry: fr.t(($) => $.common.retry),
  photosRules: fr.t(($) => $.project.form.photosRules),
}

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
const ines = {
  id: 'ines',
  label: fr.t(($) => $.project.testers.settledField.item, { name: 'Inès', outcome: 'En partie' }),
  detail: fr.t(($) => $.project.testers.settledField.detail, {
    excerpt: 'Le score repart à zéro',
    date: 'mardi',
  }),
  former: false,
}

const render = (settled: UpdateSheetSettled | null, onChange = jest.fn()) =>
  renderWithProviders(
    <UpdateSheetFields
      project={{ title: 'Quiz de la fusée', image: null, latestAt: null, version: null }}
      form={form}
      onChange={onChange}
      linesError={null}
      photos={{
        tiles: [],
        actions,
        selectedKey: null,
        select: () => {},
        descriptionOf: () => '',
        describe: () => {},
        count: 0,
      }}
      busy={false}
      settled={settled}
    />,
  )

/** Les textes de la feuille, dans l'ordre du rendu. */
const textsInOrder = (): string[] => {
  const found: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') found.push(node)
    else if (Array.isArray(node)) for (const child of node) walk(child)
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children)
    }
  }
  walk(screen.toJSON())
  return found
}

describe('the part « Retours réglés » in the update sheet fields (R7b)', () => {
  it('puts « Retours réglés » under the photos, as the validated board', async () => {
    await render({ state: 'ready', items: [ines] })

    const texts = textsInOrder()
    const rules = texts.findIndex((one) => one === T.photosRules)
    const title = texts.findIndex((one) => one === T.title)
    expect(rules).toBeGreaterThan(-1)
    expect(title).toBeGreaterThan(rules)
  })

  it('writes the checked feedback into the form', async () => {
    const onChange = jest.fn()
    await render({ state: 'ready', items: [ines] }, onChange)

    await fireEvent.press(screen.getByRole('checkbox', { name: ines.label }))

    expect(onChange).toHaveBeenCalledWith({ ...form, settledIds: ['ines'] })
  })

  it('says the open feedback could not load, in place of the part, and retries', async () => {
    const retry = jest.fn()
    await render({ state: 'error', retry })

    expect(screen.getByText(T.loadError)).toBeTruthy()
    expect(screen.queryByText(T.title)).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: T.retry }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows neither the part nor its error without open feedback', async () => {
    await render(null)

    // Témoin : la feuille est là.
    expect(screen.getByText(T.photosRules)).toBeTruthy()
    expect(screen.queryByText(T.title)).toBeNull()
    expect(screen.queryByText(T.loadError)).toBeNull()
  })
})
