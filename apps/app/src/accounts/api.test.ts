// Tests de l'export des données du membre (accounts/api.ts) : le fichier porte le nom de l'appli,
// jamais le nom de code du dépôt.
import { appName } from '@ruche/brand'
import { Platform, Share } from 'react-native'
import { downloadMyData } from './api'

// On remplace Better Auth et l'appel réseau par de faux modules : seul compte ici le fichier remis.
jest.mock('./auth-client', () => ({ authClient: {} }))
jest.mock('../api/client', () => ({
  apiFetch: jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200, text: async () => '{"name":"Léa"}' }),
}))

describe('downloadMyData', () => {
  it('names the exported file after the app, never with the code name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })

    await expect(downloadMyData()).resolves.toEqual({ ok: true })

    expect(share).toHaveBeenCalledWith({
      message: '{"name":"Léa"}',
      title: `${appName.toLowerCase()}-export.json`,
    })
    expect(JSON.stringify(share.mock.calls)).not.toContain('ruche')
  })
})

describe('downloadMyData on the web', () => {
  it('downloads a file named after the app', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    const click = jest.fn()
    const link = { href: '', download: '', click }
    // Les tests tournent hors d'un navigateur : on fournit juste ce que la fonction utilise.
    Object.defineProperty(globalThis, 'document', {
      value: { createElement: () => link },
      configurable: true,
    })
    URL.createObjectURL = jest.fn(() => 'blob:export')
    URL.revokeObjectURL = jest.fn()

    await expect(downloadMyData()).resolves.toEqual({ ok: true })

    expect(link.download).toBe(`${appName.toLowerCase()}-export.json`)
    expect(click).toHaveBeenCalled()
    platform.restore()
    Reflect.deleteProperty(globalThis, 'document')
  })
})
