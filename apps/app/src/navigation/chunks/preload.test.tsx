// Tests du morceau de l'éditeur demandé d'avance (tranche R13, relecture de l'interface du
// 17/11/2026 : « Publier » ne doit pas sembler ne rien faire pendant que son morceau arrive).
//
// Le chargement du morceau est remplacé par `load`, qui dit s'il a été demandé : sous Jest, un vrai
// `import()` échoue (il lui faudrait les modules ES de Node).
import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useEditorPreload } from './preload'

const load = jest.fn(async () => ({}))

// L'hydratation de la page web est faite (le vrai module la croit faite d'emblée sous Jest, chargé
// comme un téléphone ; on le dit ici pour le web aussi).
jest.mock('../../ui/theme/hydration', () => ({
  ...jest.requireActual('../../ui/theme/hydration'),
  useHydrated: () => true,
}))

// L'attente du repos du navigateur, tenue par le test : `idle()` la fait aboutir.
let pendingIdle: (() => void) | null = null
const requestIdleCallback = jest.fn()
const page = globalThis as Record<string, unknown>
beforeEach(() => {
  pendingIdle = null
  load.mockClear()
  // Redonnée avant chaque cas : `jest.restoreAllMocks()` efface la façon de faire d'un `jest.fn`.
  requestIdleCallback.mockReset()
  requestIdleCallback.mockImplementation((callback: () => void) => {
    pendingIdle = callback
    return 1
  })
  page.requestIdleCallback = requestIdleCallback
  page.cancelIdleCallback = jest.fn()
})
afterEach(() => {
  // Rend aussi la plateforme d'origine (`jest.replaceProperty`).
  jest.restoreAllMocks()
  delete page.requestIdleCallback
  delete page.cancelIdleCallback
})

/** Le navigateur se repose : l'attente aboutit, puis les promesses de l'`import()` se tiennent. */
const idle = async () => {
  await act(async () => {
    pendingIdle?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('the project editor chunk on the web', () => {
  it('is not requested for a visitor', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderHook(() => useEditorPreload(false, load))
    await idle()
    expect(requestIdleCallback).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it('is not requested on a phone, where the app already holds every screen', async () => {
    await renderHook(() => useEditorPreload(true, load))
    await idle()
    expect(requestIdleCallback).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it('is requested once the page is idle for a signed-in member', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderHook(() => useEditorPreload(true, load))
    // Pas pendant le démarrage : il attend que la page se repose.
    expect(requestIdleCallback).toHaveBeenCalledTimes(1)
    expect(load).not.toHaveBeenCalled()
    await idle()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
