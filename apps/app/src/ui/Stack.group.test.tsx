// Tests de `Stack` en groupe nommé (R10, l'aperçu de « Créer une ruche ») : la pile se lit d'un seul
// nom (« Ma ruche Famille ») par le rôle `group`, que React Native ne connaît pas dans
// `accessibilityRole` : il passe par `role`.
import { render, screen } from '@testing-library/react-native'
import { Stack } from './Stack'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Stack as a named group', () => {
  it('names the group and gives it the group role', async () => {
    await render(
      <Stack accessibilityRole="group" accessibilityLabel="Ma ruche Famille">
        <Text>Ma ruche</Text>
        <Text>Famille</Text>
      </Stack>,
    )

    const group = screen.getByLabelText('Ma ruche Famille')
    expect(group.props.role).toBe('group')
    // Pas d'`accessible` : sur iOS, VoiceOver atteint encore chaque partie.
    expect(group.props.accessible).toBeUndefined()
    expect(screen.getByText('Famille')).toBeTruthy()
  })

  it('keeps the other roles as accessibility roles (témoin)', async () => {
    await render(
      <Stack accessibilityRole="radiogroup" accessibilityLabel="Icône">
        <Text>Maison</Text>
      </Stack>,
    )

    expect(screen.getByLabelText('Icône').props.accessibilityRole).toBe('radiogroup')
  })
})
