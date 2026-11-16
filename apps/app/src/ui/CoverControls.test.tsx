// Tests des boutons de verre posés sur une photo (`CoverControls`, ui/ProjectCover.tsx) : à gauche
// et à droite (`start`, `end`), ou, depuis R12, une barre entière à leur place (`children`, la barre
// d'un visiteur sur la photo d'un projet public), dont rien ne se perd.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { CoverControls } from './ProjectCover'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const noop = () => {}

describe('CoverControls', () => {
  it('shows the buttons given on each side', async () => {
    await renderWithProviders(
      <CoverControls
        start={<Button label="Retour" onPress={noop} />}
        end={<Button label="Partager" onPress={noop} />}
      />,
    )

    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Partager' })).toBeTruthy()
  })

  it('shows a whole bar in place of the two sides (a visitor bar, R12)', async () => {
    await renderWithProviders(
      <CoverControls>
        <Button label="Waiggle" role="link" onPress={noop} />
        <Button label="Se connecter" role="link" onPress={noop} />
      </CoverControls>,
    )

    expect(screen.getByRole('link', { name: 'Waiggle' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeTruthy()
  })
})
