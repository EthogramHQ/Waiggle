// Tests de la feuille (refonte, tranche R2) : « Changer d'adresse », « Modifier mon profil »,
// « Supprimer mon compte » s'ouvrent dans une feuille par-dessus la page. C'est une fenêtre modale
// nommée par son titre, avec un bouton « Fermer » (relecture juridique jur-15, WCAG 2.5.7 : la
// poignée ne suffit pas). Au clavier (web) : le focus entre dans la feuille à l'ouverture, revient au
// bouton qui l'a ouverte à la fermeture, Échap ferme, et Tab tourne dans la feuille sans en sortir.
//
// Ce que Jest ne mesure pas : la feuille pleine hauteur sur téléphone, le panneau centré sur un fond
// voilé sur ordinateur, et le pied qui reste au-dessus du clavier (jur-15, WCAG 2.4.11). C'est
// l'affaire des captures et d'un essai --explore.
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'
import { focusWithoutScroll } from './focus'
import { Sheet } from './Sheet'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La couche qui s'écarte du clavier (iOS) : une vue ordinaire, repérable, qui garde ses réglages
// (`behavior`, `enabled`) dans ses props pour que le test les lise.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native')
  const { createElement } = jest.requireActual('react')
  return {
    __esModule: true,
    default: (props: object) => createElement(View, { ...props, testID: 'keyboard-avoiding' }),
  }
})
// Où la feuille pose le focus du clavier (web) : le test lit l'élément reçu.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string, shiftKey = false) => ({
  key: name,
  shiftKey,
  repeat: false,
  preventDefault: jest.fn(),
})

/** Une page avec son bouton d'ouverture et sa feuille, qui garde l'état ouvert / fermé. */
const Page = ({ start = false, onClose }: { start?: boolean; onClose?: jest.Mock }) => {
  const [open, setOpen] = useState(start)
  return (
    <>
      <Button label="Corriger mon adresse" onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        title="Changer d’adresse"
        onClose={() => {
          onClose?.()
          setOpen(false)
        }}
      >
        <Text>Nouvelle adresse</Text>
        <Button label="Envoyer le lien" onPress={() => {}} />
      </Sheet>
    </>
  )
}

/** Le nom du bouton qui ferme la feuille : le texte commun « Fermer » (common.close). */
const close = fr.t(($) => $.common.close)

/**
 * Un faux document du navigateur, le temps d'un test « web » : `activeElement` est l'élément qui
 * avait le focus avant l'ouverture ; <html> et <body> ont un style (ThemeProvider y écrit la couleur
 * de la page) ; toute autre méthode existe et ne fait rien (comme dans AmbientLight.web.test.tsx).
 */
const fakeDocument = (activeElement: object): object => {
  const node = (extra: Record<string, unknown> = {}): object =>
    new Proxy(
      {
        style: { setProperty: jest.fn(), removeProperty: jest.fn() },
        visibilityState: 'visible',
        hidden: false,
        ...extra,
      } as Record<string | symbol, unknown>,
      {
        get(target, key) {
          if (key === 'then') return undefined
          if (!(key in target)) {
            target[key] =
              key === 'documentElement' || key === 'body' || key === 'head'
                ? node()
                : jest.fn(() => undefined)
          }
          return target[key]
        },
      },
    )
  return node({ activeElement })
}

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** La feuille elle-même : l'élément nommé par le titre (aria-labelledby ou accessibilityLabel). */
const sheet = () => screen.getByLabelText('Changer d’adresse')

describe('Sheet', () => {
  it('shows nothing while closed', async () => {
    await renderWithProviders(<Page />)

    expect(screen.getByRole('button', { name: 'Corriger mon adresse' })).toBeTruthy() // témoin
    expect(screen.queryByText('Nouvelle adresse')).toBeNull()
    expect(screen.queryByRole('button', { name: close })).toBeNull()
  })

  it('is a modal dialog named by its title, with its content inside', async () => {
    await renderWithProviders(<Page start />)

    expect(roleOf(sheet().props)).toBe('dialog')
    // Modale : les lecteurs d'écran restent dans la feuille (aria-modal sur le web,
    // accessibilityViewIsModal sur iOS).
    expect(
      sheet().props['aria-modal'] === true || sheet().props.accessibilityViewIsModal === true,
    ).toBe(true)
    expect(screen.getByRole('header', { name: 'Changer d’adresse' })).toBeTruthy()
    expect(screen.getByText('Nouvelle adresse')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeTruthy()
  })

  it('closes through its « Fermer » button', async () => {
    const onClose = jest.fn()
    await renderWithProviders(<Page start onClose={onClose} />)

    await fireEvent.press(screen.getByRole('button', { name: close }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Nouvelle adresse')).toBeNull()
  })

  it('opens from the page button, then closes again', async () => {
    await renderWithProviders(<Page />)

    await fireEvent.press(screen.getByRole('button', { name: 'Corriger mon adresse' }))
    expect(screen.getByText('Nouvelle adresse')).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: close }))
    expect(screen.queryByText('Nouvelle adresse')).toBeNull()
  })

  describe('on the web, with the keyboard', () => {
    // Le bouton qui avait le focus avant l'ouverture : le navigateur le donne par
    // document.activeElement, que les tests n'ont pas (pas de DOM). On lui en prête un.
    const opener = { focus: jest.fn() }
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      jest.mocked(focusWithoutScroll).mockClear()
      opener.focus.mockClear()
      Object.defineProperty(globalThis, 'document', {
        value: fakeDocument(opener),
        configurable: true,
      })
    })
    afterEach(() => {
      jest.restoreAllMocks()
      Reflect.deleteProperty(globalThis, 'document')
    })

    it('moves the keyboard focus into the sheet when it opens', async () => {
      await renderWithProviders(<Page />)
      expect(focusWithoutScroll).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByRole('button', { name: 'Corriger mon adresse' }))

      // Le focus va dans la feuille (son titre, son premier champ ou « Fermer »), jamais à l'élément
      // qui l'a ouverte : il est resté derrière, sous le voile.
      const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
      expect(focused.length).toBeGreaterThanOrEqual(1)
      expect(focused).not.toContain(opener)
    })

    it('gives the keyboard focus back to the button that opened it when it closes', async () => {
      await renderWithProviders(<Page />)
      await fireEvent.press(screen.getByRole('button', { name: 'Corriger mon adresse' }))
      jest.mocked(focusWithoutScroll).mockClear()

      await fireEvent.press(screen.getByRole('button', { name: close }))

      // Par focusWithoutScroll (la page ne défile pas) ou par focus() directement : l'élément qui
      // avait le focus à l'ouverture le retrouve.
      const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
      expect(focused.includes(opener) || opener.focus.mock.calls.length > 0).toBe(true)
    })

    it('closes with Escape', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<Page start onClose={onClose} />)

      await fireEvent(
        screen.getByRole('button', { name: 'Envoyer le lien' }),
        'keyDown',
        key('Escape'),
      )

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Nouvelle adresse')).toBeNull()
    })

    for (const shiftKey of [false, true]) {
      it(`keeps the keyboard focus inside the sheet on ${shiftKey ? 'Shift+Tab' : 'Tab'}`, async () => {
        const onClose = jest.fn()
        await renderWithProviders(<Page start onClose={onClose} />)
        jest.mocked(focusWithoutScroll).mockClear()

        // Tab tapé dans la feuille : elle le prend en charge (preventDefault) et pose le focus
        // sur l'un de ses éléments, jamais sur la page restée derrière. Où exactement (le premier
        // après le dernier, le dernier avant le premier) : l'essai --explore le mesure.
        const event = key('Tab', shiftKey)
        await fireEvent(screen.getByRole('button', { name: 'Envoyer le lien' }), 'keyDown', event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(focusWithoutScroll).toHaveBeenCalled()
        expect(jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])).not.toContain(
          opener,
        )
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText('Nouvelle adresse')).toBeTruthy()
      })
    }

    // Relecture de l'interface (R2, « Plus tard ») : Échap a deux voies, la touche enfoncée (la
    // feuille) et la touche relâchée (le Modal, par onRequestClose). Une feuille à adresse se ferme
    // par un retour arrière : deux appels quittaient aussi la page d'avant.
    it('closes only once on Escape, though the key reaches the sheet and the layer', async () => {
      const onClose = jest.fn()
      // La feuille reste ouverte après l'appel, comme une feuille à adresse pendant son retour
      // arrière : la touche relâchée arrive encore au Modal.
      await renderWithProviders(<StillSheet onClose={onClose} />)

      await fireEvent(
        screen.getByRole('button', { name: 'Envoyer le lien' }),
        'keyDown',
        key('Escape'),
      )
      await act(() => layer().props.onRequestClose())

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('still closes on Escape released while the focus is outside the sheet', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<StillSheet onClose={onClose} />)

      await act(() => layer().props.onRequestClose())

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('ignores Escape while busy', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<StillSheet onClose={onClose} busy />)

      await fireEvent(
        screen.getByRole('button', { name: 'Envoyer le lien' }),
        'keyDown',
        key('Escape'),
      )
      await act(() => layer().props.onRequestClose())

      expect(onClose).not.toHaveBeenCalled()
    })

    // Relecture C4 : le Modal de react-native-web est déjà `role="dialog"` et `aria-modal`. La
    // couche reçoit le nom, et la feuille ne se déclare pas une seconde boîte de dialogue.
    it('names the layer of the Modal by the title, without a second dialog inside', async () => {
      await renderWithProviders(<StillSheet onClose={jest.fn()} />)

      const title = screen.getByRole('header', { name: 'Changer d’adresse' })
      expect(layer().props['aria-labelledby']).toBe(title.props.nativeID)
      expect(
        hostsOf(root()).filter(
          (node) => node.props.role === 'dialog' || node.props.accessibilityRole === 'dialog',
        ),
      ).toHaveLength(0)
    })
  })

  // Relecture B1 : pendant une action qui ne s'arrête plus (la suppression du compte), la feuille
  // ne se ferme par aucune voie, et « Fermer » le dit (inactif).
  describe('while busy', () => {
    it('disables « Fermer » and ignores it', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<StillSheet onClose={onClose} busy />)

      const button = screen.getByRole('button', { name: close })
      expect(button).toBeDisabled()
      await fireEvent.press(button)

      expect(onClose).not.toHaveBeenCalled()
    })

    it('ignores the Android back button and the scrim', async () => {
      jest.useFakeTimers()
      try {
        const onClose = jest.fn()
        await renderWithProviders(<StillSheet onClose={onClose} busy />)
        // Après la garde de double tape : seule `busy` retient le voile.
        await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

        await act(() => layer().props.onRequestClose())
        await fireEvent.press(scrim())

        expect(onClose).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    it('closes again once the action is over (témoin)', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<StillSheet onClose={onClose} />)

      await fireEvent.press(screen.getByRole('button', { name: close }))

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // Relecture C3 : la feuille s'ouvre sous le doigt qui vient de toucher « Modifier » ; la seconde
  // tape d'une double tape tombait sur le voile et la refermait (un retour arrière). La garde de
  // Dialog : le voile ignore les tapes pendant TAP_GUARD_MS après l'ouverture.
  describe('the scrim, against a double tap', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('ignores a tap right after the opening', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<StillSheet onClose={onClose} />)

      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS - 50))
      await fireEvent.press(scrim())

      expect(onClose).not.toHaveBeenCalled()
    })

    it('closes on a tap once the guard is over', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<StillSheet onClose={onClose} />)

      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent.press(scrim())

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // Relecture C5 (jur-15, WCAG 2.4.11) : sur iOS, le clavier cachait le pied collé et les champs du
  // bas. La couche s'écarte du clavier, comme Screen (iOS est la plateforme par défaut de Jest).
  it('keeps its pinned footer above the keyboard on iOS', async () => {
    await renderWithProviders(
      <Sheet
        open
        title="Changer d’adresse"
        onClose={() => {}}
        footer={<Button label="Envoyer le lien" onPress={() => {}} />}
      >
        <Text>Nouvelle adresse</Text>
      </Sheet>,
    )

    const avoiding = screen.getByTestId('keyboard-avoiding')
    expect(avoiding.props.enabled).toBe(true)
    expect(avoiding.props.behavior).toBe('padding')
    expect(within(avoiding).getByRole('button', { name: 'Envoyer le lien' })).toBeTruthy()
  })
})

/** Une feuille qui reste ouverte après onClose (comme une feuille à adresse pendant son retour). */
function StillSheet({ onClose, busy = false }: { onClose: jest.Mock; busy?: boolean }) {
  return (
    <Sheet open busy={busy} title="Changer d’adresse" onClose={onClose}>
      <Text>Nouvelle adresse</Text>
      <Button label="Envoyer le lien" onPress={() => {}} />
    </Sheet>
  )
}

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** La racine de l'arbre rendu, vue par ce qu'on en lit (ses props et ses enfants). */
const root = () => screen.root as unknown as Host

/** Tous les éléments de l'arbre rendu, en profondeur (RNTL 14 n'a plus `findAll`). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** La couche du Modal : l'élément qui reçoit onRequestClose (retour Android, Échap relâchée). */
const layer = () => {
  const found = hostsOf(root()).find((node) => typeof node.props.onRequestClose === 'function')
  if (!found) throw new Error('no Modal layer')
  return found as Host & { props: { onRequestClose: () => void } }
}

/** Le voile : caché aux lecteurs d'écran, il se trouve par ce qui le cache. */
const scrim = () => {
  const found = hostsOf(root()).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim')
  return found as never
}

// Relecture de design R2 (B2) : l'erreur d'un envoi s'écrivait sous un champ du bas, cachée par le
// pied collé. Elle se montre dans le pied, avec le bouton touché, et elle est annoncée.
describe('the message of the pinned footer', () => {
  it('shows an error as an alert in the footer, next to the button touched', async () => {
    await renderWithProviders(
      <Sheet
        open
        title="Supprimer ton compte"
        onClose={() => {}}
        notice={{ message: 'Mot de passe incorrect.' }}
        footer={<Button label="Supprimer définitivement" onPress={() => {}} />}
      >
        <Text>Ce qui disparaît</Text>
      </Sheet>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Mot de passe incorrect.')
    // Le pied : le plus petit bloc qui porte le message et le bouton. Le contenu qui défile n'y est pas.
    let footer = alert.parent
    while (
      footer &&
      within(footer).queryByRole('button', { name: 'Supprimer définitivement' }) === null
    ) {
      footer = footer.parent
    }
    expect(footer).not.toBeNull()
    expect(within(footer as never).queryByText('Ce qui disparaît')).toBeNull()
  })

  it('says a confirmation politely, without an alert', async () => {
    await renderWithProviders(
      <Sheet
        open
        title="Mon profil"
        onClose={() => {}}
        notice={{ message: 'Profil enregistré.', tone: 'success', polite: true }}
        footer={<Button label="Enregistrer" onPress={() => {}} />}
      >
        <Text>Nom</Text>
      </Sheet>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Profil enregistré.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows no message when there is none (témoin)', async () => {
    await renderWithProviders(
      <Sheet
        open
        title="Mon profil"
        onClose={() => {}}
        notice={null}
        footer={<Button label="Enregistrer" onPress={() => {}} />}
      >
        <Text>Nom</Text>
      </Sheet>,
    )

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy()
  })
})
