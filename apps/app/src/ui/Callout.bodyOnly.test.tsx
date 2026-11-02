// Test de l'encadré sans titre (R5a, le bandeau d'un projet privé) : un texte de plusieurs phrases
// passe seul, à l'encre, et non tout en gras comme un titre.
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Callout } from './Callout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const BODY = 'Privé : aucun autre membre ne le voit.'

describe('Callout without a title', () => {
  it('shows its text alone, not in bold', async () => {
    await renderWithProviders(<Callout tone="caution" icon="lock-simple" body={BODY} />)

    const style = StyleSheet.flatten(screen.getByText(BODY).props.style)
    // Le gras (600 et plus) est réservé au titre : ni la graisse, ni la police ne le disent ici
    // (selon la plateforme, la graisse passe par le nom de la police).
    expect(`${style.fontFamily ?? ''} ${style.fontWeight ?? ''}`).not.toMatch(/semi|bold|600|700/i)
  })
})
