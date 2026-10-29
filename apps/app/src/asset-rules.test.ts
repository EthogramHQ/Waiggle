/// <reference types="node" />
// Règles de sécurité des images et des fichiers fabriqués, vérifiées automatiquement (relecture de
// sécurité du plan de R1, 29/10/2026). Une image peut cacher bien des choses : des métadonnées (le
// lieu d'une photo, le logiciel qui l'a faite), du texte, ou, pour un SVG, du code qui s'exécute.
// - chaque PNG ne contient que les morceaux (« chunks ») qui dessinent l'image, et reste léger ;
// - chaque SVG est un dessin, sans script ni contenu venu d'ailleurs ;
// - un fichier fabriqué de src/ui (`*.generated.ts`) ne contient que des données, jamais du code ;
// - la lumière d'ambiance ne lit ni n'envoie rien ;
// - l'appli n'importe jamais les scripts de développement (scripts/), qui ne partent pas en ligne.
// Aujourd'hui, l'appli n'a encore aucune image : ces tests passent, et rougissent dès qu'une image
// fautive arrive.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

const root = join(__dirname, '..')

/** Tous les fichiers d'un dossier et de ses sous-dossiers (aucun si le dossier n'existe pas). */
const filesIn = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? filesIn(path) : [path]
      })
    : []

const imageDirs = ['assets', 'public', 'scripts'].map((dir) => join(root, dir))

// Un PNG commence par ces 8 octets, puis enchaîne des morceaux : 4 octets de longueur, 4 lettres
// de type, les données, 4 octets de contrôle. Seuls les types qui dessinent l'image sont admis ;
// `tEXt`, `zTXt`, `iTXt` (du texte), `eXIf` (les métadonnées d'un appareil photo), `tIME` ou
// `caBX` (une signature d'origine) sont refusés : `sharp` les retire en ré-encodant.
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const allowedChunks = new Set(['IHDR', 'PLTE', 'tRNS', 'sRGB', 'gAMA', 'pHYs', 'IDAT', 'IEND'])

/** Les types de morceaux d'un PNG, dans l'ordre, ou `null` si le fichier n'est pas un PNG. */
const pngChunks = (file: Buffer): string[] | null => {
  if (!file.subarray(0, 8).equals(pngSignature)) return null
  const chunks: string[] = []
  let offset = 8
  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset)
    chunks.push(file.toString('latin1', offset + 4, offset + 8))
    offset += 12 + length
  }
  return chunks
}

const maxPngBytes = (file: string) => (basename(file) === 'icon.png' ? 1024 * 1024 : 120 * 1024)

// Ce qui ferait d'un SVG autre chose qu'un dessin : un script, un attribut qui réagit à un
// événement (`onload=`), du HTML embarqué, une image ou un lien chargés depuis une autre adresse.
const svgDangers = [
  /<script/i,
  /\son[a-z]+\s*=/i,
  /<foreignObject/i,
  /<image/i,
  /href\s*=\s*["'](?!#)/i,
]

// Les commentaires d'un fichier fabriqué peuvent tout dire : on ne regarde que le reste.
const withoutLineComments = (code: string) => code.replace(/^\s*\/\/.*$/gm, '')

describe('asset rules', () => {
  it('keeps every PNG free of metadata and light', () => {
    const offenders = imageDirs
      .flatMap(filesIn)
      .filter((file) => file.toLowerCase().endsWith('.png'))
      .flatMap((file) => {
        const bytes = readFileSync(file)
        const chunks = pngChunks(bytes)
        const name = relative(root, file)
        if (!chunks) return [`${name}: not a PNG`]
        const extra = chunks.filter((chunk) => !allowedChunks.has(chunk))
        return [
          ...(extra.length ? [`${name}: chunks ${extra.join(', ')}`] : []),
          ...(bytes.length > maxPngBytes(file) ? [`${name}: ${bytes.length} bytes`] : []),
        ]
      })
    expect(offenders).toEqual([])
  })

  it('keeps every SVG a drawing, with no script nor outside content', () => {
    const offenders = [join(root, 'public'), join(root, 'scripts', 'logo')]
      .flatMap(filesIn)
      .filter((file) => file.toLowerCase().endsWith('.svg'))
      .flatMap((file) => {
        const svg = readFileSync(file, 'utf8')
        return svgDangers
          .filter((danger) => danger.test(svg))
          .map((danger) => `${relative(root, file)}: ${danger}`)
      })
    expect(offenders).toEqual([])
  })

  it('keeps generated files to plain data', () => {
    // Les icônes ont leur propre fabrique (scripts/icons.mts), plus ancienne : elles font exception.
    const generated = filesIn(join(root, 'src', 'ui')).filter(
      (file) => file.endsWith('.generated.ts') && basename(file) !== 'icons.generated.ts',
    )
    const offenders = generated.flatMap((file) => {
      const name = relative(root, file)
      const code = withoutLineComments(readFileSync(file, 'utf8')).trim()
      const forbidden = [/\bimport\b/, /\bfunction\b/, /=>/, /`/, /#[0-9a-f]{3,8}\b/i]
        .filter((pattern) => pattern.test(code))
        .map((pattern) => `${name}: ${pattern}`)
      // Chaque déclaration a la forme « export const nom = <JSON> as const ».
      const statements = code.split(/\n(?=export )/).filter((statement) => statement.trim())
      const notJson = statements.flatMap((statement) => {
        const match = /^export const \w+ = ([\s\S]*) as const;?$/.exec(statement.trim())
        if (!match?.[1]) return [`${name}: not "export const … = <JSON> as const"`]
        try {
          JSON.parse(match[1])
          return []
        } catch {
          return [`${name}: value is not JSON`]
        }
      })
      return [...forbidden, ...notJson]
    })
    expect(offenders).toEqual([])
  })

  it('lets the ambient light read and send nothing', () => {
    const offenders = filesIn(join(root, 'src', 'ui'))
      .filter((file) => /^AmbientLight.*\.tsx$/.test(basename(file)))
      .flatMap((file) => {
        const code = readFileSync(file, 'utf8')
        return [
          'fetch',
          'sendBeacon',
          'localStorage',
          'readPixels',
          'toDataURL',
          'UNMASKED_RENDERER',
        ]
          .filter((word) => code.includes(word))
          .map((word) => `${relative(root, file)}: ${word}`)
      })
    expect(offenders).toEqual([])
  })

  it('never imports the development scripts into the app', () => {
    const importOfScripts = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*\bscripts\//
    const offenders = [...filesIn(join(root, 'src')), ...filesIn(join(root, 'app'))]
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => importOfScripts.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file))
    expect(offenders).toEqual([])
  })
})
