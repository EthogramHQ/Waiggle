// Tests de la carte du membre des réglages (tranche R2) : son nom, le lien vers sa page, le bouton
// « Modifier », et sa forme d'attente, sans lien, pendant que le profil se lit.
//
// R16 (scénario : « les « Chargement… » écrits disparaissent (un lecteur d'écran entend toujours
// « Chargement ») » ; plan, choix 12) : pendant la lecture du profil, la carte n'écrit plus
// l'attente à la place du nom ; elle dessine une ligne vide, et le lecteur d'écran entend le texte
// d'attente.
import { fireEvent, screen } from '@testing-library/react-native'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { MemberCard, MemberCardSkeleton } from './MemberCard'

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

    // Le lecteur d'écran entend l'attente ; elle n'est plus écrite à la place du nom (R16).
    expect(await screen.findByRole('progressbar', { name: 'Chargement…' })).toBeTruthy()
    expect(screen.queryByText('Chargement…', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy()
  })
})

// R16 (plan, choix 4) : la carte vide d'un membre (photo et nom à venir), sans rôle ni nom à elle.
describe('MemberCardSkeleton (R16)', () => {
  it('draws its empty piece without any role or name of its own', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberCardSkeleton />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    // Des formes, d'abord : une pièce qui ne dessine rien ne garde aucune place.
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })
})
