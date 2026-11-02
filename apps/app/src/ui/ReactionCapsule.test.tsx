// Tests de la capsule des réactions (R5a, F-Pr9, planche `R5a-Eventail`) : la capsule de verre qui
// flotte en bas de la page d'un projet, avec les cinq icônes et leur nombre (« Waggle ! », l'abeille,
// remplace « Bravo »). Toucher pose ou retire sa réaction ; un appui long (430 ms), un clic droit, la
// touche Menu ou l'action « appui long » du lecteur d'écran ouvrent l'éventail, sans rien poser.
// Elle reprend les états de `ReactionBar` (ReactionBar.test.tsx, components.test.tsx) : le nom lu
// complet, l'état enfoncé, le membre suspendu (verrouillé ou pâli), l'erreur et « Me reconnecter ».
// Relecture du plan : ui-4 (trois chemins vers l'éventail, une seule ouverture), ui-10 (le nom lu),
// ui-13 (l'erreur au-dessus de la capsule).
import type { ReactionKind } from '@ruche/contracts'
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type CapsuleReaction, ReactionCapsule } from './ReactionCapsule'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le nom affiché d'une réaction (« Waggle ! » pour `bravo`). */
const nameOf = (kind: ReactionKind) => fr.t(($) => $.project.reactions[kind])
/** Le nom lu d'un bouton : « Utile, 5 », ou « Waggle !, 21, ta réaction » pour la sienne (ui-10). */
const labelOf = (kind: ReactionKind, count: number, mine = false) =>
  mine
    ? fr.t(($) => $.project.reactions.labelMine, { name: nameOf(kind), count })
    : fr.t(($) => $.project.reactions.label, { name: nameOf(kind), count })

const group = fr.t(($) => $.project.reactions.group)
const openHint = fr.t(($) => $.reactions.fan.open)

/** Les cinq réactions d'un projet vu par un autre membre : il a posé « Waggle ! ». */
const reactions: CapsuleReaction[] = [
  { kind: 'amazing', count: 3, mine: false },
  { kind: 'inspiring', count: 0, mine: false },
  { kind: 'useful', count: 5, mine: false },
  { kind: 'funny', count: 1, mine: false },
  { kind: 'bravo', count: 21, mine: true },
]

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
/** Tous les éléments de l'arbre rendu, en profondeur, dans l'ordre de lecture. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le clic droit (ou la touche Menu, Maj+F10), tel que react-native-web le passe à onContextMenu. */
const contextMenu = () => ({ preventDefault: jest.fn(), stopPropagation: jest.fn() })

const Capsule = (props: Partial<Parameters<typeof ReactionCapsule>[0]>) => (
  <ReactionCapsule reactions={reactions} onToggle={jest.fn()} onOpenFan={jest.fn()} {...props} />
)

describe('ReactionCapsule', () => {
  it('shows the five reactions, « Waggle ! » included, each with its count', async () => {
    await renderWithProviders(<Capsule />)

    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByText('21')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    // « Bravo » ne se lit plus nulle part : c'est « Waggle ! ». Le texte a une espace fine
    // insécable avant « ! » : une expression la cherche par \s, jamais par une espace tapée.
    expect(screen.getByText(/^Waggle\s!$/)).toBeTruthy()
    expect(screen.getByLabelText(/^Waggle\s!, 21, /)).toBeTruthy() // témoin du test suivant
    expect(screen.queryByLabelText(/Bravo/)).toBeNull()
  })

  // ui-10 : le nom lu en entier, la sienne dite comme telle.
  it('reads each button in full: « Waggle !, 21, ta réaction »', async () => {
    await renderWithProviders(<Capsule />)

    expect(screen.getByRole('button', { name: 'Waggle !, 21, ta réaction' })).toBeTruthy()
    expect(screen.getByRole('button', { name: labelOf('bravo', 21, true) })).toBeTruthy()
    expect(screen.getByRole('button', { name: labelOf('useful', 5) })).toBeTruthy()
    expect(screen.getByRole('button', { name: labelOf('inspiring', 0) })).toBeTruthy()
  })

  it('is a group of buttons named « Réagir à ce projet »', async () => {
    await renderWithProviders(<Capsule />)

    expect(roleOf(screen.getByLabelText(group).props)).toBe('group')
  })

  it('marks her own reaction as pressed, and only that one', async () => {
    await renderWithProviders(<Capsule />)

    expect(screen.getByRole('button', { name: labelOf('bravo', 21, true) })).toBeSelected()
    expect(screen.getByRole('button', { name: labelOf('useful', 5) })).not.toBeSelected()
  })

  it('says « pressed » on the web (aria-pressed)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Capsule />)

      expect(
        screen.getByRole('button', { name: labelOf('bravo', 21, true) }).props['aria-pressed'],
      ).toBe(true)
      expect(screen.getByRole('button', { name: labelOf('useful', 5) }).props['aria-pressed']).toBe(
        false,
      )
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('puts a reaction when one is touched', async () => {
    const onToggle = jest.fn()
    const onOpenFan = jest.fn()
    await renderWithProviders(<Capsule onToggle={onToggle} onOpenFan={onOpenFan} />)

    await fireEvent.press(screen.getByRole('button', { name: labelOf('useful', 5) }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('useful')
    expect(onOpenFan).not.toHaveBeenCalled()
  })

  it('takes back her own reaction when it is touched again', async () => {
    const onToggle = jest.fn()
    await renderWithProviders(<Capsule onToggle={onToggle} />)

    await fireEvent.press(screen.getByRole('button', { name: labelOf('bravo', 21, true) }))

    expect(onToggle).toHaveBeenCalledWith('bravo')
  })

  // ui-4 : l'indice dit qu'il existe une autre façon de toucher (« Voir les réactions et leurs
  // noms »), et l'action « appui long » du lecteur d'écran ouvre l'éventail.
  it('tells screen readers how to open the fan, and offers it as a long press action', async () => {
    await renderWithProviders(<Capsule />)

    for (const reaction of reactions) {
      const button = screen.getByRole('button', {
        name: labelOf(reaction.kind, reaction.count, reaction.mine),
      })
      expect(button.props.accessibilityHint).toBe(openHint)
      const actions = (button.props.accessibilityActions ?? []) as { name: string }[]
      expect(actions.map((action) => action.name)).toContain('longpress')
    }
  })

  it('opens the fan from the screen reader long press action, without putting anything', async () => {
    const onToggle = jest.fn()
    const onOpenFan = jest.fn()
    await renderWithProviders(<Capsule onToggle={onToggle} onOpenFan={onOpenFan} />)

    await fireEvent(
      screen.getByRole('button', { name: labelOf('useful', 5) }),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'longpress' },
      },
    )

    expect(onOpenFan).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  // Le vrai geste, avec la vraie horloge de React Native (Pressability) : l'appui long se décide à
  // 430 ms (le plan, U2), plus tôt que les 500 ms par défaut de React Native.
  describe('held down', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())
    const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    it('opens the fan after 430 ms, without putting the reaction', async () => {
      const onToggle = jest.fn()
      const onOpenFan = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} onOpenFan={onOpenFan} />)

      // 460 ms : au-delà de 430, en deçà des 500 ms par défaut. Un appui long réglé par défaut ne
      // s'ouvrirait pas, et la réaction serait posée au relâché.
      await user().longPress(screen.getByRole('button', { name: labelOf('useful', 5) }), {
        duration: 460,
      })

      expect(onOpenFan).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('is still a simple touch at 300 ms (témoin)', async () => {
      const onToggle = jest.fn()
      const onOpenFan = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} onOpenFan={onOpenFan} />)

      await user().longPress(screen.getByRole('button', { name: labelOf('useful', 5) }), {
        duration: 300,
      })

      expect(onToggle).toHaveBeenCalledWith('useful')
      expect(onOpenFan).not.toHaveBeenCalled()
    })

    // ui-4 : sur Chrome Android, un appui long donne aussi un `contextmenu` juste après : l'éventail
    // ne s'ouvre qu'une fois (deux ouvertures le refermeraient, ou empileraient deux couches).
    it('opens the fan only once when the long press and the context menu both arrive', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      const onToggle = jest.fn()
      const onOpenFan = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} onOpenFan={onOpenFan} />)
      const button = screen.getByRole('button', { name: labelOf('useful', 5) })

      await user().longPress(button, { duration: 460 })
      const event = contextMenu()
      await fireEvent(button, 'contextMenu', event)

      expect(onOpenFan).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
      // Le menu du navigateur ne s'ouvre pas non plus par-dessus l'éventail.
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('opens the fan only once when the context menu comes first', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      const onOpenFan = jest.fn()
      await renderWithProviders(<Capsule onOpenFan={onOpenFan} />)
      const button = screen.getByRole('button', { name: labelOf('useful', 5) })

      await fireEvent(button, 'contextMenu', contextMenu())
      await fireEvent(button, 'longPress')

      expect(onOpenFan).toHaveBeenCalledTimes(1)
    })

    // Témoin des deux tests précédents : un second geste, bien plus tard, rouvre l'éventail.
    it('opens the fan again on a later, separate gesture (témoin)', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      const onOpenFan = jest.fn()
      await renderWithProviders(<Capsule onOpenFan={onOpenFan} />)
      const button = screen.getByRole('button', { name: labelOf('useful', 5) })

      await fireEvent(button, 'contextMenu', contextMenu())
      await act(() => jest.advanceTimersByTime(2000))
      await fireEvent(button, 'contextMenu', contextMenu())

      expect(onOpenFan).toHaveBeenCalledTimes(2)
    })
  })

  // ui-4 : sur ordinateur, le clic droit, la touche Menu ou Maj+F10 (un `contextmenu` du navigateur).
  it('opens the fan on a right click, without putting anything nor the browser menu', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onToggle = jest.fn()
      const onOpenFan = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} onOpenFan={onOpenFan} />)
      const event = contextMenu()

      await fireEvent(
        screen.getByRole('button', { name: labelOf('funny', 1) }),
        'contextMenu',
        event,
      )

      expect(onOpenFan).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
    }
  })

  // Comme `ReactionBar` pour un compte suspendu (tranche 7c) : les réactions verrouillées montrent
  // leur nombre seul ; celle qu'il a donnée garde son bouton, pour la retirer.
  describe('for a suspended member', () => {
    const locked: CapsuleReaction[] = [
      { kind: 'amazing', count: 3, mine: false, locked: true },
      { kind: 'inspiring', count: 0, mine: false, locked: true },
      { kind: 'useful', count: 5, mine: false, locked: true },
      { kind: 'funny', count: 1, mine: false, locked: true },
      { kind: 'bravo', count: 21, mine: true },
    ]

    it('keeps a button only for the reaction given, and still shows the other counts', async () => {
      const onToggle = jest.fn()
      await renderWithProviders(<Capsule reactions={locked} onToggle={onToggle} />)

      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.getByLabelText(labelOf('useful', 5))).toBeTruthy()
      expect(screen.getByLabelText(labelOf('inspiring', 0))).toBeTruthy()
      await fireEvent.press(screen.getByRole('button', { name: labelOf('bravo', 21, true) }))
      expect(onToggle).toHaveBeenCalledWith('bravo')
    })

    it('keeps the reaction just taken back in place, faded, and sends nothing', async () => {
      const onToggle = jest.fn()
      const takenBack: CapsuleReaction[] = [
        ...locked.slice(0, 4),
        { kind: 'bravo', count: 20, mine: false, disabled: true },
      ]
      await renderWithProviders(<Capsule reactions={takenBack} onToggle={onToggle} />)

      const button = screen.getByRole('button', { name: labelOf('bravo', 20) })
      expect(button).toBeDisabled()
      await fireEvent.press(button)
      expect(onToggle).not.toHaveBeenCalled()
    })

    // Sur le web, un élément de liste dans un autre (<li> dans <li>) est du HTML invalide : le
    // navigateur le répare en lisant la page pré-rendue, et React ne s'y retrouve plus (erreur
    // #418 du catalogue, R5a).
    it('never puts a list item inside another one', async () => {
      const takenBack: CapsuleReaction[] = [
        ...locked.slice(0, 4),
        { kind: 'bravo', count: 20, mine: false, disabled: true },
      ]
      await renderWithProviders(<Capsule reactions={takenBack} />)

      // On parcourt tout l'arbre, même les vues qu'un lecteur d'écran ne lit pas seules
      // (getAllByRole ne trouve que les éléments lus d'un seul tenant) : chaque vue de rôle
      // « listitem » compte, et aucune ne doit être sous une autre.
      type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
      let items = 0
      let nested = 0
      const walk = (node: Host, inItem: boolean) => {
        const isItem = node.props.role === 'listitem'
        if (isItem) items++
        if (isItem && inItem) nested++
        for (const child of node.children) {
          if (typeof child !== 'string') walk(child, inItem || isItem)
        }
      }
      walk(screen.root as unknown as Host, false)
      expect(items).toBeGreaterThanOrEqual(5)
      expect(nested).toBe(0)
    })

    it('keeps the faded reaction reachable by the keyboard on the web', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(
          <Capsule reactions={[{ kind: 'bravo', count: 20, mine: false, disabled: true }]} />,
        )

        const button = screen.getByRole('button', { name: labelOf('bravo', 20) })
        expect(button).toBeDisabled()
        // react-native-web donnerait tabIndex -1 à un bouton `disabled` : le focus se perdrait.
        expect(button.props.tabIndex).toBe(0)
      } finally {
        jest.restoreAllMocks()
      }
    })
  })

  describe('when a change could not be saved', () => {
    const message = fr.t(($) => $.project.reactions.error)

    it('reads out the error as soon as it appears', async () => {
      await renderWithProviders(<Capsule error={message} />)

      expect(screen.getByRole('alert')).toHaveTextContent(message)
    })

    // ui-13 : la capsule flotte en bas de l'écran ; un message dessous sortirait de l'écran.
    it('shows the error above the capsule', async () => {
      await renderWithProviders(<Capsule error={message} />)

      const all = hostsOf(screen.root as unknown as Host)
      const alert = all.indexOf(screen.getByRole('alert') as unknown as Host)
      const firstButton = all.indexOf(
        screen.getByRole('button', { name: labelOf('amazing', 3) }) as unknown as Host,
      )
      expect(alert).toBeGreaterThanOrEqual(0)
      expect(alert).toBeLessThan(firstButton)
    })

    it('offers « Me reconnecter » when the session has expired', async () => {
      const onPress = jest.fn()
      const signIn = fr.t(($) => $.states.signIn)
      await renderWithProviders(
        <Capsule error={fr.t(($) => $.states.expired)} errorAction={{ label: signIn, onPress }} />,
      )

      const action =
        screen.queryByRole('link', { name: signIn }) ?? screen.getByRole('button', { name: signIn })
      await fireEvent.press(action)
      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('shows no message when everything went well (témoin)', async () => {
      await renderWithProviders(<Capsule />)

      expect(screen.getAllByRole('button')).toHaveLength(5)
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})

// Décision de Louis du 2/11 : la capsule d'un membre suspendu n'ouvre pas l'éventail (il n'y pose
// plus rien). Sans `onOpenFan`, aucun indice « Voir les réactions et leurs noms » (il promettrait
// une action qui n'existe pas), ni action « appui long » pour le lecteur d'écran, et le clic droit
// garde le menu du navigateur.
describe('ReactionCapsule, without a fan', () => {
  const withoutFan = () => <ReactionCapsule reactions={reactions} onToggle={jest.fn()} />
  const button = () => screen.getByRole('button', { name: labelOf('useful', 5) })

  it('keeps its buttons, which still put a reaction (témoin)', async () => {
    const onToggle = jest.fn()
    await renderWithProviders(<ReactionCapsule reactions={reactions} onToggle={onToggle} />)

    await fireEvent.press(button())

    expect(onToggle).toHaveBeenCalledWith('useful')
  })

  it('gives no hint about the fan, and no long press action', async () => {
    await renderWithProviders(withoutFan())

    expect(button().props.accessibilityHint).toBeUndefined()
    const actions = (button().props.accessibilityActions ?? []) as { name: string }[]
    expect(actions.map((action) => action.name)).not.toContain('longpress')
  })

  it('leaves the browser menu alone on a right click, and links no hint on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(withoutFan())

      expect(button().props.onContextMenu).toBeUndefined()
      expect(button().props['aria-describedby']).toBeUndefined()
      // Le texte caché de l'indice n'est pas écrit non plus.
      expect(screen.queryByText(openHint, { includeHiddenElements: true })).toBeNull()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('has no long press handler', async () => {
    await renderWithProviders(withoutFan())

    expect(button().props.onLongPress).toBeUndefined()
  })
})

// Une double tape (deux tapes à 180 ms) posait puis retirait la réaction : deux écritures, et une
// réaction qui n'existe plus. Chaque réaction a sa garde de 600 ms (`useTapGuard`).
describe('ReactionCapsule, double tap', () => {
  it('puts the reaction once on a double tap, 180 ms apart', async () => {
    jest.useFakeTimers()
    try {
      const onToggle = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} />)
      const useful = () => screen.getByRole('button', { name: labelOf('useful', 5) })

      await fireEvent.press(useful())
      await act(() => jest.advanceTimersByTime(180))
      await fireEvent.press(useful())

      expect(onToggle.mock.calls).toEqual([['useful']])
    } finally {
      jest.useRealTimers()
    }
  })

  it('takes the next tap into account after 600 ms (a separate gesture)', async () => {
    jest.useFakeTimers()
    try {
      const onToggle = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} />)
      const useful = () => screen.getByRole('button', { name: labelOf('useful', 5) })

      await fireEvent.press(useful())
      await act(() => jest.advanceTimersByTime(700))
      await fireEvent.press(useful())

      expect(onToggle.mock.calls).toEqual([['useful'], ['useful']])
    } finally {
      jest.useRealTimers()
    }
  })

  it('guards each reaction on its own: two different reactions in a row both go through', async () => {
    jest.useFakeTimers()
    try {
      const onToggle = jest.fn()
      await renderWithProviders(<Capsule onToggle={onToggle} />)

      await fireEvent.press(screen.getByRole('button', { name: labelOf('useful', 5) }))
      await act(() => jest.advanceTimersByTime(180))
      await fireEvent.press(screen.getByRole('button', { name: labelOf('funny', 1) }))

      expect(onToggle.mock.calls).toEqual([['useful'], ['funny']])
    } finally {
      jest.useRealTimers()
    }
  })
})

// Décision de Louis du 2/11 : à partir de 1 000, le nombre s'écrit en court (« 1,2 k »), pour que la
// capsule ne déborde pas à 320 points et 200 % ; le nom lu garde le nombre entier.
describe('ReactionCapsule, large counts', () => {
  const big: CapsuleReaction[] = [
    { kind: 'amazing', count: 3, mine: false },
    { kind: 'inspiring', count: 0, mine: false },
    { kind: 'useful', count: 1234, mine: false },
    { kind: 'funny', count: 12345, mine: false },
    { kind: 'bravo', count: 21, mine: true },
  ]

  it('shows 1 234 reactions as « 1,2 k », and reads the whole number', async () => {
    await renderWithProviders(<Capsule reactions={big} />)

    expect(screen.getByText('1,2 k')).toBeTruthy()
    expect(screen.getByText('12,3 k')).toBeTruthy()
    expect(screen.queryByText('1234')).toBeNull()
    expect(screen.getByRole('button', { name: labelOf('useful', 1234) })).toBeTruthy()
    expect(screen.getByRole('button', { name: labelOf('funny', 12345) })).toBeTruthy()
  })

  it('writes it « 1.2K » in English', async () => {
    await renderWithProviders(<Capsule reactions={big} />, 'en')

    expect(screen.getByText('1.2K')).toBeTruthy()
    expect(screen.getByText('12.3K')).toBeTruthy()
  })

  it('keeps a small count as it is (témoin)', async () => {
    await renderWithProviders(<Capsule reactions={big} />)

    expect(screen.getByText('21')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shortens the count of a locked reaction too', async () => {
    const locked = big.map((reaction) => ({ ...reaction, locked: true }))
    await renderWithProviders(<Capsule reactions={locked} />)

    expect(screen.getByText('1,2 k')).toBeTruthy()
    expect(screen.getByLabelText(labelOf('useful', 1234))).toBeTruthy()
  })
})
