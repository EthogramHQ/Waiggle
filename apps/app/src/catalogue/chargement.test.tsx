// Les sections du catalogue qui montrent les pièces de chargement (R16, « Les squelettes ») se
// dessinent sans erreur, de jour et de nuit : « Chargement » (ses exemples qu'on rejoue, le fondu de
// `Reveal` à la main) et « La mosaïque d'un membre » (l'en-tête vide au nom déjà connu).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { LoadingCatalogue } from './chargement'
import { MemberMosaicCatalogue } from './mosaique-membre'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('LoadingCatalogue', () => {
  it('offers to replay the waits, day and night, and shows the slow state with « Revenir »', async () => {
    await renderWithProviders(<LoadingCatalogue />)

    // Deux exemples à rejouer (Loading avant 160 ms, DelayedShapes) par thème.
    expect(screen.getAllByRole('button', { name: 'Rejouer' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Revenir' })).toHaveLength(2)
    expect(screen.getAllByRole('progressbar', { name: 'Chargement…' }).length).toBeGreaterThan(0)
  })

  it('lets the content arrive in the Reveal example, and offers to start again', async () => {
    await renderWithProviders(<LoadingCatalogue />)

    const [arrive] = screen.getAllByRole('button', { name: 'Faire arriver le contenu' })
    if (!arrive) throw new Error('no Reveal example')
    fireEvent.press(arrive)

    expect(await screen.findByText(/^Le contenu arrivé/)).toBeTruthy()
    // Le même bouton propose de recommencer ; l'exemple de l'autre thème attend toujours.
    expect(screen.getAllByRole('button', { name: 'Recommencer' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Faire arriver le contenu' })).toHaveLength(1)
  })
})

describe('MemberMosaicCatalogue', () => {
  it('reads the name already known in the empty header, as a heading, day and night', async () => {
    await renderWithProviders(<MemberMosaicCatalogue />)

    // Centré puis en colonne, dans chacun des deux thèmes.
    expect(screen.getAllByRole('header', { name: 'Max Durand' })).toHaveLength(4)
  })
})
