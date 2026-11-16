// Tests de ce qu'a donné le geste d'une ligne d'Activité (R12, `actionNotice`) : « Retirer de
// l'accueil » écrit sur place. Une réussite prend la place du geste, en confirmation polie ; un
// échec se pose sous le geste, qui reste pour réessayer, en alerte. Le message est hors du lien de
// la ligne : il ne change pas son nom.
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { renderWithProviders } from '../testing/render'
import { NotificationCard } from './NotificationCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Props = ComponentProps<typeof NotificationCard>

const LEAVE = 'Retirer de l’accueil'
const LEFT = 'Ton projet a quitté l’accueil. Il reste public.'
const FAILED = 'Le projet n’a pas pu quitter l’accueil. Réessaie.'

const base: Props = {
  leading: { kind: 'icon', icon: 'star', tone: 'honey' },
  parts: [{ text: 'Décollage !', style: 'strong' }, { text: ' est sur l’accueil' }],
  when: '12 nov.',
  thumb: { kind: 'project', image: null, title: 'Décollage !' },
  isNew: false,
  onPress: () => {},
}

describe('NotificationCard actionNotice (R12)', () => {
  it('shows nothing more without a notice (témoin : the gesture alone)', async () => {
    await renderWithProviders(
      <NotificationCard {...base} action={{ label: LEAVE, onPress: () => {} }} />,
    )

    expect(screen.getByRole('button', { name: LEAVE })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(LEFT)).toBeNull()
  })

  it('puts the success in place of the gesture, as a polite status', async () => {
    await renderWithProviders(
      <NotificationCard {...base} actionNotice={{ message: LEFT, tone: 'success' }} />,
    )

    expect(screen.getByText(LEFT)).toBeTruthy()
    expect(screen.queryByRole('button', { name: LEAVE })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    // Hors du lien de la ligne : son nom ne le reprend pas.
    const link = screen.getByRole('link')
    expect(String(link.props.accessibilityLabel)).not.toContain(LEFT)
  })

  it('keeps the gesture and shows the failure under it, as an alert', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        action={{ label: LEAVE, onPress: () => {} }}
        actionNotice={{ message: FAILED, tone: 'error' }}
      />,
    )

    expect(screen.getByRole('button', { name: LEAVE })).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(FAILED)).toBeTruthy()
  })
})
