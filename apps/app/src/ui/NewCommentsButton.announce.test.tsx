// Tests de `announce` (R21) : dans la feuille des commentaires, ou la colonne de l'ordinateur,
// l'écran a déjà sa région annoncée ; le bouton n'en ajoute pas une seconde (le même texte se lirait
// deux fois), mais reste le même bouton.
import { screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { NewCommentsButton } from './NewCommentsButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => jest.restoreAllMocks())

describe('NewCommentsButton announce', () => {
  it('has no region of its own when the screen announces', async () => {
    const said = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    await renderWithProviders(<NewCommentsButton count={1} onPress={() => {}} announce={false} />)

    expect(screen.getByRole('button', { name: '1 nouveau commentaire' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(said).not.toHaveBeenCalled()
  })

  it('keeps its region by default', async () => {
    await renderWithProviders(<NewCommentsButton count={1} onPress={() => {}} />)

    // Témoin : sans la prop, la région est là.
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
