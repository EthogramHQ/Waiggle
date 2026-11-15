// Tests de la scène d'accueil des grands écrans (WelcomeHero) : le logo nommé, puis la phrase
// d'accroche. R11 (« Moins de mots ») : plus de pastille « logiciel libre » ni de lien vers le code,
// qui est dans le pied de la feuille (ui/LegalLinks.tsx).
import { appName } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { WelcomeHero } from './WelcomeHero'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const tagline = 'Montre à tes proches ce que tu construis avec l’IA.'

describe('WelcomeHero', () => {
  it('shows the named logo, then the tagline', async () => {
    await renderWithProviders(<WelcomeHero tagline={tagline} />)

    expect(screen.getByRole('img', { name: new RegExp(appName) })).toBeTruthy()
    expect(screen.getByText(tagline)).toBeTruthy()
  })

  it('has no link of its own: the source code is in the footer of the page (R11)', async () => {
    await renderWithProviders(<WelcomeHero tagline={tagline} />)

    // Témoin : la scène est là.
    expect(screen.getByText(tagline)).toBeTruthy()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByText(/logiciel libre/)).toBeNull()
  })
})
