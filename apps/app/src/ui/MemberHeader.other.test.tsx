// Tests de l'en-tête d'un membre dont un outil favori est un « Autre » (tranche R6b, scénario « Où
// les outils s'affichent ») : un outil du catalogue reste un lien vers sa page ; un « Autre »
// (`inCatalogue: false`), pas encore au catalogue, n'a pas de page : il s'écrit en texte simple,
// jamais en lien, même si l'écran lui a donné un geste, et se lit par son nom complet.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MemberHeader } from './MemberHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const SPOKEN = fr.t(($) => $.tool.otherSpoken, { name: 'Teachable Machine' })

describe('MemberHeader, with an other tool among the favourites (R6b)', () => {
  it('links a catalogue tool to its page, and shows an other tool as plain text', async () => {
    const openClaude = jest.fn()
    const openOther = jest.fn()
    await renderWithProviders(
      <MemberHeader
        name="Inès"
        avatar={null}
        bio=""
        toolsTitle="Outils favoris"
        tools={[
          { label: 'Claude', onPress: openClaude },
          { label: 'Teachable Machine', onPress: openOther, inCatalogue: false },
        ]}
      />,
    )

    // Témoin : l'outil du catalogue est un lien, qui mène à sa page.
    await fireEvent.press(screen.getByRole('link', { name: 'Claude' }))
    expect(openClaude).toHaveBeenCalledTimes(1)

    // L'« Autre » : écrit, lu par son nom complet, sans lien ni geste.
    expect(screen.getByText('Teachable Machine')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Teachable Machine/ })).toBeNull()
    const pill = screen.getByLabelText(SPOKEN)
    await fireEvent.press(pill)
    expect(openOther).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
