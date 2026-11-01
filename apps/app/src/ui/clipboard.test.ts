// Tests de la copie dans le presse-papiers (tranche R5a) : « Copier » d'un prompt et « Copier le
// lien ». copyText dit si la copie a réussi (relecture de l'interface ui-7 : jamais un « Copié »
// mensonger), et l'appli ne lit jamais le presse-papiers (relecture juridique jur-11).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as Clipboard from 'expo-clipboard'
import { copyText } from './clipboard'

// expo-clipboard parle au presse-papiers de l'appareil, absent sous Jest : on le remplace par de
// fausses fonctions. Les lectures sont là pour vérifier qu'aucune n'est jamais appelée.
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
  getStringAsync: jest.fn(),
  hasStringAsync: jest.fn(),
  getUrlAsync: jest.fn(),
  hasUrlAsync: jest.fn(),
  getImageAsync: jest.fn(),
  hasImageAsync: jest.fn(),
}))

const write = jest.mocked(Clipboard.setStringAsync)
const readers = [
  Clipboard.getStringAsync,
  Clipboard.hasStringAsync,
  Clipboard.getUrlAsync,
  Clipboard.hasUrlAsync,
  Clipboard.getImageAsync,
  Clipboard.hasImageAsync,
].map((reader) => jest.mocked(reader))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('copyText', () => {
  it('writes the text as given and says it worked (iOS and Android answer nothing)', async () => {
    write.mockResolvedValue(undefined as never)

    await expect(copyText('Résume ce texte')).resolves.toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('Résume ce texte')
  })

  it('says it worked when the browser answers true', async () => {
    write.mockResolvedValue(true)

    await expect(copyText('x')).resolves.toBe(true)
  })

  it('says it failed when the browser refuses the copy', async () => {
    write.mockResolvedValue(false)

    await expect(copyText('x')).resolves.toBe(false)
  })

  it('says it failed, without throwing, when the copy raises an error', async () => {
    write.mockRejectedValue(new Error('NotAllowedError'))

    await expect(copyText('x')).resolves.toBe(false)
  })

  it('never reads the clipboard, whatever the copy gives', async () => {
    write.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    write.mockRejectedValueOnce(new Error('denied'))

    await copyText('a')
    await copyText('b')
    await copyText('c')

    expect(write).toHaveBeenCalledTimes(3) // témoin : les trois copies ont bien eu lieu
    for (const reader of readers) expect(reader).not.toHaveBeenCalled()
  })

  // jur-11, vérifié dans le code lui-même : aucune fonction de lecture d'expo-clipboard n'y est
  // nommée, même dans une branche que les tests ne parcourent pas. Les commentaires sont retirés
  // avant de chercher (ils peuvent citer ce qu'on n'appelle pas).
  it('names no reading function of expo-clipboard in its code', () => {
    const source = readFileSync(join(__dirname, 'clipboard.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(source).toMatch(/setStringAsync/) // témoin : le fichier lu est bien le bon
    expect(source).not.toMatch(/\b(get|has)(String|Url|Image)Async\b|addClipboardListener/)
  })
})
