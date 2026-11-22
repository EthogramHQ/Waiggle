// Tests de la compression à l'avance des fichiers de l'appli web (tranche R18, « Les finitions » ;
// infra/web/precompress.mjs), lancés par `node --test infra/web/*.test.mjs`.
//
// Le script tourne dans l'image « web », après la construction (infra/web/Dockerfile) : à côté de
// chaque script, style, police… de `_expo/static/` et `assets/`, il écrit une copie compressée en
// brotli (`.br`) et en zstd (`.zst`). Caddy sert alors directement la copie que le navigateur accepte
// (`file_server { precompressed br zstd }`), compressée une fois pour toutes au niveau le plus fort,
// au lieu de compresser vite à chaque visite. Le HTML, lui, n'est jamais compressé à l'avance :
// Caddy réécrit les pages publiques à chaque visite (`templates`, infra/Caddyfile), et une copie
// compressée sauterait cette réécriture.
//
// Chaque test construit une fausse appli (un dossier temporaire qui imite `apps/app/dist`), lance
// le script dessus comme le fait le Dockerfile, puis regarde ce qu'il a écrit.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync, zstdDecompressSync } from 'node:zlib'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'precompress.mjs')

// Un texte qui se compresse bien, comme du JavaScript ou du CSS construit (plusieurs Ko).
const code = (name) =>
  Array.from({ length: 400 }, (_, i) => `export const ${name}${i} = () => "${name}-${i}";`).join(
    '\n',
  )

// La fausse construction : les chemins relatifs et leur contenu.
const SCRIPTS = {
  '_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js': code('entry'),
  '_expo/static/js/web/SettingsScreen-fedcba9876543210fedcba9876543210.js': code('settings'),
}
const STYLES = {
  '_expo/static/css/web-0123456789abcdef0123456789abcdef.css': Array.from(
    { length: 300 },
    (_, i) => `.r-${i}{display:flex;padding:${i}px}`,
  ).join(''),
}
// Les autres sortes de fichiers à compresser (choix 1 du plan R18) : police, icône, données, wasm.
const OTHERS = {
  'assets/node_modules/@expo-google-fonts/funnel-sans/FunnelSans_400Regular.ttf': Buffer.from(
    'ttf-'.repeat(2000),
  ),
  'assets/src/assets/logo.svg': `<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0h10v10z"/>'.repeat(200)}</svg>`,
  'assets/src/assets/data.json': JSON.stringify(
    Array.from({ length: 300 }, (_, i) => ({ i, k: 'v' })),
  ),
  'assets/node_modules/some-lib/module.wasm': Buffer.from('wasm'.repeat(2000)),
}
// Des images déjà compressées par leur format : une copie compressée ne gagnerait rien.
const IMAGES = {
  'assets/src/assets/photo.png': Buffer.from('png'.repeat(2000)),
  'assets/src/assets/photo.jpg': Buffer.from('jpg'.repeat(2000)),
  'assets/src/assets/photo.webp': Buffer.from('webp'.repeat(2000)),
}
// Hors de `_expo/static/` et `assets/` : les pages, robots.txt, l'icône du site.
const OUTSIDE = {
  'index.html': `<!doctype html><html><body>${'<p>Accueil</p>'.repeat(300)}</body></html>`,
  'catalogue.html': `<!doctype html><html><body>${'<p>Catalogue</p>'.repeat(300)}</body></html>`,
  'robots.txt': `User-agent: *\n${'Disallow: /x\n'.repeat(300)}`,
  'favicon.ico': Buffer.from('ico'.repeat(2000)),
  'fr/index.html': `<!doctype html><html lang="fr"><body>${'[[waiggle '.repeat(300)}</body></html>`,
  'fr/rules.html': `<!doctype html><html lang="fr"><body>${'<p>Règles</p>'.repeat(300)}</body></html>`,
  'fr/projects/[id].html': `<!doctype html><html lang="fr"><body>${'<p>Projet</p>'.repeat(300)}</body></html>`,
  'en/index.html': `<!doctype html><html lang="en"><body>${'<p>Home</p>'.repeat(300)}</body></html>`,
  'en/app.js': code('en'),
}

const dirs = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

/** Écrit la fausse construction dans un dossier temporaire et rend son chemin. */
const fakeBuild = () => {
  const dist = mkdtempSync(join(tmpdir(), 'waiggle-precompress-'))
  dirs.push(dist)
  for (const [path, content] of Object.entries({
    ...SCRIPTS,
    ...STYLES,
    ...OTHERS,
    ...IMAGES,
    ...OUTSIDE,
  })) {
    mkdirSync(dirname(join(dist, path)), { recursive: true })
    writeFileSync(join(dist, path), content)
  }
  return dist
}

/** Lance le script comme le Dockerfile : `node infra/web/precompress.mjs <dossier construit>`. */
const precompress = (dist) => {
  const run = spawnSync(process.execPath, [SCRIPT, dist], { encoding: 'utf8' })
  assert.equal(run.status, 0, `precompress.mjs a échoué :\n${run.stderr}${run.stdout}`)
}

/** Tous les fichiers du dossier, chemins relatifs écrits avec des « / ». */
const filesIn = (dir, root = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesIn(path, root)
    return [relative(root, path).split(sep).join('/')]
  })

/** Ce que le navigateur recevrait, décompressé : il doit être exactement le fichier d'origine. */
const assertCopies = (dist, path) => {
  const original = readFileSync(join(dist, path))
  const br = readFileSync(join(dist, `${path}.br`))
  const zst = readFileSync(join(dist, `${path}.zst`))
  assert.deepEqual(brotliDecompressSync(br), original, `${path}.br, décompressé`)
  assert.deepEqual(zstdDecompressSync(zst), original, `${path}.zst, décompressé`)
  assert.ok(br.length < original.length, `${path}.br plus léger que l'original`)
  assert.ok(zst.length < original.length, `${path}.zst plus léger que l'original`)
}

describe('precompress', () => {
  it('writes a .br and a .zst next to each script and style, equal to the original once decompressed', () => {
    const dist = fakeBuild()
    precompress(dist)
    for (const path of Object.keys({ ...SCRIPTS, ...STYLES })) assertCopies(dist, path)
  })

  it('compresses the fonts, icons, data and wasm files of assets as well', () => {
    const dist = fakeBuild()
    precompress(dist)
    for (const path of Object.keys(OTHERS)) assertCopies(dist, path)
  })

  it('writes no compressed copy of an image already compressed by its format (png, jpg, webp)', () => {
    const dist = fakeBuild()
    precompress(dist)
    const files = filesIn(dist)
    // Témoin : le script a bien tourné et compressé le reste de `assets/`.
    assert.ok(files.includes('assets/src/assets/logo.svg.br'))
    for (const path of Object.keys(IMAGES)) {
      assert.ok(!files.includes(`${path}.br`), `${path}.br ne doit pas exister`)
      assert.ok(!files.includes(`${path}.zst`), `${path}.zst ne doit pas exister`)
      assert.deepEqual(readFileSync(join(dist, path)), Buffer.from(IMAGES[path]))
    }
  })

  it('leaves every file outside _expo/static and assets untouched (html, robots.txt, fr/, en/)', () => {
    const dist = fakeBuild()
    const outside = (files) =>
      files
        .filter((path) => !path.startsWith('_expo/static/') && !path.startsWith('assets/'))
        .sort()
    const before = new Map(
      outside(filesIn(dist)).map((path) => [path, statSync(join(dist, path)).mtimeMs]),
    )
    precompress(dist)
    // Aucun fichier ajouté ni retiré hors des deux dossiers : ni `index.html.br`, ni `fr/index.html.zst`.
    assert.deepEqual(outside(filesIn(dist)), [...before.keys()])
    for (const [path, mtime] of before) {
      assert.deepEqual(readFileSync(join(dist, path)), Buffer.from(OUTSIDE[path]), path)
      assert.equal(statSync(join(dist, path)).mtimeMs, mtime, `${path} réécrit`)
    }
    // Témoin : le même passage a compressé l'intérieur de `_expo/static/`.
    assert.ok(filesIn(dist).includes(`${Object.keys(SCRIPTS)[0]}.br`))
  })

  it('does not compress its own copies again when it runs a second time', () => {
    const dist = fakeBuild()
    precompress(dist)
    const once = filesIn(dist).sort()
    precompress(dist)
    assert.deepEqual(filesIn(dist).sort(), once)
    assert.ok(!once.some((path) => /\.(br|zst)\.(br|zst)$/.test(path)))
  })
})
