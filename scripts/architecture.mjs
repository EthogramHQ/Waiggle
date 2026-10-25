// L'architecture du projet, vérifiée et dessinée à partir du vrai code.
//
// esbuild (déjà utilisé pour empaqueter l'API) lit chaque fichier TypeScript et dit exactement quels
// fichiers il importe. Ce script range ensuite chaque fichier dans une « couche » (l'API, les écrans,
// les composants…), puis :
// - vérifie les frontières entre couches (par exemple : l'appli n'importe jamais la base de données,
//   qui contient des secrets ; un composant d'interface ne parle jamais à l'API) ;
// - écrit le schéma des couches dans docs/architecture/dependances.md, que GitHub affiche comme un
//   dessin (format Mermaid).
//
// Usage : pnpm arch          → vérifie, puis réécrit le schéma
//         pnpm arch --check  → vérifie, et échoue si le schéma n'est plus à jour (pnpm check, la CI)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const docFile = join(root, 'docs', 'architecture', 'dependances.md')
const checkOnly = process.argv.includes('--check')

// --- 1. Les fichiers du projet -------------------------------------------------------------------

const ignoredDirs = new Set(['node_modules', 'dist', 'dist-shots', '.expo', 'shots', 'coverage'])
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return ignoredDirs.has(name) ? [] : sourceFiles(path)
    return /\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
const roots = [
  'apps/api/src',
  'apps/app/app',
  'apps/app/src',
  'packages/brand/src',
  'packages/contracts/src',
  'packages/db/src',
  'packages/i18n/src',
]
const entryPoints = roots.flatMap((dir) => sourceFiles(join(root, dir)))

// --- 2. Les imports de chaque fichier, lus par esbuild -------------------------------------------

// Les bibliothèques extérieures (react, hono…) ne nous intéressent pas : on les laisse de côté.
// Les paquets du projet (@ruche/…) sont suivis jusqu'à leurs fichiers.
const outsideLibraries = {
  name: 'outside-libraries',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) =>
      // Un point d'entrée, ou un chemin complet de Windows (« C:\… »), est un fichier du projet.
      args.kind === 'entry-point' || isAbsolute(args.path) || args.path.startsWith('@ruche/')
        ? undefined
        : { path: args.path, external: true },
    )
  },
}
// Un import qui ne mène nulle part (paquet non déclaré, fichier absent) arrête tout, avec son message.
const result = await build({
  absWorkingDir: root,
  entryPoints,
  bundle: true,
  write: false,
  metafile: true,
  outdir: 'unused',
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  jsx: 'automatic',
  // Les variantes web d'abord, comme dans l'appli construite pour le navigateur.
  resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.mjs', '.js', '.json'],
  // Images et polices : seul leur chemin importe ici.
  loader: { '.png': 'empty', '.jpg': 'empty', '.ttf': 'empty', '.otf': 'empty', '.svg': 'empty' },
  plugins: [outsideLibraries],
}).catch((error) => {
  const messages = error.errors?.map((e) => `${e.location?.file ?? '?'} : ${e.text}`) ?? [
    error.message,
  ]
  console.error(`Architecture : import impossible à suivre\n- ${messages.join('\n- ')}`)
  process.exit(1)
})

const toProjectPath = (path) => relative(root, join(root, path)).split(sep).join('/')
const edges = []
for (const [from, input] of Object.entries(result.metafile.inputs)) {
  for (const imported of input.imports) {
    if (imported.external) continue
    edges.push([toProjectPath(from), toProjectPath(imported.path)])
  }
}

// --- 3. Les couches ------------------------------------------------------------------------------

// Dans l'ordre : la première règle qui correspond donne la couche d'un fichier.
const layers = [
  ['app/pages', /^apps\/app\/app\//],
  ['app/écrans', /^apps\/app\/src\/screens\//],
  ['app/composants', /^apps\/app\/src\/ui\//],
  ['app/catalogue', /^apps\/app\/src\/catalogue\//],
  ['app/navigation', /^apps\/app\/src\/navigation\//],
  ['app/tests', /^apps\/app\/src\/testing\//],
  // Les dossiers de domaine (projects, feed, follows, comments, blocks…) : les appels à l'API d'un
  // domaine et ce qui lui est propre. Tout dossier de src/ qui n'est pas une couche plus haut en est
  // un : un dossier ajouté par une tranche y entre seul, au lieu de tomber dans « réglages ».
  ['app/domaines', /^apps\/app\/src\/[^/]+\//],
  // Les fichiers posés à la racine de src/ : la configuration, la langue, quelques aides partagées.
  ['app/réglages', /^apps\/app\/src\//],
  ['api/routes', /^apps\/api\/src\/routes\//],
  ['api/comptes', /^apps\/api\/src\/auth\//],
  ['api/projets', /^apps\/api\/src\/projects\//],
  ['api/médias', /^apps\/api\/src\/media\//],
  ['api/e-mails', /^apps\/api\/src\/email\//],
  ['api/tests', /^apps\/api\/src\/testing\//],
  ['api/socle', /^apps\/api\/src\//],
  ['contrats', /^packages\/contracts\//],
  ['base de données', /^packages\/db\//],
  ['traductions', /^packages\/i18n\//],
  ['marque', /^packages\/brand\//],
]
const layerOf = (file) => layers.find(([, pattern]) => pattern.test(file))?.[0] ?? null
const isTest = (file) => /\.test\.tsx?$/.test(file)

// --- 4. Les règles ---------------------------------------------------------------------------------

// Chaque règle : une explication, et une fonction qui dit si un import (de → vers) l'enfreint.
const rules = [
  {
    why: "l'appli n'importe jamais le code de l'API ni la base de données (secrets, accès direct)",
    breaks: (from, to) => from.startsWith('apps/app/') && /^(apps\/api|packages\/db)\//.test(to),
  },
  {
    why: "l'API n'importe jamais le code de l'appli",
    breaks: (from, to) => from.startsWith('apps/api/') && to.startsWith('apps/app/'),
  },
  {
    why: "un paquet partagé (packages/) n'importe jamais une application",
    breaks: (from, to) => from.startsWith('packages/') && to.startsWith('apps/'),
  },
  {
    why: "les contrats, partagés avec l'appli, n'importent jamais la base de données",
    breaks: (from, to) => from.startsWith('packages/contracts/') && to.startsWith('packages/db/'),
  },
  {
    why: 'un composant (src/ui) ne connaît ni les écrans, ni les appels à l’API, ni la navigation',
    breaks: (from, to) =>
      layerOf(from) === 'app/composants' &&
      !isTest(from) &&
      ['app/écrans', 'app/domaines', 'app/navigation', 'app/pages'].includes(layerOf(to)) &&
      !allowed.has(`${from} -> ${to}`),
  },
  {
    why: 'le code de production n’importe jamais les outils de test',
    breaks: (from, to) =>
      !isTest(from) &&
      !/^apps\/(app|api)\/src\/testing\//.test(from) &&
      !from.startsWith('apps/app/src/catalogue/') &&
      /^apps\/(app|api)\/src\/testing\//.test(to),
  },
]
// Exceptions acceptées, chacune avec sa raison.
const allowed = new Set([
  // Le choix de la langue enregistre aussi la langue sur le compte du membre connecté.
  'apps/app/src/ui/LanguageSwitcher.tsx -> apps/app/src/profile/useChooseLanguage.ts',
])

const problems = []
for (const [from, to] of edges) {
  for (const rule of rules) {
    if (rule.breaks(from, to)) problems.push(`${from} → ${to} : ${rule.why}`)
  }
}

// --- 5. Le schéma ----------------------------------------------------------------------------------

const links = new Map()
for (const [from, to] of edges) {
  const a = layerOf(from)
  const b = layerOf(to)
  if (!a || !b || a === b || isTest(from) || a.endsWith('/tests') || b.endsWith('/tests')) continue
  const key = `${a}|${b}`
  links.set(key, (links.get(key) ?? 0) + 1)
}
const used = [...new Set([...links.keys()].flatMap((key) => key.split('|')))]
const id = (layer) => `n${layers.findIndex(([name]) => name === layer)}`
const group = (prefix, title, filter) => [
  `  subgraph ${prefix}["${title}"]`,
  ...used.filter(filter).map((layer) => `    ${id(layer)}["${layer.replace(/^(app|api)\//, '')}"]`),
  '  end',
]
const mermaid = [
  'flowchart LR',
  ...group('appli', 'apps/app (iOS, Android, web)', (l) => l.startsWith('app/')),
  ...group('api', 'apps/api (serveur)', (l) => l.startsWith('api/')),
  ...group('paquets', 'packages (partagés)', (l) => !/^(app|api)\//.test(l)),
  ...[...links.entries()].sort().map(([key]) => {
    const [a, b] = key.split('|')
    return `  ${id(a)} --> ${id(b)}`
  }),
].join('\n')

const doc = `# Les dépendances entre les parties du projet

Fichier fabriqué par \`pnpm arch\` (\`scripts/architecture.mjs\`) : ne pas le modifier à la main.
Chaque flèche dit « importe » (tests exclus). Le schéma ne change que si une nouvelle relation apparaît
entre deux parties : c'est le moment de se demander si elle est voulue.

\`\`\`mermaid
${mermaid}
\`\`\`

## Les règles vérifiées

${rules.map((rule) => `- ${rule.why[0].toUpperCase()}${rule.why.slice(1)}.`).join('\n')}

Exceptions acceptées :

${[...allowed].map((edge) => `- \`${edge}\``).join('\n')}
`

// --- 6. Le résultat --------------------------------------------------------------------------------

if (problems.length > 0) {
  console.error(
    `Architecture : ${problems.length} import(s) interdit(s)\n- ${problems.join('\n- ')}`,
  )
  process.exit(1)
}
let current = ''
try {
  current = readFileSync(docFile, 'utf8')
} catch {}
if (checkOnly) {
  if (current !== doc) {
    console.error('docs/architecture/dependances.md n’est plus à jour : lancer « pnpm arch ».')
    process.exit(1)
  }
} else if (current !== doc) {
  writeFileSync(docFile, doc)
  console.log('docs/architecture/dependances.md réécrit.')
}
console.log(
  `Architecture vérifiée : ${entryPoints.length} fichiers, ${edges.length} imports, aucune règle enfreinte.`,
)
