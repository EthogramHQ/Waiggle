// Tests de l'étiquette d'un outil (refonte, tranche R3, « Outils populaires » et « Tous les
// outils ») : avec un nombre, elle l'affiche et son nom lu devient « Claude, 41 projets publics »
// (`tools.withCount` et le pluriel `tools.projects`) ; le nombre affiché reste hors du nom lu
// (relecture de l'interface, « À noter »). Sans nombre, rien ne change : le libellé seul.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Tag } from './Tag'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le nom lu d'un outil avec son nombre, tel que les traductions le composent. */
const spoken = (label: string, count: number) =>
  fr.t(($) => $.tools.withCount, {
    label,
    projects: fr.t(($) => $.tools.projects, { count }),
  })

describe('Tag with a count', () => {
  it('composes the spoken name from the translations (witness)', () => {
    expect(spoken('Claude', 41)).toBe('Claude, 41 projets publics')
    expect(spoken('Claude', 1)).toBe('Claude, 1 projet public')
  })

  it('shows the number and reads « Claude, 41 projets publics » as a link', async () => {
    await renderWithProviders(<Tag label="Claude" count={41} onPress={() => {}} />)

    expect(screen.getByText('41')).toBeTruthy()
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByRole('link', { name: spoken('Claude', 41) })).toBeTruthy()
  })

  it('uses the singular for one project', async () => {
    await renderWithProviders(<Tag label="Python" count={1} onPress={() => {}} />)

    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByRole('link', { name: spoken('Python', 1) })).toBeTruthy()
  })

  it('reads the count too when it is a plain pill, without a link', async () => {
    await renderWithProviders(<Tag label="Claude" count={41} />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('41')).toBeTruthy()
    expect(screen.getByLabelText(spoken('Claude', 41))).toBeTruthy()
  })

  it('says the count in English too', async () => {
    await renderWithProviders(<Tag label="Claude" count={41} onPress={() => {}} />, 'en')

    const en = screen.getByRole('link')
    const name = (en.props as Record<string, unknown>).accessibilityLabel
    expect(name).toContain('Claude')
    expect(name).toContain('41')
    // Un vrai pluriel anglais, pas le français : le nom lu change de langue avec l'appli.
    expect(name).not.toContain('projets publics')
  })
})

describe('Tag without a count', () => {
  it('is a link named by its label alone', async () => {
    await renderWithProviders(<Tag label="Claude" onPress={() => {}} />)

    expect(screen.getByRole('link', { name: 'Claude' })).toBeTruthy()
    // Aucun nombre, aucune mention de projets.
    expect(screen.queryByText(/projet/)).toBeNull()
  })

  it('stays a plain pill with its label when it cannot be touched', async () => {
    await renderWithProviders(<Tag label="Claude" />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Claude')).toBeTruthy()
  })
})
