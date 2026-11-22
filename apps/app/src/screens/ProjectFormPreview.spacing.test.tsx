// R18 : l'espace que le membre a tapée devant « ? » reste insécable à l'affichage de l'aperçu de la carte du fil
// (la ponctuation des textes des membres). Les espaces spéciales sont écrites par leur numéro.
import { screen } from '@testing-library/react-native'
import { emptyProjectForm } from '../projects/form'
import { mockSession, renderWithProviders } from '../testing/render'
import { ProjectFormPreview } from './ProjectFormPreview'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: jest.fn().mockResolvedValue({ ok: false, error: 'internal' }),
  requestWithoutBody: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))

const NNBSP = String.fromCodePoint(0x202f)

// Le texte tel que dessiné : les requêtes de test normalisent les espaces (insécables comprises),
// on lit donc les enfants du nœud.
const drawn = (node: { props: { children?: unknown } }) => [node.props.children].flat().join('')

describe('ProjectFormPreview', () => {
  it('keeps the typed space before ? non-breaking in a member text', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await renderWithProviders(
      <ProjectFormPreview
        form={{ ...emptyProjectForm, title: 'Et si on cuisinait ?', pitch: 'Un menu, vraiment ?' }}
        cover={null}
        change={jest.fn()}
      />,
    )

    // L'aperçu est caché aux lecteurs d'écran : on le cherche malgré tout.
    const shown = { includeHiddenElements: true }
    expect(drawn(screen.getByText(/cuisinait/, shown))).toBe(`Et si on cuisinait${NNBSP}?`)
    expect(drawn(screen.getByText(/vraiment/, shown))).toBe(`Un menu, vraiment${NNBSP}?`)
  })
})
