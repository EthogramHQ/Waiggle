// Compresse à l'avance les fichiers de l'appli web : à côté de chaque script, style, police,
// icône ou donnée de `_expo/static/` et `assets/`, il écrit une copie `.br` (brotli, qualité 11) et
// une copie `.zst` (zstd, niveau 19). Caddy sert ensuite la copie que le navigateur accepte
// (`file_server { precompressed br zstd }`, infra/Caddyfile), compressée une fois pour toutes au
// niveau le plus fort, au lieu de compresser vite à chaque visite.
//
// Usage (infra/web/Dockerfile, après la construction) : node infra/web/precompress.mjs <dist>
//
// Ce qu'il ne touche jamais : le HTML (Caddy réécrit les pages publiques à chaque visite, une copie
// compressée sauterait cette réécriture), robots.txt, `fr/`, `en/`, et les images (png, jpg, webp :
// déjà compressées par leur format). Un second passage n'ajoute rien : les copies `.br` et `.zst`
// ne font pas partie des extensions compressées, et une copie est réécrite à l'identique.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brotliCompressSync, constants, zstdCompressSync } from 'node:zlib'

// Les seules sortes de fichiers compressées (choix 1 du plan R18).
const EXTENSIONS = new Set(['.js', '.css', '.json', '.svg', '.ttf', '.wasm'])
// Les seuls dossiers parcourus, sous la racine de la construction.
const FOLDERS = ['_expo/static', 'assets']

const dist = process.argv[2]
if (!dist) {
  console.error('Usage : node infra/web/precompress.mjs <dossier construit>')
  process.exit(2)
}

/** Tous les fichiers d'un dossier, sous-dossiers compris (rien si le dossier n'existe pas). */
const filesIn = (dir) => {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  })
}

let count = 0
let before = 0
let after = 0
for (const folder of FOLDERS) {
  for (const path of filesIn(join(dist, folder))) {
    if (!EXTENSIONS.has(extname(path).toLowerCase())) continue
    const original = readFileSync(path)
    const br = brotliCompressSync(original, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: original.length,
      },
    })
    const zst = zstdCompressSync(original, {
      params: { [constants.ZSTD_c_compressionLevel]: 19 },
    })
    writeFileSync(`${path}.br`, br)
    writeFileSync(`${path}.zst`, zst)
    count += 1
    before += original.length
    after += br.length
  }
}
console.log(
  `precompress : ${count} fichiers, ${(before / 1024).toFixed(0)} Ko bruts, ${(after / 1024).toFixed(0)} Ko en brotli`,
)
