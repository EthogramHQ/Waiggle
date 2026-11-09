// Les données des tests de l'administration du catalogue (tranche R6b, pages « Outils » et
// « Catégories » de la Modération, et leurs cartes) : des « Autre » à vérifier, des projets à
// ranger, des lignes de « Changements récents », et quelques outils du catalogue. Les noms sont
// variés et jamais ceux de Léa : un administrateur voit les projets d'autres membres. Seuls des
// types du contrat sont importés (`src/testing/` peut être lu par les captures).
import type {
  AdminCatalogueTool,
  CatalogueChange,
  CatalogueTool,
  PendingTool,
  UncategorizedProject,
} from '@ruche/contracts'

/** Un identifiant valide (UUID v4) tiré d'un numéro : projets et lignes du journal. */
export const catalogueId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// --- « À vérifier » : les autres outils tapés par les membres ---

/** « Make.com », cité par 3 projets : il se rattache à « Make » du catalogue. */
export const makeComPending: PendingTool = {
  slug: 'make-com',
  name: 'Make.com',
  createdAt: '2026-11-08T09:15:00.000Z',
  projectCount: 3,
  projects: [
    {
      id: catalogueId(11),
      title: 'Le tri des factures',
      author: { name: 'Hugo Lefèvre', handle: 'hugo' },
    },
    {
      id: catalogueId(12),
      title: 'Mes rappels de plantes',
      author: { name: 'Inès Moreau', handle: 'ines' },
    },
    {
      id: catalogueId(13),
      title: 'Le résumé du conseil de classe',
      author: { name: 'Yann Le Gall', handle: null },
    },
  ],
  profileCount: 0,
  profiles: [],
}

/** « Teachable Machine », cité par 1 projet : il entre au catalogue. */
export const teachablePending: PendingTool = {
  slug: 'teachable-machine',
  name: 'Teachable Machine',
  createdAt: '2026-11-07T18:40:00.000Z',
  projectCount: 1,
  projects: [
    {
      id: catalogueId(21),
      title: 'Quel papillon ?',
      author: { name: 'Hugo Lefèvre', handle: 'hugo' },
    },
  ],
  profileCount: 0,
  profiles: [],
}

/**
 * « Suno Studio », cité par 7 projets : la carte n'en montre que 5 (PENDING_TOOL_PROJECTS_SHOWN),
 * puis leur nombre.
 */
export const sunoPending: PendingTool = {
  slug: 'suno-studio',
  name: 'Suno Studio',
  createdAt: '2026-11-06T07:05:00.000Z',
  projectCount: 7,
  projects: [
    {
      id: catalogueId(31),
      title: 'La berceuse de Lina',
      author: { name: 'Élodie Martin', handle: 'elodie' },
    },
    {
      id: catalogueId(32),
      title: 'Le jingle du club',
      author: { name: 'Samuel Petit', handle: 'sam' },
    },
    {
      id: catalogueId(33),
      title: 'Chansons de route',
      author: { name: 'Inès Moreau', handle: 'ines' },
    },
    {
      id: catalogueId(34),
      title: 'Le générique du podcast',
      author: { name: 'Nora Benali', handle: 'nora' },
    },
    {
      id: catalogueId(35),
      title: 'Une chanson par anniversaire',
      author: { name: 'Paul Roux', handle: 'paul' },
    },
  ],
  profileCount: 0,
  profiles: [],
}

/**
 * « Napkin AI », cité par 2 profils et par aucun projet visible : un « Autre » des seuls outils
 * favoris (décision de Louis du 9/11/2026 au soir, jur-J1). Sa carte dit « Cité par 2 profils ».
 */
export const napkinPending: PendingTool = {
  slug: 'napkin-ai',
  name: 'Napkin AI',
  createdAt: '2026-11-05T15:20:00.000Z',
  projectCount: 0,
  projects: [],
  profileCount: 2,
  profiles: [
    { name: 'Inès Moreau', handle: 'ines' },
    { name: 'Yann Le Gall', handle: null },
  ],
}

/** « Gamma App », cité par 2 projets et 3 profils : « Cité par 2 projets et 3 profils ». */
export const gammaPending: PendingTool = {
  slug: 'gamma-app',
  name: 'Gamma App',
  createdAt: '2026-11-04T08:30:00.000Z',
  projectCount: 2,
  projects: [
    {
      id: catalogueId(36),
      title: 'Les diapos du club photo',
      author: { name: 'Samuel Petit', handle: 'sam' },
    },
    {
      id: catalogueId(37),
      title: 'L’exposé sur les volcans',
      author: { name: 'Nora Benali', handle: 'nora' },
    },
  ],
  profileCount: 3,
  profiles: [
    { name: 'Hugo Lefèvre', handle: 'hugo' },
    { name: 'Élodie Martin', handle: 'elodie' },
    { name: 'Paul Roux', handle: 'paul' },
  ],
}

/**
 * Les « Autre » cités par des profils, pour les captures (`shots.mjs`) : à la suite de
 * `pendingTools`, que les tests d'écran gardent tel quel.
 */
export const pendingToolsWithProfiles = [napkinPending, gammaPending]

/** Les trois autres outils de la page « À vérifier », du plus récent au plus ancien. */
export const pendingTools = [makeComPending, teachablePending, sunoPending]

// --- « Catalogue » : les outils normés ---

/** « Make », l'outil du catalogue auquel « Make.com » se rattache. */
export const makeTool: CatalogueTool = {
  slug: 'make',
  name: 'Make',
  family: 'automation',
  aliases: ['make.com'],
  projectCount: 9,
}

export const zapierTool: CatalogueTool = {
  slug: 'zapier',
  name: 'Zapier',
  family: 'automation',
  aliases: [],
  projectCount: 14,
}

export const lovableTool: CatalogueTool = {
  slug: 'lovable',
  name: 'Lovable',
  family: 'no-code',
  aliases: [],
  projectCount: 34,
}

/** Un outil du catalogue tel que l'administrateur le modifie (onglet « Catalogue »). */
export const adminToolOf = (tool: CatalogueTool): AdminCatalogueTool => ({
  slug: tool.slug,
  name: tool.name,
  family: tool.family,
  descriptionFr: `${tool.name} relie des applications entre elles.`,
  descriptionEn: `${tool.name} connects applications together.`,
  // Un domaine que `ToolSiteUrl` accepte (`.example` est un suffixe réservé, refusé par le
  // contrat : la feuille refusait alors d'enregistrer un outil qu'on ne faisait que renommer).
  siteUrl: `https://${tool.slug}.com/`,
  aliases: tool.aliases,
  projectCount: tool.projectCount,
})

// --- « À ranger » : les projets classés « Autre » ---

/** Un projet classé « Autre » en catégorie principale. */
export const birdhouseProject: UncategorizedProject = {
  id: catalogueId(41),
  title: 'La cabane à oiseaux connectée',
  pitch: 'Une caméra compte les mésanges qui passent dans le jardin.',
  author: { name: 'Inès Moreau', handle: 'ines' },
  primaryCategory: 'other',
  secondaryCategory: null,
  publishedAt: '2026-11-02T10:00:00.000Z',
}

/** Un projet classé « Autre » en seconde catégorie, derrière « Apprendre ». */
export const knitProject: UncategorizedProject = {
  id: catalogueId(42),
  title: 'Le patron de tricot qui parle',
  pitch: 'Il lit chaque rang à voix haute, au rythme des aiguilles.',
  author: { name: 'Samuel Petit', handle: 'sam' },
  primaryCategory: 'learning',
  secondaryCategory: 'other',
  publishedAt: '2026-11-05T16:30:00.000Z',
}

/** Les projets de « À ranger », du plus ancien au plus récent. */
export const uncategorizedProjects = [birdhouseProject, knitProject]

// --- « Changements récents » ---

const nora = { name: 'Nora Benali', handle: 'nora' }

/** Une ligne du journal, au plus près de ce que l'API rend ; chaque test change ce qu'il lit. */
export const changeOf = (over: Partial<CatalogueChange>): CatalogueChange => ({
  id: catalogueId(90),
  action: 'tool_admit',
  at: '2026-11-08T11:00:00.000Z',
  admin: nora,
  tool: null,
  mergedName: null,
  category: null,
  project: null,
  fromCategory: null,
  ...over,
})

export const admitChange = changeOf({
  id: catalogueId(91),
  action: 'tool_admit',
  tool: { slug: 'lovable', name: 'Lovable' },
})

export const mergeChange = changeOf({
  id: catalogueId(92),
  action: 'tool_merge',
  tool: { slug: 'make', name: 'Make' },
  mergedName: 'Make (le site)',
})

export const recategorizeChange = changeOf({
  id: catalogueId(93),
  action: 'project_recategorize',
  category: { code: 'animals', name: 'Animaux' },
  project: { id: catalogueId(44), title: 'Le carnet des hérissons' },
  fromCategory: 'other',
})
