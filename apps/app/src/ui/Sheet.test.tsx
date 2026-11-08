// Tests de la feuille (refonte, tranche R2) : « Changer d'adresse », « Modifier mon profil »,
// « Supprimer mon compte » s'ouvrent dans une feuille par-dessus la page. C'est une fenêtre modale
// nommée par son titre, avec un bouton « Fermer » (relecture juridique jur-15, WCAG 2.5.7 : la
// poignée ne suffit pas). Au clavier (web) : le focus entre dans la feuille à l'ouverture, revient au
// bouton qui l'a ouverte à la fermeture, Échap ferme, et Tab tourne dans la feuille sans en sortir.
//
// Ce que Jest ne mesure pas : la feuille pleine hauteur sur téléphone, le panneau centré sur un fond
// voilé sur ordinateur, et le pied qui reste au-dessus du clavier (jur-15, WCAG 2.4.11). C'est
// l'affaire des captures et d'un essai --explore.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { createRef, type RefObject, useRef, useState } from 'react'
import { Platform, StyleSheet, TextInput, View } from 'react-native'
import { getAnimatedStyle } from 'react-native-reanimated'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'
import { focusWithoutScroll } from './focus'
import { Sheet } from './Sheet'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import * as motion from './theme/motion'

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

// Décision de Louis du 2/11 (R5a) : la feuille « Partager » a la hauteur de son contenu sur
// téléphone, avec un titre plus petit ; les autres feuilles gardent la pleine hauteur et leur titre.
describe('the compact sheet, on a phone', () => {
  const style = (node: { props: Record<string, unknown> }) =>
    StyleSheet.flatten(node.props.style as never) as Record<string, unknown>

  it('has the height of its content and a smaller title', async () => {
    await renderWithProviders(
      <Sheet open compact title="Partager" onClose={() => {}}>
        <Text>Contenu</Text>
      </Sheet>,
    )

    expect(style(screen.getByLabelText('Partager')).flex).toBeUndefined()
    expect(style(screen.getByLabelText('Partager')).flexShrink).toBe(1)
    const title = style(screen.getByRole('header', { name: 'Partager' }))
    expect(title.fontSize).toBeLessThan(30)
  })

  it('keeps the full height and the big title without the option (témoin)', async () => {
    await renderWithProviders(
      <Sheet open title="Partager" onClose={() => {}}>
        <Text>Contenu</Text>
      </Sheet>,
    )

    expect(style(screen.getByLabelText('Partager')).flex).toBe(1)
    expect(style(screen.getByRole('header', { name: 'Partager' })).fontSize).toBeGreaterThanOrEqual(
      30,
    )
  })
})

// Relecture de design R5a (C1) : sur le web, le voile qui disparaît sous le doigt laisse la seconde
// tape d'une double tape tomber sur la page dessous (le « Retour » : on quittait la page), et
// pendant la garde d'ouverture, cette tape sur le voile emportait le focus (une `div`).
describe('the scrim on the web, against a double tap', () => {
  const opener = { focus: jest.fn() }
  /** Les écouteurs posés sur le document par `holdPageTaps` : les `click` à la capture. */
  const clickGuards = () =>
    (document.addEventListener as unknown as jest.Mock).mock.calls.filter(
      ([type, , capture]) => type === 'click' && capture === true,
    )

  beforeEach(() => {
    jest.useFakeTimers()
    jest.replaceProperty(Platform, 'OS', 'web')
    jest.mocked(focusWithoutScroll).mockClear()
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument(opener),
      configurable: true,
    })
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('makes the page ignore taps for a moment when the scrim closes the sheet', async () => {
    const onClose = jest.fn()
    await renderWithProviders(<StillSheet onClose={onClose} />)
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    expect(clickGuards()).toHaveLength(0) // témoin : rien n'est retenu avant la fermeture

    await fireEvent.press(scrim())

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(clickGuards()).toHaveLength(1)
  })

  it('gives the focus to « Fermer », not to the scrim, on a tap during the guard', async () => {
    const onClose = jest.fn()
    await renderWithProviders(<StillSheet onClose={onClose} />)
    jest.mocked(focusWithoutScroll).mockClear()

    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS - 50))
    await fireEvent.press(scrim())

    expect(onClose).not.toHaveBeenCalled()
    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
    expect((focused.at(-1) as unknown as Host).props.accessibilityLabel).toBe(close)
    expect(clickGuards()).toHaveLength(0) // rien n'a fermé : la page n'a rien à retenir
  })
})

// --- R5b : la feuille des commentaires ---
//
// La feuille gagne ce que demande celle des commentaires (relecture de l'interface du plan R5b) :
// - `titleCount` : « Commentaires 6 », dessiné par CountedTitle, et la boîte de dialogue lue
//   « Commentaires, 6 commentaires » (ui-I3) ;
// - `initialFocusRef` : « Écrire un commentaire » ouvre la feuille le champ prêt (ui-I3) ;
// - Échap n'est prise que si elle vient de son panneau et n'a pas déjà servi (la liste des
//   mentions, un menu, une confirmation ouverts dedans : ui-B1) ;
// - un fondu au lieu de la montée avec « Réduire les animations » (ui-B4) ;
// - le glisser vers le bas ferme, sauf pendant un envoi (`busy`, décision D1 de Louis).

/** La feuille des commentaires : son titre, son nombre, et ce qu'on lit dedans. */
function CommentsSheet({
  onClose,
  busy = false,
  probe,
}: {
  onClose: jest.Mock
  busy?: boolean
  /** Une vue posée dans la feuille, pour prêter aux vues ce que le web leur donne (`contains`). */
  probe?: RefObject<View | null>
}) {
  return (
    <Sheet
      open
      busy={busy}
      title="Commentaires"
      titleCount={{ count: 6, spoken: '6 commentaires' }}
      onClose={onClose}
      footer={<Button label="Envoyer le commentaire" onPress={() => {}} />}
    >
      <Text>Super idée, je teste ce soir.</Text>
      {probe ? <View ref={probe} /> : null}
    </Sheet>
  )
}

/** La boîte de dialogue de la feuille (téléphone) : la vue au rôle `dialog`. */
const dialogNode = () => {
  const found = hostsOf(root()).find((node) => roleOf(node.props) === 'dialog')
  if (!found) throw new Error('no dialog')
  return found
}

/** Le nom lu d'un élément : son nom donné, sinon son texte (comme le calcule un lecteur d'écran). */
const nameOf = (node: Host): string => {
  const given = node.props.accessibilityLabel ?? node.props['aria-label']
  if (typeof given === 'string') return given
  const text = (child: Host | string): string =>
    typeof child === 'string' ? child : child.children.map(text).join('')
  return text(node).replace(/\s+/g, ' ')
}

/** L'élément qui porte l'identifiant donné (`nativeID`, l'attribut id sur le web). */
const byNativeId = (id: unknown) => {
  const found = hostsOf(root()).find((node) => node.props.nativeID === id)
  if (!found) throw new Error(`nothing has the nativeID ${String(id)}`)
  return found
}

describe('the comments sheet title (R5b)', () => {
  it('the comments sheet dialog is named « Commentaires, 6 commentaires »', async () => {
    await renderWithProviders(<CommentsSheet onClose={jest.fn()} />)

    // La boîte de dialogue est nommée par son titre (aria-labelledby), et ce titre se lit avec son
    // nombre en toutes lettres, sans le chiffre seul.
    const labelledBy = dialogNode().props['aria-labelledby']
    expect(labelledBy).toEqual(expect.any(String))
    expect(nameOf(byNativeId(labelledBy))).toBe('Commentaires, 6 commentaires')
    // On voit « Commentaires 6 », un titre de la feuille.
    const header = screen.getByRole('header', { name: 'Commentaires, 6 commentaires' })
    expect(header.props.nativeID).toBe(labelledBy)
    const shown = (child: unknown): string =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : Array.isArray(child)
          ? child.map(shown).join('')
          : child && typeof child === 'object' && 'props' in child
            ? shown((child as { props: { children?: unknown } }).props.children)
            : ''
    expect(shown(header.props.children).replace(/\s+/g, ' ')).toBe('Commentaires 6')
  })

  it('names the layer of the Modal by the title and its count, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument({ focus: jest.fn() }),
      configurable: true,
    })
    try {
      await renderWithProviders(<CommentsSheet onClose={jest.fn()} />)

      expect(nameOf(byNativeId(layer().props['aria-labelledby']))).toBe(
        'Commentaires, 6 commentaires',
      )
    } finally {
      jest.restoreAllMocks()
      Reflect.deleteProperty(globalThis, 'document')
    }
  })
})

describe('the comments sheet on the web, with the keyboard (R5b)', () => {
  const opener = { focus: jest.fn() }
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    jest.mocked(focusWithoutScroll).mockClear()
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument(opener),
      configurable: true,
    })
  })
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  /** La page d'un projet, réduite à son bouton « Écrire un commentaire » et à la feuille. */
  function WritePage() {
    const [open, setOpen] = useState(false)
    const field = useRef<TextInput>(null)
    return (
      <>
        <Button label="Écrire un commentaire" onPress={() => setOpen(true)} />
        <Sheet
          open={open}
          title="Commentaires"
          initialFocusRef={field}
          onClose={() => setOpen(false)}
          footer={<TextInput ref={field} accessibilityLabel="Ton commentaire" />}
        >
          <Text>Aucun commentaire pour l’instant.</Text>
        </Sheet>
      </>
    )
  }

  it('« Écrire un commentaire » opens the sheet with the focus in the comment field', async () => {
    // Le focus peut arriver par focusWithoutScroll (sans défilement) ou par le focus() du champ :
    // on retient le dernier arrivé, quelle que soit la voie.
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    focus.mockClear()
    await renderWithProviders(<WritePage />)

    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))

    await waitFor(() => {
      const arrivals = [
        ...jest.mocked(focusWithoutScroll).mock.calls.map((call, index) => ({
          order: jest.mocked(focusWithoutScroll).mock.invocationCallOrder[index] ?? 0,
          node: call[0] as Host | undefined,
        })),
        ...focus.mock.contexts.map((context, index) => ({
          order: focus.mock.invocationCallOrder[index] ?? 0,
          node: context as unknown as Host | undefined,
        })),
      ].sort((a, b) => a.order - b.order)
      expect(arrivals.at(-1)?.node?.props.accessibilityLabel).toBe('Ton commentaire')
    })
  })

  it('opens with the focus on « Fermer » without initialFocusRef (témoin)', async () => {
    await renderWithProviders(<Page />)

    await fireEvent.press(screen.getByRole('button', { name: 'Corriger mon adresse' }))

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0] as Host)
    expect(focused.at(-1)?.props.accessibilityLabel).toBe(close)
  })

  it('ignores an Escape already handled by a field inside it', async () => {
    const onClose = jest.fn()
    await renderWithProviders(<CommentsSheet onClose={onClose} />)

    // La liste des mentions, ouverte dans le champ, a pris Échap pour se fermer : la touche arrive
    // à la feuille déjà prise (`defaultPrevented`, sur l'événement de React comme sur celui du
    // navigateur).
    const handled = {
      ...key('Escape'),
      defaultPrevented: true,
      isDefaultPrevented: () => true,
      nativeEvent: { key: 'Escape', defaultPrevented: true },
    }
    await fireEvent(
      screen.getByRole('button', { name: 'Envoyer le commentaire' }),
      'keyDown',
      handled,
    )
    // Puis la touche relâchée arrive au Modal : elle ne ferme pas non plus la feuille.
    await act(() => layer().props.onRequestClose())

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy()
  })

  it('ignores an Escape that comes from outside its panel, from a layer opened above it', async () => {
    // Un menu « … » ou la confirmation de suppression, ouverts par-dessus la feuille, sont d'autres
    // couches de la page : leurs touches remontent l'arbre de React jusqu'à la feuille, sans venir
    // de son panneau. On prête aux vues le `contains` du navigateur.
    const onClose = jest.fn()
    const probe = createRef<View>()
    await renderWithProviders(<CommentsSheet onClose={onClose} probe={probe} />)
    const proto = Object.getPrototypeOf(probe.current) as { contains?: unknown }
    const hadContains = Object.hasOwn(proto, 'contains')
    const originalContains = proto.contains
    const outside = { outside: true }
    try {
      proto.contains = (node: unknown) => node !== outside
      await fireEvent(screen.getByRole('button', { name: 'Envoyer le commentaire' }), 'keyDown', {
        ...key('Escape'),
        target: outside,
        nativeEvent: { key: 'Escape', target: outside },
      })
      expect(onClose).not.toHaveBeenCalled()

      // Témoin : la même touche, venue du panneau, ferme la feuille.
      const inside = { inside: true }
      await fireEvent(screen.getByRole('button', { name: 'Envoyer le commentaire' }), 'keyDown', {
        ...key('Escape'),
        target: inside,
        nativeEvent: { key: 'Escape', target: inside },
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      if (hadContains) proto.contains = originalContains
      else delete proto.contains
    }
  })
})

describe('the phone sheet with « Réduire les animations » (R5b)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('with reduce motion on, the phone sheet appears with a fade instead of sliding up', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    await renderWithProviders(<CommentsSheet onClose={jest.fn()} />)

    expect(layer().props.animationType).toBe('fade')
  })

  it('slides up from the bottom on a phone without it (témoin)', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    await renderWithProviders(<CommentsSheet onClose={jest.fn()} />)

    expect(layer().props.animationType).toBe('slide')
  })
})

// Décision D1 de Louis (4/11/2026) : la feuille se ferme aussi en la glissant vers le bas, pour
// toutes les feuilles, sauf pendant une action en cours (`busy` : un commentaire qui part). Le
// glisser passe par le système de réponse au toucher de React Native (PanResponder ou les
// `onResponder…` d'une vue) : on rejoue un doigt qui descend sur la zone qui se glisse, la première
// vue de la feuille qui suit le doigt sans être un bouton ni la zone qui défile.

/** Une vue de l'arbre rendu, avec son type natif (pour écarter la zone qui défile). */
type TypedHost = Host & { type?: unknown }

/** La zone de la feuille qui suit le doigt. */
const dragArea = (): TypedHost => {
  const found = (hostsOf(dialogNode()) as TypedHost[]).find(
    (node) =>
      typeof node.props.onResponderMove === 'function' &&
      typeof node.props.onClick !== 'function' &&
      node.props.accessibilityRole !== 'button' &&
      node.props.role !== 'button' &&
      node.type !== 'RCTScrollView',
  )
  if (!found) throw new Error('no drag area: nothing in the sheet follows the finger')
  return found
}

/**
 * Un doigt posé à 100 points, qui descend de `distance` points en 200 ms puis se lève : les
 * événements du système de réponse, avec l'historique des touchers que lit PanResponder.
 */
const dragDown = async (distance: number) => {
  const area = dragArea()
  let previous = { y: 100, time: 1000 }
  const start = previous
  const touchAt = (y: number, time: number, active: boolean) => {
    const touch = {
      identifier: 0,
      pageX: 200,
      pageY: y,
      locationX: 200,
      locationY: y,
      timestamp: time,
    }
    const event = {
      nativeEvent: { ...touch, touches: active ? [touch] : [], changedTouches: [touch] },
      touchHistory: {
        numberActiveTouches: active ? 1 : 0,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: time,
        touchBank: [
          {
            touchActive: active,
            startPageX: 200,
            startPageY: start.y,
            startTimeStamp: start.time,
            currentPageX: 200,
            currentPageY: y,
            currentTimeStamp: time,
            previousPageX: 200,
            previousPageY: previous.y,
            previousTimeStamp: previous.time,
          },
        ],
      },
      target: area,
      currentTarget: area,
      preventDefault: () => {},
      stopPropagation: () => {},
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      persist: () => {},
    }
    previous = { y, time }
    return event
  }
  const call = (name: string, event: object) =>
    (area.props[name] as ((event: object) => unknown) | undefined)?.(event)

  await act(async () => {
    const down = touchAt(100, 1000, true)
    call('onStartShouldSetResponderCapture', down)
    call('onStartShouldSetResponder', down)
    // Le doigt bouge de 2 points : la zone demande le toucher, et le reçoit.
    const first = touchAt(102, 1016, true)
    call('onMoveShouldSetResponderCapture', first)
    call('onMoveShouldSetResponder', first)
    call('onResponderGrant', first)
    call('onResponderStart', first)
    call('onResponderMove', touchAt(100 + distance / 2, 1100, true))
    call('onResponderMove', touchAt(100 + distance, 1200, true))
    const up = touchAt(100 + distance, 1216, false)
    call('onResponderEnd', up)
    call('onResponderRelease', up)
  })
  // Le temps d'une animation de fermeture, si la feuille en joue une avant de se fermer.
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
}

describe('dragging the phone sheet down (R5b, D1)', () => {
  it('dragging the sheet down closes it, except while a comment is being sent', async () => {
    const onClose = jest.fn()
    const { rerender } = await renderWithProviders(<CommentsSheet onClose={onClose} busy />)

    // Pendant l'envoi : un glissement accidentel ne ferme rien.
    await dragDown(400)
    expect(onClose).not.toHaveBeenCalled()

    // L'envoi fini, le même geste ferme la feuille.
    await rerender(<CommentsSheet onClose={onClose} />)
    await dragDown(400)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('a drag of a few points does not close it', async () => {
    const onClose = jest.fn()
    await renderWithProviders(<CommentsSheet onClose={onClose} />)

    await dragDown(8)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy()
  })
})

// --- R6a : la feuille de publication (relecture du plan, ui-B2, ui-I3, ui-I10) ---
//
// La feuille gagne ce que demande « Nouveau projet » :
// - `closeGuard` : quand il est donné, toute demande de fermeture (« Annuler », Échap, le voile,
//   le retour d'Android, le glisser) l'appelle au lieu de `onClose` : l'écran demande d'abord
//   « Abandonner ce projet ? » s'il y a quelque chose d'écrit. `busy` l'emporte sur tout ;
// - `cancelLabel` : un bouton texte (« Annuler ») à gauche de la tête sur téléphone, à la place de
//   la croix ; `action` : le bouton de l'action (« Publier ») à droite de la tête sur téléphone. Sur
//   ordinateur, les deux vont dans le pied ;
// - la `notice` passe sous la tête quand l'action y est (le message reste près du bouton touché) ;
// - une seconde feuille ouverte par-dessus (« Catégorie et outils ») est la couche du dessus : Échap
//   ne ferme qu'elle, et le focus revient à la ligne qui l'a ouverte.

/** Le contenu de la feuille de publication, réduit à un texte et à la ligne « Catégorie ». */
const PUBLISH_CONTENT = 'Le titre de ton projet'

/** La feuille de publication : « Annuler », « Nouveau projet », « Publier ». */
function PublishSheet({
  onClose,
  closeGuard,
  busy = false,
  notice,
}: {
  onClose: jest.Mock
  closeGuard?: jest.Mock
  busy?: boolean
  notice?: { message: string }
}) {
  return (
    <Sheet
      open
      busy={busy}
      title="Nouveau projet"
      onClose={onClose}
      {...(closeGuard ? { closeGuard } : null)}
      cancelLabel="Annuler"
      action={{ label: 'Publier', onPress: () => {}, busy }}
      {...(notice ? { notice } : null)}
    >
      <Text>{PUBLISH_CONTENT}</Text>
      <Button label="Catégorie" onPress={() => {}} />
    </Sheet>
  )
}

/** Le rang d'un élément dans l'ordre de lecture (parcours de l'arbre en profondeur). */
const readingIndex = (element: unknown) => {
  const index = hostsOf(root()).indexOf(element as Host)
  if (index === -1) throw new Error('element not found in the rendered tree')
  return index
}

/** Ce dont la feuille de téléphone est descendue (le `translateY` de sa couche animée), en points. */
const slideOffset = (): number => {
  for (const node of hostsOf(root())) {
    let animated: Record<string, unknown> | undefined
    try {
      animated = getAnimatedStyle(node as never) as Record<string, unknown> | undefined
    } catch {
      continue
    }
    const transform = Array.isArray(animated?.transform)
      ? (animated.transform as Record<string, unknown>[])
      : []
    const shift = transform.find((step) => typeof step.translateY === 'number')?.translateY
    if (typeof shift === 'number') return shift
  }
  throw new Error('nothing in the sheet slides')
}

describe('the publish sheet (R6a)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('calls closeGuard, never onClose, from cancel, Escape, the scrim and Android back', async () => {
    jest.useFakeTimers()
    const onClose = jest.fn()
    const closeGuard = jest.fn()
    await renderWithProviders(<PublishSheet onClose={onClose} closeGuard={closeGuard} />)
    // Après la garde de double tape : le voile répond.
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

    // « Annuler », le bouton texte de la tête.
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    expect(closeGuard).toHaveBeenCalledTimes(1)
    // Le voile.
    await fireEvent.press(scrim())
    expect(closeGuard).toHaveBeenCalledTimes(2)
    // Le retour d'Android : le Modal reçoit onRequestClose.
    await act(() => layer().props.onRequestClose())
    expect(closeGuard).toHaveBeenCalledTimes(3)

    // Échap, sur le web : la touche enfoncée dans la feuille, puis relâchée (le Modal), une fois.
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument({ focus: jest.fn() }),
      configurable: true,
    })
    await screen.rerender(<PublishSheet onClose={onClose} closeGuard={closeGuard} />)
    await fireEvent(screen.getByRole('button', { name: 'Catégorie' }), 'keyDown', key('Escape'))
    await act(() => layer().props.onRequestClose())
    expect(closeGuard).toHaveBeenCalledTimes(4)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(PUBLISH_CONTENT)).toBeTruthy()
  })

  it('refuses every close while busy, closeGuard included', async () => {
    jest.useFakeTimers()
    const onClose = jest.fn()
    const closeGuard = jest.fn()
    await renderWithProviders(<PublishSheet onClose={onClose} closeGuard={closeGuard} busy />)
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

    const cancel = screen.getByRole('button', { name: 'Annuler' })
    expect(cancel).toBeDisabled()
    await fireEvent.press(cancel)
    await fireEvent.press(scrim())
    await act(() => layer().props.onRequestClose())
    jest.useRealTimers()
    await dragDown(400)

    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument({ focus: jest.fn() }),
      configurable: true,
    })
    await screen.rerender(<PublishSheet onClose={onClose} closeGuard={closeGuard} busy />)
    await fireEvent(screen.getByRole('button', { name: 'Catégorie' }), 'keyDown', key('Escape'))
    await act(() => layer().props.onRequestClose())

    expect(closeGuard).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Témoin : l'envoi fini, « Annuler » demande de nouveau.
    await screen.rerender(<PublishSheet onClose={onClose} closeGuard={closeGuard} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    expect(closeGuard).toHaveBeenCalledTimes(1)
  })

  it('springs back instead of sliding away when a drag ends with a closeGuard', async () => {
    const onClose = jest.fn()
    const closeGuard = jest.fn()
    await renderWithProviders(<PublishSheet onClose={onClose} closeGuard={closeGuard} />)

    // Un glissé qui fermerait une feuille ordinaire (400 points) : la demande part à l'écran, et la
    // feuille remonte au lieu de descendre hors de l'écran (844 points, la hauteur du téléphone) ;
    // si l'écran ouvre « Abandonner ce projet ? », la feuille est encore là, en place.
    await dragDown(400)

    expect(slideOffset()).toBeLessThan(200)
    expect(closeGuard).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('puts the text cancel button and the action in the header on a phone, in the footer on a computer', async () => {
    const restorePhone = setDesktopWindow()
    restorePhone() // le téléphone d'abord (jest.setup.ts), l'ordinateur ensuite
    try {
      await renderWithProviders(<PublishSheet onClose={jest.fn()} closeGuard={jest.fn()} />)

      // Téléphone : « Annuler » à gauche, le titre, « Publier » à droite, puis le contenu. La croix
      // « Fermer » laisse sa place au bouton texte.
      const title = () => screen.getByRole('header', { name: 'Nouveau projet' })
      const cancel = () => screen.getByRole('button', { name: 'Annuler' })
      const action = () => screen.getByRole('button', { name: 'Publier' })
      const content = () => screen.getByText(PUBLISH_CONTENT)
      expect(readingIndex(cancel())).toBeLessThan(readingIndex(title()))
      expect(readingIndex(title())).toBeLessThan(readingIndex(action()))
      expect(readingIndex(action())).toBeLessThan(readingIndex(content()))
      expect(screen.queryByRole('button', { name: close })).toBeNull()

      // Ordinateur : les deux boutons passent dans le pied, après le contenu.
      await act(() => {
        setDesktopWindow()
      })
      expect(readingIndex(content())).toBeLessThan(readingIndex(action()))
      expect(readingIndex(content())).toBeLessThan(readingIndex(cancel()))
    } finally {
      restorePhone()
    }
  })

  it('shows the notice under the header when the action is in the header', async () => {
    await renderWithProviders(
      <PublishSheet
        onClose={jest.fn()}
        closeGuard={jest.fn()}
        notice={{ message: 'Choisis une catégorie' }}
      />,
    )

    // Le message suit « Publier » (dans la tête, sur téléphone) et précède le contenu : il est
    // près du bouton touché, au lieu d'un pied collé loin en bas.
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Choisis une catégorie')
    expect(readingIndex(screen.getByRole('button', { name: 'Publier' }))).toBeLessThan(
      readingIndex(alert),
    )
    expect(readingIndex(alert)).toBeLessThan(readingIndex(screen.getByText(PUBLISH_CONTENT)))
  })

  it('keeps the inner sheet as the only one closed by Escape, and gives the focus back to its opener', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const page = fakeDocument({ focus: jest.fn() }) as Record<string, unknown>
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    jest.mocked(focusWithoutScroll).mockClear()
    const outerClose = jest.fn()
    const outerGuard = jest.fn()
    const innerClose = jest.fn()

    /** La feuille de publication et, par-dessus, « Catégorie et outils », ouverte par sa ligne. */
    function TwoSheets() {
      const [inner, setInner] = useState(false)
      return (
        <Sheet
          open
          title="Nouveau projet"
          onClose={outerClose}
          closeGuard={outerGuard}
          cancelLabel="Annuler"
          action={{ label: 'Publier', onPress: () => {} }}
        >
          <Text>{PUBLISH_CONTENT}</Text>
          <Button label="Catégorie" onPress={() => setInner(true)} />
          <Sheet
            open={inner}
            title="Catégorie et outils"
            onClose={() => {
              innerClose()
              setInner(false)
            }}
            action={{ label: 'OK', onPress: () => setInner(false) }}
          >
            <Button label="Sciences et espace" onPress={() => {}} />
          </Sheet>
        </Sheet>
      )
    }
    await renderWithProviders(<TwoSheets />)

    // La ligne « Catégorie » a le focus quand elle ouvre la seconde feuille.
    const row = screen.getByRole('button', { name: 'Catégorie' })
    page.activeElement = row
    await fireEvent.press(row)
    expect(screen.getByRole('button', { name: 'Sciences et espace' })).toBeTruthy()
    jest.mocked(focusWithoutScroll).mockClear()

    /**
     * Échap comme le navigateur : enfoncée (les écouteurs du document, à la capture, puis l'élément
     * qui a le focus), puis relâchée (le Modal encore ouvert reçoit onRequestClose). Une feuille qui
     * prend la touche la marque prise (`preventDefault`), et le navigateur le dit à tous.
     */
    const typeEscape = async (focused: unknown) => {
      const native = { key: 'Escape', defaultPrevented: false, target: undefined }
      const listeners = (page.addEventListener as jest.Mock).mock.calls.filter(
        ([type]) => type === 'keydown',
      )
      await act(() => {
        for (const [, listener] of listeners) (listener as (event: object) => void)(native)
      })
      await fireEvent(focused as never, 'keyDown', {
        ...key('Escape'),
        preventDefault: () => {
          native.defaultPrevented = true
        },
        nativeEvent: native,
      })
      const open = hostsOf(root()).filter(
        (node) => typeof node.props.onRequestClose === 'function' && node.props.visible !== false,
      ) as (Host & { props: { onRequestClose: () => void } })[]
      await act(() => {
        for (const layerNode of open) layerNode.props.onRequestClose()
      })
    }

    await typeEscape(screen.getByRole('button', { name: 'Sciences et espace' }))

    // Seule la seconde feuille se ferme ; la première reste, sans rien demander.
    expect(innerClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Sciences et espace' })).toBeNull()
    expect(outerGuard).not.toHaveBeenCalled()
    expect(outerClose).not.toHaveBeenCalled()
    expect(screen.getByText(PUBLISH_CONTENT)).toBeTruthy()
    // Le focus revient à la ligne « Catégorie », sans passer par la tête de la première feuille.
    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
    expect(focused.at(-1)).toBe(row)
    expect(focused).not.toContain(screen.getByRole('button', { name: 'Annuler' }))

    // Témoin : la seconde fermée, Échap revient à la première, qui demande avant de fermer.
    await typeEscape(screen.getByRole('button', { name: 'Catégorie' }))
    expect(outerGuard).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
  })
})
