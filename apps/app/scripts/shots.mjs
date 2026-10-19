// Captures d'écran automatiques de l'appli web : le catalogue des composants et chaque écran, sur
// téléphone et sur ordinateur, de jour et de nuit. Elles servent à relire un changement d'interface
// sans lancer l'appli : la CI les joint à chaque pull request (onglet « Artifacts »).
//
// Usage : pnpm --filter @ruche/app shots            (construit l'appli puis photographie)
//         pnpm --filter @ruche/app shots --no-build (réutilise la dernière construction)
//         pnpm --filter @ruche/app shots --no-build --layout (mesure la mise en page à 9 largeurs)
//         pnpm --filter @ruche/app shots --no-build --explore parcours.mjs (essais au clic, voir plus bas)
// Les images arrivent dans apps/app/shots/ (non enregistré dans Git).
//
// Pas besoin de serveur d'API : les réponses de l'API sont simulées avec les mêmes données
// d'exemple que les tests (src/testing/). Node lit ces fichiers TypeScript directement.
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
// Les notes du journal (tranche 4b), de la plus récente à la plus ancienne. Une note, pour l'API
// simulée : son identifiant, son texte, et le jour (d'octobre 2026) de sa publication.
const note = (n, body, day) => ({
  id: `0b1c2d3e-4f50-4a61-8b72-00000000000${n}`,
  body,
  createdAt: new Date(Date.UTC(2026, 9, day, 9)).toISOString(),
})
const recipesNotes = [
  note(3, 'v2 : mode hors ligne. Les recettes se lisent même sans réseau, au fond du jardin.', 18),
  note(2, 'Il propose maintenant un dessert quand il reste des fruits.', 15),
  note(1, 'Première version en ligne : photographie ton frigo, il te dit quoi cuisiner.', 12),
]
// Le projet de Léa, vu par elle-même : son journal, avec « Supprimer » sur chaque note.
const recipesShown = { ...recipesProject, notes: recipesNotes }
// Une note de 1 000 caractères, et une adresse sans espace : rien ne doit déborder.
const longNote = Array.from({ length: 20 }, () => 'Une note très longue, pour voir la coupure. ')
  .join('')
  .slice(0, 1000)
  .trim()
const urlNote =
  'Le code est ici : https://github.com/lea-moreau/un-tres-long-nom-de-depot-pour-voir-les-coupures-de-ligne'
// Un projet aux contenus très longs, pour vérifier que rien ne déborde ni ne s'étale.
const longProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000bb',
  title:
    'Un assistant qui range les photos de vacances par lieu, par personne et par moment de la journée',
  pitch:
    'Il regarde chaque photo, reconnaît les visages que tu lui as présentés, devine le lieu et propose des albums que tu peux partager en un geste avec ta famille.',
  description: Array.from(
    { length: 6 },
    (_, i) =>
      `## Étape ${i + 1}\n\nUne longue explication, avec assez de mots pour remplir plusieurs lignes et voir où la ligne se coupe sur un grand écran, ce qui ne doit jamais dépasser une longueur confortable pour la lecture, environ soixante-dix caractères.`,
  ).join('\n\n'),
  demoUrl: 'https://une-tres-longue-adresse-de-demonstration-pour-voir-les-coupures.example.org',
  tools: [
    {
      label: 'gpt-4o-mini-2024-07-18-instruct-previews',
      slug: 'gpt-4o-mini-2024-07-18-instruct-previews',
    },
    { label: 'Claude Code', slug: 'claude-code' },
  ],
  notes: [note(5, longNote, 17), note(4, urlNote, 16)],
}
// Le projet d'un autre membre (Max) : le bouton « Suivre ce projet », son journal (sans
// « Supprimer »), et, ouvert en modification, l'état « Ce projet n'est pas à toi ».
const notMineProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000aa',
  author: { id: 'max-id', name: 'Max Durand', avatarUrl: null },
  isMine: false,
  followerCount: 2,
  notes: recipesNotes.slice(1),
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
// Le fil de l'accueil : celui de Léa, qui suit des membres (avec une suite à charger), ou vide
// quand elle ne suit personne. La page en cours choisit (feed: 'nobody' dans la liste plus bas) ;
// l'API simulée lit ce choix ici, avant chaque page.
let feedScenario = 'following'
// Les projets des personnes que Léa suit (Max, Inès) : on ne se suit pas soi-même.
const max = { id: 'max-id', name: 'Max Durand', avatarUrl: null }
const ines = { id: 'ines-id', name: 'Inès Haddad', avatarUrl: null }
const fromOthers = [
  {
    ...photosProject,
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    author: max,
    title: 'Le tri des photos de vacances',
  },
  {
    ...recipesProject,
    id: '1a2b3c4d-0000-4000-8000-000000000002',
    author: ines,
    title: 'Mon agent de recettes',
    status: 'building',
  },
  {
    ...recipesProject,
    id: '1a2b3c4d-0000-4000-8000-000000000003',
    author: max,
    title: 'Un résumé des réunions',
    pitch: 'Il écoute la réunion et envoie les décisions à chacun.',
    status: 'idea',
  },
  { ...longProject, id: '1a2b3c4d-0000-4000-8000-000000000004', author: ines },
]
const feedItems = fromOthers.map((p, i) => ({
  kind: 'project',
  at: new Date(Date.UTC(2026, 9, 19 - i, 9)).toISOString(),
  project: summaryOf(p),
}))
// La page de Max, vue par Léa qui ne le suit pas encore.
const maxMember = {
  ...leaPage,
  id: max.id,
  name: max.name,
  bio: 'Je fais des outils pour ma famille.',
  isMe: false,
  isFollowed: false,
  followerCount: 12,
  projects: feedItems
    .filter((item) => item.project.author.id === max.id)
    .map((item) => item.project),
}
// Le fil « Abonnements » mêle aux nouveaux projets les notes des projets suivis (tranche 4b) : une
// note du tri des photos (avec sa couverture) tout en haut, une de l'agent de recettes (sans photo,
// la lumière miel) plus bas. « Découvrir » ne montre jamais de note.
const noteItem = (project, n, body, day) => ({
  kind: 'note',
  at: new Date(Date.UTC(2026, 9, day, 12)).toISOString(),
  note: { ...note(n, body, day), createdAt: new Date(Date.UTC(2026, 9, day, 12)).toISOString() },
  project: summaryOf(project),
})
const followingItems = [
  noteItem(fromOthers[0], 6, 'v2 : il reconnaît maintenant les visages de profil.', 19),
  ...feedItems.slice(0, 2),
  noteItem(fromOthers[1], 7, longNote, 17),
  ...feedItems.slice(2),
]
const followingFeed = () =>
  feedScenario === 'nobody'
    ? { items: [], nextCursor: null, followsAnyone: false }
    : { items: followingItems, nextCursor: 'suite', followsAnyone: true }

const fakeApi = (signedIn) => async (route) => {
  const { pathname } = new URL(route.request().url())
  const json = (status, body) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (pathname === '/api/auth/get-session') return json(200, signedIn ? session : null)
  if (!signedIn) return json(401, { error: { code: 'unauthorized', message: '' } })
  if (pathname === '/v1/me') return json(200, leaMe)
  // Publier ou supprimer une note : l'API simulée accepte (les essais au clic, --explore, peuvent
  // remplacer ces réponses par un refus).
  const method = route.request().method()
  if (/^\/v1\/projects\/[^/]+\/notes$/.test(pathname) && method === 'POST') {
    const { body } = JSON.parse(route.request().postData() ?? '{}')
    return json(201, { id: crypto.randomUUID(), body, createdAt: new Date().toISOString() })
  }
  if (/^\/v1\/projects\/[^/]+\/notes\/[^/]+$/.test(pathname) && method === 'DELETE') {
    return route.fulfill({ status: 204, body: '' })
  }
  if (pathname === `/v1/projects/${recipesProject.id}`) return json(200, recipesShown)
  if (pathname === `/v1/projects/${photosProject.id}`) return json(200, photosProject)
  if (pathname === `/v1/projects/${notMineProject.id}`) return json(200, notMineProject)
  if (pathname === `/v1/projects/${longProject.id}`) return json(200, longProject)
  if (pathname === `/v1/members/${leaMe.id}`) return json(200, leaMember)
  if (pathname === `/v1/members/${max.id}`) return json(200, maxMember)
  if (pathname === '/v1/tags/claude-code') return json(200, claudeCode)
  if (pathname === '/v1/feed/following') return json(200, followingFeed())
  if (pathname === '/v1/feed/discover') return json(200, { items: feedItems, nextCursor: null })
  // Une page dont le chargement échoue, pour photographier l'état « erreur ».
  if (pathname === '/v1/members/erreur')
    return json(500, { error: { code: 'internal', message: '' } })
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
  // L'accueil d'un membre : le fil « Abonnements », puis le même pour qui ne suit personne.
  { name: 'accueil-connecte', path: '/', signedIn: true, fullPage: true },
  { name: 'fil-vide', path: '/', signedIn: true, feed: 'nobody' },
  // La page d'un autre membre et son projet : les boutons « Suivre ».
  { name: 'membre-autre', path: '/members/max-id', signedIn: true, fullPage: true },
  { name: 'projet-autre', path: `/projects/${notMineProject.id}`, signedIn: true, fullPage: true },
  { name: 'compte', path: '/account', signedIn: true, fullPage: true },
  { name: 'supprimer-compte', path: '/account/delete', signedIn: true, fullPage: true },
  { name: 'profil', path: '/profile', signedIn: true, fullPage: true },
  { name: 'publier', path: '/projects/new', signedIn: true, fullPage: true },
  { name: 'projet', path: project, signedIn: true, fullPage: true },
  // Après un changement de statut, le formulaire ramène l'auteur sur son projet avec une note
  // toute prête dans le champ du journal.
  { name: 'projet-annonce', path: `${project}?annonce=testable`, signedIn: true, fullPage: true },
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
  // Les états d'une page : réservée aux membres (vue par un visiteur), chargement en échec,
  // adresse qui ne mène nulle part.
  { name: 'visiteur-projet', path: project, signedIn: false },
  // wait : l'appli réessaie deux fois une lecture ratée (environ 3 s) avant d'afficher l'erreur.
  { name: 'erreur', path: '/members/erreur', signedIn: true, wait: 4500 },
  { name: 'adresse-inconnue', path: '/nulle-part', signedIn: false },
  { name: 'adresse-verifiee', path: '/verified', signedIn: true },
  // Des contenus très longs : titre, description, outils, adresse de démo.
  { name: 'projet-long', path: `/projects/${longProject.id}`, signedIn: true, fullPage: true },
  { name: 'pas-a-moi', path: `/projects/${notMineProject.id}/edit`, signedIn: true },
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

// --layout : au lieu des captures habituelles, chaque page est mesurée à neuf largeurs d'écran, du
// petit téléphone au grand écran. Le rapport (shots/layout/rapport.md) signale ce qui dépasse de la
// largeur (défilement horizontal), les zones à toucher de moins de 44 points, et garde une capture
// par largeur. C'est l'outil de l'agent de relecture du design ; il ne fait échouer aucune vérification.
// --explore <script.mjs> : l'appli tourne sur les mêmes données simulées, et le navigateur est confié
// à un script écrit pour l'occasion (par l'agent de relecture du design, hors du dépôt). Il y clique,
// tape, appuie deux fois, navigue au clavier… pour vérifier le comportement des boutons et les cas
// inhabituels, pas seulement l'allure. Le script exporte une fonction par défaut qui reçoit :
// - base : l'adresse de l'appli ; paths : l'adresse de chaque page photographiée, par son nom ;
// - open(signedIn, options) : un contexte de navigateur Playwright (visiteur ou Léa connectée),
//   avec l'API simulée ; un `context.route(...)` ajouté ensuite remplace une réponse (erreur, lenteur).
// - apiUrl : l'adresse de l'API simulée.
const exploreAt = process.argv.indexOf('--explore')
if (exploreAt !== -1) {
  const script = process.argv[exploreAt + 1]
  if (!script) throw new Error('--explore attend le chemin du script à lancer')
  const browser = await chromium.launch()
  const open = async (signedIn, options = {}) => {
    const context = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 390, height: 844 },
      ...options,
    })
    await context.route(`${apiUrl}/**`, fakeApi(signedIn))
    return context
  }
  try {
    const { default: explore } = await import(pathToFileURL(resolve(script)).href)
    await explore({
      base,
      open,
      apiUrl,
      paths: Object.fromEntries(pages.map((p) => [p.name, p.path])),
    })
  } finally {
    await browser.close()
    server.close()
  }
  process.exit(0)
}

if (process.argv.includes('--layout')) {
  await layoutReport()
  server.close()
  process.exit(0)
}

async function layoutReport() {
  const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]
  const dir = join(out, 'layout')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const lines = ['# Mise en page à plusieurs largeurs', '']
  for (const signedIn of [false, true]) {
    const context = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 390, height: 844 },
    })
    await context.route(`${apiUrl}/**`, fakeApi(signedIn))
    const page = await context.newPage()
    for (const shot of pages.filter((p) => p.signedIn === signedIn)) {
      lines.push(`## ${shot.name} (${shot.path})`, '')
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
        feedScenario = shot.feed ?? 'following'
        await page.goto(base + shot.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(shot.wait ?? 600)
        // Mesures faites dans la page : ce que le navigateur a réellement dessiné.
        const found = await page.evaluate(() => {
          const width = window.innerWidth
          const interactive =
            'button, a, input, textarea, select, [role=button], [role=link], [role=switch], [role=radio], [role=checkbox], [role=tab]'
          const nameOf = (el) =>
            (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)
          const visible = (r) => r.width > 0 && r.height > 0
          const small = [...document.querySelectorAll(interactive)]
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            // Un lien au milieu d'un paragraphe (display: inline) suit la hauteur de la ligne : les
            // règles d'accessibilité (WCAG 2.5.8) l'exemptent de la taille minimale.
            .filter(({ el }) => getComputedStyle(el).display !== 'inline')
            .filter(({ r }) => visible(r) && (r.width < 44 || r.height < 44))
            .map(({ el, r }) => `${nameOf(el)} (${Math.round(r.width)} × ${Math.round(r.height)})`)
          // Un élément qui dépasse mais qu'un parent rogne (overflow: hidden, comme la lumière
          // d'ambiance) ne se voit pas : on ne le signale pas.
          const clipped = (el) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const style = getComputedStyle(p)
              if (style.overflowX !== 'visible' || style.overflow === 'hidden') {
                const r = p.getBoundingClientRect()
                if (r.right <= width + 1 && r.left >= -1) return true
              }
            }
            return false
          }
          const outside = [...document.querySelectorAll('body *')]
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(
              ({ el, r }) => visible(r) && (r.right > width + 1 || r.left < -1) && !clipped(el),
            )
            .map(({ el }) => nameOf(el))
          return {
            scroll: document.documentElement.scrollWidth - width,
            small: [...new Set(small)],
            outside: [...new Set(outside)].slice(0, 5),
          }
        })
        await page.screenshot({ path: join(dir, `${shot.name}-${width}.png`), fullPage: true })
        const notes = []
        if (found.scroll > 0) notes.push(`défilement horizontal de ${found.scroll} px`)
        if (found.outside.length > 0) notes.push(`hors de l'écran : ${found.outside.join(' ; ')}`)
        if (found.small.length > 0) notes.push(`zones à toucher < 44 : ${found.small.join(' ; ')}`)
        lines.push(
          `- **${width} px** : ${notes.length > 0 ? notes.join(' — ') : 'rien à signaler'}`,
        )
      }
      lines.push('')
    }
    await context.close()
  }
  await browser.close()
  writeFileSync(join(dir, 'rapport.md'), `${lines.join('\n')}\n`)
  console.log(`Rapport de mise en page : ${join(dir, 'rapport.md')}`)
}

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
        feedScenario = shot.feed ?? 'following'
        await page.goto(base + shot.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(shot.wait ?? 600) // le temps des ressorts et des fondus
        const file = (part) =>
          join(out, `${shot.name}${part > 1 ? `-${part}` : ''}-${device.name}-${scheme.name}.png`)
        if (!shot.fullPage) {
          await page.screenshot({ path: file(1) })
          continue
        }
        // L'écran défile à l'intérieur de la page (ScrollView) : pour tout photographier, on
        // agrandit la fenêtre à la hauteur de son contenu.
        const height = await page.evaluate(() =>
          Math.max(...[...document.querySelectorAll('div')].map((el) => el.scrollHeight)),
        )
        // Au-delà de 16 000 points, Chromium refuse une fenêtre plus haute (le catalogue en fait
        // davantage sur téléphone) : on photographie alors la page en plusieurs morceaux
        // (catalogue, catalogue-2…), en faisant défiler la zone qui défile entre deux captures.
        const PART = 16000
        await page.setViewportSize({ ...device.viewport, height: Math.min(height, PART) })
        await page.waitForTimeout(300)
        for (let part = 1; (part - 1) * PART < height; part++) {
          if (part > 1) {
            await page.evaluate(
              (top) => {
                const scrollers = [...document.querySelectorAll('div')].filter(
                  (el) => el.scrollHeight > el.clientHeight,
                )
                const main = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
                if (main) main.scrollTop = top
              },
              (part - 1) * PART,
            )
            await page.waitForTimeout(300)
          }
          await page.screenshot({ path: file(part) })
        }
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
