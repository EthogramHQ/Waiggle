// Tests de la ligne de l'auteur sans lien (R12) : un visiteur voit le nom et la photo de l'auteur
// d'un projet public, mais son nom ne mène à sa page que si l'auteur l'a rendue publique. Sans
// `onOpen`, la ligne n'est ni un lien ni un bouton : le nom en texte simple. Les autres états de la
// ligne sont dans AuthorLine.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { AuthorLine } from './AuthorLine'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const name = 'Papi Jean'
const openLabel = 'Voir la page de Papi Jean'

describe('AuthorLine without a page to open (R12)', () => {
  it('is a link to the author page when it can be opened', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(
      <AuthorLine name={name} handle={null} avatar={null} openLabel={openLabel} onOpen={onOpen} />,
    )

    await fireEvent.press(screen.getByRole('link', { name: openLabel }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows the name as plain text, neither link nor button, without `onOpen`', async () => {
    await renderWithProviders(
      <AuthorLine name={name} handle={null} avatar={null} openLabel={openLabel} />,
    )

    expect(screen.getByText(name)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
