// Tests de la feuille (refonte, tranche R2) : « Changer d'adresse », « Modifier mon profil »,
// « Supprimer mon compte » s'ouvrent dans une feuille par-dessus la page. C'est une fenêtre modale
// nommée par son titre, avec un bouton « Fermer » (relecture juridique jur-15, WCAG 2.5.7 : la
// poignée ne suffit pas). Au clavier (web) : le focus entre dans la feuille à l'ouverture, revient au
// bouton qui l'a ouverte à la fermeture, Échap ferme, et Tab tourne dans la feuille sans en sortir.
//
// Ce que Jest ne mesure pas : la feuille pleine hauteur sur téléphone, le panneau centré sur un fond
// voilé sur ordinateur, et le pied qui reste au-dessus du clavier (jur-15, WCAG 2.4.11). C'est
// l'affaire des captures et d'un essai --explore.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'
import { focusWithoutScroll } from './focus'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
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
  })
})
