// Tests du relais des passages de page (R17, `navigation/passageRelay.ts`) : sur le web, chaque
// navigation d'Expo Router passe par `routingQueue.add` (l'« entonnoir » de `router.push`,
// `replace`, `back`…) ; le relais remplace cette fonction, devine la sorte du passage
// (`classifyPassage`) et joue la navigation dans le passage (`runPassage`, ui/pageTransition.web.ts).
//
// Relecture de sécurité du plan, S1 : les actions viennent du vrai `router`, jamais d'une fausse
// `{ type: 'PUSH' }`. La vraie fonction `routingQueue.add` est remplacée par un espion AVANT que le
// relais la lise : le relais l'appelle ensuite comme l'original, et le test voit ce qui est vraiment
// parti vers la navigation.
//
// Jest charge les fichiers comme sur iOS : `../ui/pageTransition` y serait la version du téléphone,
// qui ne fait rien. Le test lui substitue la version du web, sur un faux `document` (voir
// ui/pageTransition.web.test.ts), et une fausse fenêtre pour le Retour du navigateur (`popstate`).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { router as realRouter } from 'expo-router/build/global-state/router'
import { routingQueue as realQueue } from 'expo-router/build/global-state/routingQueue'

jest.mock('../ui/pageTransition', () => jest.requireActual('../ui/pageTransition.web'))

type Engine = typeof import('../ui/pageTransition.web')
type Queue = typeof realQueue
type Router = typeof realRouter

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** Un faux `document` : `<html>` et, si `api`, un `startViewTransition` que le test termine. */
const fakeDocument = (api: boolean) => {
  const dataset: Record<string, string | undefined> = {}
  const key = (name: string) => name.replace(/^data-/, '')
  const finishes: (() => void)[] = []
  const startViewTransition = jest.fn((arg: (() => unknown) | { update: () => unknown }) => {
    const update = typeof arg === 'function' ? arg : arg.update
    let finish: () => void = () => {}
    const end = new Promise<void>((resolve) => {
      finish = resolve
    })
    finishes.push(finish)
    const done = Promise.resolve().then(() => update())
    return {
      updateCallbackDone: done.then(() => {}),
      ready: done.then(() => {}),
      finished: done.then(() => end),
      skipTransition: finish,
    }
  })
  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  const doc = {
    documentElement: {
      dataset,
      setAttribute: (name: string, value: string) => {
        dataset[key(name)] = String(value)
      },
      removeAttribute: (name: string) => {
        delete dataset[key(name)]
      },
      getAttribute: (name: string) => dataset[key(name)] ?? null,
      hasAttribute: (name: string) => dataset[key(name)] !== undefined,
      style: {},
    },
    querySelector: () => null,
    matchMedia,
    defaultView: { matchMedia, innerHeight: 844, innerWidth: 390 },
    ...(api ? { startViewTransition } : {}),
  }
  return { doc, dataset, startViewTransition, finish: () => finishes.shift()?.() }
}

// La fausse fenêtre : l'adresse de la page affichée et les écouteurs de `popstate`.
type PopListener = (event: { stopImmediatePropagation: () => void }) => void
let popListeners: PopListener[] = []
const fakeLocation = { pathname: '/feed' }
const fakeWindow = {
  location: fakeLocation,
  addEventListener: (type: string, listener: PopListener) => {
    if (type === 'popstate') popListeners.push(listener)
  },
  removeEventListener: (type: string, listener: PopListener) => {
    if (type === 'popstate') popListeners = popListeners.filter((other) => other !== listener)
  },
}
/** Le bouton ou le geste « retour » du navigateur. */
const browserBack = () => {
  for (const listener of [...popListeners]) listener({ stopImmediatePropagation: () => {} })
}

const originals = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
}

beforeEach(() => {
  popListeners = []
  fakeLocation.pathname = '/feed'
  for (const [name, value] of [
    ['window', fakeWindow],
    ['location', fakeLocation],
  ] as const) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
})

afterEach(() => {
  for (const name of ['window', 'location'] as const) {
    const original = originals[name]
    if (original) Object.defineProperty(globalThis, name, original)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  jest.restoreAllMocks()
})

/**
 * Charge l'appli comme `index.ts` (le relais du Retour, puis celui des passages), sur cette
 * plateforme, avec un espion à la place de la vraie `routingQueue.add`. La page est hydratée et la
 * première page de la visite posée : un passage peut se jouer.
 */
const load = ({ platform = 'web', api = true }: { platform?: string; api?: boolean } = {}) => {
  const fake = fakeDocument(api)
  let loaded: { queue: Queue; router: Router; engine: Engine; add: jest.SpyInstance } | undefined
  jest.isolateModules(() => {
    jest.replaceProperty(require('react-native').Platform, 'OS', platform)
    const queue: Queue = require('expo-router/build/global-state/routingQueue').routingQueue
    const add = jest.spyOn(queue, 'add').mockImplementation(() => {})
    const router: Router = require('expo-router/build/global-state/router').router
    const hydration = require('../ui/theme/hydration')
    const engine: Engine = require('../ui/pageTransition')
    require('./backRelay')
    require('./passageRelay')
    if (platform === 'web') {
      engine.setPassageDocument(fake.doc as unknown as Parameters<Engine['setPassageDocument']>[0])
      hydration.markHydrated()
      engine.passageArrived()
    }
    loaded = { queue, router, engine, add }
  })
  if (!loaded) throw new Error('not loaded')
  return { ...loaded, fake }
}

/** La sorte (`event`) et l'adresse de chaque action partie vers la navigation. */
const sent = (add: jest.SpyInstance) =>
  add.mock.calls.map(([action]) => {
    const { type, payload } = action as {
      type: string
      payload?: { href?: string; options?: { event?: string } }
    }
    return type === 'ROUTER_LINK' ? `${payload?.options?.event} ${payload?.href}` : type
  })

describe('the funnel of Expo Router (guard: breaks if an upgrade moves it)', () => {
  it('sends push, replace, navigate, prefetch and dismissTo through routingQueue.add as ROUTER_LINK', () => {
    const add = jest.spyOn(realQueue, 'add').mockImplementation(() => {})

    realRouter.push('/projects/p1')
    realRouter.replace('/feed')
    realRouter.navigate('/members/m1')
    realRouter.prefetch('/projects/p2')
    realRouter.dismissTo('/explore')
    realRouter.dismiss()
    realRouter.dismissAll()

    expect(sent(add)).toEqual([
      'PUSH /projects/p1',
      'REPLACE /feed',
      'NAVIGATE /members/m1',
      'PRELOAD /projects/p2',
      'POP_TO /explore',
      'POP',
      'POP_TO_TOP',
    ])
    // Le relais remplace la fonction : elle doit rester une propriété qu'on peut réécrire.
    expect(Object.getOwnPropertyDescriptor(realQueue, 'add')?.writable).toBe(true)
  })
})

describe('the app entry point', () => {
  it('loads the passage relay after the back relay and before Expo Router', () => {
    const entry = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8')
    // Les positions dans le fichier : un `import` en tête, ou (R18) le `require` d'Expo Router,
    // lancé après la langue de la page (index.ts) ; dans les deux cas, plus loin dans le fichier
    // veut dire exécuté plus tard.
    const at = (pattern: RegExp) => entry.search(pattern)
    const back = at(/^import\s+['"]\.\/src\/navigation\/backRelay['"]/m)
    const passages = at(/^import\s+['"]\.\/src\/navigation\/passageRelay['"]/m)
    const router = at(/(?:^import\s+|require\()['"]expo-router\/entry['"]/m)
    expect(back).toBeGreaterThanOrEqual(0)
    expect(passages).toBeGreaterThan(back)
    expect(router).toBeGreaterThan(passages)
  })
})

describe('passageRelay on the web', () => {
  it('plays router.push inside a deeper passage, and sends the action once', async () => {
    const { router, add, fake, engine } = load()

    router.push('/projects/p1')

    expect(fake.startViewTransition).toHaveBeenCalledTimes(1)
    expect(fake.dataset.passage).toBe('deeper')
    await flush()
    engine.passageArrived()
    await flush()
    fake.finish()
    await flush()
    expect(sent(add)).toEqual(['PUSH /projects/p1'])
    expect(fake.startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('plays a tab change as a sibling passage', () => {
    const { router, fake } = load()

    router.push('/explore')

    expect(fake.dataset.passage).toBe('sibling')
  })

  it('ignores a second push to the same address during a passage, but applies a replace to it (S1)', async () => {
    const { router, add, fake, engine } = load()

    router.push('/projects/p1')
    await flush()
    router.push('/projects/p1')
    router.replace('/projects/p1')
    engine.passageArrived()
    await flush()
    fake.finish()
    await flush()

    expect(sent(add)).toEqual(['PUSH /projects/p1', 'REPLACE /projects/p1'])
    expect(fake.startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('adds no animation to the browser Back, and shows the page before at once', () => {
    const { router, fake, engine } = load({ api: false })
    router.push('/projects/p1')
    expect(engine.arrivalStyle()).toBe('fade-up') // témoin
    engine.passageArrived()
    fakeLocation.pathname = '/projects/p1'

    browserBack()

    expect(engine.arrivalStyle()).toBe('none')
    expect(fake.startViewTransition).not.toHaveBeenCalled()
  })

  it('starts no view transition on the browser Back', () => {
    const { fake, engine } = load()
    fakeLocation.pathname = '/projects/p1'

    browserBack()

    expect(fake.startViewTransition).not.toHaveBeenCalled()
    expect(engine.arrivalStyle()).toBe('none')
  })

  it('does not take the popstate of its own GO_BACK for the browser Back', async () => {
    const { queue, add, fake, engine } = load()
    fakeLocation.pathname = '/projects/p1'

    // Ce que dépose `router.back()` : le Retour de la page, qui fait `history.go(-1)` sur le web.
    queue.add({ type: 'GO_BACK' })
    await flush()
    expect(sent(add)).toEqual(['GO_BACK'])
    browserBack()

    expect(fake.dataset.passage).toBe('back')
    expect(engine.arrivalStyle()).toBe('vt')
    engine.passageArrived()
    await flush()
    fake.finish()
    await flush()

    // Le popstate attendu est consommé : le suivant vient bien du navigateur.
    browserBack()
    expect(engine.arrivalStyle()).toBe('none')
    expect(fake.startViewTransition).toHaveBeenCalledTimes(1)
  })
})

describe('passageRelay on iOS and Android', () => {
  it('leaves routingQueue.add untouched', () => {
    const { queue, add, router } = load({ platform: 'ios' })

    expect(queue.add).toBe(add)
    router.push('/projects/p1')
    expect(sent(add)).toEqual(['PUSH /projects/p1'])
  })
})
