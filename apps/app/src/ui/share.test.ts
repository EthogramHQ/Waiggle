// Tests du partage d'une page (tranche R5a, F-Pr1, F-Mb1) : l'adresse partagée, et le menu de
// partage de l'appareil. Le lien ne contient que l'adresse de la page : rien sur le membre qui
// partage (scénario), et le menu de l'appareil ne reçoit que cette adresse, ni titre ni nom
// (relecture juridique jur-4). L'identifiant est validé avant de fabriquer l'adresse (sec-B6).
import { Platform, Share } from 'react-native'
import { webAppUrl } from '../config'
import { canShareNatively, shareLink, shareUrl } from './share'

const PROJECT = '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f'

// Le navigateur de Node a déjà un `navigator`, sans `share` : chaque test web pose le sien, puis on
// remet celui d'origine.
const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const setNavigator = (value: unknown) =>
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })

afterEach(() => {
  jest.restoreAllMocks()
  if (original) Object.defineProperty(globalThis, 'navigator', original)
  else Reflect.deleteProperty(globalThis, 'navigator')
})

describe('shareUrl', () => {
  it('gives the address of a project on the web app, and nothing else', () => {
    const url = shareUrl({ kind: 'project', id: PROJECT })

    expect(url).toBe(new URL(`/projects/${PROJECT}`, webAppUrl).href)
    // Aucun paramètre, aucune ancre : rien ne dit qui a partagé.
    expect(url).not.toMatch(/[?#]/)
  })

  it('gives the address of a member page', () => {
    expect(shareUrl({ kind: 'member', id: 'lea' })).toBe(new URL('/members/lea', webAppUrl).href)
  })

  it.each([
    ['a path that climbs up', '../admin'],
    ['something that is not a project id', 'decollage'],
    ['a project id followed by a parameter', `${PROJECT}?from=lea`],
    ['an empty id', ''],
  ])('refuses %s as a project', (_, id) => {
    expect(shareUrl({ kind: 'project', id })).toBeNull()
    expect(shareUrl({ kind: 'project', id: PROJECT })).not.toBeNull() // témoin
  })

  it.each([
    ['a path', 'lea/../settings'],
    ['a parameter', 'lea?ref=max'],
    ['an absolute address', 'https://evil.example'],
    ['an empty id', ''],
  ])('refuses %s as a member', (_, id) => {
    expect(shareUrl({ kind: 'member', id })).toBeNull()
    expect(shareUrl({ kind: 'member', id: 'lea' })).not.toBeNull() // témoin
  })
})

describe('canShareNatively', () => {
  it('is true on a phone, which always has its share menu', () => {
    expect(Platform.OS).not.toBe('web') // témoin : Jest se fait passer pour iOS
    expect(canShareNatively()).toBe(true)
  })

  it('is true in a browser that offers navigator.share', () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setNavigator({ share: jest.fn() })

    expect(canShareNatively()).toBe(true)
  })

  it('is false in a browser without navigator.share', () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setNavigator({ userAgent: 'Firefox' })

    expect(canShareNatively()).toBe(false)
    // Le témoin : le même navigateur, une fois navigator.share présent.
    setNavigator({ userAgent: 'Firefox', share: jest.fn() })
    expect(canShareNatively()).toBe(true)
  })
})

describe('shareLink', () => {
  const url = new URL(`/projects/${PROJECT}`, webAppUrl).href

  it('gives the phone share menu the address only, as message and as link', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })

    await shareLink(url)

    // Exactement ces arguments : ni titre, ni nom, ni titre de la fenêtre de choix (jur-4).
    expect(share.mock.calls).toEqual([[{ message: url, url }]])
  })

  it('gives the browser share menu the address only', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const share = jest.fn().mockResolvedValue(undefined)
    setNavigator({ share })

    await shareLink(url)

    expect(share.mock.calls).toEqual([[{ url }]])
  })

  // sec-B6 : fermer le menu (AbortError) ou un navigateur qui refuse (NotAllowedError) n'est pas
  // une erreur à montrer ni à écrire dans un journal.
  it.each(['AbortError', 'NotAllowedError'])(
    'swallows %s from the browser, without throwing or logging',
    async (name) => {
      jest.replaceProperty(Platform, 'OS', 'web')
      const share = jest.fn().mockRejectedValue(new DOMException('stopped', name))
      setNavigator({ share })
      const logs = (['error', 'warn', 'log', 'info'] as const).map((level) =>
        jest.spyOn(console, level).mockImplementation(() => {}),
      )

      await expect(shareLink(url)).resolves.toBeUndefined()

      expect(share).toHaveBeenCalledWith({ url }) // témoin : le menu a bien été ouvert
      for (const log of logs) expect(log).not.toHaveBeenCalled()
    },
  )
})
