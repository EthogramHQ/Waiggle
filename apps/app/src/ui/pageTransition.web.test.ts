// Tests du moteur des passages de page sur le web (R17, `ui/pageTransition.web.ts`) : avancer,
// revenir, passer d'un onglet à l'autre, avec l'API View Transitions du navigateur ou sans elle, et
// la photo d'une carte qui devient la couverture du projet.
//
// Jest n'a ni navigateur ni API View Transitions : le test injecte un faux `document`
// (`setPassageDocument`), dont `startViewTransition` joue le rappel comme le ferait le navigateur
// (sa promesse `updateCallbackDone`, puis `ready`, puis `finished`, que le test termine quand il
// veut). Le faux garde ce qu'il a vu au moment de l'appel : l'attribut `data-passage` de `<html>` et
// le nom (`view-transition-name`) des photos.
//
// Chaque test charge un module neuf (`jest.isolateModules`) : le moteur retient l'état de la visite
// (la page hydratée, la première page posée, le passage en cours).
import { Platform } from 'react-native'

type Engine = typeof import('./pageTransition.web')

/** Une promesse qu'on résout ou rejette de l'extérieur. */
const deferred = () => {
  let resolve: () => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Laisse passer les promesses en attente (les « microtâches »). */
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

type Rect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

/** Un élément de la page : une photo, de `height` points, dont le haut est à `top`. */
const element = (top: number, height = 220) => {
  const style = {
    viewTransitionName: '',
    setProperty(name: string, value: string) {
      if (name === 'view-transition-name') style.viewTransitionName = value
    },
    removeProperty(name: string) {
      if (name === 'view-transition-name') style.viewTransitionName = ''
      return ''
    },
    getPropertyValue(name: string) {
      return name === 'view-transition-name' ? style.viewTransitionName : ''
    },
  }
  const rect: Rect = { top, bottom: top + height, left: 16, right: 374, width: 358, height }
  return { style, getBoundingClientRect: () => rect }
}
type FakeElement = ReturnType<typeof element>
const nameOf = (el: FakeElement) => el.style.viewTransitionName

type Mode = 'api' | 'none' | 'failing' | 'throwing' | 'readyRejected'

/** Le faux `document` : `<html>`, ses photos cibles, `matchMedia` et l'API selon `mode`. */
const fakeDocument = ({ mode = 'api' as Mode, reduced = false } = {}) => {
  const dataset: Record<string, string | undefined> = {}
  const targets = new Map<string, FakeElement>()
  const elements: FakeElement[] = []
  const track = (el: FakeElement) => {
    elements.push(el)
    return el
  }
  const named = () => elements.filter((el) => nameOf(el) !== '')
  const attribute = (name: string) =>
    name.replace(/^data-/, '').replace(/-(.)/g, (_, c) => c.toUpperCase())
  const documentElement = {
    dataset,
    setAttribute: (name: string, value: string) => {
      dataset[attribute(name)] = String(value)
    },
    removeAttribute: (name: string) => {
      delete dataset[attribute(name)]
    },
    getAttribute: (name: string) => dataset[attribute(name)] ?? null,
    hasAttribute: (name: string) => dataset[attribute(name)] !== undefined,
    style: {},
  }
  const matchMedia = (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })
  // Ce que le faux a vu à chaque appel de `startViewTransition`, et de quoi terminer le passage.
  const calls: { passage: string | undefined; named: FakeElement[]; finish: () => void }[] = []
  const startViewTransition = jest.fn((arg: (() => unknown) | { update: () => unknown }) => {
    if (mode === 'throwing') throw new Error('InvalidStateError')
    const update = typeof arg === 'function' ? arg : arg.update
    const end = deferred()
    calls.push({ passage: dataset.passage, named: named(), finish: end.resolve })
    // Le navigateur photographie l'ancienne page, puis joue le rappel (plus tard : une microtâche).
    const updateCallbackDone = Promise.resolve().then(() => update())
    if (mode === 'failing') {
      // Le rappel est joué, puis le passage échoue (relecture de sécurité S2).
      const failed = updateCallbackDone.then(() => Promise.reject(new Error('AbortError')))
      return {
        updateCallbackDone: failed.then(() => {}),
        ready: failed.then(() => {}),
        finished: failed.then(() => {}),
        skipTransition: () => {},
      }
    }
    const ready =
      mode === 'readyRejected'
        ? updateCallbackDone.then(() => Promise.reject(new Error('AbortError')))
        : updateCallbackDone.then(() => {})
    return {
      updateCallbackDone: updateCallbackDone.then(() => {}),
      ready,
      finished: updateCallbackDone.then(() => end.promise),
      skipTransition: () => end.resolve(),
    }
  })
  const doc = {
    documentElement,
    querySelector: (selector: string) => {
      const id = /data-cover-target="([^"]+)"/.exec(selector)?.[1]
      return id ? (targets.get(id) ?? null) : null
    },
    matchMedia,
    defaultView: { matchMedia, innerHeight: 844, innerWidth: 390 },
    ...(mode === 'none' ? {} : { startViewTransition }),
  }
  return { doc, dataset, targets, track, named, calls, startViewTransition }
}
type Fake = ReturnType<typeof fakeDocument>

/** La promesse `updateCallbackDone` du premier passage : la fin du rappel du navigateur. */
const updateDone = (fake: Fake): Promise<void> => {
  const transition = fake.startViewTransition.mock.results[0]?.value as
    | { updateCallbackDone: Promise<void> }
    | undefined
  if (!transition) throw new Error('no view transition started')
  return transition.updateCallbackDone
}

/**
 * Un moteur neuf, sur ce faux document. Par défaut, la page est hydratée et la première page de la
 * visite est posée (`passageArrived` une fois) : un passage peut se jouer.
 */
const load = (fake: Fake, { hydrated = true, firstPage = true } = {}): Engine => {
  let engine: Engine | undefined
  let markHydrated: (() => void) | undefined
  jest.isolateModules(() => {
    jest.replaceProperty(require('react-native').Platform, 'OS', 'web')
    markHydrated = require('./theme/hydration').markHydrated
    engine = require('./pageTransition.web')
  })
  if (!engine || !markHydrated) throw new Error('engine not loaded')
  engine.setPassageDocument(fake.doc as unknown as Parameters<Engine['setPassageDocument']>[0])
  if (hydrated) markHydrated()
  if (firstPage) engine.passageArrived()
  return engine
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'web')
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('pageTransition.web, without the View Transitions API', () => {
  it('runs the navigation at once and fades the deeper page in, rising', () => {
    const engine = load(fakeDocument({ mode: 'none' }))
    const mutate = jest.fn()

    engine.runPassage('deeper', mutate)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(engine.arrivalStyle()).toBe('fade-up')
  })

  it('shows the page before at once on the way back, without a fade', () => {
    const engine = load(fakeDocument({ mode: 'none' }))
    engine.runPassage('deeper', () => {})
    engine.passageArrived()

    const mutate = jest.fn()
    engine.runPassage('back', mutate)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(engine.arrivalStyle()).toBe('none')
  })

  it('cross-fades a sibling tab', () => {
    const engine = load(fakeDocument({ mode: 'none' }))

    engine.runPassage('sibling', () => {})

    expect(engine.arrivalStyle()).toBe('fade')
  })
})

describe('pageTransition.web, when there is no passage', () => {
  it('starts no view transition before the page is hydrated', () => {
    const fake = fakeDocument()
    const engine = load(fake, { hydrated: false })
    const mutate = jest.fn()

    engine.runPassage('deeper', mutate)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(fake.startViewTransition).not.toHaveBeenCalled()
  })

  it('starts no view transition before the first page of the visit is shown', () => {
    const fake = fakeDocument()
    const engine = load(fake, { firstPage: false })
    const mutate = jest.fn()

    engine.runPassage('deeper', mutate)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(fake.startViewTransition).not.toHaveBeenCalled()
  })

  it('starts no view transition for a passage of kind none (a sheet, a prefetch)', () => {
    const fake = fakeDocument()
    const engine = load(fake)
    const mutate = jest.fn()

    engine.runPassage('none', mutate)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(fake.startViewTransition).not.toHaveBeenCalled()
    expect(fake.dataset.passage).toBeUndefined()
  })
})

describe('pageTransition.web, with the View Transitions API', () => {
  it('marks <html> with the kind before the call, and removes it once the passage is finished', async () => {
    const fake = fakeDocument()
    const engine = load(fake)
    const mutate = jest.fn()

    engine.runPassage('deeper', mutate)
    expect(fake.startViewTransition).toHaveBeenCalledTimes(1)
    expect(fake.calls[0]?.passage).toBe('deeper')
    // La page qui arrive ne fond pas d'elle-même : le navigateur anime.
    expect(engine.arrivalStyle()).toBe('vt')

    await flush()
    expect(mutate).toHaveBeenCalledTimes(1)
    engine.passageArrived()
    await flush()
    expect(fake.dataset.passage).toBe('deeper')

    fake.calls[0]?.finish()
    await flush()
    expect(fake.dataset.passage).toBeUndefined()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('marks the way back and the sibling tabs by their kind', async () => {
    const fake = fakeDocument()
    const engine = load(fake)

    engine.runPassage('back', () => {})
    engine.passageArrived()
    await flush()
    fake.calls[0]?.finish()
    await flush()
    engine.runPassage('sibling', () => {})

    expect(fake.calls.map((call) => call.passage)).toEqual(['back', 'sibling'])
  })

  it('waits for the new page to arrive before the browser takes its picture', async () => {
    const fake = fakeDocument()
    const engine = load(fake)
    engine.runPassage('deeper', () => {})
    const done = jest.fn()
    void updateDone(fake).then(done)

    await flush()
    expect(done).not.toHaveBeenCalled()

    engine.passageArrived()
    await flush()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('stops waiting after about 250 ms when the page never says it arrived', async () => {
    jest.useFakeTimers()
    const fake = fakeDocument()
    const engine = load(fake)
    engine.runPassage('deeper', () => {})
    const done = jest.fn()
    void updateDone(fake).then(done)

    await flush()
    jest.advanceTimersByTime(100)
    await flush()
    expect(done).not.toHaveBeenCalled()

    jest.advanceTimersByTime(200)
    await flush()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('runs another navigation after the passage in progress, without a second animation', async () => {
    const fake = fakeDocument()
    const engine = load(fake)
    engine.runPassage('deeper', () => {})
    await flush()

    const second = jest.fn()
    engine.runPassage('deeper', second)
    await flush()
    expect(second).not.toHaveBeenCalled()

    engine.passageArrived()
    await flush()
    fake.calls[0]?.finish()
    await flush()

    expect(second).toHaveBeenCalledTimes(1)
    expect(fake.startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('never blocks when the passage fails: one navigation, the mark removed, the next one run (S2)', async () => {
    const fake = fakeDocument({ mode: 'failing' })
    const engine = load(fake)
    const mutate = jest.fn()
    const next = jest.fn()

    engine.runPassage('deeper', mutate)
    engine.runPassage('deeper', next)
    engine.passageArrived()
    await flush()
    engine.passageArrived()
    await flush()

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(fake.dataset.passage).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('still navigates once when the browser refuses to start the passage (S2)', async () => {
    const fake = fakeDocument({ mode: 'throwing' })
    const engine = load(fake)
    const mutate = jest.fn()

    engine.runPassage('deeper', mutate)
    await flush()

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(fake.dataset.passage).toBeUndefined()
  })

  it('swallows a rejected ready promise', async () => {
    const fake = fakeDocument({ mode: 'readyRejected' })
    const engine = load(fake)
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      engine.runPassage('deeper', () => {})
      engine.passageArrived()
      await flush()
      fake.calls[0]?.finish()
      // L'alerte d'une promesse rejetée sans personne pour l'écouter part au tour suivant.
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})

describe('pageTransition.web, the cover of a card that becomes the page', () => {
  /** Une carte à `top`, sa photo partagée, puis l'ouverture du projet dont la page porte `target`. */
  const open = async (
    fake: Fake,
    engine: Engine,
    card: FakeElement,
    target: FakeElement | null,
  ) => {
    engine.shareCover({ from: card, id: 'p1' })
    engine.runPassage('deeper', () => {
      if (target) fake.targets.set('p1', target)
    })
    await flush()
    engine.passageArrived()
    await flush()
  }

  it('names the card photo before the call, then the page cover in the callback, then neither', async () => {
    const fake = fakeDocument()
    const engine = load(fake)
    const card = fake.track(element(300))
    const target = fake.track(element(0, 300))

    await open(fake, engine, card, target)

    expect(fake.calls[0]?.named).toEqual([card])
    expect(nameOf(card)).toBe('')
    expect(nameOf(target)).toBe('wg-cover')

    fake.calls[0]?.finish()
    await flush()
    expect(fake.named()).toEqual([])
  })

  it('names no photo when the visitor reduces motion', async () => {
    const fake = fakeDocument({ reduced: true })
    const engine = load(fake)
    const card = fake.track(element(300))
    const target = fake.track(element(0, 300))

    await open(fake, engine, card, target)

    expect(fake.calls[0]?.named ?? []).toEqual([])
    expect(fake.named()).toEqual([])
  })

  it('names no photo when less than 75 % of the card photo is visible', async () => {
    const fake = fakeDocument()
    const engine = load(fake)
    // 64 points sur 220 dans la fenêtre de 844 : moins d'un tiers de la photo se voit.
    const card = fake.track(element(780))
    const target = fake.track(element(0, 300))

    await open(fake, engine, card, target)

    expect(fake.calls[0]?.named).toEqual([])
    expect(fake.named()).toEqual([])
  })

  it('lets the page simply fade when the project page has no cover target', async () => {
    const fake = fakeDocument()
    const engine = load(fake)
    const card = fake.track(element(300))

    await open(fake, engine, card, null)

    expect(fake.named()).toEqual([])
  })
})

// La fin d'un passage ne dépend pas de la navigation (relecture de sécurité S2) : si la navigation
// elle-même lève une erreur au moment où le passage la joue, la marque `data-passage` est quand
// même retirée de <html> et le moteur est libre. Sinon, la marque restait pour toujours (les
// captures attendaient sa fin), et toutes les navigations suivantes attendaient un passage fini.
describe('pageTransition.web, when the navigation itself throws', () => {
  const failing = () => {
    throw new Error('navigation failed')
  }

  it('removes the mark and frees the engine when the browser refuses the passage (S2)', async () => {
    const fake = fakeDocument({ mode: 'throwing' })
    const engine = load(fake)

    // L'erreur de la navigation n'est pas cachée : elle remonte, comme sans passage.
    expect(() => engine.runPassage('deeper', failing)).toThrow('navigation failed')
    expect(fake.dataset.passage).toBeUndefined()
    expect(engine.passageBusy()).toBe(false)

    const next = jest.fn()
    engine.runPassage('deeper', next)
    await flush()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('removes the mark at the net when the browser never plays the passage (S2)', async () => {
    jest.useFakeTimers()
    const fake = fakeDocument()
    // Un navigateur qui ne joue jamais le rappel et ne dit jamais la fin : seul le filet reste.
    const never = new Promise<void>(() => {})
    const stalled = {
      ...fake.doc,
      startViewTransition: () => ({ updateCallbackDone: never, ready: never, finished: never }),
    }
    // `load` ne lit que `doc` : le reste du faux (ses appels enregistrés) ne sert pas ici.
    const engine = load({ ...fake, doc: stalled } as unknown as Fake)
    const next = jest.fn()

    engine.runPassage('deeper', failing)
    engine.runPassage('deeper', next)
    expect(fake.dataset.passage).toBe('deeper')

    expect(() => jest.advanceTimersByTime(2000)).toThrow('navigation failed')
    expect(fake.dataset.passage).toBeUndefined()
    expect(engine.passageBusy()).toBe(false)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
