// L'aperçu « Ce que lira … » de la fenêtre « Retirer » (R9, planche R9-Retirer) : ce que l'auteur
// lira si le retrait est confirmé, mis à jour pendant qu'on choisit le fondement et qu'on écrit
// l'explication, puis la phrase du DSA (article 17). Sur ordinateur, dans la colonne à droite du
// formulaire ; sur téléphone, sous le formulaire. Un fichier à part (un fichier par sujet) : les
// tests du formulaire sont dans RemoveSheet.test.tsx.
import type { ModerationQueueItem } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { scamCommentItem } from '../testing/moderation'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { choiceRole, containing, fr } from '../testing/text'
import { useDecide } from './api'
import { RemoveSheet } from './RemoveSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('./api', () => ({ useDecide: jest.fn() }))

const meteoId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'

/** La description de « Météo », le projet d'Inès, signalée. */
const descriptionItem: ModerationQueueItem = {
  ...scamCommentItem,
  target: { kind: 'project', id: meteoId },
  projectId: meteoId,
  context: { projectId: meteoId, title: 'Météo', image: null },
  contentCreatedAt: '2026-10-01T08:00:00.000Z',
  authorRecord: {
    memberId: 'u9',
    name: 'Inès Haddad',
    handle: 'ines_haddad',
    joinedAt: '2026-09-02T08:00:00.000Z',
    projectCount: 3,
    commentCount: 18,
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
  part: { field: 'description', mediaId: null, position: null },
  snapshot: [{ field: 'description', value: 'Gagne 500 € par jour sans rien faire.' }],
}

const explanation = 'Une promesse de gains qui renvoie vers un site de trading.'
const previewTitle = fr.t(($) => $.moderation.removeSheet.preview, { name: 'Inès Haddad' })

beforeEach(() => {
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

const openSheet = async () => {
  await renderWithProviders(
    <RemoveSheet item={descriptionItem} open onClose={jest.fn()} onDone={jest.fn()} />,
  )
  await passTapGuard()
}

describe('what the author will read', () => {
  it('names the author, says the decision was taken after a report, how to contest, and why (DSA)', async () => {
    await openSheet()
    expect(screen.getByRole('header', { name: previewTitle })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.removal.afterReport))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.removal.contest))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.moderation.removeSheet.dsa))).toBeTruthy()
  })

  it('shows no ground nor explanation before they are chosen, then follows the form', async () => {
    await openSheet()
    const law = fr.t(($) => $.removal.grounds.illegal)
    const said = fr.t(($) => $.removal.explanation, { explanation })
    expect(screen.queryByText(law)).toBeNull()
    expect(screen.queryByText(said)).toBeNull()

    await fireEvent.press(
      screen.getByRole('button', {
        name: new RegExp(`^${fr.t(($) => $.moderation.groundLabel)}`),
      }),
    )
    await fireEvent.press(
      await screen.findByRole(choiceRole(), {
        name: containing(fr.t(($) => $.moderation.grounds.illegal)),
      }),
    )
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      explanation,
    )
    expect(screen.getByText(law)).toBeTruthy()
    expect(screen.getByText(said)).toBeTruthy()
  })

  it('comes after the form on a phone: the explanation field, then the preview', async () => {
    await openSheet()
    // Les textes trouvés le sont dans l'ordre de l'arbre, qui est l'ordre de lecture : le libellé
    // du champ d'abord, le titre de l'aperçu ensuite.
    const label = fr.t(($) => $.moderation.explanation)
    const found = screen.getAllByText(new RegExp(`^(${label}|${previewTitle})$`))
    expect(found.map((node) => node.props.children)).toEqual([label, previewTitle])
  })

  it('stands once, beside the form, on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await openSheet()
      expect(screen.getAllByRole('header', { name: previewTitle })).toHaveLength(1)
      expect(screen.getByText(fr.t(($) => $.moderation.removeSheet.dsa))).toBeTruthy()
    } finally {
      restore()
    }
  })
})
