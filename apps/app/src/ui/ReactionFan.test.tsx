// Tests de l'éventail des réactions (R5a, F-Re1, planche `R5a-Eventail`) : ouvert par un appui long
// sur la capsule (ou un clic droit, la touche Menu, l'action du lecteur d'écran), il montre par-dessus
// la page floutée chaque réaction avec son nom et son nombre. Il ressemble à `Sheet` (Sheet.test.tsx) :
// une boîte de dialogue nommée, fermée par Échap, un toucher à côté ou Retour sur Android, qui rend le
// focus à ce qui l'a ouverte, et gardée contre la double tape. Règles de la relecture du plan :
// - ui-6 : une ligne = un seul contrôle. Une ligne pose sa réaction ; sur une réaction posée, la ligne
//   dit « Ta réaction » et un bouton « Retirer {{name}} » à part retire (la ligne elle-même ne retire
//   pas). L'éventail reste ouvert après un choix : on peut en poser plusieurs ;
// - ui-5 : le doigt qui se lève après l'appui long ne choisit rien ; « J'ai compris » envoie le focus
//   à la première ligne ;
// - ui-9 : l'aide de la première fois est lue dans le stockage avant l'ouverture (rien ne pousse les
//   lignes sous le doigt) ; un stockage en panne l'affiche (oncePerDevice.ts).

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ReactionKind } from '@ruche/contracts'
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from './focus'
import { noteSeen } from './oncePerDevice'
import { type FanReaction, ReactionFan } from './ReactionFan'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Où l'éventail pose le focus du clavier (web) : le test lit l'élément reçu.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Le nom affiché d'une réaction (« Waggle ! » pour `bravo`). */
const nameOf = (kind: ReactionKind) => fr.t(($) => $.project.reactions[kind])
/** Le nom lu d'une ligne qui pose sa réaction (« Bluffant, 3 »). */
const rowName = (kind: ReactionKind, count: number) =>
  fr.t(($) => $.project.reactions.label, { name: nameOf(kind), count })
/** Le bouton à part qui retire une réaction posée (« Retirer Waggle ! »). */
const removeName = (kind: ReactionKind) =>
  fr.t(($) => $.reactions.fan.removeNamed, { name: nameOf(kind) })

const title = fr.t(($) => $.reactions.fan.title)
const mine = fr.t(($) => $.reactions.fan.mine)
const hint = fr.t(($) => $.reactions.fan.hint)
const help = fr.t(($) => $.reactions.fan.help)
const helpOk = fr.t(($) => $.reactions.fan.helpOk)

/** Les cinq réactions : le membre a posé « Waggle ! ». */
const reactions: FanReaction[] = [
  { kind: 'amazing', count: 3, mine: false },
  { kind: 'inspiring', count: 0, mine: false },
  { kind: 'useful', count: 5, mine: false },
  { kind: 'funny', count: 1, mine: false },
  { kind: 'bravo', count: 21, mine: true },
]

type FanProps = Parameters<typeof ReactionFan>[0]
const Fan = (props: Partial<FanProps>) => (
  <ReactionFan open reactions={reactions} onToggle={jest.fn()} onClose={jest.fn()} {...props} />
)

/** Affiche l'éventail, puis laisse la lecture du stockage (l'aide) se terminer. */
const show = async (props: Partial<FanProps> = {}) => {
  const result = await renderWithProviders(<Fan {...props} />)
  await act(async () => {})
  return result
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({
  key: name,
  shiftKey: false,
  repeat: false,
  preventDefault: jest.fn(),
})

type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
}
const root = () => screen.root as unknown as Host
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Le texte d'un élément et de ses descendants, mis bout à bout. */
const textOf = (node: Host): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')

/**
 * La boîte de dialogue et son nom : un élément de rôle `dialog`, nommé par son libellé ou par
 * l'élément que désigne `aria-labelledby` (comme `Sheet`).
 */
const dialogName = (): string | undefined => {
  const all = hostsOf(root())
  const dialog = all.find(
    (node) => node.props.role === 'dialog' || node.props.accessibilityRole === 'dialog',
  )
  if (!dialog) return undefined
  const named = dialog.props.accessibilityLabel ?? dialog.props['aria-label']
  if (typeof named === 'string') return named
  const id = dialog.props['aria-labelledby'] ?? dialog.props.accessibilityLabelledBy
  const label = all.find((node) => id !== undefined && node.props.nativeID === id)
  return label ? textOf(label) : undefined
}

/** La couche du Modal : l'élément qui reçoit onRequestClose (retour Android, Échap relâchée). */
const layer = () => {
  const found = hostsOf(root()).find((node) => typeof node.props.onRequestClose === 'function')
  if (!found) throw new Error('no Modal layer')
  return found as Host & { props: { onRequestClose: () => void } }
}

/** Le voile, à côté de l'éventail : caché aux lecteurs d'écran, comme celui de `Sheet`. */
const scrim = () => {
  const found = hostsOf(root()).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim')
  return found as never
}

/**
 * Un faux document du navigateur, le temps d'un test « web » (repris de Sheet.test.tsx) :
 * `activeElement` est le bouton de la capsule qui avait le focus avant l'ouverture.
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

// Chaque test part d'un appareil où l'aide n'a jamais été vue.
beforeEach(() => AsyncStorage.clear())
afterEach(() => jest.restoreAllMocks())

describe('ReactionFan', () => {
  it('shows nothing while closed', async () => {
    await renderWithProviders(<Fan open={false} />)

    expect(screen.queryByText(title)).toBeNull()
    expect(screen.queryByRole('button', { name: rowName('useful', 5) })).toBeNull()
  })

  it('is a dialog named « Les réactions »', async () => {
    await show()

    expect(dialogName()).toBe(title)
  })

  it('shows each reaction with its name and count, and « Tu peux en poser plusieurs »', async () => {
    await show()

    for (const reaction of reactions) expect(screen.getByText(nameOf(reaction.kind))).toBeTruthy()
    expect(screen.getByText('21')).toBeTruthy()
    expect(screen.getByText(hint)).toBeTruthy()
  })

  // ui-6 : une ligne = un seul contrôle, nommé par la réaction et son nombre.
  it('puts the reaction of a row when it is touched', async () => {
    const onToggle = jest.fn()
    await show({ onToggle })
    // Après la garde de l'ouverture (le doigt qui se lève, voir plus bas).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, TAP_GUARD_MS + 50))
    })

    await fireEvent(screen.getByRole('button', { name: rowName('useful', 5) }), 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: rowName('useful', 5) }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('useful')
  })

  it('says « Ta réaction » on her own reaction, with a separate « Retirer Waggle ! » button', async () => {
    const onToggle = jest.fn()
    await show({ onToggle })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, TAP_GUARD_MS + 50))
    })

    expect(screen.getByText(mine)).toBeTruthy()
    // La ligne d'une réaction posée n'est pas un second contrôle qui retirerait aussi.
    expect(
      screen.queryByRole('button', {
        name: fr.t(($) => $.project.reactions.labelMine, { name: nameOf('bravo'), count: 21 }),
      }),
    ).toBeNull()
    await fireEvent.press(screen.getByText(mine))
    expect(onToggle).not.toHaveBeenCalled()

    const remove = screen.getByRole('button', { name: removeName('bravo') })
    await fireEvent(remove, 'pressIn')
    await fireEvent.press(remove)
    expect(onToggle).toHaveBeenCalledWith('bravo')
  })

  it('offers « Retirer » only on her own reactions', async () => {
    await show()

    expect(screen.getByRole('button', { name: removeName('bravo') })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: removeName('useful') })).toBeNull()
    expect(screen.queryByRole('button', { name: removeName('amazing') })).toBeNull()
  })

  // ui-6 : on peut en poser plusieurs ; l'éventail ne se ferme pas tout seul après un choix.
  it('stays open after a choice', async () => {
    const onToggle = jest.fn()
    const onClose = jest.fn()
    await show({ onToggle, onClose })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, TAP_GUARD_MS + 50))
    })

    const row = screen.getByRole('button', { name: rowName('funny', 1) })
    await fireEvent(row, 'pressIn')
    await fireEvent.press(row)

    expect(onToggle).toHaveBeenCalledWith('funny')
    expect(onClose).not.toHaveBeenCalled()
    expect(dialogName()).toBe(title)
  })

  describe('right after opening, under the finger', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    // ui-5 : l'éventail s'ouvre sous le doigt de l'appui long ; quand ce doigt se lève sur une
    // ligne, rien n'est choisi (la garde tient jusqu'à un vrai toucher dans l'éventail).
    it('chooses nothing when the finger of the long press is lifted on a row', async () => {
      const onToggle = jest.fn()
      await renderWithProviders(<Fan onToggle={onToggle} />)
      await act(async () => {})

      const row = screen.getByRole('button', { name: rowName('useful', 5) })
      // Le doigt se lève : un relâché, sans appui commencé dans l'éventail.
      await fireEvent(row, 'pressOut')
      await fireEvent.press(row)

      expect(onToggle).not.toHaveBeenCalled()
    })

    it('chooses on a real touch afterwards (témoin)', async () => {
      const onToggle = jest.fn()
      await renderWithProviders(<Fan onToggle={onToggle} />)
      await act(async () => {})
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      await user.press(screen.getByRole('button', { name: rowName('useful', 5) }))

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith('useful')
    })

    // Comme Sheet et Dialog : une seule action sur une double tape.
    it('puts the reaction only once on a double tap', async () => {
      const onToggle = jest.fn()
      await renderWithProviders(<Fan onToggle={onToggle} />)
      await act(async () => {})
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const row = screen.getByRole('button', { name: rowName('useful', 5) })
      await user.press(row)
      await user.press(row)

      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('ignores a tap on the scrim right after the opening', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<Fan onClose={onClose} />)
      await act(async () => {})

      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS - 50))
      await fireEvent.press(scrim())

      expect(onClose).not.toHaveBeenCalled()
    })

    it('closes on a tap beside it, once the guard is over', async () => {
      const onClose = jest.fn()
      await renderWithProviders(<Fan onClose={onClose} />)
      await act(async () => {})

      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent.press(scrim())

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('closes with the Android back button', async () => {
    const onClose = jest.fn()
    await show({ onClose })

    await act(() => layer().props.onRequestClose())

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('the help, the first time only', () => {
    it('shows the help at the top, with « J’ai compris », on a device that never saw it', async () => {
      await show()

      expect(screen.getByText(help)).toBeTruthy()
      expect(screen.getByRole('button', { name: helpOk })).toBeTruthy()
      // En haut : avant la première ligne, dans l'ordre de lecture.
      const all = hostsOf(root())
      const helpAt = all.findIndex((node) => textOf(node) === help)
      const firstRow = all.indexOf(
        screen.getByRole('button', { name: rowName('amazing', 3) }) as unknown as Host,
      )
      expect(helpAt).toBeGreaterThanOrEqual(0)
      expect(helpAt).toBeLessThan(firstRow)
    })

    it('does not show the help once it was understood on this device', async () => {
      await noteSeen('reaction-fan-help')
      await show()

      expect(screen.getByRole('button', { name: rowName('useful', 5) })).toBeTruthy() // témoin
      expect(screen.queryByText(help)).toBeNull()
      expect(screen.queryByRole('button', { name: helpOk })).toBeNull()
    })

    it('hides the help on « J’ai compris », and remembers it on this device', async () => {
      const setItem = jest.spyOn(AsyncStorage, 'setItem')
      await show()

      await fireEvent.press(screen.getByRole('button', { name: helpOk }))
      await act(async () => {})

      expect(screen.queryByText(help)).toBeNull()
      expect(setItem).toHaveBeenCalled()
    })

    // ui-9 : l'aide se décide avant l'ouverture. Lue à l'ouverture, elle arriverait un instant
    // après les lignes et les pousserait vers le bas, sous le doigt.
    it('reads the device storage before the fan opens', async () => {
      const getItem = jest.spyOn(AsyncStorage, 'getItem')
      const { rerender } = await renderWithProviders(<Fan open={false} />)
      await act(async () => {})

      expect(getItem).toHaveBeenCalled()
      await rerender(<Fan open />)
      // Dès le premier dessin ouvert, sans attendre une nouvelle lecture.
      expect(screen.getByText(help)).toBeTruthy()
    })

    // ui-9 : un stockage en panne (navigation privée, refus) ne casse rien ; l'aide s'affiche.
    it('shows the help when the device storage fails', async () => {
      await noteSeen('reaction-fan-help')
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('storage unavailable'))
      await show()

      expect(screen.getByText(help)).toBeTruthy()
      expect(screen.getByRole('button', { name: rowName('useful', 5) })).toBeTruthy()
    })

    it('still hides the help on « J’ai compris » when the storage cannot write', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('quota exceeded'))
      await show()

      await fireEvent.press(screen.getByRole('button', { name: helpOk }))
      await act(async () => {})

      expect(screen.queryByText(help)).toBeNull()
      expect(screen.getByRole('button', { name: rowName('useful', 5) })).toBeTruthy()
    })
  })

  describe('on the web, with the keyboard', () => {
    // Le bouton de la capsule qui avait le focus avant l'ouverture (document.activeElement).
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
      const onClose = jest.fn()
      await show({ onClose })

      await fireEvent(
        screen.getByRole('button', { name: rowName('useful', 5) }),
        'keyDown',
        key('Escape'),
      )

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('gives the focus back to the capsule when it closes', async () => {
      const { rerender } = await renderWithProviders(<Fan open={false} />)
      await act(async () => {})
      await rerender(<Fan open />)
      await act(async () => {})
      jest.mocked(focusWithoutScroll).mockClear()

      await rerender(<Fan open={false} />)
      await act(async () => {})

      // Par focusWithoutScroll (la page ne défile pas) ou par focus() : le bouton de la capsule qui
      // avait le focus à l'ouverture le retrouve.
      const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
      expect(focused.includes(opener as never) || opener.focus.mock.calls.length > 0).toBe(true)
    })

    // ui-5 : l'aide disparue, le focus ne retombe pas en haut de la page : il va à la première ligne.
    it('moves the focus to the first row on « J’ai compris »', async () => {
      await show()
      jest.mocked(focusWithoutScroll).mockClear()

      await fireEvent.press(screen.getByRole('button', { name: helpOk }))
      await act(async () => {})

      const focused = jest
        .mocked(focusWithoutScroll)
        .mock.calls.map((call) => (call[0] as unknown as Host | null)?.props?.accessibilityLabel)
      expect(focused).toContain(rowName('amazing', 3))
    })
  })
})
