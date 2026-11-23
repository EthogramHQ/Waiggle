// Tests du sceau de cire (R19, planche R19-Sceaux) : un disque au bord pressé, miel pour une
// première fois, crème pour un palier ou une catégorie, une icône au centre. Seul (l'icône d'un avis
// de l'Activité), il se lit comme une image nommée (« Premier envol ») ; suivi d'une légende qui dit
// déjà son nom (une tuile de « Mes sceaux »), il est décoratif (`label` vide) : rien n'est lu deux
// fois.
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { WaxSeal } from './WaxSeal'

type SealProps = ComponentProps<typeof WaxSeal>

const FIRST_FLIGHT = fr.t(($) => $.game.seals.first_project)
const TESTED_10 = fr.t(($) => $.game.seals.tested_10)

/** Le sceau « Premier envol » (miel, fusée) ; chaque test change ce qu'il regarde. */
const seal = (props: Partial<SealProps> = {}) => (
  <WaxSeal icon="rocket-launch" matter="honey" size="regular" label={FIRST_FLIGHT} {...props} />
)

describe('WaxSeal', () => {
  it('reads as an image named after the seal', async () => {
    await renderWithProviders(seal())

    expect(screen.getByRole('img', { name: FIRST_FLIGHT })).toBeTruthy()
  })

  it('reads a cream seal by its name too', async () => {
    await renderWithProviders(
      seal({ icon: 'users-three', matter: 'cream', size: 'small', label: TESTED_10 }),
    )

    expect(screen.getByRole('img', { name: TESTED_10 })).toBeTruthy()
  })

  it('is read once: its icon is not read beside it', async () => {
    await renderWithProviders(seal())

    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('is decorative when its label is empty, because a caption follows', async () => {
    await renderWithProviders(seal({ label: '' }))

    // Ni image sans nom, ni icône lue : le lecteur d'écran passe directement à la légende.
    expect(screen.queryByRole('img')).toBeNull()
  })
})
