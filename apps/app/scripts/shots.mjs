// Captures d'écran automatiques de l'appli web : le catalogue des composants et chaque écran, sur
// téléphone et sur ordinateur, de jour et de nuit. Elles servent à relire un changement d'interface
// sans lancer l'appli : la CI les joint à chaque pull request (onglet « Artifacts »).
//
// Usage : pnpm --filter @ruche/app shots [options]
// Sans option, l'appli est construite (dans apps/app/dist-shots/), puis chaque page est
// photographiée dans apps/app/shots/ (ni l'un ni l'autre n'est enregistré dans Git).
//
//   --no-build        réutilise la dernière construction, au lieu de reconstruire (une minute de
//                     gagnée). Le script s'arrête si elle ne correspond plus au code actuel.
//   --tampon-ignore   avec --no-build : continue quand même (un cas voulu, à dire dans un rapport).
//   --list            affiche le nom et l'adresse de chaque page, puis s'arrête.
//   --only a,b        seulement ces pages, par leur nom (voir --list) : pour les captures comme
//                     pour --layout. Les captures des autres pages, déjà dans le dossier, restent.
//   --out <dossier>   le dossier des captures (shots/ par défaut). Deux lancements en même
//                     temps, chacun avec son dossier, ne s'écrasent pas.
//   --read            des captures faites pour être lues une à une : à l'échelle 1 (au lieu de
//                     2), et les pages longues coupées en tranches d'environ 1 600 pixels de haut
//                     (nom-1, nom-2…), plus faciles à regarder qu'une image de 10 000 pixels.
//   --layout          mesure la mise en page à 9 largeurs (rapport dans <dossier>/layout/). Avec
//                     --only, le rapport garde les sections et les images des autres pages.
//   --shard i/n       seulement la part i sur n des captures (--shard 1/2 puis --shard 2/2) : la
//                     CI les prend en deux tâches parallèles. Le travail k de la liste va à la
//                     part (k % n) + 1 (voir shard.ts). Chaque part construit le site et vérifie
//                     les erreurs de ses pages ; toutes ensemble, elles font la liste entière.
//   --explore x.mjs   confie le navigateur à un script d'essais au clic (voir plus bas).
//   --serial          une capture à la fois, au lieu de trois (voir « La file » plus bas) : plus
//                     lent, mais utile pour savoir si un défaut vient du parallélisme (une page
//                     qui n'a pas fini son animation parce que la machine est trop chargée).
//
// Exemples : pnpm --filter @ruche/app shots -- --list
//            pnpm --filter @ruche/app shots -- --no-build --only projet,compte --read --out C:/tmp/a
//            pnpm --filter @ruche/app shots -- --no-build --layout --only accueil
//
// Pas besoin de serveur d'API : les réponses de l'API sont simulées avec les mêmes données
// d'exemple que les tests (src/testing/). Node lit ces fichiers TypeScript directement.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'
import { fr } from '../../../packages/i18n/src/locales/fr.ts'
import { blockedPageOf, blockedSam } from '../src/testing/blocks.ts'
import {
  adminToolOf,
  admitChange,
  lovableTool,
  makeTool,
  mergeChange,
  pendingTools,
  pendingToolsWithProfiles,
  recategorizeChange,
  uncategorizedProjects,
  zapierTool,
} from '../src/testing/catalogue.ts'
import { categoryList } from '../src/testing/categories.ts'
import {
  instantToken,
  leaEmailPreferences,
  malformedToken,
  mentionsToken,
  recapOffPreferences,
  recapToken,
  refusedToken,
  repliesNowPreferences,
} from '../src/testing/email.ts'
import { leaMe, suspendedMe } from '../src/testing/fixtures.ts'
import {
  decisionHistory,
  decisionHistoryPageOf,
  moderationQueuePageOf,
  removalAfterReport,
  removalByLaw,
  removedPageOf,
  samMember,
  scamCommentItem,
  sevenDaySuspension,
} from '../src/testing/moderation.ts'
import {
  memberReportDismissedNotification,
  removedCommentNotification,
  removedProjectNotification,
  reportDismissedNotification,
  reportHandledNotification,
  suspendedIndefinitelyNotification,
  suspendedNotification,
  suspensionEndedNotification,
  suspensionLiftedNotification,
} from '../src/testing/notifications.ts'
import {
  draftProject,
  leaPage,
  photo,
  projectWithPhotos,
  recipesProject,
  summaryOf,
} from '../src/testing/projects.ts'
import { build, buildSite, checkStamp, createSiteServer, root } from './dist-shots.mjs'
import { loadingProblem, unfinishedTexts, waitUntilLoaded } from './loading-guard.ts'
import { parseShard, shardOf } from './shard.ts'

const defaultOut = join(root, 'shots')
const apiUrl = 'http://localhost:3000' // adresse par défaut de l'API (src/config.ts)

// Arrête le script avec un message, sans la longue trace d'une exception.
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// 1. Les options de la ligne de commande (voir le mode d'emploi en tête du fichier).
const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
// La valeur qui suit une option (« --out shots-a »), ou undefined si l'option est absente.
const optionValue = (flag) => {
  const at = args.indexOf(flag)
  if (at === -1) return undefined
  const value = args[at + 1]
  if (!value || value.startsWith('--')) fail(`${flag} attend une valeur.`)
  return value
}
const known = [
  '--no-build',
  '--tampon-ignore',
  '--list',
  '--only',
  '--out',
  '--read',
  '--layout',
  '--explore',
  '--serial',
  '--shard',
]
for (const [i, arg] of args.entries()) {
  // « -- » vient de « pnpm … shots -- --list » ; une valeur suit son option.
  const isValue = ['--only', '--out', '--explore', '--shard'].includes(args[i - 1])
  if (arg !== '--' && !isValue && !known.includes(arg)) {
    fail(`Option inconnue : ${arg}. Options possibles : ${known.join(', ')}.`)
  }
}
const read = has('--read')
// La part des captures à prendre (« 1/2 »), ou undefined : toute la liste.
const shardArg = optionValue('--shard')
let shard
try {
  shard = shardArg === undefined ? undefined : parseShard(shardArg)
} catch (error) {
  fail(error.message)
}
const only = optionValue('--only')
  ?.split(',')
  .map((name) => name.trim())
  .filter(Boolean)
// Un dossier relatif se lit depuis l'endroit où la commande a été tapée : pnpm lance le script
// depuis apps/app, mais garde ce point de départ dans INIT_CWD.
const outArg = optionValue('--out')
const out = outArg ? resolve(process.env.INIT_CWD ?? process.cwd(), outArg) : defaultOut

// Le dossier des captures est vidé avant chaque série. Garde-fou contre une faute de frappe : il ne
// doit contenir ni l'appli ni la construction, et un dossier choisi par --out qui contient déjà
// d'autres fichiers doit venir de ce script (il y laisse un fichier vide, .shots, pour le signer).
const inside = (dir, parent) => {
  const path = relative(parent, dir)
  return !path.startsWith('..') && !isAbsolute(path)
}
const claimOut = () => {
  if (inside(root, out) || inside(out, build)) {
    fail(`--out ${out} : ce dossier contient l'appli, ou se trouve dans sa construction.`)
  }
  const foreign =
    out !== defaultOut &&
    existsSync(out) &&
    readdirSync(out).length > 0 &&
    !existsSync(join(out, '.shots'))
  if (foreign) {
    fail(`--out ${out} : ce dossier contient déjà d'autres fichiers. Choisis un dossier neuf.`)
  }
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, '.shots'), '')
}

// 3. Les réponses simulées de l'API, pour un visiteur ou pour Léa connectée.
const session = {
  session: { id: 's1', userId: leaMe.id, expiresAt: '2099-01-01T00:00:00.000Z' },
  user: { ...leaMe, image: null, updatedAt: leaMe.createdAt },
}
// Tranche « adresse » : ce que Léa tape pour changer d'adresse (lea@example.com devient
// lea.moreau@exemple.fr), et un mot de passe que l'API simulée refuse, comme la vraie
// (INVALID_PASSWORD). Après le second lien, la page « Adresse changée » lit la nouvelle adresse
// dans la session, jamais dans l'URL : `email: 'changed'` (option d'une page) la donne à la session
// et au profil. Les pages, déclarées avec les autres pages du compte :
//   - changer-adresse : /account/email, connectée ;
//   - changer-adresse-envoye : la même, `prepare` remplit changeEmailShot et touche « Envoyer le
//     lien », puis attend « Regarde ta boîte mail actuelle » ;
//   - changer-adresse-erreur : la même avec wrongPasswordShot, attend « Mot de passe incorrect. » ;
//   - adresse-confirmee : /email-change/confirmed, sans session (le lien s'ouvre souvent ailleurs) ;
//   - adresse-changee : /email-change/done, connectée, `email: 'changed'` ;
//   - adresse-changee-deconnecte : /email-change/done, sans session ;
//   - adresse-lien-refuse : /email-change/done?error=INVALID_TOKEN, sans session.
const changeEmailShot = { newEmail: 'lea.moreau@exemple.fr', password: 'mot-de-passe-de-lea' }
const wrongPasswordShot = 'pas-le-bon-mot-de-passe'
// Tranche R2 : le lien « nouveau mot de passe » (un jeton accepté, un refusé) et l'adresse qui
// attend sa vérification. « Vérifie ta boîte mail » ne lit plus l'adresse dans l'URL (jur-9) :
// `pendingEmail` la pose dans le sessionStorage de l'onglet, comme l'inscription, puis recharge.
const resetTokenShot = 'tok-7f3c9a-valide' // gitleaks:allow
const refusedResetToken = 'tok-7f3c9a-refuse' // gitleaks:allow
const pendingEmail = (email) => async (page) => {
  await page.evaluate((value) => sessionStorage.setItem('waiggle.pendingEmail', value), email)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText(email, { exact: false }).first().waitFor()
}
const emailOf = { current: leaMe.email, changed: changeEmailShot.newEmail }
// R7a : les mises à jour, qui remplacent les notes du Journal, de la plus récente à la plus
// ancienne. Une mise à jour, pour l'API simulée : son numéro, ce qu'elle dit, et le jour (d'octobre
// 2026) de sa publication. Des titres et des familles variés : avec ou sans titre, avec ou sans
// version, une avec deux photos en avant / après.
const update = (
  n,
  { title = null, version = null, lines, photos = [], beforeAfter = false },
  day,
) => ({
  id: `5e6f7a8b-9c0d-4e1f-8a2b-0000000000${String(n).padStart(2, '0')}`,
  title,
  version,
  lines,
  photos,
  beforeAfter,
  createdAt: new Date(Date.UTC(2026, 9, day, 9)).toISOString(),
  // Le retrait par la modération (tranche 7a) : aucun par défaut.
  removal: null,
})
const line = (family, text) => ({ family, text })
/** Le champ de la n-ième ligne (depuis 1) de la feuille « Nouvelle mise à jour » : « Changement 2 sur 3, … ». */
const updateLine = (page, n) => page.getByLabel(new RegExp(`^Changement ${n} sur `))
/**
 * Une image PNG d'une seule couleur, fabriquée ici même (sans fichier ni dépendance) : une signature
 * puis des « morceaux » (en-tête, pixels compressés, fin), chacun avec sa somme de contrôle CRC.
 * Elle sert à choisir une vraie photo dans la feuille, que l'appli réduit avant de l'envoyer.
 */
const png = (width, height, [r, g, b]) => {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bits par couleur, en RVB, sans entrelacement
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)])
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3)
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
/** La version courte d'une mise à jour, comme sur une carte du fil (`UpdateSummary`). */
const summaryOfUpdate = ({ id, createdAt, version, lines }) => ({
  id,
  at: createdAt,
  version,
  firstLine: lines[0],
  lineCount: lines.length,
})
const recipesUpdates = [
  update(
    3,
    {
      title: 'Le mode hors ligne',
      version: 'v1.2',
      lines: [
        line('new', 'Les recettes se lisent même sans réseau, au fond du jardin'),
        line('fixed', 'Le minuteur ne s’arrête plus quand l’écran se met en veille'),
        line('polish', 'Des photos de plats plus grandes'),
      ],
      photos: [
        photo('5e6f7a8b-0000-4000-8000-0000000000a1', 1600, 900, 'Le frigo, avant la recette'),
        photo('5e6f7a8b-0000-4000-8000-0000000000a2', 1600, 900, 'La tarte aux pommes proposée'),
      ],
      beforeAfter: true,
    },
    18,
  ),
  update(2, { version: 'v1.1', lines: [line('new', 'Un dessert quand il reste des fruits')] }, 15),
  update(
    1,
    {
      title: 'Première version en ligne',
      lines: [line('new', 'Photographie ton frigo, il te dit quoi cuisiner')],
    },
    12,
  ),
]
// Le projet de Léa, vu par elle-même : la section « Les mises à jour », la corbeille sur chacune,
// et « 4 testeurs » à côté de ses abonnés (le nombre, pour elle seule).
const recipesShown = {
  ...recipesProject,
  latestUpdate: recipesUpdates[0],
  updateCount: 3,
  version: 'v1.2',
  // Le même nombre que le coin de ce projet (`testerCornersAtStart`) : 12 testeurs.
  testerCount: 12,
}
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
      inCatalogue: false,
    },
    { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
  ],
  latestUpdate: update(
    5,
    {
      title: 'Un très long titre de mise à jour, pour voir où il se coupe bien'.slice(0, 60),
      version: 'v2026.10.17-beta.12',
      lines: [
        line('new', longNote.slice(0, 120)),
        line('fixed', urlNote.slice(0, 120)),
        line('polish', longNote.slice(120, 240)),
        line('new', longNote.slice(240, 360)),
        line('fixed', longNote.slice(360, 480)),
      ],
    },
    17,
  ),
  updateCount: 2,
  version: 'v2026.10.17-beta.12',
}
// Le projet d'un autre membre (Max) : le bouton « Suivre ce projet », son journal (sans
// « Supprimer »), et, ouvert en modification, l'état « Ce projet n'est pas à toi ».
const notMineProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000aa',
  author: { id: 'max-id', name: 'Max Durand', avatarUrl: null },
  isMine: false,
  followerCount: 2,
  latestUpdate: recipesUpdates[1],
  updateCount: 2,
  version: 'v1.1',
}
// Un autre projet de Max, très commenté (tranche 5) : les fils, leurs réponses, les emplacements.
const commentedProject = {
  ...notMineProject,
  id: '00000000-0000-4000-8000-0000000000cc',
  title: 'Le chef des restes',
  pitch: 'Il transforme les restes de la semaine en trois menus.',
  followerCount: 5,
}
// Le même projet, avec ses photos, sous un autre identifiant : on photographie les deux pages.
const photosProject = { ...projectWithPhotos, id: '7c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' }
// La page de Léa, vue par elle-même (avec son brouillon privé), et la page d'une étiquette.
const leaMember = {
  ...leaPage,
  id: leaMe.id,
  name: leaMe.name,
  handle: leaMe.handle,
  isMe: true,
  projects: [summaryOf(photosProject), summaryOf(draftProject), summaryOf(recipesProject)],
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
// quand elle ne suit personne. Chaque page choisit (feed: 'nobody' dans la liste plus bas), et
// ce choix est donné à sa propre API simulée (fakeApi), jamais rangé dans une variable commune :
// trois pages photographiées en même temps ne doivent pas se le voler.
// Les projets des personnes que Léa suit (Max, Inès) : on ne se suit pas soi-même.
const max = { id: 'max-id', name: 'Max Durand', avatarUrl: null }
const ines = { id: 'ines-id', name: 'Inès Haddad', avatarUrl: null }
const fromOthers = [
  {
    ...photosProject,
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    author: max,
    title: 'Le tri des photos de vacances',
    // Son propre pitch : sans lui, il hériterait de celui de l'agent de recettes (le frigo).
    pitch: 'Il garde les meilleures photos de chaque journée et range le reste.',
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
// R4 : le total des réactions de chaque carte (« ✦ 49 »), varié : un grand, aucun (la carte ne
// montre alors rien), un petit, un moyen.
const feedTotals = [49, 0, 3, 12]
const feedItems = fromOthers.map((p, i) => ({
  kind: 'project',
  at: new Date(Date.UTC(2026, 9, 19 - i, 9)).toISOString(),
  project: { ...summaryOf(p), reactionTotal: feedTotals[i] ?? 0 },
}))
// Explorer (R6b), « Récents » : le fil des autres, plus un projet rangé dans « Animaux », pour que
// le filtre `/explore?category=animals` montre une carte. Seul « Découvrir » le reçoit : le fil des
// abonnements et ses captures restent tels quels.
// R7a, des-A2 : la première carte de « Récents » (49 réactions, la plus chargée) porte une mise à
// jour de six jours (l'horloge des captures est au 20/10/2026) : le repère « Mis à jour » se voit sur
// la page `explorer`, avec le statut et le total dans la même rangée.
const recentUpdate = summaryOfUpdate(
  update(20, { version: 'v1.3', lines: [line('new', 'Un nouvel écran de réglages')] }, 14),
)
const discoverItems = [
  ...feedItems.map((item, i) =>
    i === 0 ? { ...item, project: { ...item.project, latestUpdate: recentUpdate } } : item,
  ),
  {
    kind: 'project',
    at: new Date(Date.UTC(2026, 9, 14, 9)).toISOString(),
    project: {
      ...summaryOf(recipesProject),
      id: '1a2b3c4d-0000-4000-8000-000000000005',
      author: ines,
      title: 'Le carnet des croquettes',
      pitch: 'Il note les repas du chat et prévient quand le sac est presque vide.',
      status: 'testable',
      primaryCategory: 'animals',
      secondaryCategory: null,
      reactionTotal: 7,
    },
  },
]
/** « Récents » filtré par une catégorie (`?category=`), principale ou secondaire, comme l'API. */
const discoverOf = (category) =>
  category
    ? discoverItems.filter(
        ({ project }) =>
          project.primaryCategory === category || project.secondaryCategory === category,
      )
    : discoverItems
// Explorer (R3), « Ils cherchent des testeurs » : la première page du fil « Découvrir » filtré
// (?testers=true), des projets testables qui ont tous une démo (`demoUrl`, que le résumé porte
// depuis R3), de plusieurs membres et aux titres variés, assez pour que le carrousel dépasse.
const testerItems = [
  ['Quel papillon ?', max, 'https://papillons.example.org'],
  ['Décollage !', ines, 'https://decollage.example.com'],
  [
    'Carnet de cafés',
    { id: 'sam-id', name: 'Sam Petit', avatarUrl: null },
    'https://cafes.example.com',
  ],
  ['Le journal de Chelsea', max, 'https://chelsea.example.org'],
  ['Le quiz des capitales', ines, 'https://quiz.example.org'],
  ['Mon agent de recettes', ines, 'https://recettes.example.com'],
].map(([title, author, demoUrl], i) => ({
  kind: 'project',
  at: new Date(Date.UTC(2026, 9, 18 - i, 9)).toISOString(),
  project: {
    ...summaryOf({
      ...(i % 2 === 0 ? photosProject : recipesProject),
      id: `5e6f7a8b-0000-4000-8000-00000000000${i + 1}`,
      title,
      author,
      status: 'testable',
    }),
    demoUrl,
    // R4 : des totaux variés, dont 0.
    reactionTotal: [7, 0, 23, 2, 0, 5][i] ?? 0,
  },
}))
// La page de Max, vue par Léa qui ne le suit pas encore.
const maxMember = {
  ...leaPage,
  id: max.id,
  name: max.name,
  // Son propre pseudo : sans lui, il hériterait de celui de Léa (leaPage).
  handle: 'max_durand',
  bio: 'Je fais des outils pour ma famille.',
  isMe: false,
  isFollowed: false,
  followerCount: 12,
  projects: feedItems
    .filter((item) => item.project.author.id === max.id)
    .map((item) => item.project),
}
// R5a : Inès, l'autrice du projet de la galerie (launchProject). Sans sa page, la lecture de
// l'auteur échoue et la page projet cache « Suivre » (décision du 2/11) : la capture le perdrait.
const inesMember = {
  ...leaPage,
  id: ines.id,
  name: ines.name,
  avatarUrl: ines.avatarUrl,
  handle: 'ines_haddad',
  bio: 'Je lance des petits outils pour l’association.',
  isMe: false,
  isFollowed: false,
  followerCount: 7,
  projects: [],
}
// Tranche 7c : deux membres que la modération connaît. Sam (celui de la file, testing/moderation.ts)
// peut être suspendu ; Karim l'est déjà, 7 jours après un signalement.
const samPage = {
  ...leaPage,
  id: samMember.id,
  name: samMember.name,
  handle: samMember.handle,
  bio: 'Je teste des robots de messagerie.',
  favoriteTools: [{ label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true }],
  isMe: false,
  isFollowed: false,
  followerCount: 1,
  projects: [],
}
const karim = { id: 'karim-id', name: 'Karim Benali', avatarUrl: null }
const karimPage = {
  ...leaPage,
  id: karim.id,
  name: karim.name,
  handle: 'karim_b',
  bio: 'Des petits jeux faits avec Cursor.',
  favoriteTools: [{ label: 'Cursor', slug: 'cursor', inCatalogue: true }],
  isMe: false,
  isFollowed: false,
  followerCount: 4,
  projects: [],
}
// Ce que la page d'un membre dit à un administrateur seul (`Member.moderation`) ; null pour les
// autres, comme la vraie API. Karim, déjà suspendu, ne peut pas l'être de nouveau : on lève.
const moderationOf = {
  [samMember.id]: { isAdmin: false, suspension: null, decisions: 3, canSuspend: true },
  [karim.id]: { isAdmin: false, suspension: sevenDaySuspension, decisions: 2, canSuspend: false },
}
const moderatedPage = (page, admin) => ({
  ...page,
  moderation: admin ? (moderationOf[page.id] ?? null) : null,
})
// Le fil « Abonnements » (R7a) : la carte d'un projet suivi remonte à la date de sa mise à jour,
// avec « Mis à jour · v2 », sa première ligne et « et 2 autres changements » (le tri des photos,
// tout en haut) ; une autre plus bas, sans version ni autre ligne. « Découvrir » garde l'ordre de
// publication.
const updateItem = (project, n, content, day) => {
  const raised = {
    ...update(n, content, day),
    createdAt: new Date(Date.UTC(2026, 9, day, 12)).toISOString(),
  }
  const summary = summaryOfUpdate(raised)
  return {
    kind: 'update',
    at: raised.createdAt,
    update: summary,
    project: {
      ...summaryOf(project),
      reactionTotal: feedTotals[fromOthers.indexOf(project)] ?? 0,
      latestUpdate: summary,
      version: raised.version,
    },
  }
}
const photosUpdate = {
  version: 'v2',
  lines: [
    line('new', 'Il reconnaît maintenant les visages de profil'),
    line('fixed', 'Les photos de nuit ne sont plus rangées à part'),
    line('polish', 'Des albums aux couleurs du lieu'),
  ],
}
// Un projet ne paraît qu'une fois dans ce fil (l'API en rend un seul élément par projet, avec sa
// dernière activité) : les deux projets mis à jour prennent la place de leur carte de publication.
const followingItems = [
  updateItem(fromOthers[0], 6, photosUpdate, 19),
  updateItem(
    fromOthers[1],
    7,
    { title: 'Moins de clics', lines: [line('polish', longNote.slice(0, 120))] },
    17,
  ),
  ...feedItems.slice(2),
]
// R4, « Proches à suivre » (GET /v1/suggestions/members) : cinq membres qui ont publié
// récemment, du plus récent au plus ancien, chacun avec son dernier projet public (résumé complet,
// total compris). Jamais Léa, ni Max et Inès qu'elle suit dans le fil : la même liste sert au
// premier lancement (feed: 'nobody') et à la colonne de droite sur ordinateur. Des noms de
// longueurs variées (le plus long éprouve la ligne), une photo de couverture sur deux projets,
// des statuts et des totaux variés (dont 0).
const suggestedOf = (author, id, title, pitch, extra) => ({
  ...author,
  latestProject: {
    ...summaryOf(recipesProject),
    id,
    author,
    title,
    pitch,
    createdAt: new Date(Date.UTC(2026, 9, extra.day, 10)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, extra.day, 10)).toISOString(),
    ...extra.fields,
  },
})
const suggestedMembers = [
  suggestedOf(
    { id: 'camille-id', name: 'Camille Roux', avatarUrl: null },
    '5a6b7c8d-0000-4000-8000-000000000001',
    'Le carnet de jardin',
    'Il note les semis et prévient quand arroser.',
    {
      day: 20,
      fields: { status: 'testable', reactionTotal: 8, cover: summaryOf(photosProject).cover },
    },
  ),
  suggestedOf(
    { id: 'yanis-id', name: 'Yanis', avatarUrl: null },
    '5a6b7c8d-0000-4000-8000-000000000002',
    'Quiz de géographie',
    'Des questions sur les capitales, adaptées à ton niveau.',
    { day: 19, fields: { status: 'building', reactionTotal: 0 } },
  ),
  suggestedOf(
    { id: 'sofia-id', name: 'Sofia Lopes-Carvalho Almeida', avatarUrl: null },
    '5a6b7c8d-0000-4000-8000-000000000003',
    'Lecteur de factures',
    'Il range les factures du mois et prépare le tableau des dépenses.',
    { day: 18, fields: { status: 'idea', reactionTotal: 21 } },
  ),
  suggestedOf(
    { id: 'hugo-id', name: 'Hugo Petit', avatarUrl: null },
    '5a6b7c8d-0000-4000-8000-000000000004',
    'Histoires du soir',
    'Une histoire courte inventée avec les enfants, chaque soir.',
    {
      day: 16,
      fields: { status: 'testable', reactionTotal: 3, cover: projectWithPhotos.visuals[2] ?? null },
    },
  ),
  suggestedOf(
    { id: 'amina-id', name: 'Amina Diallo', avatarUrl: null },
    '5a6b7c8d-0000-4000-8000-000000000005',
    'Traducteur de recettes',
    'Il convertit les mesures et traduit les recettes de famille.',
    { day: 12, fields: { status: 'building', reactionTotal: 1 } },
  ),
]
// La page complète du projet de chaque carte (fil, proches suggérés), par son identifiant, telle
// que GET /v1/projects/:id la rend : jamais à Léa (`isMine: false`). Un projet suggéré reprend le
// projet de recettes, avec le titre, l'auteur, le statut et la photo de sa carte.
const cardProjects = new Map([
  ...fromOthers.map((project) => [project.id, { ...project, isMine: false }]),
  ...suggestedMembers.map(({ latestProject: { cover, reactionTotal, ...summary } }) => [
    summary.id,
    { ...recipesProject, ...summary, isMine: false, visuals: cover ? [cover] : [] },
  ]),
  // Les cartes d'« Ils cherchent des testeurs » (Explorer) : sans leur page, la carte menait à
  // « Ce projet est introuvable » (relecture design de RF, point 7). Même façon que les suggestions :
  // le projet de recettes, avec le titre, l'auteur, la démo et la photo de la carte.
  ...testerItems.map(({ project: { cover, reactionTotal, ...summary } }) => [
    summary.id,
    { ...recipesProject, ...summary, isMine: false, visuals: cover ? [cover] : [] },
  ]),
])
// R4, « Tu es à jour » : `lastReadAt` est la date retenue par le serveur, celle du premier élément
// affiché à la lecture précédente (l'horloge des captures est figée au 20/10/2026, 12 h à Paris).
// L'appli pose la sphère avant le premier élément daté de cette date ou d'avant. Selon la page :
// - feed: 'read-midway' (page « fil ») : lu jusqu'au 18/10 ; la note et le projet du 19 sont
//   nouveaux, la sphère tombe au milieu, puis les éléments déjà vus ;
// - feed: 'read-all' (page « fil-a-jour ») : lu jusqu'au plus récent ; rien de nouveau, la sphère
//   est en tête du fil ;
// - sans choix : le premier passage (jamais lu, `lastReadAt` null) ; le fil a une suite, la
//   sphère n'apparaît pas ;
// - feed: 'end' : premier passage sur un fil qui tient en une page ; la sphère est à la fin
//   (« Tu as tout vu. », jur-J1).
const lastReadOf = {
  'read-midway': feedItems[1]?.at ?? null,
  'read-all': followingItems[0]?.at ?? null,
}
const followingFeed = (feed) =>
  feed === 'nobody'
    ? { items: [], nextCursor: null, followsAnyone: false, lastReadAt: null }
    : {
        items: followingItems,
        nextCursor: feed === 'end' ? null : 'suite',
        followsAnyone: true,
        lastReadAt: lastReadOf[feed] ?? null,
      }

// Les réactions et les commentaires (tranche 5). Un commentaire, pour l'API simulée : son
// identifiant (un numéro), son auteur (null : un emplacement), son texte, le jour et l'heure
// (d'octobre 2026) de sa publication, et le reste au choix (state, isMine, editedAt, replies).
const lea = { id: leaMe.id, name: leaMe.name, avatarUrl: null }
// R5b : l'auteur d'un commentaire porte son pseudo actuel (`handle` du contrat, `null` sous un
// blocage) : « Répondre » sous une réponse commence le champ par sa mention.
const hugo = { id: 'hugo-id', name: 'Hugo Lefèvre', avatarUrl: null }
const jean = { id: 'jean-id', name: 'Papi Jean', avatarUrl: null }
const handleOf = {
  [leaMe.id]: leaMe.handle,
  [max.id]: 'max_durand',
  [ines.id]: 'ines_haddad',
  [hugo.id]: 'hugo_lefevre',
  [jean.id]: 'papi_jean',
}
const comment = (n, author, body, day, hour, fields = {}) => ({
  id: `5e6f7081-92a3-4b4c-8d5e-${String(n).padStart(12, '0')}`,
  // R7b : isTester est obligatoire dans l'auteur d'un commentaire (badge « Testeur »).
  author: author && { ...author, handle: handleOf[author.id] ?? null, isTester: false },
  body: author ? body : '',
  createdAt: new Date(Date.UTC(2026, 9, day, hour)).toISOString(),
  editedAt: null,
  state: 'visible',
  isMine: author?.id === leaMe.id,
  // Les membres mentionnés (tranche 6b) : aucun par défaut.
  mentions: [],
  // Le retrait par la modération (tranche 7a), rempli pour son auteur seul : aucun par défaut.
  removal: null,
  replies: [],
  ...fields,
})
// Sur le projet de Léa, vue par elle-même : elle masque le commentaire d'un autre (et peut le
// démasquer), et supprime ou modifie les siens.
const recipesComments = [
  comment(1, max, 'Super idée, je teste ce soir avec ce qu’il reste dans le frigo.', 18, 9, {
    replies: [
      comment(2, ines, 'Moi aussi, dis-nous comment ça se passe !', 18, 10),
      comment(3, lea, 'Merci à vous deux, j’ajoute les desserts la semaine prochaine.', 18, 12),
    ],
  }),
  comment(4, ines, 'Viens plutôt voir mon projet, il fait la même chose en mieux !', 17, 9, {
    state: 'hidden',
  }),
  comment(5, max, 'Il sait tenir compte des allergies ?', 16, 9),
]
// Sur le projet de Max, vue par Léa : un fil avec ses réponses (dont la sienne, modifiée), son
// commentaire masqué par Max (elle le lit encore, avec le bandeau), un commentaire supprimé et un
// masqué (des emplacements, gardés pour leurs réponses), puis « Afficher la suite ».
const notMineComments = [
  comment(
    11,
    ines,
    'Testé avec les restes de raclette : trois idées, dont une soupe. Bluffant.',
    18,
    9,
    {
      replies: [
        comment(12, max, 'Merci ! La soupe, c’est aussi ma préférée.', 18, 11),
        comment(13, lea, 'Je confirme, testée hier soir.', 18, 20, {
          editedAt: new Date(Date.UTC(2026, 9, 18, 21)).toISOString(),
        }),
      ],
    },
  ),
  comment(14, lea, 'Petite pub : mon tri des photos fait pareil pour les albums !', 17, 9, {
    state: 'hidden',
  }),
  comment(15, null, '', 16, 9, {
    state: 'deleted',
    replies: [comment(16, ines, 'Oui, il gère aussi les allergies.', 16, 10)],
  }),
  comment(17, null, '', 15, 9, {
    state: 'hidden',
    replies: [comment(18, max, 'Merci pour le retour, je regarde ça.', 15, 12)],
  }),
  // Deux mentions : celle de Max, rendue par l'API (un lien), et un pseudo inconnu (du texte).
  comment(
    19,
    ines,
    'Ça marche avec un frigo presque vide ? @max_durand, @paul_inconnu, vous avez essayé ?',
    14,
    9,
    {
      mentions: [{ handle: 'max_durand', memberId: max.id, name: max.name }],
    },
  ),
]
const notMineMore = [comment(20, ines, 'Première version testée : bravo pour l’interface.', 12, 9)]
// Sur le projet aux contenus très longs : un commentaire de 1 000 caractères, une adresse sans
// espace en réponse.
const longComments = [
  comment(21, max, longNote, 17, 9, {
    replies: [comment(22, ines, urlNote, 17, 10)],
  }),
]
// Les membres qu'on peut mentionner (tranche 6b), tels que GET /v1/members/mentionable les rend.
const mentionable = [
  { id: ines.id, name: ines.name, handle: 'ines_haddad', avatarUrl: null },
  { id: 'iniko-id', name: 'Iniko Diallo', handle: 'iniko', avatarUrl: null },
  { id: max.id, name: max.name, handle: 'max_durand', avatarUrl: null },
  // R5b : « @Lé » trouve Hugo Lefèvre par un mot de son nom (planche `R5b-Repondre`).
  { id: hugo.id, name: hugo.name, handle: handleOf[hugo.id], avatarUrl: null },
  { id: jean.id, name: jean.name, handle: handleOf[jean.id], avatarUrl: null },
]
// Tranche 7a : le projet « Avis express » de Léa, retiré après un signalement, au nom des règles.
// Elle seule le voit encore : le bandeau en tête, avec l'explication et l'adresse pour contester.
const removedProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000dd',
  title: 'Avis express',
  pitch: 'Il rédige des avis cinq étoiles pour les boutiques de ses amis.',
  removal: { ...removalAfterReport, explanation: 'Écrire de faux avis n’est pas permis ici.' },
  latestUpdate: {
    ...update(
      8,
      {
        title: 'Les avis automatiques',
        version: 'v2',
        lines: [line('new', 'Il publie les avis tout seul, sur plusieurs sites à la fois')],
      },
      19,
    ),
    removal: { ...removalByLaw, explanation: 'Publier de faux avis est une pratique interdite.' },
  },
  updateCount: 2,
  // La version d'une mise à jour retirée ne compte pas : celle d'avant.
  version: 'v1',
}
// R5b (K5) : le même projet retiré, sans aucun commentaire : l'aperçu dit « emptyRemoved », sans
// champ ni bouton (rien ne s'y ajoute).
const removedEmptyProject = {
  ...removedProject,
  id: '00000000-0000-4000-8000-0000000000de',
}
const removedComments = [
  comment(31, lea, 'Écris-moi en privé, je te fais tes avis pour 5 €.', 19, 9, {
    state: 'removed',
    removal: removalAfterReport,
  }),
  comment(32, null, '', 18, 9, {
    state: 'removed',
    replies: [comment(33, ines, 'Je ne suis pas sûre que ce soit une bonne idée…', 18, 11)],
  }),
  comment(34, max, 'Ça marche aussi pour les restaurants ?', 17, 9),
]
// Tranche 7b : bloquer. Léa a bloqué Sam et Théo (sa liste « Membres bloqués », du plus récent au
// plus ancien) ; Nora, elle, a bloqué Léa : pour Léa, la page de Nora n'existe pas (404, la même
// réponse qu'un membre inconnu). Max ne l'est pas encore : sa page sert au menu et au dialogue.
const blockedTheo = {
  member: { id: 'theo-id', name: 'Théo Garnier', handle: 'theo_g', avatarUrl: null },
  blockedAt: new Date(Date.UTC(2026, 9, 12, 18)).toISOString(),
}
const blockedList = [blockedSam, blockedTheo]
const blockedByNora = 'nora-id'
// La page d'un membre que Léa a bloqué : l'en-tête seul (ni bio, ni outils, ni projets, ni
// abonnés), comme la vraie API (règle 6 de la relecture du plan).
const blockedMemberPage = ({ member }) => ({
  ...leaPage,
  ...member,
  bio: '',
  favoriteTools: [],
  isMe: false,
  isBlocked: true,
  isFollowed: false,
  followerCount: 0,
  projects: [],
})
// Un projet de Max où un blocage remplace deux commentaires par leur emplacement, gardé pour ses
// réponses : celui de Sam, que Léa a bloqué (« Commentaire d'un membre que tu as bloqué »), et
// celui de Nora, qui a bloqué Léa (« Commentaire indisponible »). Les autres commentaires restent.
const gardenProject = {
  ...notMineProject,
  id: '00000000-0000-4000-8000-0000000000ee',
  title: 'Le carnet du potager',
  pitch: 'Il note les semis, la météo et les récoltes, et rappelle quand arroser.',
  followerCount: 8,
}
// Tranche R5a, la page projet : un projet d'Inès à trois photos (la galerie, « 1 sur 3 ») et trois
// prompts (« Le prompt de départ », puis « Les autres prompts · 2 »). Le troisième contient un lien :
// il porte le repère « À lire avant de l'utiliser » quand on déplie les autres. Ses photos ont leurs
// propres identifiants, donc leurs propres couleurs (sampleImage).
const launchProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000f1',
  author: ines,
  isMine: false,
  title: 'Décollage !',
  pitch: 'Un coach qui prépare ton premier 10 km, semaine après semaine.',
  status: 'testable',
  demoUrl: 'https://decollage.example.org',
  followerCount: 12,
  visuals: [
    photo('a5e1c2d3-0000-4000-8000-0000000000f1'),
    photo('5e2b3c4d-0000-4000-8000-0000000000f2', 1200, 1600),
    photo('c83d4e5f-0000-4000-8000-0000000000f3'),
  ],
  prompts: [
    'Tu es un coach de course à pied. À partir de mes trois dernières sorties (distance, temps, ressenti), propose-moi un plan de 4 semaines pour courir 10 km en moins d’une heure. Pose-moi d’abord deux questions si une information te manque.',
    'Transforme ce plan en tableau : une ligne par séance, avec le jour, la durée, l’allure visée et un conseil court.',
    'Lis https://www.example.org/conseils-10-km et résume les cinq conseils les plus utiles pour un débutant, en une phrase chacun.',
  ],
  latestUpdate: recipesUpdates[2],
  updateCount: 1,
}
// Tranche R6a, la feuille de modification (planches `R6-Modifier`, `R6-Publier-Suite`) : un projet
// de Léa à trois photos décrites, deux catégories, « Commencé en » et « Facile à refaire ? », et un
// prompt de départ où traîne une clé d'API (l'encadré « Clé : … » et « Retirer la clé »). La clé
// est écrite en morceaux : un faux, mais à la forme connue, que l'analyse des secrets de GitHub
// prendrait pour un vrai si elle était d'un seul tenant.
const fakeApiKey = ['sk', '-proj-', 'Qm7Lr2Xv9TkB4sWn8JcY', '3pHd6FaZ1uE5gNoa91f'].join('')
const skyProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000e1',
  title: 'Le ciel de ce soir',
  pitch: 'Les planètes et les constellations visibles ce soir, depuis ton jardin.',
  description:
    'Il lit la météo et la position des planètes, puis dit quoi regarder et à quelle heure.\n\n- **Jupiter** au sud-est\n- la *Grande Ourse* au nord',
  status: 'building',
  visibility: 'public',
  demoUrl: 'https://ciel-du-soir.fr',
  tools: [
    { label: 'Claude', slug: 'claude', inCatalogue: true },
    { label: 'Stellarium', slug: 'stellarium', inCatalogue: true },
  ],
  primaryCategory: 'science',
  secondaryCategory: 'learning',
  difficulty: 'medium',
  startedOn: '2026-03',
  visuals: [
    photo(
      'e1a2b3c4-0000-4000-8000-0000000000e1',
      1600,
      900,
      'La Lune au-dessus du toit, en croissant.',
    ),
    photo(
      'e2b3c4d5-0000-4000-8000-0000000000e2',
      1200,
      1600,
      'Jupiter et ses quatre lunes, vues à la lunette.',
    ),
    photo(
      'e3c4d5e6-0000-4000-8000-0000000000e3',
      1600,
      1200,
      'L’écran du projet : la carte du ciel à 22 h.',
    ),
  ],
  portraitCover: null,
  prompts: [
    `Tu es un guide d’astronomie pour débutants. Avec la météo de ma ville et l’heure, dis-moi les trois choses à regarder ce soir. Ma clé pour l’API météo : ${fakeApiKey}`,
    'Explique en deux phrases pourquoi Jupiter brille plus que les étoiles.',
  ],
  followerCount: 4,
}
// Un projet de Léa publié avant R6a, jamais modifié depuis : sans catégorie (la ligne « Catégorie »
// dit « Choisis une catégorie »), sans mois ni difficulté.
const oldProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000e2',
  title: 'Mon tri de factures',
  pitch: 'Il range les factures du mois par fournisseur et prépare le récapitulatif.',
  status: 'done',
  tools: [{ label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true }],
  primaryCategory: null,
  secondaryCategory: null,
  difficulty: null,
  startedOn: null,
  visuals: [],
  portraitCover: null,
  prompts: [],
}
// Tranche R3 : Explorer et la recherche par mots, d'après les planches `R3-Explorer` et
// `R3-Recherche`. R6b : le catalogue normé (GET /v1/tools, planche `R3-Outils`), du plus utilisé
// au moins utilisé : « Outils populaires » et « Les plus utilisés » en prennent les premiers, « De A
// à Z » les retrie par nom. Toutes les familles, des autres noms (alias), un outil sans projet
// (Zapier), et Lovable à 60 projets pour « Afficher la suite » sur sa page.
const catalogueTools = [
  { slug: 'claude', name: 'Claude', family: 'assistant', aliases: [], projectCount: 41 },
  { slug: 'lovable', name: 'Lovable', family: 'no-code', aliases: [], projectCount: 60 },
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    family: 'assistant',
    aliases: ['Chat GPT'],
    projectCount: 38,
  },
  { slug: 'python', name: 'Python', family: 'development', aliases: [], projectCount: 22 },
  { slug: 'mistral', name: 'Mistral', family: 'assistant', aliases: ['Le Chat'], projectCount: 12 },
  { slug: 'midjourney', name: 'Midjourney', family: 'creation', aliases: [], projectCount: 10 },
  {
    slug: 'home-assistant',
    name: 'Home Assistant',
    family: 'smart-home',
    aliases: ['HASS'],
    projectCount: 9,
  },
  { slug: 'notion', name: 'Notion', family: 'no-code', aliases: [], projectCount: 7 },
  { slug: 'glide', name: 'Glide', family: 'no-code', aliases: [], projectCount: 6 },
  { slug: 'make', name: 'Make', family: 'automation', aliases: ['Make.com'], projectCount: 4 },
  { slug: 'cursor', name: 'Cursor', family: 'development', aliases: [], projectCount: 5 },
  { slug: 'arduino', name: 'Arduino', family: 'hardware', aliases: [], projectCount: 3 },
  { slug: 'claude-code', name: 'Claude Code', family: 'development', aliases: [], projectCount: 2 },
  { slug: 'zapier', name: 'Zapier', family: 'automation', aliases: [], projectCount: 0 },
].sort((a, b) => b.projectCount - a.projectCount)
// Les « Autre » des projets visibles (« Pas encore dans le catalogue ») : deux noms tapés par des
// membres, en texte simple.
const otherTools = [{ name: 'Teachable Machine' }, { name: 'Ma boîte à musique' }]
const toolList = { tools: catalogueTools, others: otherTools }
// La recherche « carn » (GET /v1/search?q=carn) : deux projets (celui de Léa, testable, trouvé par
// son titre ; celui de Tante Odile, trouvé dans sa description, avec l'extrait), un membre et un
// outil. Les planches nomment Léa « Léa Moreau » ; son identifiant reste le sien (pas de pastille
// « Suivre » sur ses propres projets).
const odile = { id: 'odile-id', name: 'Tante Odile', avatarUrl: null }
const coffeeProject = {
  ...summaryOf(recipesProject),
  id: '1a2b3c4d-0000-4000-8000-000000000011',
  author: { ...lea, name: 'Léa Moreau' },
  title: 'Carnet de cafés',
  pitch: 'Chaque café goûté, noté et comparé.',
  status: 'testable',
  tools: [{ label: 'Notion', slug: 'notion', inCatalogue: true }],
  excerpt: null,
}
const biscotteProject = {
  ...summaryOf(recipesProject),
  id: '1a2b3c4d-0000-4000-8000-000000000012',
  author: odile,
  title: 'Biscotte au parc',
  pitch: 'Où promener le chien selon la météo.',
  status: 'building',
  primaryCategory: 'animals',
  secondaryCategory: null,
  tools: [{ label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true }],
  excerpt: '… Le carnet de balades de Biscotte, mis à jour chaque dimanche après la promenade …',
}
const camille = {
  id: 'camille-id',
  name: 'Camille Carnot',
  handle: 'camille_carnot',
  avatarUrl: null,
  followerCount: 12,
}
const searchResultsOf = {
  carn: {
    projects: { items: [coffeeProject, biscotteProject], more: false },
    members: { items: [camille], more: false },
    tools: { items: [catalogueTools.find((t) => t.slug === 'notion')], more: false },
  },
}
// R6b : la page d'un outil (GET /v1/tags/{slug}, planches `R6-Outil` et `R6-Outil-Desktop`). Les
// projets de Lovable : 60, de quatre membres (pas Léa), aux titres, statuts et catégories variés, du
// plus récent au plus ancien ; 50 par page, puis « Afficher la suite ». Un projet est classé
// « Autre » et cite un autre outil (« Teachable Machine », pas encore au catalogue).
const toolDescriptions = {
  claude: 'Un assistant qui répond, résume et écrit à partir de ce qu’on lui demande.',
  lovable: 'Construit une application web à partir d’une description écrite.',
  chatgpt: 'Un assistant conversationnel qui répond, rédige et explique.',
  python: 'Un langage de programmation répandu, pour les scripts comme les applications.',
  'home-assistant': 'Pilote les objets connectés de la maison depuis un seul endroit.',
  // La capture `etiquette` (relectures de R6b) : une description et un site, comme au catalogue.
  'claude-code':
    'Assistant de programmation qui travaille dans le terminal, sur le code d’un projet.',
}
const toolSites = {
  lovable: 'https://lovable.dev/',
  'claude-code': 'https://claude.com/product/claude-code',
  python: 'https://www.python.org/',
  'home-assistant': 'https://www.home-assistant.io/',
}
// Les anciennes adresses d'étiquettes rattachées au catalogue (`/tags/chat-gpt` → `/tags/chatgpt`).
const toolRedirects = { 'chat-gpt': 'chatgpt', hass: 'home-assistant' }
const toolTitles = [
  'Le potager qui s’arrose seul',
  'Quiz des capitales',
  'Carnet de randonnées',
  'Le budget des vacances',
  'Mon herbier numérique',
  'Les devoirs de Jules',
  'Agenda du club de foot',
  'Recettes de grand-mère',
  'Le traducteur de menus',
  'Suivi des croquettes',
  'La playlist du dimanche',
  'Mes plantes et la météo',
]
const toolStatuses = ['testable', 'done', 'building', 'testable', 'idea']
const toolCategories = [
  ['cooking', null],
  ['home-garden', 'science'],
  ['animals', null],
  ['learning', 'family'],
  ['games', null],
  ['travel', 'money'],
]
const toolAuthors = [ines, max, odile, hugo]
const toolProjectOf = (slug, index) => {
  const [primaryCategory, secondaryCategory] = toolCategories[index % toolCategories.length]
  const round = Math.floor(index / toolTitles.length)
  const title = toolTitles[index % toolTitles.length]
  return {
    ...summaryOf(recipesProject),
    id: `7b6e5d4c-${String(index).padStart(4, '0')}-4000-8000-${catalogueTools
      .findIndex((t) => t.slug === slug)
      .toString(16)
      .padStart(4, '0')}00000000`,
    author: toolAuthors[index % toolAuthors.length],
    title: round === 0 ? title : `${title} (${round + 1})`,
    status: toolStatuses[index % toolStatuses.length],
    primaryCategory,
    secondaryCategory,
    tools: [
      { label: catalogueTools.find((t) => t.slug === slug)?.name ?? slug, slug, inCatalogue: true },
    ],
  }
}
// Le projet classé « Autre », qui cite aussi un « Autre » (texte simple, sans lien).
const otherCategoryProject = {
  ...summaryOf(recipesProject),
  id: '7b6e5d4c-9999-4000-8000-000000000001',
  author: max,
  title: 'La machine à reconnaître les oiseaux',
  pitch: 'Une caméra au jardin dit quel oiseau passe.',
  status: 'testable',
  primaryCategory: 'other',
  secondaryCategory: null,
  tools: [
    { label: 'Lovable', slug: 'lovable', inCatalogue: true },
    { label: 'Teachable Machine', slug: 'teachable-machine', inCatalogue: false },
  ],
}
/** Tous les projets d'un outil (le plus récent d'abord) ; Lovable : 60, dont celui classé « Autre ». */
const toolProjects = (tool) => {
  const count = Math.min(tool.projectCount, 60)
  const projects = Array.from({ length: count }, (_, index) => toolProjectOf(tool.slug, index))
  if (tool.slug === 'lovable') projects[1] = otherCategoryProject
  return projects
}
/**
 * La réponse de GET /v1/tags/{slug}?status=&category=&cursor= : l'outil, les catégories de ses
 * projets (avec le filtre du statut, sans celui de la catégorie), 50 projets, la page suivante. Un
 * « Autre » ou un nom inconnu : null (404 `not_found`).
 */
const toolPageOf = (requested, params) => {
  const slug = toolRedirects[requested] ?? requested
  const tool = catalogueTools.find((t) => t.slug === slug)
  if (!tool) return null
  const status = params.get('status')
  const category = params.get('category')
  const byStatus = toolProjects(tool).filter((p) => !status || p.status === status)
  const counts = new Map()
  for (const project of byStatus) {
    for (const code of [project.primaryCategory, project.secondaryCategory]) {
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
  }
  const shown = byStatus.filter(
    (p) => !category || p.primaryCategory === category || p.secondaryCategory === category,
  )
  const start = params.get('cursor') === 'page-2' ? 50 : 0
  return {
    tool: {
      slug: tool.slug,
      name: tool.name,
      family: tool.family,
      description: toolDescriptions[tool.slug] ?? null,
      siteUrl: toolSites[tool.slug] ?? null,
      projectCount: tool.projectCount,
    },
    categories: [...counts].map(([code, projectCount]) => ({ code, projectCount })),
    projects: shown.slice(start, start + 50),
    nextCursor: start === 0 && shown.length > 50 ? 'page-2' : null,
  }
}
// Les nombres de GET /v1/categories : vraisemblables, « Autre » compris (un projet à ranger).
const categoryCounts = {
  cooking: 14,
  'home-garden': 11,
  animals: 9,
  learning: 8,
  games: 6,
  travel: 5,
  science: 4,
  family: 4,
  money: 3,
  other: 1,
}
// Aucun résultat (« carnaval ») : les trois groupes, vides.
const emptySearchResults = {
  projects: { items: [], more: false },
  members: { items: [], more: false },
  tools: { items: [], more: false },
}
const gardenComments = [
  comment(41, null, '', 18, 9, {
    state: 'blocked',
    replies: [comment(42, ines, 'Je me posais la même question pour les courgettes.', 18, 10)],
  }),
  comment(43, ines, 'Les semis de tomates ont levé en cinq jours, merci pour le rappel !', 17, 9),
  comment(44, null, '', 16, 9, {
    state: 'unavailable',
    replies: [comment(45, max, 'Bonne idée, je l’ajoute à la prochaine version.', 16, 12)],
  }),
]
// R5b, les commentaires redessinés (planches `R5b-Commentaires`, `R5b-Repondre`, `R5b-Menu-Etats`) :
// un projet de Max, vu par Léa, à 6 commentaires visibles de tous. Dans l'ordre de la feuille : le
// fil d'Inès, qui mentionne Max (la pastille, avec son nom), et la réponse de Max, l'auteur (le
// badge) ; le commentaire de Léa (le fond gris des siens) ; un autre des siens, masqué par Max
// (« Masqué par l'auteur du projet ») ; un supprimé, gardé pour la réponse de Hugo, longue de 14
// lignes (« Lire la suite » après 10) ; un retiré par la modération, gardé pour la réponse d'Inès ;
// celui de Sam, que Léa a bloqué, gardé pour la réponse de Papi Jean. L'aperçu en montre 3 sur
// téléphone (Inès, Max, Léa) et 5 sur ordinateur (puis Hugo et Inès), sans les emplacements.
/**
 * Ouvre les commentaires d'un projet : la feuille sur téléphone, la liste déroulée sur ordinateur.
 * Sur ordinateur, avec 5 commentaires ou moins, il n'y a pas de bouton : le champ est déjà là.
 */
async function openThreads(page) {
  const open = page.getByRole('button', {
    name: /^(Voir les \d+ commentaires|Commenter|Écrire un commentaire)$/,
  })
  // Le champ de la colonne est là avant les commentaires : on attend d'abord le bouton, ou la liste
  // complète (« Répondre »), sinon une machine lente passerait à côté du bouton sans le voir.
  await open
    .or(page.getByRole('button', { name: /^Répondre/ }))
    .first()
    .waitFor()
  if ((await open.count()) > 0) await open.first().click()
  await page.getByRole('combobox', { name: 'Écrire un commentaire' }).waitFor()
}

const threadsProject = {
  ...commentedProject,
  id: '00000000-0000-4000-8000-0000000000c6',
  title: 'Le chef des restes',
  followerCount: 9,
}
const hugoLongReply = [
  'J’ai tout essayé sur une semaine entière, voici mon bilan jour par jour.',
  'Lundi : un gratin de pâtes avec le fond de crème, très réussi.',
  'Mardi : une soupe de fanes de radis, étonnante mais bonne.',
  'Mercredi : il m’a proposé une omelette, j’avais déjà mangé des œufs.',
  'Jeudi : des galettes de riz, les enfants ont adoré.',
  'Vendredi : une salade de lentilles, un peu fade sans citron.',
  'Samedi : une pizza avec les restes de légumes grillés.',
  'Dimanche : un crumble avec les pommes abîmées.',
  'Ce qui marche bien : il tient compte de ce qu’on a vraiment.',
  'Ce qui manque : les quantités, il faut deviner pour quatre.',
  'Il oublie parfois ce qu’on a déjà cuisiné la veille.',
  'Les temps de cuisson sont justes, c’est appréciable.',
  'Je le garde pour la semaine prochaine, avec les desserts.',
  'Merci Max, et vivement la version 2 !',
].join('\n')
const threadsComments = [
  comment(
    51,
    ines,
    'Testé avec les restes de raclette : trois idées, dont une soupe. @max_durand, tu as prévu les desserts ?',
    19,
    9,
    {
      mentions: [{ handle: 'max_durand', memberId: max.id, name: max.name }],
      replies: [
        comment(52, max, 'Pas encore, mais c’est noté pour la version 2 !', 19, 11, {
          editedAt: new Date(Date.UTC(2026, 9, 19, 12)).toISOString(),
        }),
      ],
    },
  ),
  comment(
    53,
    lea,
    'Essayé avec un frigo presque vide : il a quand même trouvé une omelette.',
    18,
    20,
  ),
  comment(54, lea, 'Petite pub : mon tri des photos fait pareil pour les albums !', 18, 9, {
    state: 'hidden',
  }),
  comment(55, null, '', 17, 9, {
    state: 'deleted',
    replies: [comment(56, hugo, hugoLongReply, 17, 18)],
  }),
  comment(57, null, '', 16, 9, {
    state: 'removed',
    replies: [comment(58, ines, 'Je ne suis pas sûre que ce soit une bonne idée…', 16, 11)],
  }),
  comment(59, null, '', 15, 9, {
    state: 'blocked',
    replies: [comment(60, jean, 'Moi, je le fais avec les enfants le dimanche.', 15, 12)],
  }),
]
// Les commentaires de chaque projet : la première page, puis la suite (curseur « suite »).
const commentsOf = {
  [threadsProject.id]: [threadsComments],
  [gardenProject.id]: [gardenComments],
  [removedProject.id]: [removedComments],
  [recipesProject.id]: [recipesComments],
  [commentedProject.id]: [notMineComments, notMineMore],
  [longProject.id]: [longComments],
}
// Les nombres affichés : réactions par type, réactions de Léa, commentaires visibles de tous.
const reactionsOf = {
  [recipesProject.id]: {
    counts: { amazing: 3, inspiring: 1, useful: 6, funny: 0, bravo: 9 },
    mine: [],
  },
  [commentedProject.id]: {
    counts: { amazing: 2, inspiring: 4, useful: 7, funny: 1, bravo: 12 },
    mine: ['useful', 'bravo'],
  },
}
const commentCountOf = {
  [recipesProject.id]: 4,
  [commentedProject.id]: 7,
  [longProject.id]: 2,
  [threadsProject.id]: 6,
}

// L'horloge des captures (relecture design R4, A6) : le mardi 20/10/2026, 12 h à Paris. Chaque
// contexte du navigateur la pose avant sa première page (`installShotClock`), pour les captures,
// `--layout` et `--explore` : les dates relatives (« hier », « dimanche ») sont les mêmes à chaque
// passage, quel que soit le jour où l'on photographie. Ce que l'API simulée date « maintenant » (un
// commentaire envoyé, les notifications) part de la même heure.
// La façon de la poser : un décalage de `Date`, écrit dans chaque page avant son code
// (`addInitScript`). L'heure part du 20/10 à 12 h, puis avance normalement ; les minuteurs, les
// images d'animation et `performance` restent ceux du navigateur. L'horloge de Playwright
// (`clock.install`, puis `clock.setFixedTime`) empêchait le Chromium sans écran de la CI (Linux)
// de prendre les captures du fil (« Unable to capture screenshot », R4), alors qu'elle passait sur
// le PC. Un essai qui doit sauter un délai peut encore poser `page.clock` lui-même.
const SHOT_NOW = Date.parse('2026-10-20T12:00:00+02:00')
const SHOT_TIMEZONE = 'Europe/Paris'
/** Pose l'horloge des captures sur un contexte neuf, avant toute page. */
const installShotClock = (context) =>
  context.addInitScript((now) => {
    const RealDate = Date
    const offset = now - RealDate.now()
    // Une sous-classe de Date : sans argument, « maintenant » décalé ; avec, la date demandée.
    class ShotDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(RealDate.now() + offset)
        else super(...args)
      }
      static now() {
        return RealDate.now() + offset
      }
    }
    globalThis.Date = ShotDate
  }, SHOT_NOW)

// Les notifications de Léa (tranche 6b) : une de chaque sorte, sur ses projets, les deux premières
// nouvelles, puis une suite plus ancienne (« Afficher la suite »). Personne n'est nommé pour les
// réactions et les abonnés. Chaque page choisit (notifications: 'none' : aucune ; 'many' : la
// cloche à « 9+ »), et ce choix est donné à sa propre API simulée, comme le fil.
const hoursAgo = (hours) => new Date(SHOT_NOW - hours * 3_600_000).toISOString()
const dayOf = (iso) => iso.slice(0, 10)
// R8 : la miniature (`cover`), la première photo du projet s'il en a une, sinon null (sa tuile).
const notified = (project) => {
  const first = project.visuals?.[0]
  return {
    id: project.id,
    title: project.title,
    cover: first ? { url: first.url, thumbhash: first.thumbhash } : null,
  }
}
// R8 : le commentaire que « Voir en contexte » trouve (la réponse d'Inès sur le projet de Léa, dans
// recipesComments), et un commentaire disparu (404). Les pages `contexte` et `contexte-parti`
// s'ouvrent sur `/projects/${recipesProject.id}?comment=<l'un ou l'autre>`.
const contextCommentId = '5e6f7081-92a3-4b4c-8d5e-000000000002'
const goneCommentId = '5e6f7081-92a3-4b4c-8d5e-0000000000ff'
// L'identifiant d'un commentaire cité (un UUID, comme l'exige le contrat).
const commentIdOf = (n) => `00000000-0000-4000-8000-0000000006b${n}`
const notificationPages = (choice) => {
  if (choice === 'none') return [[]]
  if (choice === 'updates') {
    return [
      [
        {
          kind: 'project_update',
          id: `project_update:${testedProject.latestUpdate.id}`,
          at: hoursAgo(1),
          isNew: true,
          project: notified(testedProject),
          author: testedProject.author,
          update: {
            id: testedProject.latestUpdate.id,
            title: testedProject.latestUpdate.title,
            version: 'v1.2',
            firstLine: testedProject.latestUpdate.lines[0],
            moreLines: testedProject.latestUpdate.lines.length - 1,
          },
        },
        {
          kind: 'project_update',
          id: 'project_update:5e6f7a8b-9c0d-4e1f-8a2b-000000000009',
          at: hoursAgo(28),
          isNew: false,
          project: notified(fromOthers[1]),
          author: fromOthers[1].author,
          update: {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-000000000009',
            title: null,
            version: null,
            firstLine: line('fixed', 'Les rappels n’arrivent plus deux fois le dimanche'),
            moreLines: 0,
          },
        },
      ],
    ]
  }
  // R8, planche R8-Activite (page `notifications`, jour, nuit et ordinateur : `notifications:
  // 'activity'`) : aujourd'hui, un commentaire de Papi Jean et 12 réactions, nouveaux, puis une
  // mise à jour v1.2 et ses deux autres changements ; cette semaine, une mention de Max et trois
  // abonnés ; plus tôt, un commentaire de Léa retiré par la modération. Une seule page.
  if (choice === 'activity') {
    return [
      [
        {
          kind: 'comment',
          reason: 'comment',
          id: `comment:${commentIdOf(5)}`,
          at: hoursAgo(0.2),
          isNew: true,
          project: notified(recipesProject),
          comment: { id: commentIdOf(5), excerpt: 'On le regarde avec Yanis ce soir !' },
          author: { ...jean, handle: 'papi_jean' },
        },
        {
          kind: 'reactions',
          id: `reactions:${commentedProject.id}:${dayOf(hoursAgo(1))}`,
          at: hoursAgo(1),
          isNew: true,
          project: notified(commentedProject),
          day: dayOf(hoursAgo(1)),
          counts: { amazing: 3, inspiring: 1, useful: 2, funny: 0, bravo: 6 },
          total: 12,
        },
        {
          kind: 'project_update',
          id: `project_update:${testedProject.latestUpdate.id}`,
          at: hoursAgo(3),
          isNew: false,
          project: notified(testedProject),
          author: testedProject.author,
          update: {
            id: testedProject.latestUpdate.id,
            title: testedProject.latestUpdate.title,
            version: 'v1.2',
            firstLine: line('new', 'Un compte à rebours avant chaque question'),
            moreLines: 2,
          },
        },
        {
          kind: 'comment',
          reason: 'mention',
          id: `comment:${commentIdOf(6)}`,
          at: hoursAgo(24 * 2),
          isNew: false,
          project: notified(fromOthers[1]),
          comment: {
            id: commentIdOf(6),
            excerpt: '@lea_moreau, tu avais fait la même chose pour tes recettes ?',
          },
          author: { ...max, handle: 'max_durand' },
        },
        {
          kind: 'member_follows',
          id: `member_follows:${dayOf(hoursAgo(24 * 3))}`,
          at: hoursAgo(24 * 3),
          isNew: false,
          day: dayOf(hoursAgo(24 * 3)),
          count: 3,
        },
        {
          ...removedCommentNotification,
          at: hoursAgo(24 * 9),
          isNew: false,
          project: notified(commentedProject),
        },
      ],
    ]
  }
  // R8, planche R8-Activite-Plus (page `notifications-plus` : `notifications: 'plus'`) : les
  // lignes du coin des testeurs et de l'équipe. Léa teste « Décollage ! » de Papi Jean ; Inès teste
  // le projet de Léa. Les deux du catalogue sont signées par l'équipe, jamais un administrateur.
  if (choice === 'plus') {
    return [
      [
        {
          kind: 'tester_call',
          id: 'tester_call:00000000-0000-4000-8000-00000000a801',
          at: hoursAgo(0.33),
          isNew: true,
          project: notified(testedProject),
          author: testedProject.author,
          call: {
            id: '00000000-0000-4000-8000-00000000a801',
            excerpt: 'Nouveau niveau caché sur Saturne ! Essayez-le ce week-end…',
          },
        },
        {
          kind: 'tester_message',
          id: 'tester_message:00000000-0000-4000-8000-00000000a802',
          at: hoursAgo(2),
          isNew: true,
          project: notified(recipesProject),
          from: ines,
          role: 'tester',
          message: {
            id: '00000000-0000-4000-8000-00000000a802',
            kind: 'feedback',
            testerId: ines.id,
          },
        },
        {
          kind: 'tester_message',
          id: 'tester_message:00000000-0000-4000-8000-00000000a803',
          at: hoursAgo(5),
          isNew: false,
          project: notified(testedProject),
          from: testedProject.author,
          role: 'author',
          message: {
            id: '00000000-0000-4000-8000-00000000a803',
            kind: 'reply',
            testerId: leaMe.id,
          },
        },
        {
          kind: 'feedback_settled',
          id: 'feedback_settled:00000000-0000-4000-8000-00000000a804',
          at: hoursAgo(26),
          isNew: false,
          project: notified(testedProject),
          author: testedProject.author,
          update: {
            id: '00000000-0000-4000-8000-00000000a805',
            version: 'v1.3',
            createdAt: hoursAgo(26),
          },
        },
        {
          kind: 'project_category',
          id: `project_category:${recipesProject.id}`,
          at: hoursAgo(24 * 2),
          isNew: false,
          project: notified(recipesProject),
          category: 'cooking',
        },
        {
          kind: 'tool_added',
          id: 'tool_added:glide',
          at: hoursAgo(24 * 3),
          isNew: false,
          merged: false,
          typedName: 'Glide',
          toolSlug: 'glide',
          toolName: 'Glide',
        },
        {
          kind: 'tool_added',
          id: 'tool_added:glide-apps',
          at: hoursAgo(24 * 10),
          isNew: false,
          merged: true,
          typedName: 'Glide',
          toolSlug: 'glide-apps',
          toolName: 'Glide Apps',
        },
      ],
    ]
  }
  // Tranche 7a : un signalement traité (retiré, puis classé), un commentaire et un projet de Léa
  // retirés. Les signalements traités ne nomment ni titre ni auteur ; le lien n'existe que si le
  // contenu est encore visible.
  if (choice === 'moderation') {
    return [
      [
        { ...reportHandledNotification, at: hoursAgo(1) },
        {
          ...removedCommentNotification,
          at: hoursAgo(3),
          project: notified(commentedProject),
        },
        {
          ...reportDismissedNotification,
          at: hoursAgo(26),
          link: { projectId: notMineProject.id, memberId: null },
        },
        {
          ...removedProjectNotification,
          id: `removed:project:${removedProject.id}`,
          at: hoursAgo(30),
          project: notified(removedProject),
          ground: removedProject.removal.ground,
          explanation: removedProject.removal.explanation,
          afterReport: removedProject.removal.afterReport,
        },
        {
          ...memberReportDismissedNotification,
          at: hoursAgo(50),
          link: { projectId: null, memberId: max.id },
        },
      ],
    ]
  }
  // Tranche 7c : la suspension de son compte (7 jours après un signalement, puis sans fin, sans
  // signalement) et sa fin (à la date prévue, ou levée plus tôt avec une explication). Jamais
  // l'administrateur qui a décidé, jamais qui a signalé.
  if (choice === 'suspension') {
    return [
      [
        { ...suspensionLiftedNotification, at: hoursAgo(1) },
        { ...suspendedNotification, at: hoursAgo(26), isNew: false },
        { ...suspensionEndedNotification, at: hoursAgo(24 * 9), isNew: false },
        { ...suspendedIndefinitelyNotification, at: hoursAgo(24 * 20) },
      ],
    ]
  }
  const reactionsAt = hoursAgo(1)
  const followsAt = hoursAgo(26)
  const oldAt = hoursAgo(24 * 12)
  return [
    [
      {
        kind: 'reactions',
        id: `reactions:${recipesProject.id}:${dayOf(reactionsAt)}`,
        at: reactionsAt,
        isNew: true,
        project: notified(recipesProject),
        day: dayOf(reactionsAt),
        counts: { amazing: 0, inspiring: 1, useful: 2, funny: 0, bravo: 3 },
        total: 6,
      },
      {
        kind: 'comment',
        reason: 'comment',
        id: `comment:${commentIdOf(1)}`,
        at: hoursAgo(2),
        isNew: true,
        project: notified(recipesProject),
        comment: {
          id: commentIdOf(1),
          excerpt: 'Super idée, je teste ce soir avec ce qu’il reste dans le…',
        },
        author: { ...max, handle: 'max' },
      },
      {
        kind: 'comment',
        reason: 'mention',
        id: `comment:${commentIdOf(2)}`,
        at: hoursAgo(5),
        isNew: false,
        project: notified(commentedProject),
        comment: {
          id: commentIdOf(2),
          excerpt: '@lea_moreau avait fait pareil avec ses recettes, demande-lui !',
        },
        author: { ...ines, handle: 'ines_haddad' },
      },
      {
        kind: 'comment',
        reason: 'reply',
        id: `comment:${commentIdOf(3)}`,
        at: hoursAgo(8),
        isNew: false,
        project: notified(commentedProject),
        comment: { id: commentIdOf(3), excerpt: 'Oui, la version 2 garde les listes de courses.' },
        author: { ...max, handle: 'max' },
      },
      {
        kind: 'member_follows',
        id: `member_follows:${dayOf(followsAt)}`,
        at: followsAt,
        isNew: false,
        day: dayOf(followsAt),
        count: 3,
      },
      {
        kind: 'project_follows',
        id: `project_follows:${longProject.id}:${dayOf(followsAt)}`,
        at: hoursAgo(27),
        isNew: false,
        project: notified(longProject),
        day: dayOf(followsAt),
        count: 2,
      },
      {
        kind: 'hidden',
        id: `hidden:${commentIdOf(4)}`,
        at: hoursAgo(50),
        isNew: false,
        project: notified(commentedProject),
        comment: { id: commentIdOf(4), excerpt: 'Le bouton « Partager » ne marche pas chez moi.' },
      },
    ],
    [
      {
        kind: 'reactions',
        id: `reactions:${photosProject.id}:${dayOf(oldAt)}`,
        at: oldAt,
        isNew: false,
        project: notified(photosProject),
        day: dayOf(oldAt),
        counts: { amazing: 1, inspiring: 0, useful: 0, funny: 1, bravo: 0 },
        total: 2,
      },
      {
        kind: 'handle',
        id: 'handle',
        at: hoursAgo(24 * 20),
        isNew: false,
        handle: leaMe.handle,
      },
    ],
  ]
}

// R7a : la frise de chaque projet qui a des mises à jour, de la plus récente à la plus ancienne.
const updatesOf = new Map([
  [recipesProject.id, recipesUpdates],
  [
    longProject.id,
    [longProject.latestUpdate, update(4, { lines: [line('fixed', urlNote.slice(0, 120))] }, 16)],
  ],
  [notMineProject.id, recipesUpdates.slice(1)],
  [
    removedProject.id,
    [
      removedProject.latestUpdate,
      update(6, { version: 'v1', lines: [line('new', 'Il propose trois avis à recopier')] }, 14),
    ],
  ],
  [fromOthers[0].id, [update(6, photosUpdate, 19)]],
])
// R7a : un projet « Testable » de Max, avec sa démo, dont Léa fait partie des testeurs (« Tu testes
// ce projet », la feuille « Quitter les testeurs ») ; le nombre de testeurs ne lui est pas montré.
const testedProject = {
  ...notMineProject,
  id: '00000000-0000-4000-8000-0000000000ee',
  title: 'Décollage !',
  pitch: 'Un quiz de l’espace pour les petits-enfants, avec un compte à rebours.',
  status: 'testable',
  demoUrl: 'https://decollage.example.org',
  isTester: true,
  // Comme son coin (`testerCornersAtStart`) : 9 testeurs.
  testerCount: 9,
  latestUpdate: { ...recipesUpdates[0], title: 'Le décompte de la fusée' },
  updateCount: 1,
  version: 'v1.2',
}
cardProjects.set(testedProject.id, testedProject)
updatesOf.set(testedProject.id, [testedProject.latestUpdate])

// R7b : le coin des testeurs. Trois coins : celui du projet de recettes de Léa (elle en est
// l'autrice : 12 testeurs, la liste, deux appels, quatre fils), celui de « Décollage ! » de Max
// (Léa y est testeuse : les appels, son fil avec Max), et celui d'« Avis express », retiré par la
// modération (le coin fermé : Léa relit tout, n'écrit plus). Pages : coin-testeurs-auteur,
// coin-testeurs-testeur, coin-testeurs-fil, feuille-appel, feuille-retour, coin-ferme.
const cornerAgo = (days, hours = 0) =>
  new Date(SHOT_NOW - days * 86_400_000 - hours * 3_600_000).toISOString()
// Un identifiant (UUID v4) par famille (« a » appels, « c » messages, « d » images) et numéro.
const cornerId = (family, n) =>
  `${family.repeat(8)}-${family.repeat(4)}-4${family.repeat(3)}-8${family.repeat(3)}-${String(n).padStart(12, '0')}`
const testerMedia = (n, description = null) => {
  const { id, url, width, height, thumbhash } = photo(cornerId('d', n), 1600, 1000, description)
  return {
    id,
    url: url.replace('/media/visuals/', '/media/testers/'),
    width,
    height,
    thumbhash,
    description,
  }
}
const cornerTesterNames = [
  ['ines-id', 'Inès Martin'],
  ['sam-id', 'Sam Petit'],
  ['chloe-id', 'Chloé Bernard'],
  ['hugo-id', 'Hugo Leroy'],
  ['nora-id', 'Nora Diallo'],
  ['paul-id', 'Paul Roux'],
  ['jade-id', 'Jade Fournier'],
  ['malik-id', 'Malik Benali'],
  ['emma-id', 'Emma Girard'],
  ['theo-id', 'Théo Morel'],
  ['zoe-id', 'Zoé Lambert'],
  ['yanis-id', 'Yanis Faure'],
]
// Les testeurs de Léa, du plus récent inscrit au plus ancien.
const cornerTesters = cornerTesterNames.map(([id, name], index) => ({
  id,
  name,
  handle: index % 3 === 0 ? null : id.replace('-id', ''),
  avatarUrl: null,
  since: cornerAgo(2 + index * 2),
}))
const cornerCall = (n, text, days, photoOf = null) => ({
  id: cornerId('a', n),
  text,
  photo: photoOf,
  createdAt: cornerAgo(days),
  removal: null,
})
const cornerMessage = (n, fields) => ({
  id: cornerId('c', n),
  kind: 'reply',
  sender: 'tester',
  outcome: null,
  device: null,
  text: null,
  capture: null,
  createdAt: cornerAgo(0, 1),
  settled: null,
  removal: null,
  mine: false,
  ...fields,
})
const cornerThread = (tester, fields, current = true) => ({
  tester: {
    id: tester.id,
    name: tester.name,
    handle: current ? tester.handle : null,
    avatarUrl: null,
    current,
    since: current ? tester.since : null,
  },
  lastAt: cornerAgo(0, 2),
  lastFrom: 'tester',
  unread: false,
  state: 'open',
  excerpt: null,
  ...fields,
})
const [cornerInes, cornerSam, cornerChloe, cornerHugo] = cornerTesters
/** Ce que chaque coin contient au départ ; `fakeApi` en garde une copie par capture. */
const testerCornersAtStart = () => ({
  [recipesProject.id]: {
    corner: { role: 'author', closed: false, testerCount: 12, testers: cornerTesters },
    calls: [
      cornerCall(1, 'Essayez la recette du frigo vide ce week-end, surtout sur téléphone.', 1),
      cornerCall(
        2,
        'Nouveau : le menu de la semaine se partage en un lien. Dites-moi s’il s’ouvre chez vous.',
        6,
        testerMedia(1, 'Le menu de la semaine, sept plats en colonne'),
      ),
    ],
    threads: [
      cornerThread(cornerInes, {
        unread: true,
        excerpt: 'Pareil sur ordinateur, au fait.',
      }),
      cornerThread(cornerSam, {
        lastFrom: 'author',
        lastAt: cornerAgo(1, 3),
        excerpt: 'Merci Sam, c’est corrigé dans la v1.3 !',
      }),
      cornerThread(cornerChloe, { lastAt: cornerAgo(4), excerpt: null }, false),
      cornerThread(cornerHugo, {
        state: 'settled',
        lastAt: cornerAgo(9),
        excerpt: 'Le bouton « Imprimer » ne fait rien sur tablette.',
      }),
    ],
    messages: {
      [cornerInes.id]: [
        cornerMessage(1, {
          kind: 'feedback',
          outcome: 'partly',
          device: 'phone',
          text: 'Les quantités se doublent bien, mais la liste de courses repart à zéro quand je reviens en arrière.',
          capture: testerMedia(2),
          createdAt: cornerAgo(2, 5),
        }),
        cornerMessage(2, {
          sender: 'author',
          text: 'Merci Inès, je regarde ce soir !',
          createdAt: cornerAgo(2, 1),
          mine: true,
        }),
        cornerMessage(3, { text: 'Pareil sur ordinateur, au fait.', createdAt: cornerAgo(0, 2) }),
      ],
      [cornerSam.id]: [
        cornerMessage(4, {
          kind: 'feedback',
          outcome: 'no',
          device: 'computer',
          text: 'Le menu partagé s’ouvre sur une page blanche.',
          createdAt: cornerAgo(3),
          settled: {
            at: cornerAgo(1, 3),
            update: { id: recipesUpdates[0].id, version: 'v1.3', createdAt: cornerAgo(1, 3) },
          },
        }),
        cornerMessage(5, {
          sender: 'author',
          text: 'Merci Sam, c’est corrigé dans la v1.3 !',
          createdAt: cornerAgo(1, 3),
          mine: true,
        }),
      ],
      // Chloé ne teste plus : son retour sans texte reste à traiter (« Ne teste plus » dans la
      // feuille de mise à jour), et Hugo a déjà un retour réglé.
      [cornerChloe.id]: [
        cornerMessage(9, {
          kind: 'feedback',
          outcome: 'yes',
          device: 'tablet',
          createdAt: cornerAgo(4),
        }),
      ],
      [cornerHugo.id]: [
        cornerMessage(10, {
          kind: 'feedback',
          outcome: 'no',
          device: 'tablet',
          text: 'Le bouton « Imprimer » ne fait rien sur tablette.',
          createdAt: cornerAgo(9),
          settled: {
            at: cornerAgo(8),
            update: { id: recipesUpdates[1].id, version: 'v1.1', createdAt: cornerAgo(8) },
          },
        }),
      ],
    },
  },
  [testedProject.id]: {
    corner: { role: 'tester', closed: false, testerCount: 9, testers: null },
    calls: [
      cornerCall(3, 'Essayez le niveau 3 ce week-end, surtout sur téléphone.', 1),
      cornerCall(
        4,
        'Le compte à rebours a une nouvelle fusée. Elle décolle bien chez vous ?',
        5,
        testerMedia(3, 'Une fusée orange au-dessus du compte à rebours'),
      ),
    ],
    threads: [],
    messages: {
      [leaMe.id]: [
        cornerMessage(6, {
          kind: 'feedback',
          outcome: 'partly',
          device: 'phone',
          text: 'Le score repart à zéro au niveau 3.',
          capture: testerMedia(4),
          createdAt: cornerAgo(2, 4),
          mine: true,
        }),
        cornerMessage(7, {
          sender: 'author',
          text: 'Bien vu, merci Léa ! Je corrige pour la prochaine version.',
          createdAt: cornerAgo(1, 6),
        }),
      ],
    },
  },
  [removedProject.id]: {
    corner: { role: 'author', closed: true, testerCount: 3, testers: cornerTesters.slice(0, 3) },
    calls: [cornerCall(5, 'Essayez la version anglaise avant vendredi.', 12)],
    threads: [cornerThread(cornerSam, { excerpt: 'Les avis anglais sont bien traduits.' })],
    messages: {
      [cornerSam.id]: [
        cornerMessage(8, {
          kind: 'feedback',
          outcome: 'yes',
          device: 'tablet',
          text: 'Les avis anglais sont bien traduits.',
          createdAt: cornerAgo(11),
        }),
      ],
    },
  },
})
/** Le fil d'un coin tel que l'API le rend : le plus récent en tête. */
const newestFirst = (messages) => [...messages].reverse()
// L'API simulée d'une page : une fonction appelée par Playwright pour chaque requête vers l'API.
// Tout ce qu'elle retient (réactions, pseudo enregistré) vit dans ses propres variables, créées à
// chaque appel de fakeApi : deux pages ne partagent jamais rien. `feed` choisit le fil de l'accueil.
// `admin` (tranche 7a) : Léa est administratrice, GET /v1/me le dit et la modération répond.
// `blocks` (tranche 7b) : 'some', Léa a bloqué Sam et Théo ; 'none', personne.
// `email` (tranche « adresse ») : 'current', l'adresse de toujours ; 'changed', la nouvelle.
// `suspended` (tranche 7c) : le compte de Léa est suspendu 7 jours (GET /v1/me le dit).
// `emailChoices` (R8) : les réglages d'e-mail de départ, 'default' (tout « Dans le récap »),
// 'replies-now' (les réponses et mentions « Tout de suite ») ou 'recap-off' (récap coupé, les
// commentaires « Tout de suite », les abonnés « Jamais »).
const fakeApi = (
  signedIn,
  feed = 'following',
  notifications = 'some',
  admin = false,
  blocks = 'some',
  email = 'current',
  suspended = false,
  emailChoices = 'default',
) => {
  // L'adresse du compte, dans la session comme dans le profil (GET /v1/me).
  const accountEmail = emailOf[email] ?? emailOf.current
  const sessionNow = { ...session, user: { ...session.user, email: accountEmail } }
  // Les membres que Léa a bloqués, tels que ses gestes dans ce navigateur les ont laissés (bloquer
  // Max depuis sa page, débloquer Sam depuis la liste) : chaque capture a les siens.
  const blocked = new Map(
    (blocks === 'none' ? [] : blockedList).map((entry) => [entry.member.id, entry]),
  )
  // Les notifications : vues (PUT …/seen) ou non. Vues, la cloche revient à zéro.
  const notificationList = notificationPages(notifications)
  let seen = false
  // Ce que Léa change dans ce navigateur : ses réactions, et le nombre de commentaires ajoutés.
  const reactions = structuredClone(reactionsOf)
  const added = {}
  // Son profil, tel que le dernier PATCH /v1/me l'a laissé : une relecture (retour sur la page,
  // en-tête, page de membre) montre le nouveau pseudo, comme la vraie API.
  let me = structuredClone({
    ...leaMe,
    isAdmin: admin,
    email: accountEmail,
    suspension: suspended ? suspendedMe.suspension : null,
  })
  // Les décisions de modération prises dans ce navigateur (tranche 7a) : la cible quitte sa liste.
  const decided = new Set()
  // Les suggestions que Léa écarte dans ce navigateur (« × », R4) : elles quittent sa liste.
  const dismissed = new Set()
  // Ses réglages d'e-mail (tranche 6c), tels que le dernier PATCH les a laissés.
  // R8 : `emailChoices` choisit ceux du départ (voir plus haut, avant fakeApi).
  let emailPreferences = structuredClone(
    emailChoices === 'recap-off'
      ? recapOffPreferences
      : emailChoices === 'replies-now'
        ? repliesNowPreferences
        : leaEmailPreferences,
  )
  // Le projet tel que l'API le donne, avec ses réactions et son nombre de commentaires.
  // R7a : les testeurs de ce navigateur (POST / DELETE …/testers) : `isTester` suit le dernier geste,
  // pour que la relecture qui suit la feuille rende l'état voulu et non celui d'avant.
  const testers = new Map()
  // R7b : les coins des testeurs de cette capture, que ses gestes changent (appel, retour, retrait).
  const corners = structuredClone(testerCornersAtStart())
  const withExtras = (project) => ({
    ...project,
    isTester: testers.has(project.id) ? testers.get(project.id) : project.isTester,
    reactions: reactions[project.id] ?? project.reactions,
    commentCount: (commentCountOf[project.id] ?? 0) + (added[project.id] ?? 0),
  })
  return async (route) => {
    const url = new URL(route.request().url())
    const { pathname } = url
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (pathname === '/api/auth/get-session') return json(200, signedIn ? sessionNow : null)
    const method = route.request().method()
    // Tranche R2, le mot de passe et la vérification, sans session comme la vraie API. Mot de passe
    // oublié et renvoi du lien : toujours la même réponse. Nouveau mot de passe : le jeton refusé
    // (refusedResetToken) reçoit INVALID_TOKEN, comme Better Auth pour un lien expiré ou servi.
    if (pathname === '/api/auth/request-password-reset' && method === 'POST') {
      return json(200, { status: true })
    }
    if (pathname === '/api/auth/send-verification-email' && method === 'POST') {
      return json(200, { status: true })
    }
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const { token } = JSON.parse(route.request().postData() ?? '{}')
      if (token === refusedResetToken) {
        return json(400, { code: 'INVALID_TOKEN', message: 'Invalid token' })
      }
      return json(200, { status: true })
    }
    if (pathname === '/v1/account/unverified-email' && method === 'POST') {
      const { newEmail } = JSON.parse(route.request().postData() ?? '{}')
      return json(200, { sentTo: String(newEmail).trim().toLowerCase() })
    }
    // Changer son mot de passe (réglages, Sécurité) : avec la session de Léa.
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      if (!signedIn) return json(401, { code: 'UNAUTHORIZED', message: '' })
      return json(200, { status: true })
    }
    // Se désinscrire depuis un e-mail (tranche 6c) : sans session, comme la vraie API. Le jeton
    // vient de l'adresse ; un jeton de bonne forme mais refusé (refusedToken) reçoit 400.
    if (pathname === '/v1/email/unsubscribe' && method === 'POST') {
      const token = url.searchParams.get('token')
      if (token === refusedToken || ![recapToken, mentionsToken, instantToken].includes(token)) {
        return json(400, { error: { code: 'unsubscribe_invalid', message: '' } })
      }
      return route.fulfill({ status: 204, body: '' })
    }
    if (!signedIn) return json(401, { error: { code: 'unauthorized', message: '' } })
    // R8, « Voir en contexte » : le fil entier d'un commentaire et son projet ; un commentaire
    // inconnu (supprimé, masqué, retiré, d'un projet qu'on ne voit pas) : le même 404 partout.
    const contextOf = pathname.match(/^\/v1\/comments\/([^/]+)\/context$/)
    if (contextOf) {
      for (const [projectId, pages] of Object.entries(commentsOf)) {
        const thread = pages
          .flat()
          .find(
            (root) =>
              root.id === contextOf[1] || root.replies.some((reply) => reply.id === contextOf[1]),
          )
        if (thread) return json(200, { projectId, thread })
      }
      return json(404, { error: { code: 'not_found', message: '' } })
    }
    // Demander un changement d'adresse (tranche « adresse ») : la route de Better Auth répond
    // { code, message } en cas de refus, { status: true } sinon (même pour une adresse déjà prise :
    // on ne révèle pas qui a un compte). Rien ne change avant les deux liens : l'adresse reste.
    if (pathname === '/api/auth/change-email' && method === 'POST') {
      const { newEmail, password } = JSON.parse(route.request().postData() ?? '{}')
      if (password === wrongPasswordShot) {
        return json(400, { code: 'INVALID_PASSWORD', message: 'Invalid password' })
      }
      if (String(newEmail).trim().toLowerCase() === accountEmail) {
        return json(400, { code: 'SAME_EMAIL', message: 'Email is the same' })
      }
      return json(200, { status: true })
    }
    // Les réglages d'e-mail (tranche 6c) : lus, puis modifiés un par un ; l'API rend l'état complet.
    if (pathname === '/v1/me/email-preferences' && method === 'PATCH') {
      emailPreferences = { ...emailPreferences, ...JSON.parse(route.request().postData() ?? '{}') }
      return json(200, emailPreferences)
    }
    if (pathname === '/v1/me/email-preferences') return json(200, emailPreferences)
    // Enregistrer son profil (tranche 6a) : le pseudo de Max est déjà pris (409, comme l'API) ;
    // le reste est accepté, gardé et renvoyé.
    if (pathname === '/v1/me' && method === 'PATCH') {
      const changes = JSON.parse(route.request().postData() ?? '{}')
      if (changes.handle === maxMember.handle) {
        return json(409, { error: { code: 'handle_taken', message: '' } })
      }
      me = { ...me, ...changes }
      return json(200, me)
    }
    if (pathname === '/v1/me') return json(200, me)
    // R7a : publier ou supprimer une mise à jour, l'API simulée accepte (les essais au clic,
    // --explore, peuvent remplacer ces réponses par un refus).
    if (/^\/v1\/projects\/[^/]+\/updates$/.test(pathname) && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}')
      return json(201, {
        id: crypto.randomUUID(),
        title: body.title ?? null,
        version: body.version ?? null,
        lines: body.lines ?? [line('new', 'Une mise à jour')],
        photos: [],
        beforeAfter: false,
        createdAt: new Date(SHOT_NOW).toISOString(),
        removal: null,
      })
    }
    if (/^\/v1\/projects\/[^/]+\/updates\/[^/]+$/.test(pathname) && method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' })
    }
    // La frise d'un projet (GET …/updates) : une seule page, « Première version » au bout.
    const timeline = pathname.match(/^\/v1\/projects\/([^/]+)\/updates$/)
    if (timeline && method === 'GET') {
      return json(200, { items: updatesOf.get(timeline[1]) ?? [], nextCursor: null })
    }
    // Une photo pour une mise à jour (`slot=update`) : la photo en attente, pas le projet.
    if (
      /^\/v1\/projects\/[^/]+\/visuals$/.test(pathname) &&
      method === 'POST' &&
      /name="slot"\r?\n\r?\nupdate/.test(route.request().postData() ?? '')
    ) {
      return json(201, photo(crypto.randomUUID(), 1600, 900, null))
    }
    // R7b : le coin des testeurs, avec son état (un appel lancé paraît en tête, un retour envoyé
    // dans le fil, un testeur retiré quitte la liste). Un projet sans coin : 404, comme l'API.
    const cornerRoute = pathname.match(
      /^\/v1\/projects\/([^/]+)\/(testers|calls|threads|messages|feedback)(?:\/(.*))?$/,
    )
    const cornerOf = cornerRoute ? corners[cornerRoute[1]] : undefined
    if (cornerRoute && !(cornerRoute[2] === 'testers' && method !== 'GET' && !cornerRoute[3])) {
      const [, , part, rest = ''] = cornerRoute
      const empty = () => route.fulfill({ status: 204, body: '' })
      if (!cornerOf) return json(404, { error: { code: 'not_found', message: '' } })
      const body = () => JSON.parse(route.request().postData() ?? '{}')
      if (part === 'testers' && !rest && method === 'GET') return json(200, cornerOf.corner)
      if (part === 'testers' && rest === 'media' && method === 'POST') {
        cornerOf.uploads = (cornerOf.uploads ?? 0) + 1
        return json(201, testerMedia(50 + cornerOf.uploads))
      }
      if (part === 'testers' && rest && method === 'DELETE') {
        const left = cornerOf.corner.testers?.filter((one) => one.id !== rest) ?? null
        cornerOf.corner = { ...cornerOf.corner, testers: left, testerCount: left?.length ?? 0 }
        return empty()
      }
      if (part === 'calls' && !rest && method === 'GET')
        return json(200, { items: cornerOf.calls, nextCursor: null })
      if (part === 'calls' && !rest && method === 'POST') {
        const { text, photoId, photoDescription } = body()
        const call = cornerCall(60 + cornerOf.calls.length, text, 0)
        call.createdAt = new Date(SHOT_NOW).toISOString()
        if (photoId) call.photo = { ...testerMedia(50, photoDescription ?? null), id: photoId }
        cornerOf.calls = [call, ...cornerOf.calls]
        return json(201, call)
      }
      if (part === 'calls' && rest && method === 'DELETE') {
        cornerOf.calls = cornerOf.calls.filter((one) => one.id !== rest)
        return empty()
      }
      if (part === 'threads' && !rest && method === 'GET') {
        const state = url.searchParams.get('state') ?? 'open'
        const counts = {
          open: cornerOf.threads.filter((one) => one.state === 'open').length,
          settled: cornerOf.threads.filter((one) => one.state === 'settled').length,
        }
        const items = cornerOf.threads.filter((one) => one.state === state)
        return json(200, { items, nextCursor: null, counts })
      }
      const thread = rest.match(/^([^/]+)\/(messages|read)$/)
      if (part === 'threads' && thread?.[2] === 'read') return empty()
      if (part === 'threads' && thread && method === 'GET')
        return json(200, {
          items: newestFirst(cornerOf.messages[thread[1]] ?? []),
          nextCursor: null,
        })
      if (part === 'threads' && thread && method === 'POST') {
        const sent = body()
        const message = cornerMessage(70 + Object.values(cornerOf.messages).flat().length, {
          kind: sent.kind,
          sender: cornerOf.corner.role === 'author' ? 'author' : 'tester',
          outcome: sent.outcome ?? null,
          device: sent.device ?? null,
          text: sent.text ?? null,
          capture: sent.captureId ? { ...testerMedia(51), id: sent.captureId } : null,
          createdAt: new Date(SHOT_NOW).toISOString(),
          mine: true,
        })
        cornerOf.messages[thread[1]] = [...(cornerOf.messages[thread[1]] ?? []), message]
        return json(201, message)
      }
      const settle = rest.match(/^([^/]+)\/settled$/)
      if (part === 'messages' && (settle || method === 'DELETE')) {
        const messageId = settle ? settle[1] : rest
        for (const [testerId, list] of Object.entries(cornerOf.messages)) {
          cornerOf.messages[testerId] = settle
            ? list.map((one) =>
                one.id === messageId
                  ? {
                      ...one,
                      settled:
                        method === 'POST'
                          ? { at: new Date(SHOT_NOW).toISOString(), update: null }
                          : null,
                    }
                  : one,
              )
            : list.filter((one) => one.id !== messageId)
        }
        return empty()
      }
      // Les retours à régler de la feuille « Nouvelle mise à jour » (les retours non réglés).
      if (part === 'feedback' && rest === 'open' && method === 'GET') {
        const open = cornerOf.threads.flatMap((one) =>
          (cornerOf.messages[one.tester.id] ?? [])
            .filter((message) => message.kind === 'feedback' && !message.settled)
            .map((message) => ({
              id: message.id,
              tester: { name: one.tester.name, current: one.tester.current },
              outcome: message.outcome,
              // Comme l'API (`excerptOf`) : 80 caractères au plus, puis « … ».
              excerpt: message.text
                ? message.text.length > 80
                  ? `${message.text.slice(0, 80)}…`
                  : message.text
                : null,
              createdAt: message.createdAt,
            })),
        )
        return json(200, open)
      }
      return json(404, { error: { code: 'not_found', message: '' } })
    }
    // Rejoindre les testeurs ou les quitter : accepté (204), et l'état est gardé (`withExtras`).
    const testersOf = pathname.match(/^\/v1\/projects\/([^/]+)\/testers$/)
    if (testersOf && ['POST', 'DELETE'].includes(method)) {
      testers.set(testersOf[1], method === 'POST')
      return route.fulfill({ status: 204, body: '' })
    }
    // Réagir (PUT) ou retirer sa réaction (DELETE) : les nombres changent pour la relecture qui suit.
    const reaction = pathname.match(/^\/v1\/projects\/([^/]+)\/reactions\/([a-z]+)$/)
    if (reaction) {
      const [, id, kind] = reaction
      reactions[id] = reactions[id] ?? {
        counts: { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 0 },
        mine: [],
      }
      const state = reactions[id]
      const react = method === 'PUT'
      if (react !== state.mine.includes(kind)) {
        state.counts[kind] += react ? 1 : -1
        state.mine = react ? [...state.mine, kind] : state.mine.filter((k) => k !== kind)
      }
      return route.fulfill({ status: 204, body: '' })
    }
    // Les commentaires : la première page, puis la suite (« suite ») ; publier, modifier, supprimer,
    // masquer : l'API simulée accepte.
    const comments = pathname.match(/^\/v1\/projects\/([^/]+)\/comments$/)
    if (comments && method === 'GET') {
      const pages = commentsOf[comments[1]] ?? [[]]
      const index = url.searchParams.get('cursor') === 'suite' ? 1 : 0
      return json(200, {
        items: pages[index] ?? [],
        nextCursor: index + 1 < pages.length ? 'suite' : null,
      })
    }
    if (comments && method === 'POST') {
      const { body, replyTo } = JSON.parse(route.request().postData() ?? '{}')
      // Comme la vraie API : on répond à une racine de ce projet, qu'on voit (pas un emplacement
      // « Commentaire supprimé » ou « masqué »), sinon 404. Une réponse à une réponse aussi.
      if (replyTo) {
        const roots = (commentsOf[comments[1]] ?? []).flat()
        const root = roots.find((c) => c.id === replyTo)
        if (!root || root.state === 'deleted' || !root.author) {
          return json(404, { error: { code: 'not_found', message: '' } })
        }
      }
      added[comments[1]] = (added[comments[1]] ?? 0) + 1
      return json(201, {
        ...comment(0, lea, body, 19, 9),
        id: crypto.randomUUID(),
        createdAt: new Date(SHOT_NOW).toISOString(),
      })
    }
    const one = pathname.match(/^\/v1\/projects\/([^/]+)\/comments\/([^/]+)$/)
    if (one && method === 'PATCH') {
      const { body } = JSON.parse(route.request().postData() ?? '{}')
      const all = Object.values(commentsOf)
        .flat(2)
        .flatMap((c) => [c, ...c.replies])
      const { replies: _replies, ...original } =
        all.find((c) => c.id === one[2]) ?? comment(0, lea, '', 19, 9)
      return json(200, {
        ...original,
        id: one[2],
        body,
        editedAt: new Date(SHOT_NOW).toISOString(),
      })
    }
    if (one && method === 'DELETE') {
      added[one[1]] = (added[one[1]] ?? 0) - 1
      return route.fulfill({ status: 204, body: '' })
    }
    if (/^\/v1\/projects\/[^/]+\/comments\/[^/]+\/hide$/.test(pathname)) {
      return route.fulfill({ status: 204, body: '' })
    }
    if (pathname === `/v1/projects/${recipesProject.id}`) return json(200, withExtras(recipesShown))
    if (pathname === `/v1/projects/${photosProject.id}`) return json(200, withExtras(photosProject))
    if (pathname === `/v1/projects/${notMineProject.id}`) {
      return json(200, withExtras(notMineProject))
    }
    if (pathname === `/v1/projects/${commentedProject.id}`) {
      return json(200, withExtras(commentedProject))
    }
    // R7a : « Décollage ! » de Max, que Léa teste (`isTester`), avec son propre titre et sa seule mise
    // à jour : sa page, sa frise et sa notification se répondent.
    if (pathname === `/v1/projects/${testedProject.id}`) {
      return json(200, withExtras(testedProject))
    }
    if (pathname === `/v1/projects/${threadsProject.id}`) {
      return json(200, withExtras(threadsProject))
    }
    if (pathname === `/v1/projects/${longProject.id}`) return json(200, withExtras(longProject))
    // R5a : le brouillon privé de Léa, vu par elle (le bandeau privé, « Pas encore de réaction »).
    if (pathname === `/v1/projects/${draftProject.id}`) return json(200, withExtras(draftProject))
    if (pathname === `/v1/projects/${removedProject.id}`) {
      return json(200, withExtras(removedProject))
    }
    if (pathname === `/v1/projects/${removedEmptyProject.id}`) {
      return json(200, withExtras(removedEmptyProject))
    }
    if (pathname === `/v1/members/${leaMe.id}`) {
      return json(200, { ...leaMember, name: me.name, handle: me.handle, bio: me.bio })
    }
    if (pathname === `/v1/projects/${gardenProject.id}`) {
      return json(200, withExtras(gardenProject))
    }
    // R5a : la page projet à trois photos et trois prompts (les pages de captures : la session).
    if (pathname === `/v1/projects/${launchProject.id}`) {
      return json(200, withExtras(launchProject))
    }
    // R6a : la feuille de modification (trois photos décrites, une clé dans le prompt) et un projet
    // d'avant R6a, sans catégorie. Les pages de captures qui les ouvrent : la session.
    if (pathname === `/v1/projects/${skyProject.id}`) return json(200, withExtras(skyProject))
    if (pathname === `/v1/projects/${oldProject.id}`) return json(200, withExtras(oldProject))
    // R6a : décrire une photo (PATCH …/visuals/{id}) rend le projet, la description posée.
    const described = pathname.match(/^\/v1\/projects\/([^/]+)\/visuals\/([^/]+)$/)
    if (described && method === 'PATCH') {
      const { description } = JSON.parse(route.request().postData() ?? '{}')
      const known = [skyProject, oldProject, photosProject].find((p) => p.id === described[1])
      if (!known) return json(404, { error: { code: 'not_found', message: '' } })
      return json(
        200,
        withExtras({
          ...known,
          visuals: known.visuals.map((v) =>
            v.id === described[2] ? { ...v, description: description || null } : v,
          ),
        }),
      )
    }
    // R4 : la page du projet de chaque carte du fil et de chaque proche suggéré (relecture design,
    // A7 : « Ce projet est introuvable » au toucher d'une carte).
    const cardProject = cardProjects.get(pathname.replace(/^\/v1\/projects\//, ''))
    if (cardProject && method === 'GET') return json(200, withExtras(cardProject))
    // Suivre et ne plus suivre un membre ou un projet : 204, comme la vraie API (A7 : « Suivre »
    // d'une suggestion revenait en arrière). Une capture qui veut une panne pose sa propre route.
    if (
      /^\/v1\/(members|projects)\/[^/]+\/follow$/.test(pathname) &&
      (method === 'POST' || method === 'DELETE')
    ) {
      return route.fulfill({ status: 204, body: '' })
    }
    // Bloquer (PUT) et débloquer (DELETE) un membre (tranche 7b) : 204, comme la vraie API ; la
    // liste et la page du membre suivent. Se bloquer soi-même : 422.
    const block = pathname.match(/^\/v1\/members\/([^/]+)\/block$/)
    if (block && method === 'PUT') {
      if (block[1] === leaMe.id)
        return json(422, { error: { code: 'cannot_block_own', message: '' } })
      if (block[1] === blockedByNora)
        return json(404, { error: { code: 'not_found', message: '' } })
      const member = block[1] === max.id ? maxMember : { id: block[1], name: '', handle: '' }
      blocked.set(block[1], {
        member: { id: member.id, name: member.name, handle: member.handle, avatarUrl: null },
        // Une milliseconde de plus par blocage : le plus récent reste en tête de la liste.
        blockedAt: new Date(SHOT_NOW + blocked.size).toISOString(),
      })
      return route.fulfill({ status: 204, body: '' })
    }
    if (block && method === 'DELETE') {
      blocked.delete(block[1])
      return route.fulfill({ status: 204, body: '' })
    }
    if (pathname === '/v1/me/blocks') {
      // Du plus récent au plus ancien, en une seule page.
      const items = [...blocked.values()].sort((a, b) => b.blockedAt.localeCompare(a.blockedAt))
      return json(200, blockedPageOf(items))
    }
    // Nora a bloqué Léa : sa page répond comme celle d'un membre inconnu.
    if (pathname === `/v1/members/${blockedByNora}`) {
      return json(404, { error: { code: 'not_found', message: '' } })
    }
    const member = pathname.match(/^\/v1\/members\/([^/]+)$/)
    if (member && blocked.has(member[1])) {
      return json(200, blockedMemberPage(blocked.get(member[1])))
    }
    if (pathname === `/v1/members/${max.id}`) return json(200, maxMember)
    if (pathname === `/v1/members/${ines.id}`) return json(200, inesMember)
    // Tranche 7c : Sam, auteur du commentaire signalé de la file, et Karim, déjà suspendu. Leur
    // page dit à un administrateur seul où en est la modération (`Member.moderation`) ; la page
    // « Suspendre » (/suspend?member=) la lit, et devient « Lever » pour Karim.
    if (pathname === `/v1/members/${samMember.id}`) return json(200, moderatedPage(samPage, admin))
    if (pathname === `/v1/members/${karim.id}`) return json(200, moderatedPage(karimPage, admin))
    // R6b : la page d'un outil du catalogue, filtrée par `?status=` et `?category=` ; un « Autre » ou
    // un nom inconnu répond 404, comme l'API.
    if (pathname.startsWith('/v1/tags/')) {
      const page = toolPageOf(
        decodeURIComponent(pathname.slice('/v1/tags/'.length)),
        url.searchParams,
      )
      return page ? json(200, page) : json(404, { error: { code: 'not_found', message: '' } })
    }
    // R6b : les catégories, dans l'ordre de la feuille, avec le nombre de projets visibles.
    if (pathname === '/v1/categories') {
      const english = (route.request().headers()['accept-language'] ?? '').startsWith('en')
      return json(200, categoryList(english ? 'en' : 'fr', categoryCounts))
    }
    if (pathname === '/v1/feed/following') return json(200, followingFeed(feed))
    // « Marquer le fil lu » (R4) : l'appli l'envoie quand la première page s'affiche. La page
    // garde la date lue au début de la visite, donc la capture ne change pas : 204, rien de gardé.
    if (pathname === '/v1/feed/read' && method === 'PUT')
      return route.fulfill({ status: 204, body: '' })
    // « Proches à suivre » (R4) : la liste, sans ceux que Léa a écartés ; écarter répond 204.
    if (pathname === '/v1/suggestions/members') {
      return json(200, { members: suggestedMembers.filter((m) => !dismissed.has(m.id)) })
    }
    const dismissal = pathname.match(/^\/v1\/suggestions\/members\/([^/]+)\/dismissed$/)
    if (dismissal && method === 'PUT') {
      dismissed.add(decodeURIComponent(dismissal[1]))
      return route.fulfill({ status: 204, body: '' })
    }
    // « Découvrir » (Explorer, R3) : le carrousel des testeurs (?testers=true), ou « Récents », où
    // Léa suit déjà Max (comme la planche R3-Explorer-Desktop) : ses cartes n'ont pas de pastille,
    // celles d'Inès portent « Suivre Inès Haddad ».
    if (pathname === '/v1/feed/discover') {
      if (url.searchParams.get('testers') === 'true')
        return json(200, { items: testerItems, nextCursor: null, followedAuthorIds: [] })
      return json(200, {
        items: discoverOf(url.searchParams.get('category')),
        nextCursor: null,
        followedAuthorIds: [max.id],
      })
    }
    // Les notifications (tranche 6b) : le nombre de la cloche, la liste en deux pages, « vu ».
    if (pathname === '/v1/notifications/unread') {
      const fresh = notificationList.flat().filter((n) => n.isNew).length
      return json(200, { count: seen ? 0 : notifications === 'many' ? 10 : fresh })
    }
    if (pathname === '/v1/notifications/seen' && method === 'PUT') {
      seen = true
      return route.fulfill({ status: 204, body: '' })
    }
    if (pathname === '/v1/notifications') {
      const index = url.searchParams.get('cursor') === 'suite' ? 1 : 0
      return json(200, {
        items: notificationList[index] ?? [],
        nextCursor: index + 1 < notificationList.length ? 'suite' : null,
        asOf: new Date(SHOT_NOW).toISOString(),
      })
    }
    // Signaler (tranche 7a) : accepté (la page « signaler-erreur » remplace cette réponse par le
    // quota atteint).
    if (pathname === '/v1/reports' && method === 'POST') {
      return json(201, { id: crypto.randomUUID() })
    }
    // La cible que montre la page « Signaler » (GET /v1/reports/target) : le commentaire des
    // captures, avec son texte et son projet.
    if (pathname === '/v1/reports/target') {
      const id = url.searchParams.get('id')
      const comment = notMineComments.find((c) => c.id === id)
      if (url.searchParams.get('kind') !== 'comment' || !comment) {
        return json(404, { error: { code: 'not_found', message: '' } })
      }
      return json(200, {
        target: { kind: 'comment', id: comment.id },
        text: comment.body,
        projectId: commentedProject.id,
        // Tranche 7b : l'auteur, pour « Bloquer aussi @x » après l'envoi (absent s'il est bloqué).
        author: {
          id: comment.author.id,
          name: comment.author.name,
          handle: comment.author.id === ines.id ? 'ines_haddad' : 'max_durand',
          isBlocked: blocked.has(comment.author.id),
        },
      })
    }
    // La modération (tranche 7a) : pour un membre qui n'est pas administrateur, ces routes
    // n'existent pas (404, comme la vraie API). Une décision retire la cible de sa liste.
    if (pathname.startsWith('/v1/moderation/') && !admin) {
      return json(404, { error: { code: 'not_found', message: '' } })
    }
    // R6b : l'administration du catalogue (pages « Outils » et « Catégories »), les données des
    // tests de ces pages (`testing/catalogue.ts`), chaque liste en une seule page.
    const onePage = (items) => json(200, { items, nextCursor: null })
    // Depuis jur-J1 (décision de Louis du 9/11/2026 au soir), un « Autre » des seuls profils et un
    // « Autre » cité par des projets et des profils suivent ceux des tests d'écran.
    if (pathname === '/v1/moderation/tools/pending') {
      return onePage([...pendingTools, ...pendingToolsWithProfiles])
    }
    if (pathname === '/v1/moderation/tools' && method === 'GET') {
      return onePage([makeTool, zapierTool, lovableTool].map(adminToolOf))
    }
    if (pathname === '/v1/moderation/categories/pending') return onePage(uncategorizedProjects)
    if (pathname === '/v1/moderation/catalogue-changes') {
      return onePage([admitChange, mergeChange, recategorizeChange])
    }
    if (pathname === '/v1/moderation/reports') {
      const page = moderationQueuePageOf()
      return json(200, { ...page, items: page.items.filter((i) => !decided.has(i.target.id)) })
    }
    if (pathname === '/v1/moderation/removed') {
      const page = removedPageOf()
      return json(200, { ...page, items: page.items.filter((i) => !decided.has(i.target.id)) })
    }
    if (pathname === '/v1/moderation/decisions' && method === 'POST') {
      // Tranche 7c : suspendre et lever visent un membre (`memberId`), pas une cible de la file.
      const { action, target, memberId } = JSON.parse(route.request().postData() ?? '{}')
      decided.add(target?.id ?? memberId)
      return json(201, {
        id: crypto.randomUUID(),
        action,
        createdAt: new Date(SHOT_NOW).toISOString(),
      })
    }
    // L'historique des décisions (tranche 7c), de la plus récente à la plus ancienne, en une page ;
    // `?member=` ne garde que celles qui visent ce membre (ses contenus et son compte).
    if (pathname === '/v1/moderation/decisions') {
      const member = url.searchParams.get('member')
      return json(
        200,
        decisionHistoryPageOf(
          member ? decisionHistory.filter((d) => d.member?.id === member) : decisionHistory,
        ),
      )
    }
    // Une page dont le chargement échoue, pour photographier l'état « erreur ».
    // Les membres proposés après « @ » (tranche 6b) : ceux dont le pseudo commence par la
    // recherche, 5 au plus, comme l'API.
    // Tranche R3 : la liste des outils d'Explorer, et la recherche par mots. « carn » trouve deux
    // projets, un membre et un outil ; tout autre texte (« carnaval ») ne trouve rien.
    if (pathname === '/v1/tools') return json(200, toolList)
    if (pathname === '/v1/search') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      // « quota » : le quota de recherches est dépassé (page `recherche-429`).
      if (q === 'quota') return json(429, { error: { code: 'rate_limited', message: '' } })
      const found = searchResultsOf[q] ?? emptySearchResults
      const category = url.searchParams.get('category')
      if (!category) return json(200, found)
      const items = found.projects.items.filter(
        (p) => p.primaryCategory === category || p.secondaryCategory === category,
      )
      return json(200, { ...found, projects: { items, more: false } })
    }
    if (pathname === '/v1/members/mentionable') {
      // R5b, comme la vraie API : sans accents ni majuscules, le début du pseudo, du nom ou d'un
      // mot du nom (après une espace, un tiret ou une apostrophe : décision D2).
      const fold = (text) =>
        text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/^@/, '')
      const q = fold(url.searchParams.get('q') ?? '')
      const found = mentionable.filter(
        (m) =>
          fold(m.handle).startsWith(q) ||
          fold(m.name)
            .split(/[\s'’-]+/)
            .some((w) => w.startsWith(q)),
      )
      return json(200, { members: found.slice(0, 5) })
    }
    if (pathname === '/v1/members/erreur')
      return json(500, { error: { code: 'internal', message: '' } })
    const tag = pathname.match(/^\/v1\/tags\/([^/]+)$/)
    if (tag) return json(200, { slug: tag[1], label: null, projects: [] })
    // R7b : les images du coin des testeurs (photos d'appel, captures) ont leur propre dossier.
    const media = pathname.match(/^\/media\/(?:visuals|testers)\/([0-9a-f-]+)\.webp$/)
    if (media) {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: sampleImage(media[1]),
      })
    }
    return json(404, { error: { code: 'not_found', message: '' } })
  }
}

// 4. Ce qu'on photographie.
const project = `/projects/${recipesProject.id}`
// R7b : le projet que Léa teste (« Décollage ! »), et la feuille « Ton retour » remplie : « En
// partie », « Téléphone » et un texte.
const tested = `/projects/${testedProject.id}/testers`
const fillFeedback = async (page) => {
  await page.getByRole('radio', { name: fr.project.testers.feedback.outcomes.partly }).click()
  await page.getByRole('radio', { name: fr.project.testers.feedback.devices.phone }).click()
  await page
    .getByLabel(fr.project.testers.feedback.text)
    .fill('Le score repart à zéro au niveau 3.')
}
// La photo de Léa (R2, feuilles du profil et de la suppression) : son profil répond avec une photo,
// servie comme les autres images d'exemple, pour cette page seule (page.route passe avant l'API
// simulée du contexte), puis la page est relue.
const leaPhoto = `${apiUrl}/media/visuals/e4a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b.webp`
const withLeaPhoto = async (page) => {
  await page.route(
    (url) => url.pathname === '/v1/me',
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { ...leaMe, avatarUrl: leaPhoto } })
        : route.fallback(),
  )
  await page.reload({ waitUntil: 'networkidle' })
}
const pages = [
  { name: 'catalogue', path: '/catalogue', signedIn: false, fullPage: true },
  { name: 'accueil', path: '/', signedIn: false },
  { name: 'connexion', path: '/sign-in', signedIn: false },
  // R2 : arrivé du nouveau mot de passe, « Mot de passe changé. Connecte-toi avec le nouveau. »
  {
    name: 'connexion-mot-de-passe-change',
    path: '/sign-in?announce=passwordChanged',
    signedIn: false,
  },
  { name: 'inscription', path: '/sign-up', signedIn: false },
  // R2, « Trop d'essais » : l'API refuse la connexion pour 10 minutes (429, Retry-After : 600) ; le
  // bouton reste bloqué, l'heure du prochain essai est écrite en clair (décision D3).
  {
    name: 'trop-essais',
    path: '/sign-in',
    signedIn: false,
    prepare: async (page) => {
      await page.route('**/api/auth/sign-in/email', (route) =>
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          // L'API est sur une autre origine que l'appli : le navigateur ne laisse lire Retry-After
          // que si la réponse l'expose, comme le fait la vraie API (CORS, `exposeHeaders` d'app.ts).
          headers: {
            'Retry-After': '600',
            'Access-Control-Expose-Headers': 'Retry-After',
          },
          body: JSON.stringify({ code: 'TOO_MANY_REQUESTS', message: '' }),
        }),
      )
      await page.getByLabel('Adresse e‑mail').fill('ines.haddad@exemple.fr')
      await page.getByLabel('Mot de passe', { exact: true }).fill('un-mot-de-passe-faux')
      await page.getByRole('button', { name: 'Me connecter' }).click()
      // Pas `getByRole('status')` : la couche des toasts en a un autre, caché.
      await page.getByText(/Nouvel essai possible/).waitFor()
    },
  },
  // Tranche R2 : « Vérifie ta boîte mail », l'adresse venue de l'inscription (gmail : « Ouvrir ma
  // messagerie » ; un service inconnu : pas de bouton sur ordinateur), puis après « Renvoyer ».
  {
    name: 'verifier-email',
    path: '/check-email',
    signedIn: false,
    prepare: pendingEmail('ines.haddad@gmail.com'),
  },
  {
    name: 'verifier-email-inconnue',
    path: '/check-email',
    signedIn: false,
    prepare: pendingEmail('ines.haddad@exemple.fr'),
  },
  {
    name: 'verifier-email-renvoye',
    path: '/check-email',
    signedIn: false,
    prepare: async (page) => {
      await pendingEmail('ines.haddad@gmail.com')(page)
      await page.getByRole('button', { name: /^Renvoyer l.e‑mail$/ }).click()
      await page.getByText(/nouvel e‑mail vient de partir/).waitFor()
    },
  },
  // Tranche R2 : le mot de passe oublié (vide, puis envoyé), le nouveau mot de passe ouvert par le
  // lien, et ce même lien refusé par le serveur.
  { name: 'mot-de-passe-oublie', path: '/forgot-password', signedIn: false },
  {
    name: 'mot-de-passe-oublie-envoye',
    path: '/forgot-password',
    signedIn: false,
    prepare: async (page) => {
      await page.getByLabel('Adresse e‑mail').fill('ines.haddad@gmail.com')
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByText(/Si un compte existe pour cette adresse/).waitFor()
    },
  },
  {
    name: 'nouveau-mot-de-passe',
    path: `/reset-password?token=${resetTokenShot}`,
    signedIn: false,
    prepare: async (page) => {
      await page.getByLabel('Nouveau mot de passe').fill('une-phrase-assez-longue')
    },
  },
  {
    name: 'lien-refuse',
    path: `/reset-password?token=${refusedResetToken}`,
    signedIn: false,
    prepare: async (page) => {
      await page.getByLabel('Nouveau mot de passe').fill('une-phrase-assez-longue')
      await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
      await page.getByRole('heading', { name: 'Ce lien ne marche plus' }).waitFor()
    },
  },
  // La rubrique Sécurité des réglages : changer son mot de passe (la route est celle des réglages).
  { name: 'changer-mot-de-passe', path: '/settings/security/password', signedIn: true },
  // Décision D1 : le second lien d'un changement d'adresse ouvert sans session.
  { name: 'adresse-connecte-toi', path: '/email-change/sign-in-first', signedIn: false },
  { name: 'quitter', path: '/out?url=https%3A%2F%2Frecettes.example.com', signedIn: false },
  // Le Fil (R3) : l'accueil d'un membre, ses abonnements seuls (le logo et la cloche en haut sur
  // téléphone, la barre d'onglets en bas), puis le même pour qui ne suit personne.
  // R4 : « fil » est lu jusqu'au 18/10, donc « Tu es à jour » coupe le fil en deux ; « fil-a-jour »
  // n'a rien de neuf (la sphère en tête) ; « fil-vide » est le premier lancement (« Ton fil
  // t'attend » et les proches à suivre).
  { name: 'fil', path: '/', signedIn: true, feed: 'read-midway', fullPage: true },
  // RF : le Fil défilé de 700 points. Sur ordinateur, la barre du haut reste fixée et le contenu
  // passe dessous ; sur téléphone, rien ne change (pas de barre du haut).
  {
    name: 'fil-defile',
    path: '/',
    signedIn: true,
    feed: 'read-midway',
    prepare: async (page) => {
      await page.evaluate(() => {
        // La vraie zone de défilement de l'écran (la plus haute qui défile), comme pour fullPage.
        const scrollers = [...document.querySelectorAll('div')].filter(
          (el) =>
            el.scrollHeight > el.clientHeight &&
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
        )
        const main = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
        if (main) main.scrollTop = 700
        else window.scrollTo(0, 700)
      })
    },
  },
  { name: 'fil-a-jour', path: '/', signedIn: true, feed: 'read-all', fullPage: true },
  { name: 'fil-vide', path: '/', signedIn: true, feed: 'nobody' },
  // R4 : le fil qui charge (la première page ne répond jamais : le squelette des cartes), puis le
  // fil en panne (500 : le message et « Réessayer »). La route de la page passe avant l'API
  // simulée ; la page est relue pour que la première requête la prenne.
  {
    name: 'fil-chargement',
    path: '/',
    signedIn: true,
    prepare: async (page) => {
      await page.route(
        (url) => url.pathname === '/v1/feed/following',
        () => {},
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('[aria-busy="true"]').first().waitFor()
    },
  },
  {
    name: 'fil-erreur',
    path: '/',
    signedIn: true,
    prepare: async (page) => {
      await page.route(
        (url) => url.pathname === '/v1/feed/following',
        (route) =>
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'internal', message: '' } }),
          }),
      )
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Réessayer' }).first().waitFor()
    },
  },
  // Explorer (R3) : le haut de la page (le champ sur téléphone, le carrousel des testeurs, les
  // outils populaires), puis la page entière jusqu'à « Récents » et ses pastilles « Suivre ».
  // Chaque capture est prise de jour et de nuit ; « explorer-nuit » est la page entière (planche
  // R3-Explorer-Nuit).
  { name: 'explorer', path: '/explore', signedIn: true },
  { name: 'explorer-nuit', path: '/explore', signedIn: true, fullPage: true },
  // R6b : « Récents » filtré par la pastille « Animaux » (une carte), puis une catégorie sans projet
  // dans ce fil : le message vide traduit, avec le nom de la catégorie.
  { name: 'explorer-filtre', path: '/explore?category=animals', signedIn: true, fullPage: true },
  {
    name: 'explorer-categorie-vide',
    path: '/explore?category=travel',
    signedIn: true,
    fullPage: true,
  },
  // « Tous les outils » (R3) : de A à Z, chacun avec sa tuile et son nombre de projets publics.
  { name: 'outils', path: '/tools', signedIn: true, fullPage: true },
  // Le bout du fil (R1) : « Tu es à jour » sur le miel vif, sous la dernière carte.
  { name: 'fil-fini', path: '/', signedIn: true, feed: 'end', fullPage: true },
  // Une adresse qui ne mène nulle part (R1) : la page introuvable, sur le miel vif.
  { name: 'introuvable', path: '/nulle-part', signedIn: false },
  // Les notifications (tranche 6b) : la liste (avec sa suite), l'écran vide, et la cloche à « 9+ ».
  // R8 : la page « Activité » de la planche R8-Activite (sections, miel, roue sur téléphone ; sur
  // ordinateur « Tout marquer comme lu » et la colonne des e-mails, réponses « Tout de suite »), puis
  // les lignes du coin des testeurs et du catalogue (R8-Activite-Plus), et l'état vide à deux boutons.
  {
    name: 'notifications',
    path: '/notifications',
    signedIn: true,
    notifications: 'activity',
    emailChoices: 'replies-now',
    fullPage: true,
  },
  {
    name: 'notifications-plus',
    path: '/notifications',
    signedIn: true,
    notifications: 'plus',
    fullPage: true,
  },
  { name: 'notifications-vide', path: '/notifications', signedIn: true, notifications: 'none' },
  { name: 'cloche-pleine', path: '/', signedIn: true, notifications: 'many' },
  // La page d'un autre membre et son projet : les boutons « Suivre ».
  { name: 'membre-autre', path: '/members/max-id', signedIn: true, fullPage: true },
  { name: 'projet-autre', path: `/projects/${notMineProject.id}`, signedIn: true, fullPage: true },
  // R7a (U4b) : la frise des mises à jour, vue par l'autrice (corbeilles) et par un autre membre
  // (« Suivre ce projet », « Signaler »), chacune avec l'avant / après en tête.
  {
    name: 'projet-mises-a-jour',
    path: `/projects/${recipesProject.id}/updates`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'projet-mises-a-jour-autre',
    path: `/projects/${testedProject.id}/updates`,
    signedIn: true,
    fullPage: true,
  },
  // R7a (U7) : la section « Les mises à jour » de la page de l'autrice : la dernière mise à jour en
  // entier, « Voir les 3 mises à jour » et « Publier une mise à jour ».
  { name: 'projet-section-maj', path: project, signedIn: true, fullPage: true },
  // R7a : le fil « Abonnements » (premier passage) : deux cartes de projets mis à jour (« Mis à jour
  // · v2 », la première ligne, « et 2 autres changements »), chaque projet une seule fois.
  { name: 'fil-mise-a-jour', path: '/', signedIn: true, fullPage: true },
  // R7a : Activité, avec deux notifications « a publié une mise à jour de … » (une nouvelle, une lue).
  {
    name: 'activite-maj',
    path: '/notifications',
    signedIn: true,
    notifications: 'updates',
    fullPage: true,
  },
  // R7a : la feuille « Nouvelle mise à jour » de l'autrice, dans ses états : vide, remplie, cinq
  // lignes (« Ajouter une ligne » disparaît), deux photos en avant / après, l'erreur « Écris au moins
  // un changement », puis « Annuler » devant un texte écrit (« Abandonner cette mise à jour ? »).
  { name: 'feuille-mise-a-jour', path: `${project}/update`, signedIn: true },
  {
    name: 'feuille-mise-a-jour-remplie',
    path: `${project}/update`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByLabel(fr.project.updates.titleField).fill('Le décompte de la fusée')
      await page.getByLabel(fr.project.updates.versionField).fill('v1.2')
      await updateLine(page, 1).fill('Un compte à rebours de dix secondes avant le décollage')
      await page.getByRole('button', { name: fr.project.updates.addLine }).click()
      await page
        .getByRole('button', { name: /^Famille : /, exact: false })
        .nth(1)
        .click()
      await page.getByRole('menuitemradio', { name: fr.update.family.fixed }).click()
      await updateLine(page, 2).fill('Le son ne se coupe plus quand on change d’onglet')
    },
  },
  {
    name: 'feuille-mise-a-jour-5-lignes',
    path: `${project}/update`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await updateLine(page, 1).fill('Un compte à rebours de dix secondes')
      for (const n of [2, 3, 4, 5]) {
        await page.getByRole('button', { name: fr.project.updates.addLine }).click()
        await updateLine(page, n).fill(`Le changement numéro ${n}`)
      }
      await page.getByText('5 / 5').first().waitFor()
    },
  },
  {
    name: 'feuille-mise-a-jour-avant-apres',
    path: `${project}/update`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await updateLine(page, 1).fill('Le tableau de bord est plus clair')
      for (const n of [1, 2]) {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page
            .getByRole('button', {
              // « Ajouter des photos » (téléphone) ou la zone « Glisse tes images ici, ou choisis-les ».
              name: new RegExp(`^${fr.project.form.addPhotosLabel}|choisis-les`),
            })
            .first()
            .click(),
        ])
        await chooser.setFiles({
          name: `photo-${n}.png`,
          mimeType: 'image/png',
          buffer: png(1200, 800, n === 1 ? [200, 120, 60] : [60, 140, 200]),
        })
        await page.getByRole('button', { name: `Retirer la photo ${n}` }).waitFor()
      }
      await page.getByRole('switch', { name: fr.project.updates.beforeAfterSwitch }).click()
    },
  },
  {
    name: 'feuille-mise-a-jour-erreur',
    path: `${project}/update`,
    signedIn: true,
    // La feuille ignore les tapes des 600 premières ms (`guardTaps`) : on attend plus que d'habitude.
    wait: 1500,
    prepare: async (page) => {
      await page
        .getByRole('button', { name: fr.project.updates.publish, exact: true })
        .last()
        .click()
      await page.getByText(fr.project.updates.required).first().waitFor()
    },
  },
  {
    name: 'feuille-mise-a-jour-abandon',
    path: `${project}/update`,
    signedIn: true,
    wait: 1500, // « Annuler » ignore les tapes des 600 premières ms de la feuille
    prepare: async (page) => {
      await updateLine(page, 1).fill('Un compte à rebours de dix secondes')
      await page
        .getByRole('button', { name: fr.project.updates.cancel, exact: true })
        .first()
        .click()
      await page.getByText(fr.project.updates.discardTitle).waitFor()
    },
  },
  // R7a : les testeurs. La feuille d'inscription (page de Décollage !, d'Inès, « Testable » avec sa
  // démo), le refus « plus de nouveaux testeurs », et la page de sortie de la démo (la ligne « Tu
  // veux aider Inès ? »). R7b : une fois inscrit, « Le coin des testeurs » à la place du bouton (page
  // de Max ; la feuille « Tu testes ce projet » a disparu), et l'arrivée du coin après « Quitter les
  // testeurs » (?focus=join : le focus sur « Rejoindre les testeurs », l'adresse nettoyée).
  {
    name: 'testeur',
    path: `/projects/${launchProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: fr.project.testers.join }).click()
      await page.getByRole('heading', { name: fr.project.testers.joinTitle }).waitFor()
    },
  },
  {
    name: 'testeur-membre',
    path: `/projects/${testedProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      // Il mène au coin : il se lit « lien » (R7b, correction 7).
      await page.getByRole('link', { name: fr.project.testers.corner }).waitFor()
    },
  },
  {
    name: 'testeur-retour',
    path: `/projects/${launchProject.id}?focus=join`,
    signedIn: true,
    prepare: async (page) => {
      await page.waitForFunction(
        (name) => document.activeElement?.textContent?.includes(name) ?? false,
        fr.project.testers.join,
      )
      await page.waitForFunction(() => !window.location.search.includes('focus='))
    },
  },
  {
    name: 'testeur-complet',
    path: `/projects/${launchProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.route('**/v1/projects/*/testers', (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'testers_full', message: '' } }),
        }),
      )
      await page.getByRole('button', { name: fr.project.testers.join }).click()
      await page.waitForTimeout(800) // la feuille ignore les tapes de ses 600 premières ms
      await page
        .getByRole('dialog')
        .getByRole('button', { name: fr.project.testers.confirm })
        .click()
      await page.getByText(fr.project.testers.full).first().waitFor()
    },
  },
  {
    name: 'testeur-sortie',
    path: `/out?url=${encodeURIComponent(launchProject.demoUrl)}&project=${launchProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('link', { name: fr.project.testers.leavingLink }).waitFor()
    },
  },
  // R7b : le coin des testeurs. L'autrice (Léa, 12 testeurs : la liste, les appels, puis les fils à
  // traiter), la testeuse (Léa chez Max : les appels, puis son fil), un fil ouvert (sur ordinateur, le
  // coin à gauche et le fil à droite), et le coin fermé par la modération (relecture seule).
  { name: 'coin-testeurs-auteur', path: `${project}/testers`, signedIn: true, fullPage: true },
  {
    name: 'coin-testeurs-auteur-retours',
    path: `${project}/testers?tab=feedback`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByText(fr.project.testers.thread.privacyList).first().waitFor()
    },
  },
  {
    name: 'coin-testeurs-testeur',
    path: `/projects/${testedProject.id}/testers`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'coin-testeurs-testeur-retours',
    path: `/projects/${testedProject.id}/testers?tab=feedback`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: fr.project.testers.feedback.send }).waitFor()
    },
  },
  {
    name: 'coin-testeurs-fil',
    path: `${project}/testers/threads/${cornerInes.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByText('Pareil sur ordinateur, au fait.').last().waitFor()
    },
  },
  {
    name: 'coin-ferme',
    path: `/projects/${removedProject.id}/testers`,
    signedIn: true,
    fullPage: true,
  },
  // R7b : la feuille « Nouvel appel » (vide, puis remplie) de l'autrice. La feuille ignore les tapes
  // de ses 600 premières ms (`guardTaps`) : on attend plus que d'habitude.
  { name: 'feuille-appel', path: `${project}/testers/new-call`, signedIn: true, wait: 1500 },
  {
    name: 'feuille-appel-remplie',
    path: `${project}/testers/new-call`,
    signedIn: true,
    wait: 1500,
    prepare: async (page) => {
      await page
        .getByLabel(fr.project.testers.calls.field)
        .fill('Essayez le niveau 3 ce week-end, surtout sur téléphone.')
    },
  },
  // R7b : la feuille « Ton retour » du testeur (Léa chez Max) : vide, remplie, l'erreur sans issue
  // (« Choisis Oui, En partie ou Non. »), et un brouillon rouvert. Le brouillon vit en mémoire : la
  // feuille est rouverte par un clic dans l'appli, jamais par `page.goto`, qui le viderait.
  { name: 'feuille-retour', path: `${tested}/new-feedback`, signedIn: true, wait: 1500 },
  {
    name: 'feuille-retour-remplie',
    path: `${tested}/new-feedback`,
    signedIn: true,
    wait: 1500,
    prepare: fillFeedback,
  },
  {
    name: 'feuille-retour-erreur',
    path: `${tested}/new-feedback`,
    signedIn: true,
    wait: 1500,
    prepare: async (page) => {
      await page.getByLabel(fr.project.testers.feedback.text).fill('Le score repart à zéro.')
      await page
        .getByRole('button', { name: fr.project.testers.feedback.submit, exact: true })
        .last()
        .click()
      await page.getByText(fr.project.testers.feedback.outcomeRequired).first().waitFor()
    },
  },
  {
    name: 'feuille-retour-brouillon',
    path: `${tested}?tab=feedback`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: fr.project.testers.feedback.send }).click()
      await page.getByRole('heading', { name: fr.project.testers.feedback.sheetTitle }).waitFor()
      await page.waitForTimeout(800) // la feuille ignore les tapes de ses 600 premières ms
      await fillFeedback(page)
      await page
        .getByRole('button', { name: fr.project.testers.feedback.cancel, exact: true })
        .first()
        .click()
      await page
        .getByRole('heading', { name: fr.project.testers.feedback.sheetTitle })
        .waitFor({ state: 'detached' })
      await page.getByRole('button', { name: fr.project.testers.feedback.send }).click()
      await page.getByRole('button', { name: fr.project.testers.feedback.clearDraft }).waitFor()
    },
  },
  // R7b : la feuille « Nouvelle mise à jour » de l'autrice avec la partie « Retours réglés » : les
  // retours à traiter (dont celui d'un ancien testeur), et un coché.
  {
    name: 'maj-retours-regles',
    path: `${project}/update`,
    signedIn: true,
    fullPage: true,
    wait: 1500,
    prepare: async (page) => {
      await page.getByText(fr.project.testers.settledField.title).first().waitFor()
      await page.getByRole('checkbox').first().click()
    },
  },
  // Les commentaires d'un projet (R5b) : l'aperçu sous le projet, puis la feuille (sur téléphone) ou
  // la liste déroulée (sur ordinateur), ouverte par un clic une fois la page prête (prepare).
  {
    name: 'projet-commentaires-apercu',
    path: `/projects/${threadsProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'projet-commentaires',
    path: `/projects/${threadsProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: openThreads,
  },
  // Répondre à une réponse : « @max_durand » prérempli, le bandeau, le commentaire visé surligné, et
  // « @Lé » tapé : la liste propose Hugo Lefèvre, trouvé par un mot de son nom.
  {
    name: 'projet-repondre',
    path: `/projects/${threadsProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await openThreads(page)
      await page
        .getByRole('button', { name: /^Répondre/ })
        .nth(1)
        .click()
      const field = page.getByRole('combobox', { name: 'Écrire un commentaire' })
      await field.press('End')
      await field.pressSequentially('@Lé')
      await page.getByRole('option', { name: /Hugo Lefèvre/ }).waitFor()
    },
  },
  // Les commentaires d'un projet privé, vu par son auteur, sans commentaire : la bannière « privé »
  // et l'état vide qui le dit (jur-J10) ; puis ceux d'un projet public retiré par la modération,
  // vu par son auteur : pas de champ, « emptyRemoved ».
  {
    name: 'projet-prive-commentaires',
    path: `/projects/${draftProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'projet-retire-commentaires',
    path: `/projects/${removedEmptyProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  // Les états : masqué, supprimé, retiré, bloqué, et le texte long replié après 10 lignes.
  {
    name: 'projet-commentaires-etats',
    path: `/projects/${threadsProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await openThreads(page)
      await page
        .getByRole('button', { name: /^Lire la suite/ })
        .first()
        .scrollIntoViewIfNeeded()
    },
  },
  {
    name: 'projet-commenter',
    path: `/projects/${commentedProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await openThreads(page)
      await page
        .getByRole('combobox', { name: 'Écrire un commentaire' })
        .fill('Testé ce soir : il m’a proposé une soupe de fanes de radis, une vraie réussite.')
    },
  },
  // Mentionner (tranche 6b) : « @in » tapé dans un commentaire, la liste des membres ouverte, le
  // premier en surbrillance d'emblée (Entrée le choisirait).
  {
    name: 'projet-mentionner',
    path: `/projects/${commentedProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await openThreads(page)
      const field = page.getByRole('combobox', { name: 'Écrire un commentaire' })
      await field.fill('Bravo, demande à @i')
      await field.press('n')
      await page.getByRole('option', { name: /Inès Haddad/ }).waitFor()
    },
  },
  // Tranche R2 : la page « Réglages » (qui remplace « Mon compte ») et chacune de ses rubriques.
  { name: 'reglages', path: '/settings', signedIn: true, fullPage: true },
  {
    name: 'reglages-notifications',
    path: '/settings/notifications',
    signedIn: true,
    fullPage: true,
  },
  { name: 'reglages-langue', path: '/settings/language', signedIn: true, fullPage: true },
  { name: 'reglages-apparence', path: '/settings/appearance', signedIn: true, fullPage: true },
  { name: 'reglages-donnees', path: '/settings/data', signedIn: true, fullPage: true },
  { name: 'reglages-securite', path: '/settings/security', signedIn: true, fullPage: true },
  // Retour de « Changer ton mot de passe » (relecture R2, B2) : la rubrique dit elle-même
  // « Mot de passe changé », le toast n'est plus la seule trace.
  {
    name: 'reglages-securite-change',
    path: '/settings/security?announce=passwordChanged',
    signedIn: true,
    fullPage: true,
  },
  { name: 'reglages-compte', path: '/settings/account', signedIn: true, fullPage: true },
  { name: 'reglages-a-propos', path: '/settings/about', signedIn: true, fullPage: true },
  { name: 'supprimer-compte', path: '/settings/account/delete', signedIn: true, fullPage: true },
  // Tranche « adresse » : la page qui change l'adresse, la demande partie (le premier lien vers
  // l'adresse actuelle), un mot de passe refusé ; puis les pages des deux liens.
  { name: 'changer-adresse', path: '/settings/account/email', signedIn: true, fullPage: true },
  {
    name: 'changer-adresse-envoye',
    path: '/settings/account/email',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByLabel('Nouvelle adresse e‑mail').fill(changeEmailShot.newEmail)
      await page.getByLabel('Confirme avec ton mot de passe').fill(changeEmailShot.password)
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByText('Regarde ta boîte mail actuelle').waitFor()
    },
  },
  {
    name: 'changer-adresse-erreur',
    path: '/settings/account/email',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByLabel('Nouvelle adresse e‑mail').fill(changeEmailShot.newEmail)
      await page.getByLabel('Confirme avec ton mot de passe').fill(wrongPasswordShot)
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByText('Mot de passe incorrect.').waitFor()
    },
  },
  { name: 'adresse-confirmee', path: '/email-change/confirmed', signedIn: false },
  { name: 'adresse-changee', path: '/email-change/done', signedIn: true, email: 'changed' },
  { name: 'adresse-changee-deconnecte', path: '/email-change/done', signedIn: false },
  {
    name: 'adresse-lien-refuse',
    path: '/email-change/done?error=INVALID_TOKEN',
    signedIn: false,
  },
  { name: 'profil', path: '/settings/profile', signedIn: true, fullPage: true },
  // R2 : le profil en feuille, Léa avec sa photo (floutée en tête de la feuille), sa bio et ses
  // outils ; sur ordinateur, l'aperçu de sa page à droite.
  {
    name: 'feuille-profil',
    path: '/settings/profile',
    signedIn: true,
    prepare: async (page) => {
      await withLeaPhoto(page)
      await page.getByRole('dialog', { name: 'Mon profil' }).waitFor()
    },
  },
  // R2 : la suppression en feuille, avec la photo de Léa et les couvertures de ses projets.
  {
    name: 'feuille-suppression',
    path: '/settings/account/delete',
    signedIn: true,
    prepare: async (page) => {
      await withLeaPhoto(page)
      await page.getByRole('dialog', { name: 'Supprimer ton compte' }).waitFor()
    },
  },
  // Tranche 6a : un pseudo déjà pris (celui de Max), refusé sous son champ ; ce qui a été tapé reste.
  {
    name: 'profil-pseudo-pris',
    path: '/settings/profile',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByLabel('Pseudo', { exact: true }).fill('max_durand')
      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await page.getByText('Ce pseudo est déjà pris. Choisis-en un autre.').waitFor()
    },
  },
  // Un nouveau pseudo enregistré : la confirmation rappelle que l'ancien reste réservé.
  {
    name: 'profil-pseudo-change',
    path: '/settings/profile',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      // L'API simulée garde le pseudo d'une largeur à l'autre (--layout) : on en change vraiment.
      const field = page.getByLabel('Pseudo', { exact: true })
      await field.fill((await field.inputValue()) === 'lea_moreau' ? 'lea_m' : 'lea_moreau')
      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await page.getByText(/te reste réservé/).waitFor()
    },
  },
  // Tranche 6c : un réglage d'e-mail touché, enregistré tout de suite (« Réglage enregistré. »).
  {
    name: 'profil-email',
    path: '/settings/notifications',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page
        .getByRole('switch', { name: 'Un e‑mail quand on me mentionne ou me répond' })
        .click()
      await page.getByText('Réglage enregistré.').waitFor()
    },
  },
  // Tranche 6c : la session expire pendant la visite. Suivre le projet est refusé (401) : le
  // message, et à côté le lien « Me reconnecter ». La route de cette page passe avant l'API
  // simulée du contexte.
  {
    name: 'session-expiree',
    path: `/projects/${notMineProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.route('**/v1/projects/*/follow', (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'unauthorized', message: '' } }),
        }),
      )
      await page.getByRole('switch', { name: /Suivre ce projet|Projet suivi/ }).click()
      await page.getByRole('link', { name: 'Me reconnecter' }).waitFor()
    },
  },
  // Tranche 7a : signaler le commentaire d'Inès sur le projet de Max, puis le quota atteint.
  {
    name: 'signaler',
    path: `/report?kind=comment&id=${notMineComments[0]?.id}&project=${commentedProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'signaler-erreur',
    path: `/report?kind=comment&id=${notMineComments[0]?.id}&project=${commentedProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.route('**/v1/reports', (route) =>
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'rate_limited', message: '' } }),
        }),
      )
      await page.getByRole('radio', { name: /^Arnaque ou spam/ }).click()
      await page.getByRole('button', { name: 'Envoyer' }).click()
      await page.getByRole('alert').waitFor()
    },
  },
  // La modération, vue par Léa administratrice : la file, les retirés, le dialogue « Retirer ».
  { name: 'moderation', path: '/moderation', signedIn: true, admin: true, fullPage: true },
  {
    name: 'moderation-retires',
    path: '/moderation',
    signedIn: true,
    admin: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByRole('radio', { name: 'Retirés' }).click()
      await page.getByRole('button', { name: 'Rétablir' }).first().waitFor()
    },
  },
  {
    name: 'moderation-retirer',
    path: '/moderation',
    signedIn: true,
    admin: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Retirer', exact: true }).first().click()
      await page.getByRole('heading', { name: 'Retirer ce contenu ?' }).waitFor()
    },
  },
  // R6b : les pages du catalogue de la Modération. « Outils » : les autres outils à vérifier, puis
  // l'onglet « Catalogue » ; « Catégories » : les projets à ranger, puis l'onglet des catégories.
  {
    name: 'moderation-outils',
    path: '/moderation/tools',
    signedIn: true,
    admin: true,
    fullPage: true,
    prepare: async (page) => {
      // `first()` : le nom de l'outil paraît deux fois, sur sa carte et dans la description cachée
      // qui relie ses boutons à lui (`ActionDescription`).
      await page.getByText('Make.com', { exact: true }).first().waitFor()
    },
  },
  {
    name: 'moderation-outils-catalogue',
    path: '/moderation/tools',
    signedIn: true,
    admin: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByRole('radio', { name: 'Catalogue' }).click()
      await page.getByText('Zapier', { exact: true }).first().waitFor()
    },
  },
  {
    name: 'moderation-categories',
    path: '/moderation/categories',
    signedIn: true,
    admin: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByText('La cabane à oiseaux connectée').first().waitFor()
    },
  },
  {
    name: 'moderation-categories-liste',
    path: '/moderation/categories',
    signedIn: true,
    admin: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByRole('radio', { name: 'Catégories' }).click()
      await page.getByRole('button', { name: 'Nouvelle catégorie' }).waitFor()
    },
  },
  { name: 'reglages-admin', path: '/settings', signedIn: true, admin: true, fullPage: true },
  // Tranche 7b : bloquer. Le menu « … » de la page de Max, ouvert ; puis « Bloquer » choisi, la
  // fenêtre qui dit ce qui change ; la page de Sam vue par Léa qui l'a bloqué (l'en-tête seul,
  // « Tu as bloqué @sam ») ; la liste « Membres bloqués », pleine puis vide ; la confirmation d'un
  // signalement qui propose « Bloquer aussi @ines_haddad » ; un fil où deux commentaires sont
  // remplacés par leur emplacement ; le menu « … » d'un projet.
  {
    name: 'membre-menu',
    path: `/members/${max.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Plus d.actions$/ }).click()
      await page.getByRole('menuitem', { name: 'Bloquer' }).waitFor()
    },
  },
  {
    name: 'membre-bloquer',
    path: `/members/${max.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Plus d.actions$/ }).click()
      await page.getByRole('menuitem', { name: 'Bloquer' }).click()
      // Le titre finit par « ? » derrière une espace insécable (typo:fix) : une expression suffit.
      await page.getByRole('heading', { name: /^Bloquer @max_durand/ }).waitFor()
    },
  },
  { name: 'membre-bloque', path: `/members/${blockedSam.member.id}`, signedIn: true },
  { name: 'membres-bloques', path: '/blocks', signedIn: true, fullPage: true },
  { name: 'membres-bloques-vide', path: '/blocks', signedIn: true, blocks: 'none' },
  {
    name: 'signaler-envoye',
    path: `/report?kind=comment&id=${notMineComments[0]?.id}&project=${commentedProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByRole('radio', { name: /^Arnaque ou spam/ }).click()
      await page.getByRole('button', { name: 'Envoyer' }).click()
      await page.getByRole('button', { name: 'Bloquer aussi @ines_haddad' }).waitFor()
    },
  },
  {
    name: 'projet-commentaires-bloques',
    path: `/projects/${gardenProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'projet-menu',
    path: `/projects/${notMineProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Plus d.actions$/ }).click()
      await page.getByRole('menuitem', { name: 'Signaler ce projet' }).waitFor()
    },
  },
  // Le projet retiré de Léa, vu par elle : bandeau, note retirée, commentaires retirés.
  {
    name: 'projet-retire',
    path: `/projects/${removedProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  // Les deux sortes de notifications de la modération.
  {
    name: 'notifications-moderation',
    path: '/notifications',
    signedIn: true,
    notifications: 'moderation',
    fullPage: true,
  },
  // Tranche 7c : le compte de Léa suspendu. Le bandeau en haut de l'accueil et d'un projet ; sur
  // son projet, ni « Modifier » ni note à écrire ; sur celui de Max, ni suivre, ni réagir, ni
  // commenter ; le formulaire remplacé par l'état « suspendu » ; le profil fermé, les e-mails
  // réglables.
  { name: 'suspendu-accueil', path: '/', signedIn: true, suspended: true },
  { name: 'suspendu-projet', path: project, signedIn: true, suspended: true, fullPage: true },
  {
    name: 'suspendu-projet-autre',
    path: `/projects/${notMineProject.id}`,
    signedIn: true,
    suspended: true,
    fullPage: true,
  },
  { name: 'suspendu-publier', path: '/projects/new', signedIn: true, suspended: true },
  {
    name: 'suspendu-profil',
    path: '/settings/profile',
    signedIn: true,
    suspended: true,
    fullPage: true,
  },
  // La suspension et sa fin, dans les notifications.
  {
    name: 'notifications-suspension',
    path: '/notifications',
    signedIn: true,
    notifications: 'suspension',
    fullPage: true,
  },
  // Côté administrateur (Léa) : « Suspendre » Sam depuis la carte de son commentaire signalé (la
  // carte et son rappel « Déjà pour @sam… » sont sur la capture « moderation ») ; « Lever » la
  // suspension de Karim ; l'historique, entier puis filtré sur Sam.
  {
    name: 'suspendre',
    path: `/suspend?member=${samMember.id}&fromKind=comment&fromId=${scamCommentItem.target.id}`,
    signedIn: true,
    admin: true,
    fullPage: true,
  },
  {
    name: 'lever',
    path: `/suspend?member=${karim.id}`,
    signedIn: true,
    admin: true,
    fullPage: true,
  },
  {
    name: 'moderation-historique',
    path: '/moderation?tab=history',
    signedIn: true,
    admin: true,
    fullPage: true,
  },
  {
    name: 'moderation-historique-membre',
    path: `/moderation?tab=history&member=${samMember.id}`,
    signedIn: true,
    admin: true,
    fullPage: true,
  },
  { name: 'publier', path: '/projects/new', signedIn: true, fullPage: true },
  { name: 'projet', path: project, signedIn: true, fullPage: true },
  // Après un changement de statut, le formulaire ramène l'auteur sur son projet avec une note
  // toute prête dans le champ du journal.
  { name: 'projet-annonce', path: `${project}?announce=testable`, signedIn: true, fullPage: true },
  // R8, « Voir en contexte » (planche R8-Contexte) : arrivé d'une notification, la feuille ouverte
  // sur le fil du commentaire visé (en tête, éclairé), puis sur un commentaire disparu (« Ce
  // commentaire n'est plus là. »). Sur ordinateur, la colonne déroulée amène le commentaire en vue.
  {
    name: 'contexte',
    path: `/projects/${recipesProject.id}?comment=${contextCommentId}`,
    signedIn: true,
  },
  {
    name: 'contexte-parti',
    path: `/projects/${recipesProject.id}?comment=${goneCommentId}`,
    signedIn: true,
  },
  { name: 'modifier', path: `${project}/edit`, signedIn: true, fullPage: true },
  // Le projet avec ses photos : couverture verticale sur téléphone, vignettes, éditeur des photos.
  { name: 'projet-photos', path: `/projects/${photosProject.id}`, signedIn: true, fullPage: true },
  {
    name: 'modifier-photos',
    path: `/projects/${photosProject.id}/edit`,
    signedIn: true,
    fullPage: true,
  },
  // R6a : la seconde feuille « Catégorie et outils », une catégorie cochée.
  {
    name: 'publier-categorie',
    path: '/projects/new',
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Catégorie(?! et outils)/ }).click()
      await page.getByRole('checkbox', { name: /^Sciences et espace/ }).click()
    },
  },
  // R6b : « Autre » cochée (son aide sous les cases) et un nom absent du catalogue, ajouté comme
  // autre outil (sa pastille marquée, l'aide sous le champ).
  {
    name: 'publier-categorie-autre',
    path: '/projects/new',
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Catégorie(?! et outils)/ }).click()
      await page.getByRole('checkbox', { name: /^Autre/ }).click()
      await page.getByRole('combobox', { name: 'Outils' }).fill('Teachable Machine')
      await page.getByRole('option', { name: /comme autre outil/ }).click()
    },
  },
  // R6b : les catégories en panne (GET /v1/categories en 500) : le message et « Réessayer » à leur
  // place, les outils toujours là.
  {
    name: 'publier-categorie-erreur',
    path: '/projects/new',
    signedIn: true,
    prepare: async (page) => {
      await page.route(
        (url) => url.pathname === '/v1/categories',
        (route) =>
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'internal', message: '' } }),
          }),
      )
      // Depuis R6b, le formulaire lit les catégories dès son ouverture : la page est rechargée
      // pour que cette première lecture tombe déjà en panne (sinon la feuille garde la liste lue).
      await page.reload()
      await page.getByRole('button', { name: /^Catégorie(?! et outils)/ }).click()
      await page.getByRole('button', { name: 'Réessayer' }).first().waitFor({ timeout: 15_000 })
    },
  },
  // R6a : un titre tapé, puis « Annuler » : « Abandonner ce projet ? » par-dessus la feuille. (Pas
  // Échap : en CI, la touche pouvait arriver avant que la feuille l'écoute, et rien ne s'ouvrait.)
  {
    name: 'publier-abandon',
    path: '/projects/new',
    signedIn: true,
    prepare: async (page) => {
      const title = page.getByLabel('Titre', { exact: true })
      await title.fill('Le ciel de ce soir')
      await page.getByRole('button', { name: 'Annuler', exact: true }).first().click()
      await page.getByText('Abandonner ce projet ?').waitFor()
    },
  },
  // R6a : « Supprimer » du menu « … » de l'auteur ouvre la fenêtre (vignette, badge corbeille).
  {
    name: 'supprimer-projet',
    path: project,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Plus d’actions', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Supprimer', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Supprimer', exact: true })
        .waitFor()
    },
  },
  // La page d'un membre (la sienne : avec un brouillon privé), et celle d'une étiquette, pleine
  // puis vide.
  { name: 'membre', path: `/members/${leaMe.id}`, signedIn: true, fullPage: true },
  // « Moi » (R3) : la même page par l'onglet, sans « Retour », la roue des réglages en haut à
  // droite.
  { name: 'moi', path: '/me', signedIn: true, fullPage: true },
  // La barre d'onglets au plus étroit (320 points) avec le texte à 200 % (relecture du plan R3,
  // ui-8) : les libellés passent sous l'icône, sur une ligne. Téléphone seulement (l'ordinateur
  // n'a pas de barre d'onglets) ; `textScale` grossit chaque texte, comme le réglage d'un
  // téléphone (le web n'a pas de `fontScale`).
  {
    name: 'barre-320-texte-200',
    path: '/',
    signedIn: true,
    phone: { width: 320, height: 640 },
    phoneOnly: true,
    textScale: 2,
  },
  { name: 'etiquette', path: '/tags/claude-code', signedIn: true, fullPage: true },
  { name: 'etiquette-vide', path: '/tags/inconnu', signedIn: true },
  // Les états d'une page : réservée aux membres (vue par un visiteur), chargement en échec,
  // adresse qui ne mène nulle part.
  { name: 'visiteur-projet', path: project, signedIn: false },
  // wait : l'appli réessaie deux fois une lecture ratée (environ 3 s) avant d'afficher l'erreur.
  { name: 'erreur', path: '/members/erreur', signedIn: true, wait: 4500 },
  { name: 'adresse-inconnue', path: '/nulle-part', signedIn: false },
  { name: 'adresse-verifiee', path: '/verified', signedIn: true },
  // Se désinscrire depuis un e-mail (tranche 6c), sans connexion : la question, la confirmation,
  // « Tout couper », puis un lien abîmé (« Lien invalide » dès l'ouverture). « profil » montre la
  // section « E-mails ».
  { name: 'desinscription', path: `/unsubscribe?token=${recapToken}`, signedIn: false },
  {
    name: 'desinscription-faite',
    path: `/unsubscribe?token=${recapToken}`,
    signedIn: false,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Confirmer' }).click()
      await page.getByText(/Tu ne recevras plus le récap de la semaine/).waitFor()
    },
  },
  {
    name: 'desinscription-tout',
    path: `/unsubscribe?token=${mentionsToken}`,
    signedIn: false,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Confirmer' }).click()
      await page.getByText(/Tu ne recevras plus d’e‑mail quand on te mentionne/).waitFor()
      // « Tout couper » ignore les appuis des 600 ms qui suivent la confirmation (la seconde tape
      // d'une double tape) : on appuie comme un membre qui a lu le message.
      await page.waitForTimeout(700)
      await page.getByRole('button', { name: 'Tout couper' }).click()
      await page.getByText(/plus aucun e‑mail de notification/).waitFor()
    },
  },
  {
    name: 'desinscription-invalide',
    path: `/unsubscribe?token=${malformedToken}`,
    signedIn: false,
  },
  // Des contenus très longs : titre, description, outils, adresse de démo.
  { name: 'projet-long', path: `/projects/${longProject.id}`, signedIn: true, fullPage: true },
  { name: 'pas-a-moi', path: `/projects/${notMineProject.id}/edit`, signedIn: true },
  // Un projet qui n'existe pas (ou privé) : l'API simulée répond « introuvable ».
  {
    name: 'projet-introuvable',
    path: '/projects/00000000-0000-4000-8000-000000000000',
    signedIn: true,
  },
  // Tranche R5a, la page projet (planches R5a-*) : le projet d'Inès à trois photos et trois prompts,
  // l'éventail des réactions (ouvert d'un clic droit, comme d'un appui long), la feuille Partager,
  // le brouillon privé vu par Léa, et la page de sortie qui nomme le projet de la démo.
  { name: 'projet-galerie', path: `/projects/${launchProject.id}`, signedIn: true, fullPage: true },
  {
    name: 'projet-eventail',
    path: `/projects/${launchProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page
        .getByRole('button', { name: /^Bluffant/ })
        .first()
        .click({ button: 'right' })
      await page.getByRole('dialog', { name: 'Les réactions' }).waitFor()
    },
  },
  {
    name: 'projet-partager',
    path: `/projects/${launchProject.id}`,
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Partager', exact: true }).first().click()
      await page.getByRole('button', { name: 'Copier le lien' }).waitFor()
    },
  },
  { name: 'projet-auteur-prive', path: `/projects/${draftProject.id}`, signedIn: true },
  {
    name: 'sortie-demo',
    path: `/out?url=${encodeURIComponent(launchProject.demoUrl)}&project=${launchProject.id}`,
    signedIn: true,
  },
  // Tranche R3 : la recherche par mots (planche R3-Recherche) : des résultats, rien trouvé, le
  // quota dépassé ; et l'onglet Ruches, avant les ruches.
  { name: 'recherche', path: '/search?q=carn', signedIn: true, fullPage: true },
  { name: 'recherche-vide', path: '/search?q=carnaval', signedIn: true },
  { name: 'recherche-429', path: '/search?q=quota', signedIn: true },
  // R6b : la recherche filtrée par une catégorie (« Animaux » : un projet sur deux), puis par une
  // catégorie où rien n'est trouvé, sur l'onglet « Projets » (le message et de quoi retirer le filtre).
  { name: 'recherche-categorie', path: '/search?q=carn&category=animals', signedIn: true },
  {
    name: 'recherche-categorie-vide',
    path: '/search?q=carn&category=travel',
    signedIn: true,
    prepare: async (page) => {
      await page.getByRole('radio', { name: /^Projets/ }).click()
      await page.getByText('Aucun projet trouvé dans cette catégorie.').waitFor()
    },
  },
  { name: 'ruches', path: '/hives', signedIn: true },
]
// Le garde des captures (loading-guard.ts) : juste avant chaque capture, après les attentes
// habituelles, la page ne doit plus montrer « Chargement… » ni « Cette page n’a pas pu se
// charger ». Sinon la capture photographie une attente ou une panne (des données simulées
// invalides, en 7c), et le script échoue en la nommant. Les textes viennent des traductions
// françaises, la langue de toutes les captures (locale fr-FR plus bas).
const unfinished = unfinishedTexts(fr)
// Les pages qui montrent l'un de ces textes exprès : le catalogue (les états « chargement » et
// « erreur » de StateMessage) et « erreur » (une lecture qui échoue, LoadErrorScreen).
const intendedUnfinished = ['catalogue', 'erreur', 'fil-chargement', 'fil-erreur']
// Le texte visible de la page : innerText donne une ligne par bloc, sans ce qui est caché
// (display: none) ; textContent collerait tous les textes et lirait aussi les cachés.
// Depuis Miel 2 (R1), un squelette ou le logo du lancement n'affichent plus « Chargement… » :
// c'est leur nom pour les lecteurs d'écran (aria-label). On ajoute donc au texte le nom de chaque
// élément occupé (aria-busy), une ligne chacun, pour que le garde les voie encore.
const visibleText = (page) =>
  page.evaluate(() => {
    const busy = [...document.querySelectorAll('[aria-busy="true"]')]
      .map((element) => element.getAttribute('aria-label'))
      .filter(Boolean)
    // biome-ignore lint/performance/useDomNodeTextContent: on veut le texte rendu (voir ci-dessus).
    return [document.body.innerText, ...busy].join('\n')
  })
const unfinishedProblem = async (page, shot, name) =>
  loadingProblem(name, await visibleText(page), {
    texts: unfinished,
    page: shot.name,
    intended: intendedUnfinished,
  })
// Avant le garde, on laisse à la page le temps de finir de charger : 10 s au plus, en la relisant
// tous les quarts de seconde (voir waitUntilLoaded). Une page chargée passe tout de suite ; une
// page en panne échoue toujours, seulement 10 s plus tard.
const settleLoading = (page, shot) =>
  waitUntilLoaded(() => unfinishedProblem(page, shot, shot.name), { patience: 10_000, step: 250 })

/**
 * Grossit chaque texte affiché (et sa hauteur de ligne) de `factor`, comme le réglage « taille du
 * texte » d'un téléphone poussé à 200 % : la largeur de l'écran ne change pas, seul le texte
 * grossit. Sur le web, `fontScale` vaut toujours 1 : on écrit donc les tailles dans la page. Les
 * tailles sont toutes lues avant d'être écrites (un parent grossi changerait celles de ses enfants).
 * Même règle que `textScale` des essais (`.claude/explore/lib.mjs`).
 */
const scaleText = async (page, factor) => {
  await page.evaluate((factor) => {
    const all = [...document.querySelectorAll('body *')]
    const sizes = all.map((element) => {
      const style = getComputedStyle(element)
      return [Number.parseFloat(style.fontSize), style.lineHeight]
    })
    all.forEach((element, rank) => {
      const [font, line] = sizes[rank]
      element.style.fontSize = `${font * factor}px`
      if (line !== 'normal') element.style.lineHeight = `${Number.parseFloat(line) * factor}px`
    })
  }, factor)
  await page.waitForTimeout(400) // le temps que la barre se mesure de nouveau (onLayout)
}

const devices = [
  { name: 'telephone', viewport: { width: 390, height: 844 } },
  { name: 'ordinateur', viewport: { width: 1440, height: 900 } },
]
const schemes = [
  { name: 'jour', colorScheme: 'light' },
  { name: 'nuit', colorScheme: 'dark' },
]

// 5. Les pages choisies (--only), la liste (--list), puis la construction et le serveur.
if (only) {
  const unknown = only.filter((name) => !pages.some((p) => p.name === name))
  if (unknown.length > 0) {
    fail(`--only : page inconnue (${unknown.join(', ')}). Les noms : voir --list.`)
  }
}
const selected = only ? pages.filter((p) => only.includes(p.name)) : pages

if (has('--list')) {
  const width = Math.max(...selected.map((p) => p.name.length))
  for (const p of selected) {
    console.log(`${p.name.padEnd(width)}  ${p.path}${p.signedIn ? '  (Léa connectée)' : ''}`)
  }
  process.exit(0)
}

if (has('--no-build')) checkStamp({ ignore: has('--tampon-ignore') })
else buildSite()

// La construction, servie comme par un hébergeur (dist-shots.mjs).
const server = createSiteServer()
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

// La file : les captures se prennent trois à la fois (une par une avec --serial). Une capture
// passe l'essentiel de son temps à attendre (le réseau, les ressorts, les fondus) : pendant
// qu'une page attend, une autre peut se charger. Au-delà de trois, la machine de la CI (quatre
// processeurs) serait trop chargée, et les animations risqueraient de ne pas finir à temps.
// Chaque travail ouvre son propre contexte Playwright (un navigateur « neuf » : ses cookies, sa
// fenêtre, son API simulée) : rien ne passe d'un travail à l'autre.
const lanes = has('--serial') ? 1 : 3
// Fait `work(job)` pour chaque travail, `lanes` à la fois. Une « voie » est une boucle asynchrone
// qui prend le prochain travail de la liste dès qu'elle a fini le sien ; les voies tournent en
// même temps, mais JavaScript n'exécute qu'un bout de code à la fois : `next++` ne peut pas être
// lu par deux voies au même instant. Au premier échec, les voies finissent leur travail en cours,
// n'en prennent plus, et l'erreur est relancée.
const runQueue = async (jobs, work) => {
  let next = 0
  let failure = null
  const lane = async () => {
    while (next < jobs.length && !failure) {
      const job = jobs[next++]
      try {
        await work(job)
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, lane))
  if (failure) throw failure.error
}

// La hauteur du contenu : celle de la plus haute zone de la page (l'écran défile à l'intérieur
// d'un ScrollView, pas la page elle-même).
const contentHeight = (page) =>
  page.evaluate(() =>
    Math.max(...[...document.querySelectorAll('div')].map((el) => el.scrollHeight)),
  )
// La hauteur de ce qui défile : la zone de défilement de l'écran, ou la page entière. Contrairement
// à contentHeight, elle ignore la lumière d'ambiance, qui dérive sans cesse de quelques pixels
// dans son cadre et ne serait jamais « stable ».
const scrollHeight = (page) =>
  page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('div')].filter((el) =>
      ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
    )
    return Math.max(
      document.documentElement.scrollHeight,
      ...scrollers.map((el) => el.scrollHeight),
    )
  })
// Attend que la page ait fini de grandir (la description, le journal, les commentaires se
// dessinent après le haut de la page), puis rend sa hauteur. Une attente fixe ne suffit pas :
// quand trois pages se dessinent en même temps, chacune va moins vite, et la première version
// de ce script photographiait parfois une page coupée à mi-hauteur. On mesure toutes les 250 ms,
// jusqu'à deux mesures de suite identiques (au plus 10 secondes).
const settle = async (page) => {
  let last = await scrollHeight(page)
  let steady = 0
  for (let i = 0; i < 40 && steady < 2; i++) {
    await page.waitForTimeout(250)
    const now = await scrollHeight(page)
    steady = now === last ? steady + 1 : 0
    last = now
  }
  return contentHeight(page)
}

// --layout : au lieu des captures habituelles, chaque page est mesurée à neuf largeurs d'écran, du
// petit téléphone au grand écran. Le rapport (<dossier>/layout/rapport.md) signale ce qui dépasse de la
// largeur (défilement horizontal), les zones à toucher de moins de 44 points, et garde une capture
// par largeur. C'est l'outil de la relecture du design ; il ne fait échouer aucune vérification,
// sauf une page restée en chargement ou en panne (le garde des captures, voir intendedUnfinished).
// --explore <script.mjs> : l'appli tourne sur les mêmes données simulées, et le navigateur est confié
// à un script écrit pour l'occasion (par la relecture du design, hors du dépôt). Il y clique,
// tape, appuie deux fois, navigue au clavier… pour vérifier le comportement des boutons et les cas
// inhabituels, pas seulement l'allure. Le script exporte une fonction par défaut qui reçoit :
// - base : l'adresse de l'appli ; paths : l'adresse de chaque page photographiée, par son nom ;
// - open(signedIn, options) : un contexte de navigateur Playwright (visiteur ou Léa connectée),
//   avec sa propre API simulée ; un `context.route(...)` ajouté ensuite remplace une réponse
//   (erreur, lenteur). options.feed: 'nobody' donne un fil vide ; options.notifications: 'none'
//   aucune notification, 'many' la cloche à « 9+ », 'moderation' celles de la modération ;
//   options.admin: true fait de Léa une administratrice (tranche 7a) ; options.email: 'changed'
//   lui donne sa nouvelle adresse (tranche « adresse ») ; le reste va à newContext.
// - apiUrl : l'adresse de l'API simulée.
const script = optionValue('--explore')
if (script) {
  const browser = await chromium.launch()
  const open = async (
    signedIn,
    { feed, notifications, admin, blocks, email, suspended, emailChoices, ...options } = {},
  ) => {
    const context = await browser.newContext({
      locale: 'fr-FR',
      timezoneId: SHOT_TIMEZONE,
      viewport: { width: 390, height: 844 },
      ...options,
    })
    // L'horloge des captures ; un essai peut poser `page.clock` lui-même pour un autre jour.
    await installShotClock(context)
    await context.route(
      `${apiUrl}/**`,
      fakeApi(signedIn, feed, notifications, admin, blocks, email, suspended, emailChoices),
    )
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

if (has('--layout')) {
  await layoutReport()
  server.close()
  process.exit(0)
}

async function layoutReport() {
  const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]
  claimOut()
  const dir = join(out, 'layout')
  const reportPath = join(dir, 'rapport.md')
  // Avec --only, on ne refait que les pages choisies : le rapport déjà là garde les sections des
  // autres pages (une section commence par « ## <nom> (<adresse>) »), et seules les images des
  // pages choisies sont effacées. Sans --only, on repart d'un dossier vide. Avant (R7a), le rapport
  // était réécrit avec les seules pages choisies, et les mesures des autres se perdaient.
  const kept = new Map()
  if (only && existsSync(reportPath)) {
    let current
    for (const line of readFileSync(reportPath, 'utf8').split('\n')) {
      const heading = line.match(/^## (\S+) \(/)
      if (heading) {
        current = only.includes(heading[1]) ? undefined : []
        if (current) kept.set(heading[1], current)
      }
      current?.push(line)
    }
    // Une image se nomme « <page>-<largeur>.png ». Comparaison de chaînes, pas d'expression
    // régulière construite avec les noms donnés à --only (CodeQL : injection d'expression).
    const imageOf = (name, page) =>
      name.startsWith(`${page}-`) && /^\d+\.png$/.test(name.slice(page.length + 1))
    for (const name of readdirSync(dir)) {
      if (only.some((page) => imageOf(name, page))) rmSync(join(dir, name), { force: true })
    }
  } else {
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  // Le rapport de chaque page, rangé à sa place dans la liste : les pages finissent dans le
  // désordre (trois à la fois), mais le rapport garde l'ordre de la liste.
  const sections = new Map()
  // Les captures restées en chargement (ou en panne), signalées à la fin.
  const unloadedPages = []
  // Les pages qui ont dépassé leur limite de temps, signalées à la fin elles aussi.
  const stuckPages = []
  // Chaque largeur a 60 secondes au plus (page et largeur nommées dans l'erreur). `work` est la
  // promesse de la mesure : si la limite gagne la course, on ne peut pas l'arrêter de force, mais
  // on lui met un `catch` pour que son échec tardif (le contexte fermé sous ses pieds) ne plante
  // pas le script ; la fermeture du contexte, juste après, coupe ses appels en attente.
  const PAGE_DEADLINE = 60_000
  const withDeadline = (work, ms, what) => {
    let timer
    const limit = new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(Object.assign(new Error(`${what} : plus de ${ms / 1000} s`), { deadline: true })),
        ms,
      )
    })
    work.catch(() => {})
    return Promise.race([work, limit]).finally(() => clearTimeout(timer))
  }
  // Un travail par page, dans son propre contexte : sa fenêtre, neuve ; l'API simulée est reposée
  // neuve à chaque largeur (voir measureWidth).
  const measure = async (shot) => {
    const lines = [`## ${shot.name} (${shot.path})`, '']
    const context = await browser.newContext({
      locale: 'fr-FR',
      timezoneId: SHOT_TIMEZONE,
      viewport: { width: 390, height: 844 },
    })
    try {
      await installShotClock(context)
      const page = await context.newPage()
      // La mesure d'une largeur. Elle est lancée plus bas sous une limite de temps : voir
      // `withDeadline`.
      const measureWidth = async (width) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
        // Une largeur ne doit rien hériter de la précédente : on lève toutes les routes (celles de
        // `prepare`, posées sur la page, comme l'API simulée, posée sur le contexte) et on repose
        // une API simulée NEUVE, qui a oublié ce que la page y avait changé (le pseudo enregistré à
        // 320 px, un signalement, une réaction). Sans cela, la route de fil-chargement, qui ne
        // répond jamais, empêchait « networkidle » à toutes les largeurs suivantes (R4).
        await page.unrouteAll({ behavior: 'ignoreErrors' })
        await context.unrouteAll({ behavior: 'ignoreErrors' })
        await context.route(
          `${apiUrl}/**`,
          fakeApi(
            shot.signedIn,
            shot.feed,
            shot.notifications,
            shot.admin,
            shot.blocks,
            shot.email,
            shot.suspended,
            shot.emailChoices,
          ),
        )
        await page.goto(base + shot.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(shot.wait ?? 600)
        if (shot.prepare) {
          await shot.prepare(page)
          await page.waitForTimeout(300)
        }
        if (shot.textScale) await scaleText(page, shot.textScale)
        await settleLoading(page, shot)
        await settle(page) // la page entière, pas seulement son haut (voir settle)
        // Une page restée en chargement ne se mesure pas : noté dans le rapport, et le script
        // échoue à la fin (voir intendedUnfinished).
        const unloaded = await unfinishedProblem(page, shot, `${shot.name}-${width}`)
        if (unloaded) unloadedPages.push(unloaded)
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
        if (unloaded) notes.push('**page non chargée**')
        if (found.scroll > 0) notes.push(`défilement horizontal de ${found.scroll} px`)
        if (found.outside.length > 0) notes.push(`hors de l'écran : ${found.outside.join(' ; ')}`)
        if (found.small.length > 0) notes.push(`zones à toucher < 44 : ${found.small.join(' ; ')}`)
        lines.push(
          `- **${width} px** : ${notes.length > 0 ? notes.join(' — ') : 'rien à signaler'}`,
        )
      }
      for (const width of widths) {
        try {
          await withDeadline(measureWidth(width), PAGE_DEADLINE, `${shot.name} à ${width} px`)
        } catch (error) {
          if (!error.deadline) throw error
          // Une page bloquée coûtait 17 min à tout le rapport (R4) : on la note, on abandonne ses
          // largeurs restantes (le `finally` ferme le contexte, ce qui coupe ce qui attendait
          // encore), et les autres pages continuent.
          stuckPages.push(error.message)
          lines.push(`- **${width} px** : **page bloquée** (${error.message})`)
          break
        }
      }
      lines.push('')
      sections.set(shot, lines)
    } finally {
      await context.close()
    }
  }
  try {
    await runQueue(selected, measure)
  } finally {
    await browser.close()
  }
  // Les pages dans l'ordre de la liste : celles mesurées maintenant, et celles gardées du rapport
  // d'avant (une page retirée de la liste disparaît du rapport). Une section gardée finit déjà par
  // sa ligne vide.
  const lines = [
    '# Mise en page à plusieurs largeurs',
    '',
    ...pages.flatMap((shot) => sections.get(shot) ?? kept.get(shot.name) ?? []),
  ]
  writeFileSync(reportPath, `${lines.join('\n').replace(/\n+$/, '')}\n`)
  console.log(`Rapport de mise en page : ${reportPath}`)
  if (stuckPages.length > 0) console.error(`Pages bloquées :\n${stuckPages.join('\n')}`)
  if (unloadedPages.length > 0) console.error(`Pages non chargées :\n${unloadedPages.join('\n')}`)
  if (stuckPages.length > 0 || unloadedPages.length > 0) {
    server.close()
    process.exit(1)
  }
}

// Le dossier des captures : sans --only, on repart d'un dossier vide ; avec --only, on n'efface
// que les captures des pages choisies, et celles des autres pages restent. Le nom d'une capture
// donne sa page : « projet-autre-2-telephone-nuit.png » → « projet-autre ».
claimOut()
const shotName = new RegExp(
  `^(.+?)(?:-\\d+)?-(?:${devices.map((d) => d.name).join('|')})-(?:${schemes.map((s) => s.name).join('|')})\\.png$`,
)
for (const name of readdirSync(out)) {
  if (name === '.shots') continue
  if (only && !only.includes(name.match(shotName)?.[1])) continue
  rmSync(join(out, name), { recursive: true, force: true })
}

// Une page longue est photographiée en plusieurs tranches, en faisant défiler sa zone de
// défilement. Au-delà de 16 000 points, Chromium refuse une fenêtre plus haute ; bien avant, il
// laisse des zones non peintes, sans erreur, quand l'image est grande en pixels. Les captures
// sont prises à l'échelle 2 : des tranches de 12 000 points faisaient 23 000 pixels de haut, et
// sur ordinateur (2 880 pixels de large) les champs et les choix du catalogue sortaient en
// blanc. On coupe donc au-delà de 6 000 points, soit 12 000 pixels (le catalogue : catalogue,
// catalogue-2…). Avec --read, les tranches font environ 1 600 pixels, une hauteur qui se lit
// confortablement, et sont numérotées dès la première (nom-1).
const PART = read ? 1600 : 6000
const scale = read ? 1 : 2

// Les travaux de la file : une capture par page, appareil et thème. Le catalogue, le plus long,
// est en tête de la liste : il commence tôt au lieu de finir seul, après tous les autres.
// Une page peut changer la fenêtre du téléphone (`phone`, la barre à 320 points) et se passer de
// l'ordinateur (`phoneOnly`).
const devicesFor = (shot) =>
  devices
    .filter((device) => !shot.phoneOnly || device.name === 'telephone')
    .map((device) =>
      shot.phone && device.name === 'telephone' ? { ...device, viewport: shot.phone } : device,
    )
// Avec --shard, seule la part demandée de cette liste (le catalogue, en tête, se partage entre les
// parts, au lieu de rester tout entier dans la première).
const allJobs = selected.flatMap((shot) =>
  devicesFor(shot).flatMap((device) => schemes.map((scheme) => ({ shot, device, scheme }))),
)
const jobs = shardOf(allJobs, shard)
if (shard)
  console.log(`Part ${shard.index}/${shard.count} : ${jobs.length} travaux sur ${allJobs.length}.`)

const browser = await chromium.launch()
// Les erreurs de toutes les pages, réunies ici et signalées à la fin (le script échoue alors).
// Plusieurs pages y ajoutent les leurs en même temps : sans risque, JavaScript n'exécute qu'un
// bout de code à la fois.
const problems = []
const capture = async ({ shot, device, scheme }) => {
  // Un contexte neuf par capture, avec son API simulée neuve : ce qu'une page enregistre (un
  // nouveau pseudo) ne se voit sur aucune autre, et une capture ne dépend pas de celles prises
  // avant elle, ni de celles prises en même temps.
  const context = await browser.newContext({
    viewport: device.viewport,
    colorScheme: scheme.colorScheme,
    locale: 'fr-FR',
    timezoneId: SHOT_TIMEZONE,
    deviceScaleFactor: scale,
  })
  try {
    await installShotClock(context)
    await context.route(
      `${apiUrl}/**`,
      fakeApi(
        shot.signedIn,
        shot.feed,
        shot.notifications,
        shot.admin,
        shot.blocks,
        shot.email,
        shot.suspended,
        shot.emailChoices,
      ),
    )
    const page = await context.newPage()
    // Une erreur dans la page (ou une page qui ne s'hydrate pas) est signalée à la fin.
    page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`))
    await page.goto(base + shot.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(shot.wait ?? 600) // le temps des ressorts et des fondus
    // Un geste avant la capture (ouvrir un champ), puis le temps de son fondu.
    if (shot.prepare) {
      await shot.prepare(page)
      await page.waitForTimeout(300)
    }
    if (shot.textScale) await scaleText(page, shot.textScale)
    await settleLoading(page, shot)
    const height = await settle(page)
    // La page s'est-elle chargée ? (voir intendedUnfinished) Le problème est signalé à la fin,
    // avec les erreurs des pages ; la capture est prise quand même, pour qu'on la regarde.
    const unloaded = await unfinishedProblem(
      page,
      shot,
      `${shot.name}-${device.name}-${scheme.name}`,
    )
    if (unloaded) problems.push(unloaded)
    // Le nom du fichier : sans numéro pour une seule image ; ensuite catalogue, catalogue-2…
    // ou, avec --read, nom-1, nom-2…
    const file = (part, parts) => {
      const numbered = read ? parts > 1 : part > 1
      return join(
        out,
        `${shot.name}${numbered ? `-${part}` : ''}-${device.name}-${scheme.name}.png`,
      )
    }
    if (!shot.fullPage) {
      await page.screenshot({ path: file(1, 1) })
      return
    }
    // L'écran défile à l'intérieur de la page (ScrollView) : pour tout photographier, on
    // agrandit la fenêtre à la hauteur de son contenu (mesurée par settle).
    // Des tranches de hauteur égale (au plus PART) : la dernière tombe pile en bas de la page,
    // au lieu de reprendre une partie de la précédente.
    const parts = Math.max(1, Math.ceil(height / PART))
    const slice = Math.ceil(height / parts)
    await page.setViewportSize({ ...device.viewport, height: slice })
    await page.waitForTimeout(300)
    for (let part = 1; part <= parts; part++) {
      if (part > 1) {
        await page.evaluate(
          (top) => {
            // Seulement une vraie zone de défilement (overflow auto ou scroll) : un bloc qui
            // dépasse d'un pixel sans défiler était choisi à sa place, et la deuxième capture
            // reprenait le haut de la page, à moitié peint.
            const scrollers = [...document.querySelectorAll('div')].filter(
              (el) =>
                el.scrollHeight > el.clientHeight &&
                ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
            )
            const main = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
            // Sans zone de défilement à elle, c'est la page entière qui défile.
            if (main) main.scrollTop = top
            else window.scrollTo(0, top)
          },
          (part - 1) * slice,
        )
        await page.waitForTimeout(300)
      }
      await page.screenshot({ path: file(part, parts) })
    }
  } finally {
    await context.close()
  }
}
try {
  await runQueue(jobs, capture)
} finally {
  await browser.close()
  server.close()
}

console.log(`Captures dans ${out}`)
if (problems.length > 0) {
  console.error(`Erreurs dans les pages :\n${problems.join('\n')}`)
  process.exit(1)
}
