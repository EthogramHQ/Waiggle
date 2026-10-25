// Le menu « … » (tranche 7b), au-delà de ce qu'en dit ActionMenu.test.tsx : son bouton dit qu'il
// est ouvert ou fermé, la liste ouverte rend l'action choisie, et la section du catalogue montre
// ses états.
// À part : ActionMenu.test.tsx est écrit par l'auteur des tests de la tranche, qu'on ne modifie pas.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ActionMenu, ActionMenuList } from '../ui/ActionMenu'
import { ActionMenuSamples } from './actionMenu'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const items = [
  { label: 'Signaler ce profil', onPress: jest.fn() },
  { label: 'Bloquer', onPress: jest.fn(), tone: 'danger' as const },
]

describe('ActionMenu, once opened', () => {
  it('says that it is open', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    await fireEvent.press(screen.getByRole('button', { name: fr.t('actionMenu.label') }))

    expect(
      screen.getByRole('button', { name: fr.t('actionMenu.label'), expanded: true }),
    ).toBeTruthy()
    // (Le rôle « menu » de la liste ne se cherche pas ici : RNTL ne trouve un rôle que sur un
    // élément `accessible`, qu'on ne met pas sur un conteneur. À relever dans le navigateur.)
  })

  it('says again that it is closed once an action is chosen', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    await fireEvent.press(screen.getByRole('button', { name: fr.t('actionMenu.label') }))
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler ce profil' }))

    expect(
      screen.getByRole('button', { name: fr.t('actionMenu.label'), expanded: false }),
    ).toBeTruthy()
  })
})

describe('ActionMenuList', () => {
  it('hands the chosen action over, as a menu item', async () => {
    const onChoose = jest.fn()
    await renderWithProviders(
      <ActionMenuList label="Plus d’actions" items={items} onChoose={onChoose} />,
    )

    await fireEvent.press(screen.getByRole('menuitem', { name: 'Bloquer' }))

    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ label: 'Bloquer' }))
  })
})

describe('the « … » menu in the catalogue', () => {
  it('shows the closed buttons and the open lists in their states', async () => {
    await renderWithProviders(<ActionMenuSamples />)

    expect(screen.getByRole('header', { name: 'Menu « … »' })).toBeTruthy()
    // Deux boutons fermés (sur une surface, sur une image), quatre listes ouvertes.
    expect(screen.getAllByRole('button', { name: 'Plus d’actions' })).toHaveLength(2)
    expect(screen.getAllByRole('menuitem', { name: 'Débloquer' })).toHaveLength(1)
    expect(screen.getAllByRole('menuitem', { name: 'Signaler ce projet' })).toHaveLength(1)

    await fireEvent.press(screen.getByRole('menuitem', { name: 'Débloquer' }))
    expect(screen.getByText('Choisi : Débloquer')).toBeTruthy()
  })
})
