// Tests de l'en-tête d'un membre quand ses outils n'ont pas de lien (tranche 7c) : sur le profil
// verrouillé d'un compte suspendu, seuls les noms des outils sont connus, pas leur étiquette. Ils
// s'affichent alors en simples pastilles, jamais en liens ou en boutons qui ne mèneraient nulle
// part. (L'en-tête avec des liens est testé dans components.test.tsx.)
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { MemberHeader } from './MemberHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('MemberHeader, with tools that lead nowhere', () => {
  it('shows each tool as a plain pill, not a link nor a button', async () => {
    await renderWithProviders(
      <MemberHeader
        name="Karim"
        handle="@karim_b"
        avatar={null}
        bio="Des petits jeux faits avec Cursor."
        toolsTitle="Outils favoris"
        tools={[{ label: 'Cursor' }, { label: 'ChatGPT', onPress: undefined }]}
      />,
    )

    // Témoins : l'en-tête est là, avec la liste des outils.
    expect(screen.getByRole('header', { name: 'Karim' })).toBeTruthy()
    expect(screen.getByText('Outils favoris')).toBeTruthy()
    for (const tool of ['Cursor', 'ChatGPT']) {
      expect(screen.getByText(tool)).toBeTruthy()
      expect(screen.queryByRole('link', { name: tool })).toBeNull()
      expect(screen.queryByRole('button', { name: tool })).toBeNull()
    }
  })
})
