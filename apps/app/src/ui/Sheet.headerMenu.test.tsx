// Tests de `headerMenu` (tranche R20, la feuille « Ton retour ») : le menu « ⋯ » dans la tête de la
// feuille, avec l'action (téléphone) comme sans elle, et ses choix atteignables.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ActionMenu } from './ActionMenu'
import { SheetPanel } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const fold = jest.fn()
const menu = <ActionMenu label="Plus d’actions" items={[{ label: 'Replier', onPress: fold }]} />

beforeEach(() => fold.mockReset())

describe('Sheet headerMenu', () => {
  it.each(['phone', 'desktop'] as const)(
    'puts the menu in the head of a sheet with an action (%s)',
    async (layout) => {
      await renderWithProviders(
        <SheetPanel
          title="Ton retour"
          layout={layout}
          onClose={() => {}}
          cancelLabel="Annuler"
          action={{ label: 'Envoyer', onPress: () => {} }}
          headerMenu={menu}
        >
          <Text>Contenu</Text>
        </SheetPanel>,
      )

      await fireEvent.press(screen.getByRole('button', { name: 'Plus d’actions' }))
      await fireEvent.press(await screen.findByRole('menuitem', { name: 'Replier' }))

      expect(fold).toHaveBeenCalledTimes(1)
      // Témoin : l'action est toujours là.
      expect(screen.getByRole('button', { name: 'Envoyer' })).toBeTruthy()
    },
  )

  it('draws no menu without it', async () => {
    await renderWithProviders(
      <SheetPanel title="Ton retour" layout="phone" onClose={() => {}}>
        <Text>Contenu</Text>
      </SheetPanel>,
    )

    expect(screen.queryByRole('button', { name: 'Plus d’actions' })).toBeNull()
  })
})
