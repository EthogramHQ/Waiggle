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
//   --out <dossier>   le dossier des captures (shots/ par défaut). Deux agents lancés en même
//                     temps, chacun avec son dossier, ne s'écrasent pas.
//   --read            des captures faites pour être lues par un agent : à l'échelle 1 (au lieu de
//                     2), et les pages longues coupées en tranches d'environ 1 600 pixels de haut
//                     (nom-1, nom-2…), plus faciles à regarder qu'une image de 10 000 pixels.
//   --layout          mesure la mise en page à 9 largeurs (rapport dans <dossier>/layout/).
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
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { fr } from '../../../packages/i18n/src/locales/fr.ts'
import { blockedPageOf, blockedSam } from '../src/testing/blocks.ts'
import {
  leaEmailPreferences,
  malformedToken,
  mentionsToken,
  recapToken,
  refusedToken,
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
  projectWithPhotos,
  recipesProject,
  summaryOf,
} from '../src/testing/projects.ts'
import { build, buildSite, checkStamp, createSiteServer, root } from './dist-shots.mjs'
import { loadingProblem, unfinishedTexts } from './loading-guard.ts'

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
]
for (const [i, arg] of args.entries()) {
  // « -- » vient de « pnpm … shots -- --list » ; une valeur suit son option.
  const isValue = ['--only', '--out', '--explore'].includes(args[i - 1])
  if (arg !== '--' && !isValue && !known.includes(arg)) {
    fail(`Option inconnue : ${arg}. Options possibles : ${known.join(', ')}.`)
  }
}
const read = has('--read')
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
const emailOf = { current: leaMe.email, changed: changeEmailShot.newEmail }
// Les notes du journal (tranche 4b), de la plus récente à la plus ancienne. Une note, pour l'API
// simulée : son identifiant, son texte, et le jour (d'octobre 2026) de sa publication.
const note = (n, body, day) => ({
  id: `0b1c2d3e-4f50-4a61-8b72-00000000000${n}`,
  body,
  createdAt: new Date(Date.UTC(2026, 9, day, 9)).toISOString(),
  // Le retrait par la modération (tranche 7a) : aucun par défaut.
  removal: null,
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
// La page d'une étiquette : deux projets différents qui la portent, de deux membres (photosProject
// et recipesProject sont le même projet, l'un avec photos : la page montrait deux fois le même).
const claudeCode = {
  slug: 'claude-code',
  label: 'Claude Code',
  projects: [summaryOf(fromOthers[0]), summaryOf(recipesProject)],
}
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
// Tranche 7c : deux membres que la modération connaît. Sam (celui de la file, testing/moderation.ts)
// peut être suspendu ; Karim l'est déjà, 7 jours après un signalement.
const samPage = {
  ...leaPage,
  id: samMember.id,
  name: samMember.name,
  handle: samMember.handle,
  bio: 'Je teste des robots de messagerie.',
  favoriteTools: [{ label: 'ChatGPT', slug: 'chatgpt' }],
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
  favoriteTools: [{ label: 'Cursor', slug: 'cursor' }],
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
// feed: 'end' : le fil tient en une page, son bas dit « Tu es à jour » (R1, le miel vif local).
const followingFeed = (feed) =>
  feed === 'nobody'
    ? { items: [], nextCursor: null, followsAnyone: false }
    : { items: followingItems, nextCursor: feed === 'end' ? null : 'suite', followsAnyone: true }

// Les réactions et les commentaires (tranche 5). Un commentaire, pour l'API simulée : son
// identifiant (un numéro), son auteur (null : un emplacement), son texte, le jour et l'heure
// (d'octobre 2026) de sa publication, et le reste au choix (state, isMine, editedAt, replies).
const lea = { id: leaMe.id, name: leaMe.name, avatarUrl: null }
const comment = (n, author, body, day, hour, fields = {}) => ({
  id: `5e6f7081-92a3-4b4c-8d5e-${String(n).padStart(12, '0')}`,
  author,
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
      mentions: [{ handle: 'max_durand', memberId: max.id }],
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
]
// Tranche 7a : le projet « Avis express » de Léa, retiré après un signalement, au nom des règles.
// Elle seule le voit encore : le bandeau en tête, avec l'explication et l'adresse pour contester.
const removedProject = {
  ...recipesProject,
  id: '00000000-0000-4000-8000-0000000000dd',
  title: 'Avis express',
  pitch: 'Il rédige des avis cinq étoiles pour les boutiques de ses amis.',
  removal: { ...removalAfterReport, explanation: 'Écrire de faux avis n’est pas permis ici.' },
  notes: [
    {
      ...note(7, 'v2 : il publie les avis tout seul, sur plusieurs sites à la fois.', 19),
      removal: { ...removalByLaw, explanation: 'Publier de faux avis est une pratique interdite.' },
    },
    note(6, 'Première version : il propose trois avis à recopier.', 14),
  ],
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
// Les commentaires de chaque projet : la première page, puis la suite (curseur « suite »).
const commentsOf = {
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
const commentCountOf = { [recipesProject.id]: 4, [commentedProject.id]: 7, [longProject.id]: 2 }

// Les notifications de Léa (tranche 6b) : une de chaque sorte, sur ses projets, les deux premières
// nouvelles, puis une suite plus ancienne (« Afficher la suite »). Personne n'est nommé pour les
// réactions et les abonnés. Chaque page choisit (notifications: 'none' : aucune ; 'many' : la
// cloche à « 9+ »), et ce choix est donné à sa propre API simulée, comme le fil.
const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString()
const dayOf = (iso) => iso.slice(0, 10)
const notified = (project) => ({ id: project.id, title: project.title })
// L'identifiant d'un commentaire cité (un UUID, comme l'exige le contrat).
const commentIdOf = (n) => `00000000-0000-4000-8000-0000000006b${n}`
const notificationPages = (choice) => {
  if (choice === 'none') return [[]]
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

// L'API simulée d'une page : une fonction appelée par Playwright pour chaque requête vers l'API.
// Tout ce qu'elle retient (réactions, pseudo enregistré) vit dans ses propres variables, créées à
// chaque appel de fakeApi : deux pages ne partagent jamais rien. `feed` choisit le fil de l'accueil.
// `admin` (tranche 7a) : Léa est administratrice, GET /v1/me le dit et la modération répond.
// `blocks` (tranche 7b) : 'some', Léa a bloqué Sam et Théo ; 'none', personne.
// `email` (tranche « adresse ») : 'current', l'adresse de toujours ; 'changed', la nouvelle.
// `suspended` (tranche 7c) : le compte de Léa est suspendu 7 jours (GET /v1/me le dit).
const fakeApi = (
  signedIn,
  feed = 'following',
  notifications = 'some',
  admin = false,
  blocks = 'some',
  email = 'current',
  suspended = false,
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
  // Ses réglages d'e-mail (tranche 6c), tels que le dernier PATCH les a laissés.
  let emailPreferences = structuredClone(leaEmailPreferences)
  // Le projet tel que l'API le donne, avec ses réactions et son nombre de commentaires.
  const withExtras = (project) => ({
    ...project,
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
    // Se désinscrire depuis un e-mail (tranche 6c) : sans session, comme la vraie API. Le jeton
    // vient de l'adresse ; un jeton de bonne forme mais refusé (refusedToken) reçoit 400.
    if (pathname === '/v1/email/unsubscribe' && method === 'POST') {
      const token = url.searchParams.get('token')
      if (token === refusedToken || ![recapToken, mentionsToken].includes(token)) {
        return json(400, { error: { code: 'unsubscribe_invalid', message: '' } })
      }
      return route.fulfill({ status: 204, body: '' })
    }
    if (!signedIn) return json(401, { error: { code: 'unauthorized', message: '' } })
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
    // Publier ou supprimer une note : l'API simulée accepte (les essais au clic, --explore, peuvent
    // remplacer ces réponses par un refus).
    if (/^\/v1\/projects\/[^/]+\/notes$/.test(pathname) && method === 'POST') {
      const { body } = JSON.parse(route.request().postData() ?? '{}')
      return json(201, { id: crypto.randomUUID(), body, createdAt: new Date().toISOString() })
    }
    if (/^\/v1\/projects\/[^/]+\/notes\/[^/]+$/.test(pathname) && method === 'DELETE') {
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
        createdAt: new Date().toISOString(),
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
      return json(200, { ...original, id: one[2], body, editedAt: new Date().toISOString() })
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
    if (pathname === `/v1/projects/${longProject.id}`) return json(200, withExtras(longProject))
    if (pathname === `/v1/projects/${removedProject.id}`) {
      return json(200, withExtras(removedProject))
    }
    if (pathname === `/v1/members/${leaMe.id}`) {
      return json(200, { ...leaMember, name: me.name, handle: me.handle, bio: me.bio })
    }
    if (pathname === `/v1/projects/${gardenProject.id}`) {
      return json(200, withExtras(gardenProject))
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
        blockedAt: new Date().toISOString(),
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
    // Tranche 7c : Sam, auteur du commentaire signalé de la file, et Karim, déjà suspendu. Leur
    // page dit à un administrateur seul où en est la modération (`Member.moderation`) ; la page
    // « Suspendre » (/suspend?member=) la lit, et devient « Lever » pour Karim.
    if (pathname === `/v1/members/${samMember.id}`) return json(200, moderatedPage(samPage, admin))
    if (pathname === `/v1/members/${karim.id}`) return json(200, moderatedPage(karimPage, admin))
    if (pathname === '/v1/tags/claude-code') return json(200, claudeCode)
    if (pathname === '/v1/feed/following') return json(200, followingFeed(feed))
    if (pathname === '/v1/feed/discover') return json(200, { items: feedItems, nextCursor: null })
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
        asOf: new Date().toISOString(),
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
      return json(201, { id: crypto.randomUUID(), action, createdAt: new Date().toISOString() })
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
    if (pathname === '/v1/members/mentionable') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      return json(200, { members: mentionable.filter((m) => m.handle.startsWith(q)).slice(0, 5) })
    }
    if (pathname === '/v1/members/erreur')
      return json(500, { error: { code: 'internal', message: '' } })
    const tag = pathname.match(/^\/v1\/tags\/([^/]+)$/)
    if (tag) return json(200, { slug: tag[1], label: null, projects: [] })
    const media = pathname.match(/^\/media\/visuals\/([0-9a-f-]+)\.webp$/)
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
  // Le bout du fil (R1) : « Tu es à jour » sur le miel vif, sous la dernière carte.
  { name: 'fil-fini', path: '/', signedIn: true, feed: 'end', fullPage: true },
  // Une adresse qui ne mène nulle part (R1) : la page introuvable, sur le miel vif.
  { name: 'introuvable', path: '/nulle-part', signedIn: false },
  // Les notifications (tranche 6b) : la liste (avec sa suite), l'écran vide, et la cloche à « 9+ ».
  { name: 'notifications', path: '/notifications', signedIn: true, fullPage: true },
  { name: 'notifications-vide', path: '/notifications', signedIn: true, notifications: 'none' },
  { name: 'cloche-pleine', path: '/', signedIn: true, notifications: 'many' },
  // La page d'un autre membre et son projet : les boutons « Suivre ».
  { name: 'membre-autre', path: '/members/max-id', signedIn: true, fullPage: true },
  { name: 'projet-autre', path: `/projects/${notMineProject.id}`, signedIn: true, fullPage: true },
  // Les commentaires d'un projet (tranche 5) : les fils, leurs réponses, un commentaire masqué,
  // un supprimé, « Afficher la suite » ; puis les champs ouverts (un commentaire en cours, une
  // réponse), ouverts par un clic une fois la page prête (prepare).
  {
    name: 'projet-commentaires',
    path: `/projects/${commentedProject.id}`,
    signedIn: true,
    fullPage: true,
  },
  {
    name: 'projet-commenter',
    path: `/projects/${commentedProject.id}`,
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Écrire un commentaire' }).click()
      await page
        .getByLabel('Ton commentaire')
        .fill('Testé ce soir : il m’a proposé une soupe de fanes de radis, une vraie réussite.')
      await page.getByRole('button', { name: 'Répondre', exact: true }).first().click()
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
      await page.getByRole('button', { name: 'Écrire un commentaire' }).click()
      const field = page.getByLabel('Ton commentaire')
      await field.fill('Bravo, demande à @i')
      await field.press('n')
      await page.getByRole('option', { name: /Inès Haddad/ }).waitFor()
    },
  },
  { name: 'compte', path: '/account', signedIn: true, fullPage: true },
  { name: 'supprimer-compte', path: '/account/delete', signedIn: true, fullPage: true },
  // Tranche « adresse » : la page qui change l'adresse, la demande partie (le premier lien vers
  // l'adresse actuelle), un mot de passe refusé ; puis les pages des deux liens.
  { name: 'changer-adresse', path: '/account/email', signedIn: true, fullPage: true },
  {
    name: 'changer-adresse-envoye',
    path: '/account/email',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByLabel('Nouvelle adresse e-mail').fill(changeEmailShot.newEmail)
      await page.getByLabel('Confirme avec ton mot de passe').fill(changeEmailShot.password)
      await page.getByRole('button', { name: 'Envoyer le lien' }).click()
      await page.getByText('Regarde ta boîte mail actuelle').waitFor()
    },
  },
  {
    name: 'changer-adresse-erreur',
    path: '/account/email',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page.getByLabel('Nouvelle adresse e-mail').fill(changeEmailShot.newEmail)
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
  { name: 'profil', path: '/profile', signedIn: true, fullPage: true },
  // Tranche 6a : un pseudo déjà pris (celui de Max), refusé sous son champ ; ce qui a été tapé reste.
  {
    name: 'profil-pseudo-pris',
    path: '/profile',
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
    path: '/profile',
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
    path: '/profile',
    signedIn: true,
    fullPage: true,
    prepare: async (page) => {
      await page
        .getByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' })
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
  { name: 'compte-admin', path: '/account', signedIn: true, admin: true, fullPage: true },
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
  { name: 'suspendu-profil', path: '/profile', signedIn: true, suspended: true, fullPage: true },
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
      await page.getByText(/tu ne recevras plus le récap de la semaine/).waitFor()
    },
  },
  {
    name: 'desinscription-tout',
    path: `/unsubscribe?token=${mentionsToken}`,
    signedIn: false,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Confirmer' }).click()
      await page.getByText(/tu ne recevras plus d’e-mail quand on te mentionne/).waitFor()
      // « Tout couper » ignore les appuis des 600 ms qui suivent la confirmation (la seconde tape
      // d'une double tape) : on appuie comme un membre qui a lu le message.
      await page.waitForTimeout(700)
      await page.getByRole('button', { name: 'Tout couper' }).click()
      await page.getByText(/plus aucun e-mail de notification/).waitFor()
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
]
// Le garde des captures (loading-guard.ts) : juste avant chaque capture, après les attentes
// habituelles, la page ne doit plus montrer « Chargement… » ni « Cette page n’a pas pu se
// charger ». Sinon la capture photographie une attente ou une panne (des données simulées
// invalides, en 7c), et le script échoue en la nommant. Les textes viennent des traductions
// françaises, la langue de toutes les captures (locale fr-FR plus bas).
const unfinished = unfinishedTexts(fr)
// Les pages qui montrent l'un de ces textes exprès : le catalogue (les états « chargement » et
// « erreur » de StateMessage) et « erreur » (une lecture qui échoue, LoadErrorScreen).
const intendedUnfinished = ['catalogue', 'erreur']
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
// par largeur. C'est l'outil de l'agent de relecture du design ; il ne fait échouer aucune vérification,
// sauf une page restée en chargement ou en panne (le garde des captures, voir intendedUnfinished).
// --explore <script.mjs> : l'appli tourne sur les mêmes données simulées, et le navigateur est confié
// à un script écrit pour l'occasion (par l'agent de relecture du design, hors du dépôt). Il y clique,
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
    { feed, notifications, admin, blocks, email, suspended, ...options } = {},
  ) => {
    const context = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 390, height: 844 },
      ...options,
    })
    await context.route(
      `${apiUrl}/**`,
      fakeApi(signedIn, feed, notifications, admin, blocks, email, suspended),
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
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  // Le rapport de chaque page, rangé à sa place dans la liste : les pages finissent dans le
  // désordre (trois à la fois), mais le rapport garde l'ordre de la liste.
  const sections = new Map()
  // Les captures restées en chargement (ou en panne), signalées à la fin.
  const unloadedPages = []
  // Un travail par page, dans son propre contexte : sa fenêtre et son API simulée neuve, gardée
  // d'une largeur à l'autre (le pseudo enregistré à 320 px se retrouve à 360 px).
  const measure = async (shot) => {
    const lines = [`## ${shot.name} (${shot.path})`, '']
    const context = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 390, height: 844 },
    })
    try {
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
        ),
      )
      const page = await context.newPage()
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
        await page.goto(base + shot.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(shot.wait ?? 600)
        if (shot.prepare) {
          await shot.prepare(page)
          await page.waitForTimeout(300)
        }
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
  const lines = [
    '# Mise en page à plusieurs largeurs',
    '',
    ...selected.flatMap((shot) => sections.get(shot)),
  ]
  writeFileSync(join(dir, 'rapport.md'), `${lines.join('\n')}\n`)
  console.log(`Rapport de mise en page : ${join(dir, 'rapport.md')}`)
  if (unloadedPages.length > 0) {
    console.error(`Pages non chargées :\n${unloadedPages.join('\n')}`)
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
// catalogue-2…). Avec --read, les tranches font environ 1 600 pixels, la hauteur qu'un agent lit
// confortablement, et sont numérotées dès la première (nom-1).
const PART = read ? 1600 : 6000
const scale = read ? 1 : 2

// Les travaux de la file : une capture par page, appareil et thème. Le catalogue, le plus long,
// est en tête de la liste : il commence tôt au lieu de finir seul, après tous les autres.
const jobs = selected.flatMap((shot) =>
  devices.flatMap((device) => schemes.map((scheme) => ({ shot, device, scheme }))),
)

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
    deviceScaleFactor: scale,
  })
  try {
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
