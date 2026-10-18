// Captures d'écran automatiques de l'appli web : le catalogue des composants et chaque écran, sur
// téléphone et sur ordinateur, de jour et de nuit. Elles servent à relire un changement d'interface
// sans lancer l'appli : la CI les joint à chaque pull request (onglet « Artifacts »).
//
// Usage : pnpm --filter @ruche/app shots            (construit l'appli puis photographie)
//         pnpm --filter @ruche/app shots --no-build (réutilise la dernière construction)
// Les images arrivent dans apps/app/shots/ (non enregistré dans Git).
//
// Pas besoin de serveur d'API : les réponses de l'API sont simulées avec les mêmes données
// d'exemple que les tests (src/testing/). Node lit ces fichiers TypeScript directement.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { leaMe } from '../src/testing/fixtures.ts'
import {
  draftProject,
  leaPage,
  projectWithPhotos,
  recipesProject,
  summaryOf,
} from '../src/testing/projects.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const build = join(root, 'dist-shots')
const out = join(root, 'shots')
const apiUrl = 'http://localhost:3000' // adresse par défaut de l'API (src/config.ts)

// 1. Construire l'appli web, catalogue compris.
if (!process.argv.includes('--no-build')) {
  rmSync(build, { recursive: true, force: true })
  const result = spawnSync(
    'pnpm',
    ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', build],
    { cwd: root, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_CATALOGUE: '1' } },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// 2. La servir comme le ferait un hébergeur : /sign-in renvoie sign-in.html.
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
const server = createServer((req, res) => {
  const file = fileFor(req.url ?? '/')
  if (!file) {
    res.writeHead(400)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

// 3. Les réponses simulées de l'API, pour un visiteur ou pour Léa connectée.
const session = {
  session: { id: 's1', userId: leaMe.id, expiresAt: '2099-01-01T00:00:00.000Z' },
  user: { ...leaMe, image: null, updatedAt: leaMe.createdAt },
}
// Le même projet, avec ses photos, sous un autre identifiant : on photographie les deux pages.
const photosProject = { ...projectWithPhotos, id: '7c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' }
// La page de Léa, vue par elle-même (avec son brouillon privé), et la page d'une étiquette.
const leaMember = {
  ...leaPage,
  id: leaMe.id,
  name: leaMe.name,
  isMe: true,
  projects: [summaryOf(photosProject), summaryOf(draftProject), summaryOf(recipesProject)],
}
const claudeCode = {
  slug: 'claude-code',
  label: 'Claude Code',
  projects: [summaryOf(photosProject), summaryOf(recipesProject)],
}
// Une image d'exemple par photo (le dépôt n'en contient aucune) : un dégradé SVG, d'une couleur
// différente selon la photo, aux proportions annoncées par l'API.
const sampleImage = (id) => {
  const visual = [...photosProject.visuals, photosProject.portraitCover].find((v) => v?.id === id)
  const hue = (parseInt(id.slice(0, 2), 16) * 47) % 360
  const { width = 1600, height = 900 } = visual ?? {}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${hue + 40} 65% 38%)"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${width * 0.7}" cy="${height * 0.35}" r="${Math.min(width, height) * 0.18}" fill="hsl(${hue + 180} 80% 85%)" opacity="0.8"/>
</svg>`
}
const fakeApi = (signedIn) => async (route) => {
  const { pathname } = new URL(route.request().url())
  const json = (status, body) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (pathname === '/api/auth/get-session') return json(200, signedIn ? session : null)
  if (!signedIn) return json(401, { error: { code: 'unauthorized', message: '' } })
  if (pathname === '/v1/me') return json(200, leaMe)
  if (pathname === `/v1/projects/${recipesProject.id}`) return json(200, recipesProject)
  if (pathname === `/v1/projects/${photosProject.id}`) return json(200, photosProject)
  if (pathname === `/v1/members/${leaMe.id}`) return json(200, leaMember)
  if (pathname === '/v1/tags/claude-code') return json(200, claudeCode)
  const tag = pathname.match(/^\/v1\/tags\/([^/]+)$/)
  if (tag) return json(200, { slug: tag[1], label: null, projects: [] })
  const media = pathname.match(/^\/media\/visuals\/([0-9a-f-]+)\.webp$/)
  if (media) {
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: sampleImage(media[1]) })
  }
  return json(404, { error: { code: 'not_found', message: '' } })
}

// 4. Ce qu'on photographie.
const project = `/projects/${recipesProject.id}`
const pages = [
  { name: 'catalogue', path: '/catalogue', signedIn: false, fullPage: true },
  { name: 'accueil', path: '/', signedIn: false },
  { name: 'connexion', path: '/sign-in', signedIn: false },
  { name: 'inscription', path: '/sign-up', signedIn: false },
  { name: 'verifier-email', path: '/check-email?email=lea%40example.com', signedIn: false },
  { name: 'quitter', path: '/out?url=https%3A%2F%2Frecettes.example.com', signedIn: false },
  { name: 'accueil-connecte', path: '/', signedIn: true },
  { name: 'compte', path: '/account', signedIn: true, fullPage: true },
  { name: 'supprimer-compte', path: '/account/delete', signedIn: true, fullPage: true },
  { name: 'profil', path: '/profile', signedIn: true, fullPage: true },
  { name: 'publier', path: '/projects/new', signedIn: true, fullPage: true },
  { name: 'projet', path: project, signedIn: true, fullPage: true },
  { name: 'modifier', path: `${project}/edit`, signedIn: true, fullPage: true },
  // Le projet avec ses photos : couverture verticale sur téléphone, vignettes, éditeur des photos.
  { name: 'projet-photos', path: `/projects/${photosProject.id}`, signedIn: true, fullPage: true },
  {
    name: 'modifier-photos',
    path: `/projects/${photosProject.id}/edit`,
    signedIn: true,
    fullPage: true,
  },
  // La page d'un membre (la sienne : avec un brouillon privé), et celle d'une étiquette, pleine
  // puis vide.
  { name: 'membre', path: `/members/${leaMe.id}`, signedIn: true, fullPage: true },
  { name: 'etiquette', path: '/tags/claude-code', signedIn: true, fullPage: true },
  { name: 'etiquette-vide', path: '/tags/inconnu', signedIn: true },
  // Un projet qui n'existe pas (ou privé) : l'API simulée répond « introuvable ».
  {
    name: 'projet-introuvable',
    path: '/projects/00000000-0000-4000-8000-000000000000',
    signedIn: true,
  },
]
const devices = [
  { name: 'telephone', viewport: { width: 390, height: 844 } },
  { name: 'ordinateur', viewport: { width: 1440, height: 900 } },
]
const schemes = [
  { name: 'jour', colorScheme: 'light' },
  { name: 'nuit', colorScheme: 'dark' },
]

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const problems = []
for (const device of devices) {
  for (const scheme of schemes) {
    for (const signedIn of [false, true]) {
      const context = await browser.newContext({
        viewport: device.viewport,
        colorScheme: scheme.colorScheme,
        locale: 'fr-FR',
        deviceScaleFactor: 2,
      })
      await context.route(`${apiUrl}/**`, fakeApi(signedIn))
      const page = await context.newPage()
      // Une erreur dans la page (ou une page qui ne s'hydrate pas) est signalée à la fin.
      page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`))
      for (const shot of pages.filter((p) => p.signedIn === signedIn)) {
        await page.setViewportSize(device.viewport)
        await page.goto(base + shot.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(600) // le temps des ressorts et des fondus
        if (shot.fullPage) {
          // L'écran défile à l'intérieur de la page (ScrollView) : pour tout photographier, on
          // agrandit la fenêtre à la hauteur de son contenu.
          const height = await page.evaluate(() =>
            Math.max(...[...document.querySelectorAll('div')].map((el) => el.scrollHeight)),
          )
          await page.setViewportSize({ ...device.viewport, height: Math.min(height, 8000) })
          await page.waitForTimeout(300)
        }
        await page.screenshot({ path: join(out, `${shot.name}-${device.name}-${scheme.name}.png`) })
      }
      await context.close()
    }
  }
}
await browser.close()
server.close()

console.log(`Captures dans ${out}`)
if (problems.length > 0) {
  console.error(`Erreurs dans les pages :\n${problems.join('\n')}`)
  process.exit(1)
}
