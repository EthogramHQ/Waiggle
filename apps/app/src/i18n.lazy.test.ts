// Tests de l'anglais à la demande, côté appli (R18, « Le premier chargement plus léger » ; plan,
// choix 5) : sur le web, le script de départ n'a que le français ; l'anglais arrive par
// `ensureLanguage(i18n, 'en')` de `@ruche/i18n`. L'appli n'affiche jamais l'anglais avant qu'il soit
// arrivé, et un échec garde le français.
//
// Avant l'hydratation (l'entrée de l'appli, `index.ts`), une page /en/, ou une langue de navigateur
// anglaise sur une page sans langue, attend l'anglais : le premier rendu du client est alors celui
// du HTML pré-rendu, sans écart. Si le morceau anglais manque (une mise en ligne entre-temps) : un
// seul rechargement par adresse, avec la mémoire de `reloadOnce` (`lazyScreen`) ; s'il manque encore
// après, la page s'hydrate en français (relecture de sécurité du plan, S3 : jamais de boucle).
//
// Ce que ces tests supposent de `src/i18n.ts` (à confirmer par la session, l'API de cette fonction
// n'est pas au découpage) :
// - `keepAddressLanguage(appI18n, language)` passe par `ensureLanguage` avant `changeLanguage` ;
// - `preparePageLanguage(): Promise<Language>`, appelée par l'entrée avant l'hydratation : lit
//   l'adresse (`location.pathname`) et la langue du navigateur, attend l'anglais s'il le faut, et
//   rend la langue dans laquelle la page s'hydrate. Elle ne se termine pas quand elle recharge.
//
// Sous Jest, `@ruche/i18n` est l'index (les deux langues tout de suite) : on remplace son seul
// `ensureLanguage` pour tenir l'anglais en attente, ou le faire échouer.
import type { Language } from '@ruche/i18n'
import type { i18n as I18n } from 'i18next'

const mockEnsure = jest.fn<Promise<void>, [I18n, Language]>()
jest.mock('@ruche/i18n', () => ({
  ...jest.requireActual('@ruche/i18n'),
  ensureLanguage: (...args: [I18n, Language]) => mockEnsure(...args),
}))
// La langue du navigateur, changée par chaque test.
let mockLocales: { languageTag: string }[] = [{ languageTag: 'fr-FR' }]
jest.mock('expo-localization', () => ({ getLocales: () => mockLocales }))

type I18nModule = typeof import('./i18n')

/**
 * Charge `src/i18n.ts` comme une page neuve du navigateur : des modules neufs (aucun état gardé
 * d'une page à l'autre, comme après un rechargement), sur le web. Seul `sessionStorage` (posé sur
 * `globalThis` par le test) survit au rechargement, comme dans un vrai onglet.
 */
const loadPage = (): I18nModule => {
  let loaded: I18nModule | undefined
  jest.isolateModules(() => {
    const { Platform } = require('react-native') as typeof import('react-native')
    jest.replaceProperty(Platform, 'OS', 'web')
    loaded = require('./i18n') as I18nModule
  })
  if (!loaded) throw new Error('src/i18n.ts not loaded')
  return loaded
}

/** Une promesse qu'on tient ou qu'on rompt à la main : l'anglais « en route ». */
const deferred = () => {
  let resolve = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  // Un rejet que personne n'attend encore (le code d'avant R18 n'appelle pas ensureLanguage) ne
  // doit pas faire échouer le test pour une autre raison que la sienne.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

/** Laisse passer les promesses en cours (plusieurs tours, par prudence). */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 0))
}

/** Suit une promesse sans l'attendre : `settled` dit si elle s'est terminée. */
const watch = <T>(promise: Promise<T>) => {
  const state: { settled: boolean; value?: T } = { settled: false }
  void promise.then((value) => {
    state.settled = true
    state.value = value
  })
  return state
}

// Le navigateur : l'adresse (avec son rechargement) et la mémoire de l'onglet.
const reload = jest.fn()
const storage = new Map<string, string>()
const browser = (pathname: string) => {
  Object.assign(globalThis, {
    location: { pathname, reload },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  })
}

beforeEach(() => {
  mockEnsure.mockReset().mockResolvedValue(undefined)
  mockLocales = [{ languageTag: 'fr-FR' }]
  reload.mockClear()
  storage.clear()
})

afterEach(() => {
  jest.restoreAllMocks()
  const globals = globalThis as { location?: unknown; sessionStorage?: unknown }
  delete globals.location
  delete globals.sessionStorage
})

describe('switching the app to English', () => {
  it('waits for ensureLanguage before showing English', async () => {
    const { createI18n, keepAddressLanguage } = loadPage()
    const appI18n = createI18n('fr')
    const english = deferred()
    mockEnsure.mockReturnValue(english.promise)

    keepAddressLanguage(appI18n, 'en')
    await flush()

    // L'instance de l'appli elle-même, et l'anglais (comparés sans tout imprimer en cas d'échec).
    expect(
      mockEnsure.mock.calls.map(([instance, language]) => [instance === appI18n, language]),
    ).toEqual([[true, 'en']])
    expect(appI18n.language).toBe('fr')

    english.resolve()
    await flush()

    expect(appI18n.language).toBe('en')
  })

  it('keeps French when English fails to load', async () => {
    const { createI18n, keepAddressLanguage } = loadPage()
    const appI18n = createI18n('fr')
    mockEnsure.mockRejectedValue(new Error('chunk missing'))

    keepAddressLanguage(appI18n, 'en')
    await flush()

    // L'instance de l'appli elle-même, et l'anglais (comparés sans tout imprimer en cas d'échec).
    expect(
      mockEnsure.mock.calls.map(([instance, language]) => [instance === appI18n, language]),
    ).toEqual([[true, 'en']])
    expect(appI18n.language).toBe('fr')
  })
})

describe('the page language before hydration', () => {
  it('waits for English before hydrating an /en/ page', async () => {
    browser('/en/')
    const english = deferred()
    mockEnsure.mockReturnValue(english.promise)

    const page = watch(loadPage().preparePageLanguage())
    await flush()

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(page.settled).toBe(false)

    english.resolve()
    await flush()

    expect(page).toEqual({ settled: true, value: 'en' })
  })

  it('waits for English on a page without language when the browser speaks English', async () => {
    browser('/')
    mockLocales = [{ languageTag: 'en-US' }]

    const page = watch(loadPage().preparePageLanguage())
    await flush()

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(page).toEqual({ settled: true, value: 'en' })
  })

  it('loads nothing more on a French page, even with an English browser', async () => {
    browser('/fr/')
    mockLocales = [{ languageTag: 'en-US' }]

    const page = watch(loadPage().preparePageLanguage())
    await flush()

    expect(mockEnsure).not.toHaveBeenCalled()
    expect(page).toEqual({ settled: true, value: 'fr' })
  })

  it('reloads at most once when the English chunk is missing before hydration', async () => {
    browser('/en/')
    mockEnsure.mockRejectedValue(new Error('chunk missing'))

    // La première page : le morceau manque, elle se recharge (une nouvelle version est en ligne).
    void loadPage().preparePageLanguage()
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)

    // La page rechargée : le morceau manque encore, elle ne se recharge plus.
    void loadPage().preparePageLanguage()
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('hydrates the page when the English chunk still fails after the reload', async () => {
    browser('/en/')
    mockEnsure.mockRejectedValue(new Error('chunk missing'))
    void loadPage().preparePageLanguage()
    await flush()

    const reloaded = watch(loadPage().preparePageLanguage())
    await flush()

    // La page s'hydrate, en français : mieux qu'une page blanche ou qu'un rechargement sans fin.
    expect(reloaded).toEqual({ settled: true, value: 'fr' })
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
