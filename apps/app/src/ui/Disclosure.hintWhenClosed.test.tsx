// Tests de `hintWhenClosed` (tranche R20, « Joint à ton retour ») : le résumé sous le titre se lit
// tant que la section est repliée, et part une fois dépliée, où le contenu dit tout en entier.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Disclosure } from './Disclosure'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = 'Joint à ton retour'
const HINT = 'Écran, appareil, version'

describe('Disclosure hintWhenClosed', () => {
  it('shows the hint closed, and hides it once open', async () => {
    await renderWithProviders(
      <Disclosure title={TITLE} hint={HINT} hintWhenClosed>
        <Text>Écran : /feed</Text>
      </Disclosure>,
    )
    expect(screen.getByText(HINT)).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: TITLE }))

    expect(screen.queryByText(HINT)).toBeNull()
    expect(screen.getByText('Écran : /feed')).toBeTruthy()
  })

  it('keeps the hint once open without it', async () => {
    await renderWithProviders(
      <Disclosure title={TITLE} hint={HINT}>
        <Text>Écran : /feed</Text>
      </Disclosure>,
    )

    await fireEvent.press(screen.getByRole('button', { name: TITLE }))

    expect(screen.getByText(HINT)).toBeTruthy()
  })
})
