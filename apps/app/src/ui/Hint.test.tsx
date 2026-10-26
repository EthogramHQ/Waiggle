// Tests de Hint (la petite note à icône) : un morceau du texte peut être un lien, lu comme tel et
// qui s'ouvre au toucher ; sans lien, la note reste un simple texte (tranche « adresse », des-6).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders as render } from '../testing/render'
import { Hint } from './Hint'

const text = 'Tu n’as plus accès à ton adresse ? Écris-nous à contact@example.org.'

describe('Hint', () => {
  it('turns the given part of the text into a link that opens on press', async () => {
    const onPress = jest.fn()
    await render(
      <Hint icon="envelope-simple" text={text} link={{ label: 'contact@example.org', onPress }} />,
    )

    await fireEvent.press(screen.getByRole('link', { name: 'contact@example.org' }))

    expect(onPress).toHaveBeenCalledTimes(1)
    // La phrase reste entière, lien compris.
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('stays plain text without a link, or when the link is not in the text', async () => {
    await render(
      <Hint
        icon="envelope-simple"
        text={text}
        link={{ label: 'autre@example.org', onPress: jest.fn() }}
      />,
    )

    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
