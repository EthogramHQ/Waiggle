// Tests de la carte du membre des réglages (tranche R2) : son nom, le lien vers sa page, le bouton
// « Modifier », et sa forme d'attente, sans lien, pendant que le profil se lit.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { MemberCard } from './MemberCard'

const base = {
  loadingLabel: 'Chargement…',
  avatar: null,
  avatarLabel: 'Photo de profil',
  edit: { label: 'Modifier', onPress: jest.fn() },
}

describe('MemberCard', () => {
  it('shows the name, a link to the page with its address, and « Modifier »', async () => {
    const view = jest.fn()
    await renderWithProviders(
      <MemberCard
        {...base}
        name="Léa"
        viewPage={{ label: 'Voir ma page', href: '/members/u1', onPress: view }}
      />,
    )

    expect(screen.getByText('Léa')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Voir ma page' })
    expect((link.props as Record<string, unknown>).href).toBe('/members/u1')
    await fireEvent.press(link)
    expect(view).toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Modifier' }))
    expect(base.edit.onPress).toHaveBeenCalled()
  })

  it('says it is loading, without a link, while the profile is read', async () => {
    await renderWithProviders(<MemberCard {...base} name={null} />)

    expect(screen.getByText('Chargement…')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy()
  })
})
