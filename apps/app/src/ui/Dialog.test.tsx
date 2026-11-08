// Tests de la fenêtre de confirmation (Dialog) : son titre, son message, ses boutons, le contenu
// qu'elle rappelle (tranche 7a), et sa fermeture. Qu'elle défile quand elle dépasse de l'écran ne se
// mesure pas ici (Jest ne calcule aucune position) : c'est l'essai --explore de la fenêtre à 200 %
// de texte et en paysage qui le prouve.
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog, TAP_GUARD_MS } from './Dialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const props = {
  visible: true,
  title: 'Retirer ce contenu ?',
  message: 'Les autres membres ne le verront plus.',
}

describe('Dialog', () => {
  it('shows its title, its message and its buttons', async () => {
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.getByRole('header', { name: 'Retirer ce contenu ?' })).toBeTruthy()
    expect(screen.getByText('Les autres membres ne le verront plus.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeTruthy()
  })

  it('recalls the content it acts on, its kind and its text, in three lines at most', async () => {
    const text = 'Envoie-moi le code de ta carte, je te débloque la version pro.'
    await renderWithProviders(
      <Dialog {...props} quote={{ label: 'Commentaire', text }} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.getByText('Commentaire')).toBeTruthy()
    expect(screen.getByText(text).props.numberOfLines).toBe(3)
  })

  it('recalls nothing when it is given no content', async () => {
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.getByText('Les autres membres ne le verront plus.')).toBeTruthy() // témoin
    expect(screen.queryByText('Commentaire')).toBeNull()
  })

  it('closes through its « Annuler »', async () => {
    const onDismiss = jest.fn()
    await renderWithProviders(
      <Dialog {...props} onDismiss={onDismiss}>
        <Button label="Annuler" variant="secondary" onPress={onDismiss} />
      </Dialog>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows each paragraph of a longer message on its own', async () => {
    const paragraphs = ['Tu ne verras plus ses contenus.', 'Bloquer ne prévient pas la modération.']
    await renderWithProviders(
      <Dialog {...props} message={paragraphs} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    // Chacun son texte (getByText exact) : aucun n'est collé à l'autre dans un seul paragraphe.
    expect(screen.getByText(paragraphs[0] as string)).toBeTruthy()
    expect(screen.getByText(paragraphs[1] as string)).toBeTruthy()
  })

  it('takes a tap at once when it is not guarded', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={onPress} />
      </Dialog>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // La seconde tape d'une double tape sur le geste qui ouvre la fenêtre (« Bloquer » d'un menu)
  // tombait sur sa confirmation (relecture de design 7b, essais A, E, G). Que la tape tombe bien sous
  // le doigt ne se mesure pas ici : l'essai --explore de la double tape le prouve.
  describe('with guardTaps', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('ignores the taps on its buttons just after opening, then takes them', async () => {
      const onPress = jest.fn()
      await renderWithProviders(
        <Dialog {...props} guardTaps onDismiss={jest.fn()}>
          <Button label="Retirer" variant="confirm" onPress={onPress} />
        </Dialog>,
      )

      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS - 50))
      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
      expect(onPress).not.toHaveBeenCalled()

      await act(() => jest.advanceTimersByTime(50))
      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('guards again each time it opens', async () => {
      const onPress = jest.fn()
      const dialog = (visible: boolean) => (
        <Dialog {...props} visible={visible} guardTaps onDismiss={jest.fn()}>
          <Button label="Retirer" variant="confirm" onPress={onPress} />
        </Dialog>
      )
      await renderWithProviders(dialog(true))
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

      await screen.rerender(dialog(false))
      await screen.rerender(dialog(true))
      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))

      expect(onPress).not.toHaveBeenCalled()
    })

    it('stays open when « Annuler » is touched during the guard', async () => {
      const onDismiss = jest.fn()
      await renderWithProviders(
        <Dialog {...props} guardTaps onDismiss={onDismiss}>
          <Button label="Annuler" variant="secondary" onPress={onDismiss} />
        </Dialog>,
      )

      await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

      expect(onDismiss).not.toHaveBeenCalled()
      expect(screen.getByRole('header', { name: 'Retirer ce contenu ?' })).toBeTruthy()
    })
  })

  it('shows nothing while closed', async () => {
    await renderWithProviders(
      <Dialog {...props} visible={false} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.queryByRole('header', { name: 'Retirer ce contenu ?' })).toBeNull()
  })
})

// --- R6a : la fenêtre de suppression d'un projet (relecture du plan, ui-B3 et ui-I4) ---
//
// La fenêtre gagne :
// - `busy` : pendant la suppression, ni Échap, ni le voile, ni le retour d'Android ne la ferment
//   (« Supprimer » reste occupé, la fenêtre ne ment pas sur ce qui continue derrière) ;
// - `error` : une suppression qui échoue le dit dans la fenêtre, qui reste ouverte ;
// - sur le web, un nom (son titre) et une description (son message), comme une boîte de dialogue ;
// - une Échap relâchée sans avoir été enfoncée pendant qu'elle était ouverte ne la ferme pas : c'est
//   la fin de la touche qui fermait autre chose (la feuille, un menu), pas un geste pour elle
//   (comme `lastEscape` de Sheet).

type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent?: Host
}

/** La racine de l'arbre rendu, vue par ce qu'on en lit (ses props et ses enfants). */
const root = () => screen.root as unknown as Host

/** Tous les éléments de l'arbre rendu, en profondeur (RNTL 14 n'a plus `findAll`). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le texte d'un élément et de ses enfants, blancs ramenés à une espace. */
const textOf = (node: Host): string => {
  const text = (child: Host | string): string =>
    typeof child === 'string' ? child : child.children.map(text).join('')
  return text(node).replace(/\s+/g, ' ').trim()
}

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

/**
 * Un faux document du navigateur, le temps d'un test « web » : toute méthode existe (une fausse
 * fonction qui retient ses appels, comme `addEventListener`), <html> et <body> ont un style
 * (ThemeProvider y écrit la couleur de la page).
 */
const fakeDocument = (): Record<string, unknown> => {
  const node = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
    new Proxy(
      {
        style: { setProperty: jest.fn(), removeProperty: jest.fn() },
        visibilityState: 'visible',
        hidden: false,
        activeElement: null,
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
    ) as Record<string, unknown>
  return node()
}

/**
 * Enfonce Échap dans la fenêtre, comme le navigateur : les écouteurs de `keydown` posés sur le
 * document (à la capture ou non) la reçoivent, puis la touche arrive à l'élément qui a le focus
 * (`onKeyDown` d'une vue de la fenêtre, s'il y en a un). La fenêtre peut écouter l'un ou l'autre.
 */
const pressEscape = async (page: Record<string, unknown>, focused: unknown) => {
  const event = { key: 'Escape', repeat: false, defaultPrevented: false, preventDefault: jest.fn() }
  const listeners = (page.addEventListener as jest.Mock).mock.calls.filter(
    ([type]) => type === 'keydown',
  )
  await act(() => {
    for (const [, listener] of listeners) (listener as (event: object) => void)(event)
  })
  await fireEvent(focused as never, 'keyDown', { ...event, nativeEvent: event })
}

/** La fenêtre de suppression, telle que l'écrit la page d'un projet. */
const deleteProps = {
  visible: true,
  title: 'Supprimer « Le ciel de ce soir » ?',
  message: 'Le projet disparaît tout de suite. Impossible de revenir en arrière.',
}

describe('Dialog, the delete window (R6a)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('is named by its title and described by its message on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', { value: fakeDocument(), configurable: true })
    await renderWithProviders(
      <Dialog {...deleteProps} onDismiss={jest.fn()}>
        <Button label="Supprimer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    // La boîte de dialogue (la couche du Modal, ou une vue dedans) : nommée par l'identifiant du
    // titre, décrite par celui du message.
    const named = hostsOf(root()).filter(
      (node) => typeof node.props['aria-labelledby'] === 'string',
    )
    expect(named).toHaveLength(1)
    const dialog = named[0] as Host
    const byId = (id: string) => hostsOf(root()).find((node) => node.props.nativeID === id)
    const title = byId(String(dialog.props['aria-labelledby']))
    expect(title && textOf(title)).toBe(deleteProps.title)
    expect(screen.getByRole('header', { name: deleteProps.title }).props.nativeID).toBe(
      dialog.props['aria-labelledby'],
    )
    const described = String(dialog.props['aria-describedby'] ?? '')
      .split(' ')
      .filter(Boolean)
      .map(byId)
      .map((node) => (node ? textOf(node) : ''))
      .join(' ')
    expect(described).toContain(deleteProps.message)
  })

  it('ignores an Escape released without having been pressed while open (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const page = fakeDocument()
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    const onDismiss = jest.fn()
    await renderWithProviders(
      <Dialog {...deleteProps} onDismiss={onDismiss}>
        <Button label="Annuler" variant="secondary" onPress={onDismiss} />
      </Dialog>,
    )

    // Échap enfoncée ailleurs (elle fermait la feuille d'où vient la fenêtre), relâchée ici : le
    // Modal reçoit seulement la touche relâchée.
    await act(() => layer().props.onRequestClose())
    expect(onDismiss).not.toHaveBeenCalled()

    // Témoin : enfoncée puis relâchée pendant que la fenêtre est ouverte, elle la ferme, une fois.
    await pressEscape(page, screen.getByRole('button', { name: 'Annuler' }))
    await act(() => layer().props.onRequestClose())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('refuses Escape, the scrim and Android back while busy', async () => {
    jest.useFakeTimers()
    const web = jest.replaceProperty(Platform, 'OS', 'web')
    const page = fakeDocument()
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    const onDismiss = jest.fn()
    const window = (busy: boolean) => (
      <Dialog {...deleteProps} busy={busy} onDismiss={onDismiss}>
        <Button label="Supprimer" variant="confirm" loading={busy} onPress={jest.fn()} />
      </Dialog>
    )
    await renderWithProviders(window(true))
    // Après la garde de double tape : seule `busy` retient le voile.
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

    // Échap enfoncée puis relâchée (web), puis une tape sur le voile.
    await pressEscape(page, screen.getByRole('header', { name: deleteProps.title }))
    await act(() => layer().props.onRequestClose())
    await fireEvent.press(scrim())
    expect(onDismiss).not.toHaveBeenCalled()

    // Sur Android, le bouton retour arrive au Modal par onRequestClose, sans touche enfoncée.
    web.restore()
    await screen.rerender(window(true))
    await act(() => layer().props.onRequestClose())
    expect(onDismiss).not.toHaveBeenCalled()

    // Témoin : l'action finie, le même retour ferme la fenêtre.
    await screen.rerender(window(false))
    await act(() => layer().props.onRequestClose())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows an error in the window and keeps it open', async () => {
    const onDismiss = jest.fn()
    const window = (error?: string) => (
      <Dialog {...deleteProps} {...(error ? { error } : null)} onDismiss={onDismiss}>
        <Button label="Supprimer" variant="confirm" onPress={jest.fn()} />
      </Dialog>
    )
    await renderWithProviders(window())
    expect(screen.queryByRole('alert')).toBeNull() // témoin : pas d'erreur, pas d'alerte

    await screen.rerender(window('Impossible de supprimer ce projet. Réessaie.'))

    // L'erreur est une alerte, lue dès qu'elle paraît, dans la fenêtre : le plus petit bloc qui
    // porte l'alerte et le bouton porte aussi le titre (la fenêtre, pas la page dessous).
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Impossible de supprimer ce projet. Réessaie.')
    let block = alert.parent
    while (block && within(block).queryByRole('button', { name: 'Supprimer' }) === null) {
      block = block.parent
    }
    expect(block).not.toBeNull()
    expect(within(block as never).getByText(deleteProps.title)).toBeTruthy()
    // Elle reste ouverte : rien ne l'a fermée.
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: deleteProps.title })).toBeTruthy()
  })
})
