// Tests de la feuille « Partager » (tranche R5a, F-Pr1, F-Mb1, planche R5a-Partager) : le titre
// « {{title}} sur Waiggle », l'adresse de la page (rien d'autre), le bandeau qui dit qui pourra
// l'ouvrir, « Partager… » (le menu de l'appareil, s'il existe) et « Copier le lien ». La feuille
// repose sur `Sheet` : Échap, toucher à côté et focus rendu viennent d'elle, et sont revérifiés ici
// (R2-E5 : un composant qui ressemble à un existant garde ses gardes).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { webAppUrl } from '../config'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { Button } from './Button'
import { copyText } from './clipboard'
import { focusWithoutScroll } from './focus'
import { ShareSheet } from './ShareSheet'
import { canShareNatively, shareLink } from './share'
import { TAP_GUARD_MS } from './tapGuard'
import { useHydrated } from './theme/hydration'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./clipboard', () => ({ copyText: jest.fn() }))
// Le menu de l'appareil : la feuille demande s'il existe, puis lui passe l'adresse. L'adresse
// elle-même (shareUrl) reste la vraie fonction.
jest.mock('./share', () => ({
  ...jest.requireActual('./share'),
  canShareNatively: jest.fn(() => true),
  shareLink: jest.fn(() => Promise.resolve()),
}))
// L'hydratation de la page web : vraie partout, sauf dans le test qui la retient.
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: jest.fn(() => true),
}))
// Où la feuille pose le focus du clavier (web) : le test lit l'élément reçu.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))
// Les toasts : on note ce qui est affiché, et quand (par rapport à la fermeture de la feuille).
const mockEvents: string[] = []
jest.mock('./theme/toast', () => ({
  ...jest.requireActual('./theme/toast'),
  useToast: () => ({ show: (text: string) => mockEvents.push(`toast: ${text}`) }),
}))

const copy = jest.mocked(copyText)
const share = jest.mocked(shareLink)
const canShare = jest.mocked(canShareNatively)
const hydrated = jest.mocked(useHydrated)

const PROJECT = '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f'
const URL_OF_PROJECT = new URL(`/projects/${PROJECT}`, webAppUrl).href
const TITLE = 'Décollage !'

const t = {
  title: fr.t(($) => $.share.title, { title: TITLE }),
  membersOnly: fr.t(($) => $.share.membersOnly),
  privateOnly: fr.t(($) => $.share.privateOnly),
  system: fr.t(($) => $.share.system),
  copy: fr.t(($) => $.share.copy),
  copiedMembers: fr.t(($) => $.share.copiedMembers),
  copiedPrivate: fr.t(($) => $.share.copiedPrivate),
  copyFailed: fr.t(($) => $.share.copyFailed),
  close: fr.t(($) => $.common.close),
}

beforeEach(() => {
  mockEvents.length = 0
  copy.mockReset()
  share.mockClear()
  canShare.mockReturnValue(true)
  hydrated.mockReturnValue(true)
})

type SheetProps = Partial<Parameters<typeof ShareSheet>[0]>

/** Une feuille ouverte qui reste ouverte après onClose : on peut y toucher deux fois. */
const StillSheet = (props: SheetProps) => (
  <ShareSheet
    open
    title={TITLE}
    target={{ kind: 'project', id: PROJECT }}
    onClose={() => mockEvents.push('close')}
    {...props}
  />
)

/** Une page avec son bouton Partager et sa feuille, qui garde l'état ouvert / fermé. */
const Page = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button label="Partager" onPress={() => setOpen(true)} />
      <ShareSheet
        open={open}
        title={TITLE}
        target={{ kind: 'project', id: PROJECT }}
        onClose={() => {
          mockEvents.push('close')
          setOpen(false)
        }}
      />
    </>
  )
}

const copyButton = () => screen.getByRole('button', { name: containing(t.copy) })

describe('ShareSheet', () => {
  it('is a dialog titled « Décollage ! sur Waiggle » that shows the address of the project', async () => {
    await renderWithProviders(<StillSheet />)

    expect(screen.getByRole('header', { name: containing(t.title) })).toBeTruthy()
    expect(screen.getByText(URL_OF_PROJECT)).toBeTruthy()
  })

  it('shows an address without any parameter: nothing about the member who shares', async () => {
    await renderWithProviders(<StillSheet />)

    const address = screen.getByText(containing(`/projects/${PROJECT}`))
    expect(String(address.props.children)).not.toMatch(/[?#]/)
  })

  it('says only members will be able to open a public project', async () => {
    await renderWithProviders(<StillSheet visibility="public" />)

    expect(screen.getByText(containing(t.membersOnly))).toBeTruthy()
    expect(screen.queryByText(containing(t.privateOnly))).toBeNull()
  })

  // jur-3 : un projet privé ne s'ouvrira que pour son auteur.
  it('says a private project will only open for its author', async () => {
    await renderWithProviders(<StillSheet visibility="private" />)

    expect(screen.getByText(containing(t.privateOnly))).toBeTruthy()
    expect(screen.queryByText(containing(t.membersOnly))).toBeNull()
  })

  it('says only members will be able to open the page of a member', async () => {
    await renderWithProviders(<StillSheet title="Max" target={{ kind: 'member', id: 'max' }} />)

    expect(screen.getByText(new URL('/members/max', webAppUrl).href)).toBeTruthy()
    expect(screen.getByText(containing(t.membersOnly))).toBeTruthy()
  })

  describe('« Partager… »', () => {
    it('opens the share menu of the device with the address only, once on a double tap', async () => {
      await renderWithProviders(<StillSheet />)
      const button = screen.getByRole('button', { name: containing(t.system) })

      await fireEvent.press(button)
      await fireEvent.press(button)

      expect(share.mock.calls).toEqual([[URL_OF_PROJECT]])
    })

    it('is absent when the device has no share menu', async () => {
      canShare.mockReturnValue(false)
      await renderWithProviders(<StillSheet />)

      expect(copyButton()).toBeTruthy() // témoin : la feuille est là, avec « Copier le lien »
      expect(screen.queryByRole('button', { name: containing(t.system) })).toBeNull()
    })

    // ui-9 : le pré-rendu ne connaît pas le navigateur ; le bouton n'apparaît qu'après
    // l'hydratation, sinon React redessinerait toute la page.
    it('waits for the web page to be hydrated', async () => {
      hydrated.mockReturnValue(false)
      await renderWithProviders(<StillSheet />)

      expect(copyButton()).toBeTruthy() // témoin
      expect(screen.queryByRole('button', { name: containing(t.system) })).toBeNull()
    })
  })

  describe('« Copier le lien »', () => {
    // ui-8 : un toast sous une fenêtre modale serait caché ; la feuille se ferme d'abord.
    it('copies the address, closes the sheet, then says « Lien copié » for members', async () => {
      copy.mockResolvedValue(true)
      await renderWithProviders(<StillSheet />)

      await fireEvent.press(copyButton())
      await act(async () => {})

      expect(copy.mock.calls).toEqual([[URL_OF_PROJECT]])
      expect(mockEvents).toEqual(['close', `toast: ${t.copiedMembers}`])
    })

    // jur-5 : pour un projet privé, le toast le redit.
    it('says the link will only open for its author on a private project', async () => {
      copy.mockResolvedValue(true)
      await renderWithProviders(<StillSheet visibility="private" />)

      await fireEvent.press(copyButton())
      await act(async () => {})

      expect(mockEvents).toEqual(['close', `toast: ${t.copiedPrivate}`])
    })

    it('copies once and closes once on a double tap', async () => {
      let resolve: (value: boolean) => void = () => {}
      copy.mockReturnValue(
        new Promise<boolean>((done) => {
          resolve = done
        }),
      )
      await renderWithProviders(<StillSheet />)
      const button = copyButton()

      await fireEvent.press(button)
      await fireEvent.press(button)
      await act(async () => resolve(true))

      expect(copy).toHaveBeenCalledTimes(1)
      expect(mockEvents.filter((event) => event === 'close')).toHaveLength(1)
    })

    // ui-7 : jamais un « Lien copié » mensonger.
    it('says the copy failed when the device refuses it', async () => {
      copy.mockResolvedValue(false)
      await renderWithProviders(<StillSheet />)

      await fireEvent.press(copyButton())
      await act(async () => {})

      expect(copy).toHaveBeenCalledTimes(1) // témoin
      expect(mockEvents).not.toContain(`toast: ${t.copiedMembers}`)
      expect(
        mockEvents.includes(`toast: ${t.copyFailed}`) ||
          screen.queryByText(containing(t.copyFailed)) !== null,
      ).toBe(true)
    })
  })

  describe('closing', () => {
    it('closes through « Fermer »', async () => {
      await renderWithProviders(<StillSheet />)

      await fireEvent.press(screen.getByRole('button', { name: t.close }))

      expect(mockEvents).toEqual(['close'])
    })

    it('closes on a tap beside it, once the guard against a double tap is over', async () => {
      jest.useFakeTimers()
      try {
        await renderWithProviders(<StillSheet />)
        await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

        await fireEvent.press(scrim())

        expect(mockEvents).toEqual(['close'])
      } finally {
        jest.useRealTimers()
      }
    })

    describe('on the web, with the keyboard', () => {
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

      it('closes with Escape', async () => {
        await renderWithProviders(<StillSheet />)

        await fireEvent(copyButton(), 'keyDown', key('Escape'))

        expect(mockEvents).toEqual(['close'])
      })

      it('gives the focus back to the Share button when it closes', async () => {
        await renderWithProviders(<Page />)
        await fireEvent.press(screen.getByRole('button', { name: 'Partager' }))
        expect(copyButton()).toBeTruthy() // témoin : la feuille est ouverte
        jest.mocked(focusWithoutScroll).mockClear()

        await fireEvent.press(screen.getByRole('button', { name: t.close }))

        const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
        expect(focused.includes(opener) || opener.focus.mock.calls.length > 0).toBe(true)
      })
    })
  })
})

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({
  key: name,
  shiftKey: false,
  repeat: false,
  preventDefault: jest.fn(),
})

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur (RNTL 14 n'a plus `findAll`). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le voile de la feuille : caché aux lecteurs d'écran, il se trouve par ce qui le cache. */
const scrim = () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim')
  return found as never
}

/**
 * Un faux document du navigateur, le temps d'un test « web » (comme dans Sheet.test.tsx) :
 * `activeElement` est l'élément qui avait le focus avant l'ouverture ; toute autre propriété existe
 * et ne fait rien.
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
        get(target, name) {
          if (name === 'then') return undefined
          if (!(name in target)) {
            target[name] =
              name === 'documentElement' || name === 'body' || name === 'head'
                ? node()
                : jest.fn(() => undefined)
          }
          return target[name]
        },
      },
    )
  return node({ activeElement })
}
