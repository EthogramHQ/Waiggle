// Un onglet ouvert avant un déploiement se recharge sur la nouvelle appli, une seule fois par
// version, quand une réponse de l'API ne correspond plus à son contrat (api/newVersion.ts).
import { RELOADED_FOR_KEY, reloadIfNewVersion } from './newVersion'

/** Un faux sessionStorage, vide au départ. */
const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

/** Les dépendances d'un onglet web à la version `current`, face à une API à la version `online`. */
const tab = (current: string | null, online: unknown) => {
  const reload = jest.fn()
  const storage = memoryStorage()
  const fetchHealth = jest.fn(async () => ({ status: 'ok', version: online }))
  return { platform: 'web', current, fetchHealth, storage, reload }
}

describe('reloading a tab opened before a deployment', () => {
  it('reloads the page when the API in production is of another version', async () => {
    const deps = tab('c28041d', '987c0ee')

    expect(await reloadIfNewVersion(deps)).toBe(true)

    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(deps.storage.getItem(RELOADED_FOR_KEY)).toBe('987c0ee')
  })

  it('reloads only once for a given version, so a real defect of the API never loops', async () => {
    const deps = tab('c28041d', '987c0ee')
    await reloadIfNewVersion(deps)

    expect(await reloadIfNewVersion(deps)).toBe(false)

    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the app and the API are of the same version', async () => {
    const deps = tab('987c0ee', '987c0ee')

    expect(await reloadIfNewVersion(deps)).toBe(false)

    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('does nothing without a known version: development, local stack, phone app', async () => {
    for (const deps of [tab(null, '987c0ee'), tab('local', '987c0ee'), tab('987c0ee', 'local')]) {
      expect(await reloadIfNewVersion(deps)).toBe(false)
      expect(deps.reload).not.toHaveBeenCalled()
    }
    const phone = { ...tab('c28041d', '987c0ee'), platform: 'ios' }
    expect(await reloadIfNewVersion(phone)).toBe(false)
    expect(phone.fetchHealth).not.toHaveBeenCalled()
  })

  it('does nothing when the API cannot be reached', async () => {
    const deps = {
      ...tab('c28041d', '987c0ee'),
      fetchHealth: jest.fn(async () => Promise.reject(new Error('offline'))),
    }

    expect(await reloadIfNewVersion(deps)).toBe(false)

    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('asks the API only once when several answers are refused at the same time', async () => {
    const deps = tab('c28041d', '987c0ee')

    await Promise.all([
      reloadIfNewVersion(deps),
      reloadIfNewVersion(deps),
      reloadIfNewVersion(deps),
    ])

    expect(deps.fetchHealth).toHaveBeenCalledTimes(1)
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })
})
