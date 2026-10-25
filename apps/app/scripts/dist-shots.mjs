// La construction de l'appli web pour les essais (apps/app/dist-shots/) : la fabriquer, savoir de
// quel commit elle vient (le tampon .commit), et la servir comme le ferait un hébergeur. Partagé par
// scripts/shots.mjs (les captures) et scripts/journey-local.mjs (le parcours sur ce PC).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const build = join(root, 'dist-shots')

// Arrête le script avec un message, sans la longue trace d'une exception.
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// Le tampon de la construction : le commit dont elle vient, suivi de « modifié » si la copie de
// travail avait des changements pas encore enregistrés. Avec --no-build, on le compare à l'état
// actuel, pour ne pas photographier sans le savoir un code ancien.
const git = (...gitArgs) => {
  const result = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}
export const currentStamp = () => {
  const head = git('rev-parse', 'HEAD')
  if (!head) return 'inconnu' // pas de Git (archive du code, par exemple)
  return git('status', '--porcelain') ? `${head} modifié` : head
}
export const stampFile = join(build, '.commit')

// Construit l'appli web, catalogue compris, puis écrit le tampon.
// On lance la commande d'Expo avec Node directement (process.execPath), au lieu de « pnpm exec
// expo » : sous Windows, pnpm est un script (pnpm.cmd) que spawnSync ne sait pas lancer sans
// passer par l'interpréteur de commandes, et il échouait sans un mot. createRequire permet de
// trouver un fichier d'un paquet installé (expo/bin/cli) comme le ferait un require().
// WAIGGLE_WORKERS, quand il est posé, limite le nombre de processus de Metro : sur un PC modeste, on
// garde ainsi la construction sous un plafond de mémoire ; sans lui (la CI), Metro choisit seul.
export const buildSite = () => {
  rmSync(build, { recursive: true, force: true })
  const expo = createRequire(join(root, 'package.json')).resolve('expo/bin/cli')
  const workers = Number(process.env.WAIGGLE_WORKERS)
  const result = spawnSync(
    process.execPath,
    [
      expo,
      'export',
      '--platform',
      'web',
      '--output-dir',
      build,
      ...(workers > 0 ? ['--max-workers', String(workers)] : []),
    ],
    { cwd: root, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_CATALOGUE: '1' } },
  )
  if (result.error) fail(`Impossible de lancer la construction (expo) : ${result.error.message}`)
  if (result.status !== 0) {
    fail(
      `La construction de l'appli web a échoué (code ${result.status ?? result.signal}) : voir les messages d'Expo ci-dessus.`,
    )
  }
  writeFileSync(stampFile, `${currentStamp()}\n`)
}

// Avec --no-build : la construction existe-t-elle, et vient-elle du code actuel ?
export const checkStamp = () => {
  if (!existsSync(join(build, 'index.html'))) {
    fail(`Aucune construction dans ${build} : lance la commande une fois sans --no-build.`)
  }
  const built = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : null
  const now = currentStamp()
  if (!built) {
    console.warn(
      'Attention : la construction n’a pas de tampon (dist-shots/.commit), on ne sait pas de quel code elle vient. Relance sans --no-build en cas de doute.',
    )
  } else if (built !== now) {
    console.warn(
      `Attention : la construction vient de ${built}, mais la copie de travail est à ${now}. Elle risque de montrer l'ancien code (captures, parcours) : relance sans --no-build.`,
    )
  } else if (now.endsWith('modifié')) {
    console.warn(
      'Note : la copie avait déjà des changements lors de la construction. Ceux faits depuis ne se voient pas dans le tampon : relance sans --no-build si tu as modifié l’appli.',
    )
  }
}

// La servir comme le ferait un hébergeur : /sign-in renvoie sign-in.html.
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}
// Trouve le fichier d'une adresse. Les pages à paramètre (/projects/123) sont construites une seule
// fois, sous le nom du paramètre (projects/[id].html) : un dossier ou fichier entre crochets
// correspond à n'importe quel segment.
const isFile = (path) => existsSync(path) && statSync(path).isFile()
const isDir = (path) => existsSync(path) && statSync(path).isDirectory()
const pageFor = (dir, segments) => {
  if (segments.length === 0) return isFile(join(dir, 'index.html')) ? join(dir, 'index.html') : null
  const [segment, ...rest] = segments
  // Le segment correspond à son nom exact, ou à n'importe quel nom entre crochets ([id]).
  const dynamic = readdirSync(dir)
    .filter((name) => name.startsWith('['))
    .map((name) => name.replace(/\.html$/, ''))
  for (const name of new Set([segment, ...dynamic])) {
    const path = join(dir, name)
    if (rest.length === 0 && isFile(`${path}.html`)) return `${path}.html`
    if (rest.length === 0 && isFile(path)) return path
    if (isDir(path)) {
      const found = pageFor(path, rest)
      if (found) return found
    }
  }
  return null
}
// Le fichier à servir pour une adresse, ou null si l'adresse est mal formée ou cherche à sortir
// du dossier construit (« ../ », barre oblique inverse sous Windows, nom de lecteur « C: »).
const fileFor = (url) => {
  let path
  try {
    path = decodeURIComponent(new URL(url, 'http://x').pathname)
  } catch {
    return null // encodage invalide (« %E0%A4%A »)
  }
  const segments = path.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.some((s) => s === '..' || s.includes('\\') || s.includes(':'))) return null
  const file = pageFor(build, segments) ?? join(build, '+not-found.html')
  // Dernière vérification : le chemin final est bien dans le dossier construit.
  return resolve(file).startsWith(resolve(build) + sep) ? file : null
}
/** Un serveur qui sert la construction (à démarrer avec listen). */
export const createSiteServer = () =>
  createServer((req, res) => {
    const file = fileFor(req.url ?? '/')
    if (!file) {
      res.writeHead(400)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
