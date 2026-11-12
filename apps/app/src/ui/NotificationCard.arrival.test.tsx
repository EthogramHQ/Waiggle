// Tests de deux ajouts de R8 à la ligne d'Activité (ui/NotificationCard.tsx), venus de l'écran :
// - `ref` : la vue qui reçoit le focus quand la ligne arrive avec la page suivante. C'est le lien
//   lui-même (le lecteur d'écran du téléphone le lit en entier), ou la ligne qui ne mène nulle part ;
// - une ligne qui ne mène nulle part dit sa date complète au lecteur d'écran (aucun nom de lien ne
//   la porte pour elle), comme avant R8 (test d'écran de R4).
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import type { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { NotificationCard } from './NotificationCard'
import { relativeDate } from './relativeDate'

const now = new Date('2026-10-21T12:00:00.000Z')
const date = '2026-10-19T18:00:00.000Z'
const common = {
  leading: { kind: 'icon', icon: 'user-plus', tone: 'neutral' } as const,
  parts: [{ text: '3 personnes', style: 'strong' as const }, { text: ' te suivent' }],
  when: { date, now },
  isNew: false,
}

describe('NotificationCard, on arrival', () => {
  it('gives its arrival view to the link, named with the whole line', async () => {
    const ref = createRef<View>()
    await renderWithProviders(<NotificationCard {...common} onPress={() => {}} ref={ref} />)

    const link = screen.getByRole('link', { name: /3 personnes te suivent/ })
    // La vue reçue porte le rôle et le nom du lien (RNTL garde les `props` d'une vue native).
    const props = (ref.current as unknown as { props?: Record<string, unknown> } | null)?.props
    expect(props?.accessibilityRole).toBe('link')
    expect(props?.accessibilityLabel).toBe(link.props.accessibilityLabel)
  })

  it('gives its arrival view to the line itself when it leads nowhere', async () => {
    const ref = createRef<View>()
    await renderWithProviders(<NotificationCard {...common} onPress={null} ref={ref} />)

    // Témoin : la ligne est là, sans lien…
    expect(screen.queryByRole('link')).toBeNull()
    // … et c'est elle qui reçoit la vue.
    expect(ref.current).not.toBeNull()
  })

  it('reads the full date of a line that leads nowhere', async () => {
    await renderWithProviders(<NotificationCard {...common} onPress={null} />)

    const { label, full } = relativeDate(date, 'fr', now)
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByLabelText(full)).toBeTruthy()
  })
})
