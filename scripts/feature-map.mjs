// La carte des fonctionnalités, tirée du vrai code : pour chaque fonctionnalité, ses pages (et
// l'écran qui les dessine), les routes de l'API que ces écrans appellent, et les tables de la base
// que ces routes lisent ou écrivent. Elle sert à dessiner la carte interactive du projet.
//
// Usage : node scripts/feature-map.mjs [fichier.json]   (sans fichier : affiche le JSON)
// Un élément qu'aucune fonctionnalité ne revendique apparaît sous « Non classé » : c'est le signal
// qu'il faut compléter la liste `features` ci-dessous.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(path, 'utf8')
const project = (path) => relative(root, path).split(sep).join('/')
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

// --- Les fonctionnalités, et ce qui leur appartient ---------------------------------------------

// Chaque fonctionnalité dit quelles pages, routes et tables sont à elle (motifs sur leur nom), et
// d'où elle vient : sa tranche dans docs/scenarios/phase-1.md. null : rien de ce genre. (Les leçons de
// chaque fonctionnalité, écrites hors du dépôt, sont ajoutées par l'outil qui dessine la carte.)
const features = [
  {
    id: 'comptes',
    name: 'Comptes',
    tranche: 'Tranche 1 · Mise en ligne, R2 · Le compte',
    // R2 : mot de passe oublié, et les réglages du compte (/settings, ses rubriques, le mot de
    // passe, l'adresse, la suppression) ; « Mon profil » dans les réglages reste au profil.
    pages:
      /^\/(sign-up|sign-in|check-email|verified|forgot-password|reset-password|account\/delete|account\/email|email-change\/(confirmed|done|sign-in-first)|settings(\/\[section\]|\/account\/(delete|email)|\/security\/password)?)$/,
    routes: /^(ALL \/api\/auth)/,
    tables: /^(user|session|account|verification|rate_limit)$/,
  },
  // Avant « profil » : les réglages d'e-mail sont sous /v1/me/.
  {
    id: 'emails',
    name: 'E-mails de notification',
    tranche: 'Tranche 6c',
    pages: /^\/unsubscribe$/,
    routes: /^\w+ \/v1\/(email\/|me\/email-preferences$)/,
    tables: /^email_preference$/,
  },
  // Avant « profil » et « membres » : la liste des membres bloqués est sous /v1/me/, et bloquer
  // sous /v1/members/{id}/.
  {
    id: 'bloquer',
    name: 'Bloquer',
    tranche: 'Tranche 7b',
    pages: /^\/blocks$/,
    routes: /^\w+ \/v1\/(me\/blocks|members\/\{id\}\/block)$/,
    tables: /^member_block$/,
  },
  {
    id: 'profil',
    name: 'Profil et langue',
    tranche: 'Tranche 2',
    pages: /^\/(profile|account|settings\/profile)$/,
    routes: /^\w+ \/v1\/me(\/|$)/,
    tables: /^(profile|member_handle|api_rate_limit)$/,
  },
  // Avant « membres » : la recherche après « @ » est sous /v1/members/.
  {
    id: 'notifications',
    name: 'Notifications et mentions',
    tranche: 'Tranche 6b',
    pages: /^\/notifications$/,
    routes: /^\w+ \/v1\/(notifications(\/|$)|members\/mentionable$)/,
    tables: /^(notification_state|comment_mention)$/,
  },
  {
    id: 'moderation',
    name: 'Signaler et modérer',
    tranche: 'Tranches 7a et 7c',
    pages: /^\/(report|moderation|suspend)$/,
    routes: /^\w+ \/v1\/(reports|moderation)(\/|$)/,
    tables: /^(content_report|moderation_decision|admin_member|account_suspension)$/,
  },
  // Avant « projets » : ses routes sont sous /v1/projects/{id}/.
  {
    id: 'reagir',
    name: 'Réagir et commenter',
    tranche: 'Tranche 5',
    pages: null,
    routes: /^\w+ \/v1\/projects\/\{id\}\/(reactions|comments)(\/|$)/,
    tables: /^project_(reaction|comment)$/,
  },
  {
    id: 'projets',
    name: 'Projets',
    tranche: 'Tranche 3a',
    pages: /^\/projects\//,
    routes: /^\w+ \/v1\/projects(\/\{id\})?$/,
    tables: /^project$/,
  },
  {
    id: 'photos',
    name: 'Photos des projets',
    tranche: 'Tranche 3b-1',
    pages: null,
    routes: /^(\w+ \/v1\/projects\/\{id\}\/visuals|GET \/media)/,
    tables: /^project_media$/,
  },
  // Avant « membres » : la première fonctionnalité qui correspond l'emporte, et les routes de suivi
  // (/v1/members/{id}/follow) appartiennent à celle-ci.
  {
    id: 'suivre',
    name: 'Suivre, le fil et les notes',
    tranche: 'Tranches 4a et 4b',
    pages: null,
    routes: /^\w+ \/v1\/(feed\/|(members|projects)\/\{id\}\/(follow$|notes))/,
    tables: /^((member|project)_follow|project_note)$/,
  },
  {
    id: 'membres',
    name: 'Membres et étiquettes',
    tranche: 'Tranche 3b-2',
    pages: /^\/(members|tags)\//,
    routes: /^\w+ \/v1\/(members|tags)\//,
    tables: null,
  },
  {
    id: 'accueil',
    name: 'Accueil et liens sortants',
    tranche: 'Tranches 1 à 3',
    pages: /^\/(|out)$/,
    routes: null,
    tables: null,
  },
  {
    id: 'design',
    name: 'Design Miel',
    tranche: 'Design Miel',
    pages: /^\/catalogue$/,
    routes: null,
    tables: null,
  },
  {
    id: 'socle',
    name: 'Socle et mise en ligne',
    tranche: 'Phase 0 · Mise en ligne',
    pages: null,
    routes: /^GET \/health$/,
    tables: null,
  },
]

// --- Les tables (packages/db/src/schema) --------------------------------------------------------

const tableOfExport = new Map() // nom dans le code (projectMedia) → nom de la table (project_media)
for (const file of walk(join(root, 'packages/db/src/schema'))) {
  for (const [, name, table] of read(file).matchAll(/export const (\w+) = pgTable\(\s*'(\w+)'/g)) {
    tableOfExport.set(name, table)
  }
}

// --- Les routes de l'API, et les tables qu'elles touchent ----------------------------------------

// Les tables lues ou écrites par un fichier, et par les fichiers de l'API qu'il importe.
const apiDir = join(root, 'apps/api/src')
const tablesUsedBy = (file, seen = new Set()) => {
  if (seen.has(file) || !existsSync(file)) return new Set()
  seen.add(file)
  const code = read(file)
  const tables = new Set(
    [...code.matchAll(/schema\.(\w+)/g)].map(([, name]) => tableOfExport.get(name)).filter(Boolean),
  )
  for (const [, spec] of code.matchAll(/from '(\.[^']+)'/g)) {
    const target = resolve(dirname(file), spec)
    for (const candidate of [`${target}.ts`, join(target, 'index.ts')]) {
      if (candidate.startsWith(apiDir)) for (const t of tablesUsedBy(candidate, seen)) tables.add(t)
    }
  }
  return tables
}

const routes = []
for (const file of walk(join(apiDir, 'routes')).filter((f) => !f.endsWith('.test.ts'))) {
  const code = read(file)
  const tables = [...tablesUsedBy(file)].sort()
  for (const [, method, path] of code.matchAll(/method: '(\w+)',\s*path: '([^']+)'/g)) {
    routes.push({ id: `${method.toUpperCase()} ${path}`, file: project(file), tables })
  }
  if (code.includes("app.get('/media/")) {
    routes.push({ id: 'GET /media/{dossier}/{fichier}', file: project(file), tables })
  }
}
// Les routes des comptes sont celles de Better Auth (inscription, connexion, vérification…).
routes.push({
  id: 'ALL /api/auth/*',
  file: 'apps/api/src/auth/auth.ts',
  tables: [...tablesUsedBy(join(apiDir, 'auth/auth.ts'))].sort(),
})
routes.push({ id: 'GET /health', file: 'apps/api/src/app.ts', tables: [] })

// --- Les pages de l'appli, leur écran, et les routes qu'elles appellent --------------------------

const appDir = join(root, 'apps/app')
// Le morceau d'un fichier qui définit ces fonctions exportées (de « export … nom » au suivant), plus
// les autres fonctions du même fichier qu'elles appellent (useMember appelle getMember).
const exportsNamed = (code, names) => {
  const blocks = code.split(/\n(?=export )/)
  const nameOf = (block) => block.match(/^export (?:const|function|async function) (\w+)/)?.[1]
  const wanted = new Set(names)
  for (let grew = true; grew; ) {
    grew = false
    for (const block of blocks.filter((b) => wanted.has(nameOf(b)))) {
      for (const other of blocks.map(nameOf)) {
        if (other && !wanted.has(other) && new RegExp(`\\b${other}\\b`).test(block)) {
          wanted.add(other)
          grew = true
        }
      }
    }
  }
  return blocks.filter((block) => wanted.has(nameOf(block))).join('\n')
}

// Les adresses de l'API appelées par un fichier de l'appli. On suit les fonctions qu'il importe
// vraiment (un écran qui n'importe que useSession n'appelle pas l'export des données), en sautant les
// composants (qui ne parlent pas à l'API) et la barre de navigation (commune à toutes les pages).
const callsOf = (file, names = null, seen = new Set()) => {
  const key = `${file}|${names?.join(',') ?? '*'}`
  if (seen.has(key) || !existsSync(file)) return new Set()
  seen.add(key)
  const code = read(file)
  const body = names ? exportsNamed(code, names) : code
  const calls = new Set()
  // `/v1/members/${encodeURIComponent(id)}` → /v1/members/x : la partie variable devient « x ».
  for (const [, path] of body.matchAll(/[`'](\/v1\/(?:[^`'$]|\$\{[^}]*\})*)/g)) {
    calls.add(path.replace(/\$\{[^}]*\}/g, 'x').replace(/\/$/, ''))
  }
  for (const [, rest] of body.matchAll(/projectPath\([^)]*\)(?:\}([^`]*)`)?/g)) {
    calls.add(`/v1/projects/x${rest ?? ''}`)
  }
  if (/authClient\./.test(body)) calls.add('/api/auth')
  if (/useMediaSources\(/.test(body) && !/export const useMediaSources/.test(body))
    calls.add('/media')
  for (const [, imported, spec] of code.matchAll(/import \{([^}]*)\} from '(\.[^']+)'/g)) {
    const target = resolve(dirname(file), spec)
    if (['ui', 'testing', 'navigation'].some((d) => target.includes(`${sep}${d}${sep}`))) continue
    const wanted = imported
      .split(',')
      .map(
        (part) =>
          part
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0],
      )
      .filter((name) => name && new RegExp(`\\b${name}\\b`).test(body.replace(/^import .*$/gm, '')))
    if (wanted.length === 0) continue
    for (const candidate of [`${target}.ts`, `${target}.tsx`, join(target, 'index.ts')]) {
      for (const call of callsOf(candidate, wanted, seen)) calls.add(call)
    }
  }
  return calls
}
// « /v1/projects/{id}/visuals » appelé par l'appli → les routes de l'API qui y répondent.
const routesFor = (call) =>
  routes
    .filter(({ id }) => {
      const path = id.split(' ')[1]
      if (call === '/api/auth') return path.startsWith('/api/auth')
      if (call === '/media') return path.startsWith('/media')
      const pattern = new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`)
      return pattern.test(call.replace(/\$\{[^}]+\}/g, 'x').replace(/\{[^}]+\}/g, 'x'))
    })
    .map(({ id }) => id)

const pages = walk(join(appDir, 'app'))
  .filter((f) => /\.tsx$/.test(f) && !/[\\/](_layout|\+html|\+not-found)\.tsx$/.test(f))
  .map((file) => {
    const path =
      `/${project(file)
        .replace(/^apps\/app\/app\//, '')
        .replace(/\.tsx$/, '')
        .replace(/(^|\/)index$/, '')}`.replace(/\/$/, '') || '/'
    const code = read(file)
    const screenSpec = code.match(/from '([^']*screens\/(\w+))'/)
    const screenFile = screenSpec ? resolve(dirname(file), `${screenSpec[1]}.tsx`) : file
    const calls = [...callsOf(screenFile)].sort()
    return {
      path,
      screen: screenSpec?.[2] ?? null,
      calls: [...new Set(calls.flatMap(routesFor))].sort(),
    }
  })
  .sort((a, b) => a.path.localeCompare(b.path))

// --- Le rangement par fonctionnalité --------------------------------------------------------------

const tables = [...new Set(tableOfExport.values())].sort()
const owner = (kind, value) => features.find((f) => f[kind]?.test(value))?.id ?? 'non-classe'
const map = {
  generatedAt: new Date().toISOString().slice(0, 10),
  features: [
    ...features.map(({ id, name, tranche }) => ({ id, name, tranche })),
    { id: 'non-classe', name: 'Non classé', tranche: '' },
  ],
  pages: pages.map((p) => ({ ...p, feature: owner('pages', p.path) })),
  routes: routes
    .map((r) => ({ ...r, feature: owner('routes', r.id) }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  tables: tables.map((t) => ({ id: t, feature: owner('tables', t) })),
}

const json = `${JSON.stringify(map, null, 2)}\n`
const out = process.argv[2]
if (out) {
  writeFileSync(out, json)
  const loose = [...map.pages, ...map.routes, ...map.tables].filter(
    (x) => x.feature === 'non-classe',
  )
  console.log(
    `Carte écrite : ${out} (${pages.length} pages, ${routes.length} routes, ${tables.length} tables)`,
  )
  if (loose.length > 0) console.log(`Non classé : ${loose.map((x) => x.path ?? x.id).join(', ')}`)
} else {
  process.stdout.write(json)
}
