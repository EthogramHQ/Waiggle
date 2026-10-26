// Tests du menu « … » (ActionMenu, tranche 7b) : les actions secondaires d'une page (« Signaler ce
// profil », « Bloquer ») derrière un seul bouton, au lieu d'un bouton chacune (décision de Louis du
// 24/10/2026). À part de components.test.tsx : ActionMenu est écrit par un autre agent que
// ReportCard ou ListGroup ; tant qu'il manque, seul ce fichier échoue (charte du pôle code, 7a).
//
// L'interface attendue de `src/ui/ActionMenu.tsx` :
// - `items` : la liste des actions, `{ label, onPress, tone? }` (`tone: 'danger'` pour une action
//   qui retire ou coupe quelque chose) ;
// - `label` : le nom du bouton, « Plus d'actions » par défaut (actionMenu.label).
// Le bouton est un IconButton (icône `dots-three`) ; chaque action est un `menuitem`.
//
// Ce que Jest ne prouve pas, à vérifier dans le navigateur (essai --explore du design-reviewer) :
// la fermeture par Échap et le focus rendu au bouton une fois le menu fermé.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ActionMenu } from './ActionMenu'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const report = jest.fn()
const block = jest.fn()
const items = [
  { label: 'Signaler ce profil', onPress: report },
  { label: 'Bloquer', onPress: block, tone: 'danger' as const },
]

beforeEach(() => {
  report.mockReset()
  block.mockReset()
})

/** Le bouton qui ouvre le menu. */
const trigger = () => screen.getByRole('button', { name: fr.t(($) => $.actionMenu.label) })

describe('ActionMenu', () => {
  it('is a single button named « Plus d’actions », its actions hidden while closed', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    expect(trigger()).toBeTruthy()
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.queryByText('Signaler ce profil')).toBeNull()
  })

  it('says that it opens a menu, and that it is closed', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    // aria-expanded sur le web, accessibilityState.expanded sur téléphone.
    expect(
      screen.getByRole('button', { name: fr.t(($) => $.actionMenu.label), expanded: false }),
    ).toBeTruthy()
  })

  it('takes another name when given one', async () => {
    await renderWithProviders(<ActionMenu items={items} label="Actions du projet" />)

    expect(screen.getByRole('button', { name: 'Actions du projet' })).toBeTruthy()
  })

  it('shows its actions, in order, once opened', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    await fireEvent.press(trigger())

    expect(screen.getByRole('menuitem', { name: 'Signaler ce profil' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Bloquer' })).toBeTruthy()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    // Dans l'ordre donné.
    expect(
      screen
        .getAllByText(/^(Signaler ce profil|Bloquer)$/)
        .map((element) => element.props.children),
    ).toEqual(['Signaler ce profil', 'Bloquer'])
  })

  it('does the action chosen, once, and closes', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    await fireEvent.press(trigger())
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Bloquer' }))

    expect(block).toHaveBeenCalledTimes(1)
    expect(report).not.toHaveBeenCalled()
    expect(screen.queryByRole('menuitem')).toBeNull()
    // Le bouton reste là, pour rouvrir le menu.
    expect(trigger()).toBeTruthy()
  })

  it('closes without doing anything through « Fermer le menu » (a touch outside it)', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    await fireEvent.press(trigger())
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.actionMenu.close) }))

    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(report).not.toHaveBeenCalled()
    expect(block).not.toHaveBeenCalled()
  })

  // Corrections de 7b (relecture ui-9) : Tab quitte le menu, qui se ferme sans rien faire ; le
  // focus va alors au contrôle qui suit « … » (Maj+Tab : à « … »). Où va le focus, Jest ne le voit
  // pas : l'essai --explore du rapport le mesure dans le navigateur.
  describe('on the web, with the keyboard', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    for (const shiftKey of [false, true]) {
      it(`closes without doing anything on ${shiftKey ? 'Shift+Tab' : 'Tab'}`, async () => {
        jest.replaceProperty(Platform, 'OS', 'web')
        await renderWithProviders(<ActionMenu items={items} />)

        await fireEvent.press(trigger())
        const preventDefault = jest.fn()
        await fireEvent(screen.getByRole('menuitem', { name: 'Signaler ce profil' }), 'keyDown', {
          key: 'Tab',
          shiftKey,
          preventDefault,
        })

        expect(screen.queryByRole('menuitem')).toBeNull()
        expect(report).not.toHaveBeenCalled()
        expect(block).not.toHaveBeenCalled()
        expect(
          screen.getByRole('button', { name: fr.t(($) => $.actionMenu.label), expanded: false }),
        ).toBeTruthy()
      })
    }
  })

  it('opens again after being closed', async () => {
    await renderWithProviders(<ActionMenu items={items} />)

    await fireEvent.press(trigger())
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler ce profil' }))
    await fireEvent.press(trigger())

    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    expect(report).toHaveBeenCalledTimes(1)
  })
})
