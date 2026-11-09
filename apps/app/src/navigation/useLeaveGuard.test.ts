// Tests de useLeaveGuard (navigation/useLeaveGuard.ts) sur le web : le bouton Retour du navigateur,
// pendant une feuille modifiée, demande d'abord (décision de Louis du 9/11/2026, R6a). Expo Router
// n'envoie pas `beforeRemove` pour ce Retour : il remet toute la pile à l'arrivée du `popstate`. Le
// hook garde donc une étape de plus dans l'historique, à la même adresse, et arrête le `popstate`
// qui la consomme avant qu'Expo Router l'entende.
//
// Le navigateur est remplacé par un faux : un historique (des entrées, une position), et une fenêtre
// qui envoie `popstate` à ses écouteurs comme un vrai navigateur (ceux posés « à la capture »
// d'abord, `stopImmediatePropagation` arrête les suivants). Un écouteur « Expo Router », posé avant
// le hook, dit si Expo Router aurait entendu le retour. Un `history.back()` du code ne bouge qu'à
// `flush()`, comme dans le navigateur, où il arrive dans une tâche suivante.
import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useLeaveGuard } from './useLeaveGuard'

/** La fausse navigation d'Expo Router (`useNavigation()`), lue par le hook. */
const mockNavigation = {
  addListener: jest.fn(() => () => {}),
  dispatch: jest.fn(),
}
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }))

type Entry = { state: unknown; url: string }
type PopEvent = { stopImmediatePropagation: () => void; stopPropagation: () => void }
type Listener = { fn: (event: PopEvent) => void; capture: boolean }

/** Un faux navigateur : le fil (`/`), puis la feuille « Nouveau projet » ouverte par-dessus. */
const makeBrowser = () => {
  const entries: Entry[] = [
    { state: { id: 'feed' }, url: '/' },
    { state: { id: 'sheet' }, url: '/projects/new' },
  ]
  let index = 1
  const listeners: { type: string; listener: Listener }[] = []
  // Les déplacements demandés par le code (`back`, `go`), joués à `flush()`.
  const queued: number[] = []
  const captureOf = (option: unknown) =>
    option === true || (typeof option === 'object' && option !== null && 'capture' in option)
  const page = {
    history: {
      get state() {
        return entries[index]?.state ?? null
      },
      pushState: jest.fn((state: unknown, _title: string, url?: string) => {
        entries.splice(index + 1)
        entries.push({ state, url: url ?? entries[index]?.url ?? '/' })
        index += 1
      }),
      replaceState: jest.fn((state: unknown, _title: string, url?: string) => {
        entries[index] = { state, url: url ?? entries[index]?.url ?? '/' }
      }),
      back: jest.fn(() => {
        queued.push(-1)
      }),
      go: jest.fn((delta: number) => {
        queued.push(delta)
      }),
    },
    location: {
      get href() {
        return entries[index]?.url ?? '/'
      },
    },
    addEventListener: jest.fn(
      (type: string, fn: (event: PopEvent) => void, option?: boolean | object) => {
        listeners.push({ type, listener: { fn, capture: captureOf(option) } })
      },
    ),
    removeEventListener: jest.fn(
      (type: string, fn: (event: PopEvent) => void, option?: boolean | object) => {
        const at = listeners.findIndex(
          (it) =>
            it.type === type && it.listener.fn === fn && it.listener.capture === captureOf(option),
        )
        if (at > -1) listeners.splice(at, 1)
      },
    ),
  }
  const popstate = () => {
    let stopped = false
    const event: PopEvent = {
      stopImmediatePropagation: () => {
        stopped = true
      },
      stopPropagation: () => {
        stopped = true
      },
    }
    const all = listeners.filter((it) => it.type === 'popstate').map((it) => it.listener)
    for (const { fn } of [...all.filter((it) => it.capture), ...all.filter((it) => !it.capture)]) {
      if (stopped) break
      fn(event)
    }
  }
  const traverse = (delta: number) => {
    const next = index + delta
    if (!entries[next]) return
    index = next
    popstate()
  }
  // L'écouteur d'Expo Router, posé au démarrage de l'appli, donc avant le hook.
  const expoRouter = jest.fn()
  page.addEventListener('popstate', expoRouter)
  return {
    page,
    entries,
    expoRouter,
    /** L'entrée où se trouve le navigateur. */
    here: () => entries[index] as Entry,
    /** Le nombre d'entrées jusqu'à la position actuelle comprise. */
    depth: () => index + 1,
    /** Joue les déplacements demandés par le code. */
    flush: async () => {
      await act(async () => {
        while (queued.length > 0) traverse(queued.shift() as number)
      })
    },
    /** Le membre touche Retour (`steps` : plusieurs pas, depuis le menu du bouton). */
    userBack: async (steps = 1) => {
      await act(async () => traverse(-steps))
    },
  }
}

type Browser = ReturnType<typeof makeBrowser>
let browser: Browser
let originalWindow: unknown

const onHeld = jest.fn()

/** Monte le hook sur le web, avec ou sans changements ; `rerender` change `dirty`. */
const guard = async (dirty: boolean) => {
  const hook = await renderHook(
    ({ changed }: { changed: boolean }) => useLeaveGuard(changed, onHeld),
    { initialProps: { changed: dirty } },
  )
  return {
    ...hook,
    setDirty: async (changed: boolean) => {
      await hook.rerender({ changed })
    },
  }
}

const marked = (entry: Entry) =>
  typeof entry.state === 'object' &&
  entry.state !== null &&
  Object.values(entry.state as Record<string, unknown>).includes(true)

describe('on the web', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    browser = makeBrowser()
    originalWindow = (globalThis as { window?: unknown }).window
    Object.defineProperty(globalThis, 'window', {
      value: browser.page,
      configurable: true,
      writable: true,
    })
    onHeld.mockClear()
    mockNavigation.dispatch.mockClear()
  })
  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
    jest.restoreAllMocks()
  })

  it('keeps one more step at the same address while something was written, and none before', async () => {
    const hook = await guard(false)
    expect(browser.page.history.pushState).not.toHaveBeenCalled()
    expect(browser.depth()).toBe(2)

    await hook.setDirty(true)
    expect(browser.depth()).toBe(3)
    expect(browser.here().url).toBe('/projects/new')
    // Une marque dans `state`, et l'identifiant d'Expo Router gardé, qui voit toujours la feuille.
    expect(marked(browser.here())).toBe(true)
    expect(browser.here().state).toEqual(expect.objectContaining({ id: 'sheet' }))
    await hook.unmount()
  })

  it('stops a browser Back before Expo Router hears it, puts the step back and asks', async () => {
    const hook = await guard(true)
    await browser.userBack()

    expect(onHeld).toHaveBeenCalledTimes(1)
    expect(onHeld).toHaveBeenCalledWith({ type: 'GO_BACK' })
    // Expo Router n'a rien entendu : la pile n'est pas remise, la feuille reste.
    expect(browser.expoRouter).not.toHaveBeenCalled()
    expect(browser.here().url).toBe('/projects/new')
    // L'étape est remise : un second Retour demande encore.
    expect(browser.depth()).toBe(3)
    expect(marked(browser.here())).toBe(true)
    await hook.unmount()
  })

  it('asks again at a second Back, and keeps a single step', async () => {
    const hook = await guard(true)
    await browser.userBack()
    await browser.userBack()

    expect(onHeld).toHaveBeenCalledTimes(2)
    expect(browser.expoRouter).not.toHaveBeenCalled()
    expect(browser.depth()).toBe(3)
    await hook.unmount()
  })

  it('takes the step away, then lets the sheet go back, when the member gives up', async () => {
    const hook = await guard(true)
    await browser.userBack()
    const action = onHeld.mock.calls[0]?.[0]

    await act(async () => hook.result.current.proceed(action))
    // Le retour d'Expo Router attend que l'étape soit retirée : sinon il ne reculerait que jusqu'à
    // la feuille, et une étape resterait en trop.
    expect(mockNavigation.dispatch).not.toHaveBeenCalled()
    await browser.flush()

    expect(browser.depth()).toBe(2)
    expect(browser.here().url).toBe('/projects/new')
    expect(marked(browser.here())).toBe(false)
    // Le retrait n'est pas un retour pour Expo Router.
    expect(browser.expoRouter).not.toHaveBeenCalled()
    expect(mockNavigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
    await hook.unmount()
  })

  it('takes the step away without leaving the page once nothing is left to lose', async () => {
    const hook = await guard(true)
    expect(browser.depth()).toBe(3)
    await hook.setDirty(false)
    await browser.flush()

    expect(browser.depth()).toBe(2)
    expect(browser.here().url).toBe('/projects/new')
    expect(browser.expoRouter).not.toHaveBeenCalled()
    expect(onHeld).not.toHaveBeenCalled()

    // Plus rien à perdre : le Retour suivant part sans demander.
    await browser.userBack()
    expect(onHeld).not.toHaveBeenCalled()
    expect(browser.expoRouter).toHaveBeenCalledTimes(1)
    expect(browser.here().url).toBe('/')
    await hook.unmount()
  })

  it('lets a departure wait for the step to be gone (publish, save, close)', async () => {
    const hook = await guard(true)
    let gone = false
    await act(async () => {
      void hook.result.current.release().then(() => {
        gone = true
      })
    })
    expect(gone).toBe(false)
    await browser.flush()

    expect(gone).toBe(true)
    expect(browser.depth()).toBe(2)
    expect(browser.expoRouter).not.toHaveBeenCalled()
    // Relâché : plus rien n'est gardé, même si `dirty` reste vrai.
    await browser.userBack()
    expect(onHeld).not.toHaveBeenCalled()
    await hook.unmount()
  })

  it('lets a departure go at once when no step was kept', async () => {
    const hook = await guard(false)
    let gone = false
    await act(async () => {
      void hook.result.current.release().then(() => {
        gone = true
      })
    })
    expect(gone).toBe(true)
    expect(browser.page.history.back).not.toHaveBeenCalled()
    await hook.unmount()
  })

  it('lets a Back pass through to Expo Router when nothing was written', async () => {
    const hook = await guard(false)
    await browser.userBack()

    expect(onHeld).not.toHaveBeenCalled()
    expect(browser.expoRouter).toHaveBeenCalledTimes(1)
    expect(browser.here().url).toBe('/')
    await hook.unmount()
  })

  it('stops nothing once unmounted', async () => {
    const hook = await guard(false)
    await hook.unmount()
    expect(
      browser.page.addEventListener.mock.calls.filter(([type]) => type === 'popstate').length,
    ).toBe(
      browser.page.removeEventListener.mock.calls.filter(([type]) => type === 'popstate').length +
        1,
    )
  })
})

describe('on a phone', () => {
  it('never touches a browser history', async () => {
    const pushState = jest.fn()
    const back = jest.fn()
    const original = (globalThis as { window?: unknown }).window
    Object.defineProperty(globalThis, 'window', {
      value: {
        history: { state: null, pushState, back, go: jest.fn() },
        location: { href: '/projects/new' },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      configurable: true,
      writable: true,
    })
    try {
      const hook = await guard(true)
      await hook.setDirty(false)
      await hook.setDirty(true)
      expect(pushState).not.toHaveBeenCalled()
      expect(back).not.toHaveBeenCalled()
      await hook.unmount()
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: original,
        configurable: true,
        writable: true,
      })
    }
  })
})
