// Test de l'état « done » de StateMessage (R4, ménage M7) : une démarche partie ou aboutie. Il a un
// titre, des paragraphes, un message à lire sous le titre (`notice`), une aide après les
// paragraphes (`children`) et une issue ; l'icône de sa tuile est décorative.
import { fireEvent, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { StateMessage } from './StateMessage'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('StateMessage, « done »', () => {
  it('gives the title, the paragraphs, the notice, the help and the way out, in that order', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <StateMessage
        kind="done"
        icon="envelope-simple"
        level={1}
        title="C’est envoyé"
        message={['Premier paragraphe', 'Second paragraphe']}
        notice={<Text>Le message à lire</Text>}
        actions={[{ label: 'Retour', onPress, variant: 'secondary' }]}
      >
        <Text>Une aide</Text>
      </StateMessage>,
    )

    expect(screen.getByRole('header', { name: 'C’est envoyé' }).props.accessibilityRole).toBe(
      'header',
    )
    // L'ordre de lecture : titre, message, paragraphes, aide, issue.
    const order = [
      'C’est envoyé',
      'Le message à lire',
      'Premier paragraphe',
      'Second paragraphe',
      'Une aide',
      'Retour',
    ]
    const positions = order.map((text) => JSON.stringify(screen.toJSON()).indexOf(text))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)

    await fireEvent.press(screen.getByRole('button', { name: 'Retour' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is not an alert (only an error is)', async () => {
    await renderWithProviders(<StateMessage kind="done" title="Fait" message="Tout va bien" />)

    expect(screen.getByText('Tout va bien').props.accessibilityRole).toBeUndefined()
  })
})
