// Les ruches d'exemple (R10, docs/scenarios/refonte.md, « R10 — Les Ruches ») : les ruches de Léa,
// l'invitation qu'elle a reçue, les membres, les projets réservés à une ruche, l'actualité, le Fil
// d'une ruche, les lignes d'Activité et la page d'un membre en tuiles. Toutes conformes au contrat
// (`packages/contracts/src/hives.ts`), pour les captures (`scripts/shots.mjs`) et les tests à venir.
//
// Seulement des types importés : `scripts/shots.mjs` lit ce fichier avec Node, qui ne sait charger
// ni les sources de @ruche/contracts (leurs imports n'ont pas d'extension), ni un autre fichier de
// `testing/` sans extension. D'où la petite fabrique de photos écrite ici, comme `photo()` de
// `testing/projects.ts`.
//
// Les dates sont comptées depuis l'horloge des captures (le 20 octobre 2026 à midi, heure de Paris,
// `SHOT_NOW` de shots.mjs) : l'actualité d'une ruche ne remonte que 30 jours, et une invitation
// expire après 30 jours. Les membres ont les identifiants des captures (`jean-id`, `odile-id`…) :
// toucher leur nom ouvre une page que le faux serveur connaît.
import type {
  FollowingFeedPage,
  HiveActivityItem,
  HiveActivityPage,
  HiveInvitation,
  HiveMember,
  HiveMembers,
  HivePage,
  HiveProjectsPage,
  HiveSummary,
  InvitableMember,
  Member,
  MemberFace,
  MyHives,
  Notification,
  ProjectSummary,
  ProjectVisual,
} from '@ruche/contracts'

/** L'heure des captures : le 20 octobre 2026 à midi, heure de Paris. */
export const HIVES_NOW = Date.parse('2026-10-20T12:00:00+02:00')

/** Une date d'exemple : `hours` heures avant l'heure des captures. */
export const hoursAgo = (hours: number) => new Date(HIVES_NOW - hours * 3_600_000).toISOString()

// --- Les membres ---

type Person = { id: string; name: string }

/** Léa (la session des captures, `leaMe.id`) et les autres membres des ruches de l'exemple. */
export const lea: Person = { id: 'u1', name: 'Léa' }
export const papiJean: Person = { id: 'jean-id', name: 'Papi Jean' }
export const odile: Person = { id: 'odile-id', name: 'Tante Odile' }
export const ines: Person = { id: 'ines-id', name: 'Inès Haddad' }
export const max: Person = { id: 'max-id', name: 'Max Durand' }
export const hugo: Person = { id: 'hugo-id', name: 'Hugo Lefèvre' }
// Pas `nora-id` : dans les captures, cette Nora-là a bloqué Léa, et bloquer efface les invitations
// entre deux membres. Celle qui invite Léa dans « Atelier IA » est une autre.
export const nora: Person = { id: 'nora-benali-id', name: 'Nora Benali' }

/** Un membre tel que les ruches le montrent : son nom et sa photo (aucune dans l'exemple). */
export const faceOf = (person: Person): MemberFace => ({
  id: person.id,
  name: person.name,
  avatarUrl: null,
})

// --- Les ruches ---

export const familleId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c01'
export const amisId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c02'
export const atelierId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c03'
export const invitationId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c04'
/** La ruche que Léa crée dans la feuille « Créer une ruche ». */
export const createdId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c05'

/** « Famille » : 4 membres, animée par Papi Jean, 2 nouveautés ; Léa en est membre. */
export const famille: HiveSummary = {
  id: familleId,
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: papiJean.id, name: papiJean.name },
  faces: [papiJean, lea, odile, ines].map(faceOf),
  news: 2,
  role: 'member',
}

/** La même ruche, Léa animatrice (les réglages de la ruche ne s'ouvrent qu'à l'animateur). */
export const familleAnimated: HiveSummary = {
  ...famille,
  animator: { id: lea.id, name: lea.name },
  faces: [lea, papiJean, odile, ines].map(faceOf),
  role: 'animator',
}

/** « Amis du jeudi » : 6 membres, animée par Inès, rien de neuf. */
export const amis: HiveSummary = {
  id: amisId,
  name: 'Amis du jeudi',
  icon: 'coffee',
  memberCount: 6,
  animator: { id: ines.id, name: ines.name },
  faces: [ines, max, hugo, lea].map(faceOf),
  news: 0,
  role: 'member',
}

/** L'invitation de Nora Benali dans « Atelier IA » (6 membres), reçue il y a 3 h. */
export const invitation: HiveInvitation = {
  id: invitationId,
  hive: {
    id: atelierId,
    name: 'Atelier IA',
    icon: 'code',
    memberCount: 6,
    animatorName: nora.name,
  },
  inviter: faceOf(nora),
  createdAt: hoursAgo(3),
}

/** Ce que l'invitation donne une fois acceptée (POST …/accept → 200 `HiveSummary`). */
export const atelier: HiveSummary = {
  id: atelierId,
  name: 'Atelier IA',
  icon: 'code',
  memberCount: 7,
  animator: { id: nora.id, name: nora.name },
  faces: [nora, lea].map(faceOf),
  news: 0,
  role: 'member',
}

/** GET /v1/hives : deux ruches et une invitation ; Léa a créé une ruche (pas l'une de celles-ci). */
export const myHives: MyHives = {
  hives: [famille, amis],
  invitations: [invitation],
  createdCount: 1,
}

/** GET /v1/hives, Léa animatrice de Famille (page `ruche-reglages`). */
export const myHivesAnimator: MyHives = { ...myHives, hives: [familleAnimated, amis] }

/** GET /v1/hives : aucune ruche, aucune invitation (l'onglet vide). */
export const noHives: MyHives = { hives: [], invitations: [], createdCount: 0 }

/** GET /v1/hives : le premier lancement, aucune ruche mais une invitation qui attend. */
export const invitedOnly: MyHives = { hives: [], invitations: [invitation], createdCount: 0 }

/** La ruche créée par la feuille (POST /v1/hives → 201 `HiveSummary`) : Léa seule, animatrice. */
export const createdHive = (name: string | null, icon: HiveSummary['icon']): HiveSummary => ({
  id: createdId,
  name,
  icon,
  memberCount: 1,
  animator: { id: lea.id, name: lea.name },
  faces: [faceOf(lea)],
  news: 0,
  role: 'animator',
})

// --- Les projets ---

/** Une photo de projet sur l'API de développement : les captures y répondent par une image. */
const photoOf = (id: string, width = 1600, height = 900): ProjectVisual => ({
  id,
  kind: 'image',
  url: `http://localhost:3000/media/visuals/${id}.webp`,
  width,
  height,
  thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
  description: null,
})

type ProjectFields = {
  title: string
  pitch: string
  author: Person
  /** La ruche à qui le projet est réservé ; `null` : un projet « Membres de Waiggle ». */
  hive: { id: string; name: string | null } | null
  status?: ProjectSummary['status']
  category?: ProjectSummary['primaryCategory']
  /** Le numéro de la photo de couverture ; `null` : un projet sans photo (la tuile à l'initiale). */
  cover?: number | null
  days: number
  demoUrl?: string | null
  visibility?: ProjectSummary['visibility']
}

/** Un projet en version courte (`ProjectSummary`), tel que les listes le donnent. */
const projectOf = (n: number, fields: ProjectFields): ProjectSummary => {
  const at = hoursAgo(fields.days * 24)
  const cover = fields.cover ?? null
  return {
    id: `6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1f${String(n).padStart(2, '0')}`,
    author: faceOf(fields.author),
    title: fields.title,
    pitch: fields.pitch,
    status: fields.status ?? 'building',
    visibility: fields.visibility ?? (fields.hive ? 'hive' : 'public'),
    hive: fields.hive,
    tools: [{ label: 'Claude Code', slug: 'claude-code', inCatalogue: true }],
    cover:
      cover === null
        ? null
        : photoOf(`a1b2c3d4-0000-4000-8000-0000000010${String(cover).padStart(2, '0')}`),
    demoUrl: fields.demoUrl ?? null,
    reactionTotal: n % 3 === 0 ? 0 : n * 2,
    portraitCover: null,
    primaryCategory: fields.category ?? 'family',
    secondaryCategory: null,
    createdAt: at,
    updatedAt: at,
    latestUpdate: null,
    version: null,
  }
}

const inFamille = { id: familleId, name: 'Famille' }

/** Le plan de table de Léa, réservé à Famille (épinglé par Papi Jean). */
export const planDeTable = projectOf(1, {
  title: 'Le plan de table',
  pitch: 'Qui s’assoit à côté de qui pour les 80 ans de Papi Jean.',
  author: lea,
  hive: inFamille,
  cover: 1,
  days: 2,
})
/** Biscotte au parc, de Tante Odile, réservé à Famille. */
export const biscotte = projectOf(2, {
  title: 'Biscotte au parc',
  pitch: 'Le carnet des promenades du chien, avec la météo du jour.',
  author: odile,
  hive: inFamille,
  category: 'animals',
  cover: 2,
  days: 5,
})
/** Les recettes de Mamie, de Tante Odile, réservé à Famille, sans photo. */
export const recettesMamie = projectOf(3, {
  title: 'Les recettes de Mamie',
  pitch: 'Les fiches de Mamie, recopiées et cherchables par ingrédient.',
  author: odile,
  hive: inFamille,
  category: 'cooking',
  cover: null,
  days: 9,
})
/** L'album des vacances d'Inès, réservé à Famille. */
export const albumVacances = projectOf(4, {
  title: 'L’album de Belle-Île',
  pitch: 'Les photos de l’été rangées par jour, avec une légende écrite par l’IA.',
  author: ines,
  hive: inFamille,
  category: 'photo-video',
  cover: 4,
  days: 14,
})
/** Le jeu de mémoire de Papi Jean, « Membres de Waiggle », qui cherche des testeurs. */
export const memo = projectOf(5, {
  title: 'Le jeu de mémoire',
  pitch: 'Retrouver les paires de photos de famille, en trois niveaux.',
  author: papiJean,
  hive: null,
  status: 'testable',
  category: 'games',
  cover: 5,
  days: 3,
  demoUrl: 'https://memo.example.com',
})
/** L'herbier de Tante Odile, « Membres de Waiggle », sans photo. */
export const herbier = projectOf(6, {
  title: 'Mon herbier de balcon',
  pitch: 'Une photo d’une plante, et l’IA dit quand l’arroser.',
  author: odile,
  hive: null,
  status: 'testable',
  category: 'home-garden',
  cover: null,
  days: 11,
  demoUrl: 'https://herbier.example.com',
})
/** Le tricot de Tante Odile, terminé, « Membres de Waiggle ». */
export const tricot = projectOf(7, {
  title: 'Le patron de tricot qui compte les rangs',
  pitch: 'Dicter « un rang de plus » et il suit où on en est.',
  author: odile,
  hive: null,
  status: 'done',
  category: 'art',
  cover: 7,
  days: 20,
})
/** Le projet privé de Tante Odile : elle seule le voit (jamais dans les listes des autres). */
export const odileDraft = projectOf(8, {
  title: 'Le calendrier des anniversaires',
  pitch: 'Pas encore prêt.',
  author: odile,
  hive: null,
  status: 'idea',
  visibility: 'private',
  cover: null,
  days: 1,
})
/** Un projet réservé à « Amis du jeudi », de Max (une autre ruche de Léa). */
export const quizJeudi = projectOf(9, {
  title: 'Le quiz du jeudi',
  pitch: 'Dix questions tirées au sort pour la soirée jeux.',
  author: max,
  hive: { id: amisId, name: 'Amis du jeudi' },
  category: 'games',
  cover: 9,
  days: 4,
})

/** Les projets réservés à Famille, du plus récent au plus ancien (GET …/projects). */
export const familleProjects: ProjectSummary[] = [
  planDeTable,
  biscotte,
  recettesMamie,
  albumVacances,
]

/** GET /v1/hives/{id}/projects : une seule page. */
export const projectsPage: HiveProjectsPage = { items: familleProjects, nextCursor: null }

// --- La page d'une ruche ---

/** GET /v1/hives/{id}, Léa simple membre : elle peut inviter ; Le plan de table épinglé. */
export const memberPage: HivePage = {
  summary: famille,
  invite: 'allowed',
  invitePolicy: 'members',
  pendingInvitations: 1,
  pinned: { ...planDeTable, pinnedBy: { id: papiJean.id, name: papiJean.name } },
  seekingTesters: [memo, herbier],
  projectCount: familleProjects.length,
  successor: null,
}

/** La même page, Léa animatrice : Papi Jean, le plus ancien, animerait après elle. */
export const animatorPage: HivePage = {
  ...memberPage,
  summary: familleAnimated,
  successor: { name: papiJean.name },
}

/** La page d'« Amis du jeudi » (Léa simple membre ; seul l'animateur invite). */
export const amisPage: HivePage = {
  summary: amis,
  invite: 'animatorOnly',
  invitePolicy: 'animator',
  pendingInvitations: 0,
  pinned: null,
  seekingTesters: [],
  projectCount: 1,
  successor: null,
}

/** La page de la ruche que Léa vient de créer : elle seule (« Ta ruche est prête »). */
export const readyPage = (name: string | null, icon: HiveSummary['icon']): HivePage => ({
  summary: createdHive(name, icon),
  invite: 'allowed',
  invitePolicy: 'members',
  pendingInvitations: 0,
  pinned: null,
  seekingTesters: [],
  projectCount: 0,
  successor: null,
})

const activityItem = (
  kind: HiveActivityItem['kind'],
  actor: Person,
  project: ProjectSummary,
  hours: number,
  version: string | null = null,
): HiveActivityItem => ({
  kind,
  actor: faceOf(actor),
  project,
  version,
  at: hoursAgo(hours),
  reserved: project.visibility === 'hive',
})

/** GET /v1/hives/{id}/activity : 30 jours au plus, une seule page. */
export const activity: HiveActivityPage = {
  items: [
    activityItem('pinned', papiJean, planDeTable, 20),
    activityItem('published', lea, planDeTable, 48),
    activityItem('published', papiJean, memo, 72),
    activityItem('updated', odile, biscotte, 100, 'v2'),
    activityItem('published', odile, recettesMamie, 9 * 24),
    activityItem('published', ines, albumVacances, 14 * 24),
  ],
  nextCursor: null,
}

const memberOf = (
  person: Person,
  handle: string,
  changes: Partial<HiveMember> = {},
): HiveMember => ({
  face: faceOf(person),
  handle,
  role: 'member',
  isMe: person.id === lea.id,
  reduced: false,
  ...changes,
})

/** GET /v1/hives/{id}/members : Papi Jean l'animateur, puis Léa, Tante Odile et Inès. */
export const members: HiveMembers = {
  members: [
    memberOf(papiJean, 'papijean', { role: 'animator' }),
    memberOf(lea, 'lea'),
    memberOf(odile, 'odile'),
    memberOf(ines, 'ines'),
  ],
}

/** Les mêmes membres, Léa animatrice (Papi Jean redevenu simple membre). */
export const membersLeaAnimator: HiveMembers = {
  members: [
    memberOf(lea, 'lea', { role: 'animator' }),
    memberOf(papiJean, 'papijean'),
    memberOf(odile, 'odile'),
    memberOf(ines, 'ines'),
  ],
}

/** GET /v1/hives/{id}/invitable?q= : Max (à inviter), Inès (déjà membre), Hugo (déjà invité). */
export const invitable: InvitableMember[] = [
  { face: faceOf(max), handle: 'maxd', state: 'none' },
  { face: faceOf(ines), handle: 'ines', state: 'member' },
  { face: faceOf(hugo), handle: 'hugo', state: 'invited' },
]

/** Ce que la recherche « Inviter » trouve pour un texte : le nom ou le pseudo, sans accents. */
export const invitableFor = (q: string): InvitableMember[] => {
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const wanted = fold(q.trim())
  return invitable.filter(
    (one) =>
      fold(one.handle).startsWith(wanted) ||
      fold(one.face.name)
        .split(/\s+/)
        .some((word) => word.startsWith(wanted)),
  )
}

// --- Le Fil d'une ruche ---

/**
 * GET /v1/feed/following?hive=<Famille> : les projets réservés à la ruche et les projets « Membres
 * de Waiggle » de ses membres, du plus récent au plus ancien ; `followsAnyone` toujours vrai,
 * `lastReadAt` : la dernière visite de Léa (avant « Biscotte au parc »).
 */
export const hiveFeed: FollowingFeedPage = {
  items: [planDeTable, memo, biscotte, recettesMamie, herbier, albumVacances].map((project) => ({
    kind: 'project' as const,
    at: project.createdAt,
    project,
  })),
  nextCursor: null,
  followsAnyone: true,
  lastReadAt: hoursAgo(80),
}

// --- L'Activité ---

const notifiedFamille = { id: familleId, name: 'Famille', icon: 'house-line' as const }

/**
 * Les cinq lignes des ruches dans l'Activité (GET /v1/notifications) : l'invitation (vers l'onglet
 * Ruches), « Max a rejoint » (vers les membres), l'animation confiée (vers la ruche), puis le retrait
 * et la suppression (nulle part ; le nom de la ruche supprimée est gardé tel qu'il était).
 */
export const hiveNotifications: Notification[] = [
  {
    kind: 'hive_invited',
    id: `hive_invited:${invitationId}`,
    at: hoursAgo(3),
    isNew: true,
    invitation: { id: invitationId },
    hive: { id: atelierId, name: 'Atelier IA', icon: 'code' },
    inviter: faceOf(nora),
  },
  {
    kind: 'hive_joined',
    id: `hive_joined:${familleId}:${max.id}`,
    at: hoursAgo(6),
    isNew: true,
    hive: notifiedFamille,
    member: faceOf(max),
  },
  {
    kind: 'hive_animator',
    id: `hive_animator:${familleId}`,
    at: hoursAgo(30),
    isNew: false,
    hive: notifiedFamille,
  },
  {
    kind: 'hive_removed',
    id: `hive_removed:${amisId}`,
    at: hoursAgo(3 * 24),
    isNew: false,
    hive: { id: amisId, name: 'Amis du jeudi', icon: 'coffee' },
  },
  {
    kind: 'hive_deleted',
    id: 'hive_deleted:club-lecture',
    at: hoursAgo(6 * 24),
    isNew: false,
    hive: { id: null, name: 'Club lecture', icon: 'book-open' },
  },
]

// --- La page d'un membre, en tuiles ---

/**
 * GET /v1/members/odile-id, vue par Léa : « Projets · 4 », du plus récent au plus ancien, avec et
 * sans photo, et deux projets réservés à Famille (Léa en est membre). Son brouillon privé n'y est
 * pas : l'API ne donne les projets privés qu'à leur auteur.
 */
export const odileMemberPage: Member = {
  id: odile.id,
  name: odile.name,
  handle: 'odile',
  avatarUrl: null,
  bio: 'Retraitée, jardinière, et depuis peu bricoleuse d’agents.',
  removedParts: [],
  favoriteTools: [
    { label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true },
    { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
  ],
  isMe: false,
  isBlocked: false,
  isFollowed: true,
  followerCount: 5,
  projects: [biscotte, recettesMamie, herbier, tricot],
  moderation: null,
}
