// Tests des tuiles (refonte, tranche R1) : la tuile d'un projet (miel, crème ou encre), un lien vers
// sa page nommé par son titre, comme la carte d'un projet ; et la tuile « + Ajouter », un bouton.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { AddTile, ProjectTile } from './Tile'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

describe('ProjectTile', () => {
  it('is a link to the project, named by its title', async () => {
    await renderWithProviders(
      <ProjectTile title="Carnet de cafés" author="Sam Petit" onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
  })

  it('shows who made the project', async () => {
    await renderWithProviders(
      <ProjectTile title="Carnet de cafés" author="Sam Petit" onPress={() => {}} />,
    )

    expect(screen.getByText('Sam Petit', { includeHiddenElements: true })).toBeTruthy()
  })

  it('opens the project when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <ProjectTile title="Carnet de cafés" author="Sam Petit" onPress={onPress} />,
    )

    await fireEvent.press(screen.getByRole('link', { name: 'Carnet de cafés' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // it.each : le même test pour chaque teinte de tuile ; aucune ne change ce qui est lu.
  it.each(['honey', 'cream', 'ink'] as const)(
    'keeps its name and its author in the %s variant',
    async (variant) => {
      await renderWithProviders(
        <ProjectTile
          title="Carnet de cafés"
          author="Sam Petit"
          variant={variant}
          onPress={() => {}}
        />,
      )

      expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
      expect(screen.getByText('Sam Petit', { includeHiddenElements: true })).toBeTruthy()
    },
  )

  it('opens with the Enter key on the web, like a real link', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <ProjectTile title="Carnet de cafés" author="Sam Petit" onPress={onPress} />,
      )

      await fireEvent(
        screen.getByRole('link', { name: 'Carnet de cafés' }),
        'keyDown',
        key('Enter'),
      )

      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('AddTile', () => {
  it('is a button named by its label, which it shows', async () => {
    await renderWithProviders(<AddTile label="Ajouter un projet" onPress={() => {}} />)

    expect(screen.getByRole('button', { name: 'Ajouter un projet' })).toBeTruthy()
    expect(screen.getByText('Ajouter un projet', { includeHiddenElements: true })).toBeTruthy()
  })

  it('runs its action when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<AddTile label="Ajouter un projet" onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter un projet' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
