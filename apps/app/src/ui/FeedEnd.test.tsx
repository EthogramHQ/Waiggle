// Tests du bas de fil sur le miel vif (R1, « Tu es à jour ») : ce qu'un membre ou un lecteur d'écran
// en perçoit. Les états ordinaires (« Afficher la suite », chargement, erreur, fin discrète) sont
// testés dans components.test.tsx.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { FeedEnd } from './FeedEnd'

const labels = { moreLabel: 'Afficher la suite', endLabel: 'Tu es à jour' }

describe('FeedEnd on bright honey', () => {
  it('tells the member they are up to date, with nothing left to press', async () => {
    await renderWithProviders(
      <FeedEnd state="end" ambiance="brand" {...labels} onMore={jest.fn()} />,
    )

    // Le message est lu : le miel est un décor caché aux lecteurs d'écran, pas le message.
    expect(screen.getByText('Tu es à jour')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps offering what comes next while the feed is not finished', async () => {
    await renderWithProviders(
      <FeedEnd state="more" ambiance="brand" {...labels} onMore={jest.fn()} />,
    )

    // L'ambiance ne change que la fin : tant qu'il en reste, le bouton ordinaire.
    expect(screen.getByRole('button', { name: 'Afficher la suite' })).toBeTruthy()
    expect(screen.queryByText('Tu es à jour')).toBeNull()
  })
})
