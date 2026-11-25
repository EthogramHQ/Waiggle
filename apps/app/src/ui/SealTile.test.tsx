// Tests de la tuile d'un sceau (R19, rubrique « Mes sceaux » de « Ma récolte » et du profil) : le
// sceau de cire, son nom dessous, et, s'il est donné, le jour où il a été gagné. Le nom suit le
// sceau : le sceau est donc décoratif (son `label` vide, ui/WaxSeal), et la tuile se lit par ses
// textes, une seule fois chacun.
//
// `date` est un texte déjà mis en forme par l'écran (« 12 nov. 2026 ») : la tuile ne formate rien.
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SealTile } from './SealTile'

type TileProps = ComponentProps<typeof SealTile>

const FIRST_SETTLED = fr.t(($) => $.game.seals.first_settled)
const COOKING = fr.t(($) => $.game.seals.category.cooking)

/** La tuile « Premier retour réglé » (miel), sans date ; chaque test change ce qu'il regarde. */
const tile = (props: Partial<TileProps> = {}) => (
  <SealTile
    seal={{ icon: 'check-circle', matter: 'honey', size: 'regular', label: '' }}
    name={FIRST_SETTLED}
    {...props}
  />
)

describe('SealTile', () => {
  it('shows the name of the seal under it', async () => {
    await renderWithProviders(tile())

    expect(screen.getByText(FIRST_SETTLED)).toBeTruthy()
  })

  it('reads the name once: the seal itself stays decorative', async () => {
    await renderWithProviders(tile())

    expect(screen.getAllByText(FIRST_SETTLED)).toHaveLength(1)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the day the seal was earned when it is given', async () => {
    await renderWithProviders(tile({ name: COOKING, date: '12 nov. 2026' }))

    expect(screen.getByText(COOKING)).toBeTruthy()
    expect(screen.getByText('12 nov. 2026')).toBeTruthy()
  })

  it('shows no date line without a date', async () => {
    // Le témoin est le test précédent : la même tuile, avec sa date, la montre.
    await renderWithProviders(tile())

    expect(screen.queryByText(/2026/)).toBeNull()
  })
})
