// Tests de l'export des données du membre (accounts/api.ts) : le fichier porte le nom de l'appli,
// jamais le nom de code du dépôt. Puis (tranche « adresse ») la demande de changement d'adresse.
import { appName } from '@ruche/brand'
import { Platform, Share } from 'react-native'
import { changeEmail, downloadMyData } from './api'
import { authClient } from './auth-client'

// On remplace Better Auth et l'appel réseau par de faux modules : seul compte ici ce qui part et
// ce qui revient. Le client Better Auth offre deux chemins vers POST /api/auth/change-email :
// sa méthode `changeEmail`, ou `$fetch` si le type de la méthode refuse le mot de passe (plan de la
// tranche). Les deux faux répondent pareil : le test vérifie ce qui part, pas le chemin choisi.
jest.mock('./auth-client', () => ({ authClient: { changeEmail: jest.fn(), $fetch: jest.fn() } }))
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

// --- Tranche « adresse » : demander le changement d'adresse ---

// Les deux chemins possibles vers la route, vus comme de simples fausses fonctions.
const routes = () => [
  authClient.changeEmail as unknown as jest.Mock,
  authClient.$fetch as unknown as jest.Mock,
]
/** Ce que Better Auth répond, quel que soit le chemin pris : { data, error }, sans lever d'erreur. */
const serverAnswers = (answer: { data: unknown; error: unknown }) => {
  for (const route of routes()) route.mockReset().mockResolvedValue(answer)
}
/** Tous les appels faits à la route, par l'un ou l'autre chemin. */
const calls = () => routes().flatMap((route) => route.mock.calls)
const refused = (status: number, code?: string) =>
  serverAnswers({ data: null, error: { status, statusText: '', message: '', code } })

const request = { newEmail: 'lea.moreau@exemple.fr', password: 'mot-de-passe-de-lea' }

describe('changeEmail', () => {
  it('sends the new address and the password to the server, once', async () => {
    serverAnswers({ data: { status: true }, error: null })

    await expect(changeEmail(request)).resolves.toEqual({ ok: true })

    expect(calls()).toHaveLength(1)
    const sent = JSON.stringify(calls())
    expect(sent).toContain('"newEmail":"lea.moreau@exemple.fr"')
    expect(sent).toContain('"password":"mot-de-passe-de-lea"')
  })

  it('says the password is wrong', async () => {
    refused(400, 'INVALID_PASSWORD')

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'wrongPassword' })
  })

  it('says the new address is already the current one', async () => {
    refused(400, 'SAME_EMAIL')

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'sameEmail' })
  })

  it('says there were too many attempts', async () => {
    refused(429)

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'tooManyAttempts' })
  })

  it('falls back to the generic message for anything unexpected', async () => {
    refused(500, 'SOMETHING_ELSE')

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'generic' })
  })

  it('turns a server out of reach into the generic message, without throwing', async () => {
    // Sans réseau, l'appel peut échouer au lieu de répondre : l'écran ne doit pas rester « occupé ».
    for (const route of routes()) route.mockReset().mockRejectedValue(new TypeError('offline'))

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'generic' })
  })
})
