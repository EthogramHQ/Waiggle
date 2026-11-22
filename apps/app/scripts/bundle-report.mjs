// Le poids du premier chargement de l'appli web (tranche R13, « Le premier chargement ») : pour
// quelques pages pré-rendues d'une construction de production (`pnpm --filter @ruche/app build`,
// qui écrit apps/app/dist), ce que le navigateur télécharge avant de pouvoir montrer la page.
//
// Par page : le HTML, le script d'entrée et les morceaux qu'elle demande d'emblée (balises
// `<script src>`, `<link rel="preload" as="script">` et `modulepreload`), les feuilles de style et
// les polices préchargées (`<link rel="preload" as="font">`). Pour chaque fichier : son poids brut,
// et compressé comme le ferait le serveur, en gzip et en brotli (les réglages par défaut de Node :
// un ordre de grandeur, pas l'octet près du serveur). Puis les morceaux chargés à la demande (les
// écrans rares, `navigation/lazyScreen.tsx`), absents du départ.
//
// R18 : `--max-start [Ko]` en fait une garde (la CI la lance après la construction). Elle additionne
// le poids en brotli (qualité 11, ce que sert le serveur depuis la compression à l'avance,
// infra/web/precompress.mjs) des seuls scripts de départ de `/fr/`, et rend le code 1 au-delà de la
// limite, ou si `/fr/` manque. Sans nombre, la limite est MAX_START_KB, ci-dessous.
//
// Usage : node apps/app/scripts/bundle-report.mjs <dossier construit> [--json] [--max-start [Ko]]
// La sortie ne nomme que des chemins relatifs à la construction : elle se colle telle quelle dans un
// bilan ou une pull request.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

// La limite de la garde, en Ko de brotli : écrite une seule fois, ici. À relever (ou à baisser)
// à la main quand le départ change volontairement.
const MAX_START_KB = 650

const args = process.argv.slice(2)
const json = args.includes('--json')
// `--max-start` seul prend MAX_START_KB ; suivi d'un nombre, ce nombre (qui n'est alors pas le dossier).
const maxStartAt = args.indexOf('--max-start')
let maxStart = null
let maxStartValue = -1
if (maxStartAt !== -1) {
  const next = args[maxStartAt + 1]
  if (next !== undefined && /^\d+(\.\d+)?$/.test(next)) {
    maxStart = Number(next)
    maxStartValue = maxStartAt + 1
  } else {
    maxStart = MAX_START_KB
  }
}
const dist = args.find((arg, i) => !arg.startsWith('--') && i !== maxStartValue)
if (!dist) {
  console.error(
    'Usage : node apps/app/scripts/bundle-report.mjs <dossier construit> [--json] [--max-start [Ko]]',
  )
  process.exit(2)
}

// Les pages mesurées : l'accueil d'un visiteur, une page de texte, et la page d'un projet public
// (une seule page pré-rendue sert tous les projets : le serveur la réécrit, infra/Caddyfile).
const PAGES = [
  { name: '/fr/', file: 'fr/index.html' },
  { name: '/fr/rules', file: 'fr/rules.html' },
  { name: '/fr/projects/<id>', file: 'fr/projects/[id].html' },
]

/** Les poids d'un fichier : brut, gzip et brotli (qualité 11, comme le serveur), en octets. */
const sizes = (buffer) => ({
  raw: buffer.length,
  gzip: gzipSync(buffer).length,
  brotli: brotliCompressSync(buffer, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length,
})

// Une adresse de la page (« /_expo/static/js/web/index-1a2b.js?v=3 ») devient le fichier construit
// (« _expo/static/js/web/index-1a2b.js ») ; une adresse d'un autre site est ignorée.
const toFile = (href) => {
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith('//')) return null
  const path = decodeURIComponent(href.split(/[?#]/)[0] ?? '').replace(/^\/+/, '')
  return path === '' ? null : path
}

/** La valeur d'un attribut dans une balise (`src`, `href`, `rel`, `as`), sans guillemets. */
const attribute = (tag, name) =>
  tag
    .match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    ?.slice(1)
    .find(Boolean)

/** Ce que la page demande d'emblée, rangé par sorte (script, style, police). */
const resourcesOf = (html) => {
  const found = []
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attribute(tag, 'src')
    if (src) found.push({ kind: 'script', href: src })
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    const as = (attribute(tag, 'as') ?? '').toLowerCase()
    const href = attribute(tag, 'href')
    if (!href) continue
    if (rel.includes('modulepreload') || (rel.includes('preload') && as === 'script')) {
      found.push({ kind: 'script', href })
    } else if (rel.includes('preload') && as === 'font') {
      found.push({ kind: 'font', href })
    } else if (rel.includes('stylesheet') || (rel.includes('preload') && as === 'style')) {
      found.push({ kind: 'style', href })
    }
  }
  // Un même fichier demandé deux fois (préchargé, puis appelé) ne se télécharge qu'une fois.
  const seen = new Set()
  return found.flatMap(({ kind, href }) => {
    const file = toFile(href)
    if (!file || seen.has(file)) return []
    seen.add(file)
    return [{ kind, file }]
  })
}

/** Tous les fichiers JavaScript de la construction, sous-dossiers compris. */
const scriptsIn = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return scriptsIn(path)
    return entry.name.endsWith('.js') ? [relative(dist, path).split(sep).join('/')] : []
  })

const add = (a, b) => ({
  raw: a.raw + b.raw,
  gzip: a.gzip + b.gzip,
  brotli: a.brotli + b.brotli,
})
const zero = { raw: 0, gzip: 0, brotli: 0 }

const pages = PAGES.map(({ name, file }) => {
  const path = join(dist, file)
  if (!existsSync(path)) return { name, file, missing: true }
  const html = readFileSync(path)
  const files = [
    { kind: 'html', file, ...sizes(html) },
    ...resourcesOf(html.toString('utf8')).map(({ kind, file: resource }) => {
      const resourcePath = join(dist, resource)
      return existsSync(resourcePath)
        ? { kind, file: resource, ...sizes(readFileSync(resourcePath)) }
        : { kind, file: resource, missing: true, ...zero }
    }),
  ]
  const total = files.reduce(add, zero)
  return { name, file, files, total }
})

// Les morceaux que nulle page mesurée ne demande d'emblée : chargés plus tard, à la demande.
const atStart = new Set(pages.flatMap((page) => (page.files ?? []).map((f) => f.file)))
const onDemand = scriptsIn(dist)
  .filter((file) => !atStart.has(file))
  .map((file) => ({ file, ...sizes(readFileSync(join(dist, file))) }))
  .sort((a, b) => b.raw - a.raw)
const onDemandTotal = onDemand.reduce(add, zero)

// --- La garde : les scripts de départ de /fr/ pèsent-ils plus que la limite ? ----------------------
if (maxStart !== null) {
  const home = pages.find((page) => page.name === '/fr/')
  if (!home || home.missing) {
    console.error('bundle-report : la page /fr/ manque, son poids de départ ne se mesure pas.')
    process.exit(1)
  }
  const scripts = home.files.filter((f) => f.kind === 'script')
  const startKb = scripts.reduce((sum, f) => sum + f.brotli, 0) / 1024
  const line = `scripts de départ de /fr/ : ${startKb.toFixed(1)} Ko en brotli (limite ${maxStart} Ko)`
  if (startKb > maxStart) {
    console.error(
      `bundle-report : ${line}. Trop lourd : un écran ou une bibliothèque est entré au départ.`,
    )
    process.exit(1)
  }
  console.log(line)
}

if (json) {
  console.log(
    JSON.stringify({ pages, onDemand: { files: onDemand, total: onDemandTotal } }, null, 2),
  )
  process.exit(0)
}

// --- Sortie lisible ---------------------------------------------------------------------------

const kio = (bytes) => `${(bytes / 1024).toFixed(1)} Ko`
const KINDS = { html: 'page', script: 'script', style: 'style', font: 'police' }
// Un nom court : le nom du fichier, sans le dossier ni l'empreinte de la construction.
const short = (file) =>
  (file.split('/').pop() ?? file).replace(/[-.]([0-9a-f]{16,})(?=\.[a-z0-9]+$)/i, '')
const row = (cells, widths) =>
  cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ')
const WIDTHS = [44, 11, 11, 11]

for (const page of pages) {
  console.log(`\n${page.name}  (${page.file})`)
  if (page.missing) {
    console.log('  page absente de la construction')
    continue
  }
  console.log(`  ${row(['fichier', 'brut', 'gzip', 'brotli'], WIDTHS)}`)
  for (const f of page.files) {
    const label = `${KINDS[f.kind]} ${short(f.file)}${f.missing ? ' (introuvable)' : ''}`
    console.log(`  ${row([label, kio(f.raw), kio(f.gzip), kio(f.brotli)], WIDTHS)}`)
  }
  const { total } = page
  console.log(`  ${row(['total', kio(total.raw), kio(total.gzip), kio(total.brotli)], WIDTHS)}`)
  const fonts = page.files.filter((f) => f.kind === 'font')
  console.log(
    `  polices préchargées : ${fonts.length}${fonts.length ? ` (${fonts.map((f) => short(f.file)).join(', ')})` : ''}`,
  )
}

console.log(`\nMorceaux chargés à la demande, absents du départ : ${onDemand.length}`)
if (onDemand.length > 0) {
  console.log(`  ${row(['fichier', 'brut', 'gzip', 'brotli'], WIDTHS)}`)
  for (const f of onDemand) {
    console.log(`  ${row([short(f.file), kio(f.raw), kio(f.gzip), kio(f.brotli)], WIDTHS)}`)
  }
  console.log(
    `  ${row(['total', kio(onDemandTotal.raw), kio(onDemandTotal.gzip), kio(onDemandTotal.brotli)], WIDTHS)}`,
  )
}
