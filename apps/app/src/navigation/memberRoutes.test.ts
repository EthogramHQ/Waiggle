// Les pages réservées aux membres se chargent à la demande (tranche R18, « Les finitions », choix 7
// du plan). Sur le web, toutes les routes de `app/` partent dans le script de départ, que chaque
// visiteur télécharge ; un écran importé en tête d'une route y part avec elle. Un visiteur
// n'ouvre jamais Explorer, la recherche, les outils, les notifications ni les ruches : ces écrans
// passent donc par `lazyScreen` (navigation/lazyScreen.tsx), qui les demande dans un morceau à part
// quand on ouvre la page, avec le squelette de la page (`shape`, R16) pendant l'attente.
//
// Un test statique : il lit le texte des fichiers de routes, sans les exécuter (sous Jest, un vrai
// `import()` échoue). Ce qu'il vérifie est ce que la construction du site ferait des imports.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const APP = join(__dirname, '../..')
const read = (path: string) => readFileSync(join(APP, path), 'utf8')

type Route = { file: string; screen: string; chunk: 'explore' | 'hives' | 'settings' | 'scout' }

// Les pages du choix 7 et l'écran que chacune montre ; deux morceaux, pour ne pas en créer un
// troisième, commun, que chaque page chargerait d'emblée (leçon de R13).
const PAGES: Route[] = [
  { file: 'app/explore.tsx', screen: 'ExploreScreen', chunk: 'explore' },
  { file: 'app/search.tsx', screen: 'SearchScreen', chunk: 'explore' },
  { file: 'app/tools.tsx', screen: 'ToolsScreen', chunk: 'explore' },
  { file: 'app/notifications.tsx', screen: 'NotificationsScreen', chunk: 'explore' },
  { file: 'app/hives.tsx', screen: 'HivesScreen', chunk: 'hives' },
  { file: 'app/hives/[id].tsx', screen: 'HiveScreen', chunk: 'hives' },
  // R19 : « Ma récolte » et le classement de la semaine, dans le morceau des réglages (pas de
  // morceau neuf, leçon de R13) : on les ouvre depuis son profil, comme les réglages.
  { file: 'app/harvest/index.tsx', screen: 'HarvestScreen', chunk: 'settings' },
  { file: 'app/harvest/rankings.tsx', screen: 'RankingsScreen', chunk: 'settings' },
]
// La feuille « Créer une ruche », posée sur la page d'avant (`navigation/sheetRoutes.ts`).
const SHEET: Route = { file: 'app/hives/new.tsx', screen: 'HiveCreateSheet', chunk: 'hives' }
const MEMBER_SCREENS = [...PAGES, SHEET].map((route) => route.screen)

/** Le code sans ses commentaires : un commentaire qui cite `lazyScreen(` ne compte pas. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** Le texte entre les parenthèses de chaque appel à `lazyScreen(…)`. */
const lazyCalls = (source: string): string[] => {
  const calls: string[] = []
  const text = code(source)
  for (const match of text.matchAll(/\blazyScreen\s*(?:<[^>]*>)?\s*\(/g)) {
    let depth = 1
    let end = (match.index ?? 0) + match[0].length
    const start = end
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1
      if (text[end] === ')') depth -= 1
      end += 1
    }
    calls.push(text.slice(start, end - 1))
  }
  return calls
}

/** L'appel à `lazyScreen` qui charge `screen` depuis `navigation/chunks/<chunk>`, s'il existe. */
const lazyCallOf = (route: Route) =>
  lazyCalls(read(route.file)).find(
    (call) =>
      new RegExp(`import\\(\\s*'[./]*(?:src/)?navigation/chunks/${route.chunk}'\\s*\\)`).test(
        call,
      ) && new RegExp(`\\b${route.screen}\\b`).test(call),
  )

/** Les modules importés en tête d'un fichier (`import … from '…'`), sans les imports de types. */
const staticImports = (source: string): string[] =>
  [...code(source).matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+'([^']+)'/gm)].map(
    (match) => match[1] as string,
  )

// Un import relatif devient un fichier du dépôt (les extensions que Metro essaie, dans l'ordre).
const EXTENSIONS = ['', '.web.tsx', '.web.ts', '.tsx', '.ts', '/index.tsx', '/index.ts']
const resolveImport = (from: string, specifier: string): string | null => {
  if (!specifier.startsWith('.')) return null
  for (const extension of EXTENSIONS) {
    const path = join(dirname(from), specifier + extension)
    if (existsSync(path) && statSync(path).isFile()) return path
  }
  return null
}

/** Tous les fichiers de l'appli qu'atteignent les imports en tête, depuis `entries`. */
const reachedFrom = (entries: string[]): Set<string> => {
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const specifier of staticImports(readFileSync(file, 'utf8'))) {
      const next = resolveImport(file, specifier)
      if (next) visit(next)
    }
  }
  for (const entry of entries) visit(join(APP, entry))
  return new Set([...seen].map((file) => relative(APP, file).split(sep).join('/')))
}

/** Les écrans de membres qu'un fichier importe en tête. */
const memberScreensImportedBy = (file: string) =>
  staticImports(read(file))
    .map((specifier) => specifier.split('/').pop() ?? '')
    .filter((name) => MEMBER_SCREENS.includes(name))

describe('member routes loaded on demand', () => {
  it.each(PAGES)('loads $screen on demand with the page skeleton ($file)', (route) => {
    const call = lazyCallOf(route)
    expect(call).toMatch(new RegExp(`navigation/chunks/${route.chunk}'`))
    // Les réglages de `lazyScreen` (son second argument) donnent la forme du squelette commun, ou,
    // R18 (relecture de design), l'attente propre à l'écran (`loading`), à sa largeur.
    expect(call).toMatch(/\bshape\s*:\s*'[a-z]+'|\bloading\s*:\s*[A-Z]\w+/)
  })

  it('loads the hive creation sheet on demand as a sheet, without a page skeleton', () => {
    const call = lazyCallOf(SHEET)
    expect(call).toMatch(/navigation\/chunks\/hives'/)
    expect(call).toMatch(/\bsheet\s*:\s*true\b/)
    expect(call).not.toMatch(/\bshape\s*:/)
  })

  it.each([...PAGES, SHEET])('imports no member screen at the top of $file', (route) => {
    expect(memberScreensImportedBy(route.file)).toEqual([])
  })

  it('gathers explore, search, tools and notifications in one chunk, and the hives in another', () => {
    const exported = (chunk: string) =>
      staticImports(read(`src/navigation/chunks/${chunk}.ts`))
        .map((specifier) => specifier.split('/').pop() ?? '')
        .sort()
    expect(exported('explore')).toEqual(
      ['ExploreScreen', 'NotificationsScreen', 'SearchScreen', 'ToolsScreen'].sort(),
    )
    expect(exported('hives')).toEqual(
      expect.arrayContaining(['HiveCreateSheet', 'HiveScreen', 'HivesScreen']),
    )
    expect(exported('hives')).not.toEqual(expect.arrayContaining(['ExploreScreen']))
  })

  it('gathers « Ma récolte » and the ranking of the week in the settings chunk', () => {
    const exported = staticImports(read('src/navigation/chunks/settings.ts')).map(
      (specifier) => specifier.split('/').pop() ?? '',
    )
    expect(exported).toEqual(expect.arrayContaining(['HarvestScreen', 'RankingsScreen']))
    // Témoin : les réglages y sont toujours.
    expect(exported).toContain('SettingsScreen')
  })

  // R18 (relecture de design) : l'attente propre d'un écran (`loading`, screens/HivesLoading.tsx…)
  // part avec sa route dans le script de départ ; elle ne doit y ramener aucun de ces écrans.
  it.each([...PAGES, SHEET])('reaches no member screen through the imports of $file', (route) => {
    const screens = MEMBER_SCREENS.map((screen) => `src/screens/${screen}.tsx`)
    const reached = reachedFrom([route.file])
    expect(screens.filter((screen) => reached.has(screen))).toEqual([])
  })

  it('reaches none of these screens from app/index.tsx or app/_layout.tsx', () => {
    const reached = reachedFrom(['app/index.tsx', 'app/_layout.tsx'])
    // Témoin : la lecture suit bien les imports, jusqu'à l'écran de l'accueil d'un visiteur.
    expect(reached).toContain('src/screens/ShowcaseScreen.tsx')
    const screens = MEMBER_SCREENS.map((screen) => `src/screens/${screen}.tsx`)
    expect(screens.filter((screen) => reached.has(screen))).toEqual([])
  })
})

// R20 (plan, « Appli ») : les Éclaireuses. Seuls le bouton de la Goutte (`ui/HoneyDrop`) et son
// branchement (`scout/ScoutDrop`) partent dans le script de départ, avec `app/_layout.tsx` ; la
// feuille « Ton retour » et la page des missions se chargent à la demande, dans un morceau neuf
// (`navigation/chunks/scout.ts`) ; les réglages et la page de tri, dans les morceaux existants.
const SCOUT_SHEET: Route = {
  file: 'app/scout-report.tsx',
  screen: 'ScoutReportSheet',
  chunk: 'scout',
}
const SCOUT_MISSIONS: Route = {
  file: 'app/scout/missions.tsx',
  screen: 'ScoutMissionsScreen',
  chunk: 'scout',
}
const SCOUT_FILES = [
  'src/scout/ScoutReportSheet.tsx',
  'src/screens/ScoutMissionsScreen.tsx',
  'src/screens/ScoutSettingsScreen.tsx',
  'src/screens/ScoutTriageScreen.tsx',
]

describe('the scouts pages loaded on demand (R20)', () => {
  it('loads the sheet « Ton retour » on demand as a sheet, from the scout chunk', () => {
    const call = lazyCallOf(SCOUT_SHEET)
    expect(call).toMatch(/navigation\/chunks\/scout'/)
    expect(call).toMatch(/\bsheet\s*:\s*true\b/)
  })

  it('loads the missions of the week on demand with the page skeleton', () => {
    const call = lazyCallOf(SCOUT_MISSIONS)
    expect(call).toMatch(/navigation\/chunks\/scout'/)
    expect(call).toMatch(/\bshape\s*:\s*'[a-z]+'|\bloading\s*:\s*[A-Z]\w+/)
  })

  it('declares the sheet « Ton retour » among the sheets', () => {
    expect(read('src/navigation/sheetRoutes.ts')).toMatch(/'scout-report'/)
  })

  it('sends only the drop to the start script, never the scouts screens', () => {
    const reached = reachedFrom(['app/index.tsx', 'app/_layout.tsx'])
    // Témoin : la Goutte est bien montée par la mise en page de l'appli.
    expect(reached).toContain('src/scout/ScoutDrop.tsx')
    expect(reached).toContain('src/ui/HoneyDrop.tsx')
    expect(SCOUT_FILES.filter((file) => reached.has(file))).toEqual([])
  })

  it.each([SCOUT_SHEET, SCOUT_MISSIONS])(
    'reaches no scouts screen through the imports of $file',
    (route) => {
      const reached = reachedFrom([route.file])
      expect(SCOUT_FILES.filter((file) => reached.has(file))).toEqual([])
    },
  )
})
