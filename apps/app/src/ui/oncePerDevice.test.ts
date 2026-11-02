// Tests de la mémoire « une fois par appareil » (R5a, l'aide de l'éventail des réactions) : ce qu'on
// a déjà montré une fois sur cet appareil, rangé dans son stockage (localStorage sur le web), comme
// la suspension vue (suspensionMemory.ts). Les règles viennent de la relecture du plan :
// - sec-B8 et jur-10 : on range une constante, jamais un identifiant ni une date, et on compare la
//   valeur lue à cette constante (une autre valeur ne compte pas) ; le module ne parle ni à l'API
//   ni au réseau : ce réglage reste sur l'appareil ;
// - ui-9 : un stockage piégé ou qui lève ne casse rien, et l'aide s'affiche (« pas encore vue »).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { hasSeen, noteSeen, ONCE_SEEN } from './oncePerDevice'

// AsyncStorage est remplacé par sa version de test (jest.setup.ts), un stockage en mémoire : on le
// vide avant chaque test, et on retire les pannes simulées après.
beforeEach(() => AsyncStorage.clear())
afterEach(() => jest.restoreAllMocks())

describe('oncePerDevice', () => {
  it('has seen nothing on a new device', async () => {
    expect(await hasSeen('reaction-fan-help')).toBe(false)
  })

  it('remembers what was shown once', async () => {
    await noteSeen('reaction-fan-help')

    expect(await hasSeen('reaction-fan-help')).toBe(true)
  })

  // sec-B8 : la valeur rangée est la constante exportée, et rien d'autre (ni date, ni identifiant
  // du membre ou de l'appareil, ni compteur).
  it('stores the same constant, whatever the moment, without any date or number', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem')
    // Le stockage simulé fait déjà de `setItem` une `jest.fn` : `spyOn` la rend telle quelle, avec
    // les appels des tests précédents du fichier. On les efface pour ne compter que les nôtres.
    setItem.mockClear()
    // Deux moments éloignés : une valeur qui contiendrait l'heure changerait de l'un à l'autre.
    jest.useFakeTimers({ now: new Date('2026-11-02T08:00:00Z'), doNotFake: ['nextTick'] })
    try {
      await noteSeen('reaction-fan-help')
      jest.setSystemTime(new Date('2027-03-15T21:30:00Z'))
      await noteSeen('reaction-fan-help')
    } finally {
      jest.useRealTimers()
    }

    expect(setItem).toHaveBeenCalledTimes(2)
    const values = setItem.mock.calls.map((call) => call[1])
    expect(values).toEqual([ONCE_SEEN, ONCE_SEEN])
    expect(ONCE_SEEN).not.toMatch(/\d/)
  })

  // Une valeur rangée par autre chose (une ancienne version, une extension du navigateur, une
  // main malveillante) ne vaut pas « vue » : seule la constante compte.
  it.each([
    ['true'],
    ['1'],
    ['yes'],
    ['{"seen":true}'],
    [`${ONCE_SEEN} `],
    [`${ONCE_SEEN}x`],
    [''],
  ])('treats a trapped value %p as not seen', async (value) => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(value)

    expect(await hasSeen('reaction-fan-help')).toBe(false)
  })

  // Témoin du test précédent : la vraie constante, lue telle quelle, vaut bien « vue ».
  it('treats the exact constant as seen (témoin)', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(ONCE_SEEN)

    expect(await hasSeen('reaction-fan-help')).toBe(true)
  })

  // ui-9 : navigation privée, stockage plein ou refusé : l'aide s'affiche plutôt que rien ne marche.
  // Même si elle a déjà été notée pendant la visite : le plan dit « aide affichée », sans mémoire de
  // secours.
  it('says « not seen » when the storage throws, even after noting it', async () => {
    await noteSeen('reaction-fan-help')
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('storage unavailable'))

    await expect(hasSeen('reaction-fan-help')).resolves.toBe(false)
  })

  it('does not fail when the storage refuses to write', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('quota exceeded'))

    await expect(noteSeen('reaction-fan-help')).resolves.toBeUndefined()
  })
})

// sec-B8, jur-10 : un test qui lit le code lui-même. Ce réglage d'interface ne quitte jamais
// l'appareil : le module n'importe que le stockage, n'appelle pas le réseau, et ne fabrique ni date
// ni identifiant à ranger.
describe('oncePerDevice, read as code', () => {
  // Le code sans ses commentaires : un mot cité dans une explication ne compte pas (code.md, R4).
  const code = () =>
    readFileSync(join(__dirname, 'oncePerDevice.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('imports nothing but the device storage', () => {
    const imported = [...code().matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    )

    // Témoin : le module lit bien le stockage.
    expect(imported).toContain('@react-native-async-storage/async-storage')
    for (const name of imported) {
      expect(name).toBe('@react-native-async-storage/async-storage')
    }
  })

  it('never calls the network, nor makes a date or an identifier', () => {
    const source = code()

    expect(source).not.toMatch(/\bfetch\b/)
    expect(source).not.toMatch(/XMLHttpRequest|WebSocket|sendBeacon/)
    expect(source).not.toMatch(/\brequire\s*\(/)
    expect(source).not.toMatch(/\bDate\b|\bnow\s*\(|performance\./)
    expect(source).not.toMatch(/random|uuid|randomUUID|crypto/i)
  })
})
