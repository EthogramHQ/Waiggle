// Projets d'exemple pour les tests de l'appli.
// Seulement des types : scripts/shots.mjs lit ce fichier avec Node, qui ne sait pas charger les
// sources de @ruche/contracts (leurs imports n'ont pas d'extension). Une valeur importée d'ici
// (NO_REACTIONS) casserait les captures ; on écrit donc « aucune réaction » en toutes lettres.
import type { Member, Project, ProjectSummary, ProjectVisual } from '@ruche/contracts'

/** Aucune réaction (comme NO_REACTIONS du contrat). */
const noReactions: Project['reactions'] = {
  counts: { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 0 },
  mine: [],
}

export const recipesProject: Project = {
  id: '6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f',
  author: { id: 'u1', name: 'Léa', avatarUrl: null },
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  description: '## Comment ça marche\n\nOn **photographie** le frigo.',
  status: 'testable',
  visibility: 'public',
  demoUrl: 'https://recettes.example.com',
  tools: [
    { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
    { label: 'Cursor', slug: 'cursor', inCatalogue: true },
  ],
  prompts: ['Propose trois recettes avec : {ingrédients}'],
  // R6a : les catégories, la difficulté et le mois de début (le temps passé a disparu).
  primaryCategory: 'cooking',
  secondaryCategory: 'family',
  difficulty: 'easy',
  startedOn: '2026-09',
  visuals: [],
  portraitCover: null,
  isMine: true,
  isFollowed: false,
  followerCount: 0,
  // R7a : les mises à jour et les testeurs (aucune ici).
  latestUpdate: null,
  updateCount: 0,
  version: null,
  isTester: false,
  testerCount: null,
  // R7b : « Rejoindre les testeurs » reste proposé.
  testerJoinable: true,
  reactions: noReactions,
  commentCount: 0,
  removal: null,
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  removedParts: [],
  createdAt: '2026-10-12T08:00:00.000Z',
  updatedAt: '2026-10-12T08:00:00.000Z',
}

/**
 * Une photo de projet, telle que l'API la décrit. Son adresse est sur l'API de développement
 * (localhost:3000) : les captures d'écran (scripts/shots.mjs) y répondent par une image d'exemple.
 */
export const photo = (
  id: string,
  width = 1600,
  height = 900,
  description: string | null = null, // R6a : lue par les lecteurs d'écran quand elle existe
): ProjectVisual => ({
  id,
  kind: 'image',
  url: `http://localhost:3000/media/visuals/${id}.webp`,
  width,
  height,
  thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
  description,
})

/** Le même projet, avec trois photos et une couverture verticale. */
export const projectWithPhotos: Project = {
  ...recipesProject,
  visuals: [
    photo('11111111-1111-4111-8111-111111111111'),
    photo('22222222-2222-4222-8222-222222222222'),
    photo('33333333-3333-4333-8333-333333333333'),
  ],
  portraitCover: photo('44444444-4444-4444-8444-444444444444', 900, 1600),
}

/** Un projet en version courte, comme dans les listes (page d'un membre, d'une étiquette). */
export const summaryOf = ({ visuals, ...project }: Project): ProjectSummary => ({
  id: project.id,
  author: project.author,
  title: project.title,
  pitch: project.pitch,
  status: project.status,
  visibility: project.visibility,
  tools: project.tools,
  cover: visuals[0] ?? null,
  demoUrl: project.demoUrl,
  reactionTotal: 0,
  portraitCover: project.portraitCover,
  primaryCategory: project.primaryCategory,
  secondaryCategory: project.secondaryCategory,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  // R7a : la version courte ne garde pas la mise à jour entière ; un test qui en veut une la pose.
  latestUpdate: null,
  version: project.version,
})

/**
 * R6a : un projet publié avant les catégories, jamais modifié depuis : ni catégorie, ni
 * difficulté, ni mois de début.
 */
export const legacyProject: Project = {
  ...recipesProject,
  id: '8b3e4c0a-5d6f-4e70-9b82-9c0d1e2f3a41',
  title: 'Mon vieux projet',
  primaryCategory: null,
  secondaryCategory: null,
  difficulty: null,
  startedOn: null,
}

/** Un second projet de Léa, privé : un brouillon. */
export const draftProject: Project = {
  ...recipesProject,
  id: '7a2d3b9f-4c5e-4d6f-8a71-8b9c0d1e2f30',
  title: 'Mon brouillon',
  pitch: 'Pas encore prêt.',
  status: 'idea',
  visibility: 'private',
}

/** La page de Léa, vue par un autre membre. */
export const leaPage: Member = {
  id: 'u1',
  name: 'Léa',
  handle: 'lea',
  avatarUrl: null,
  bio: 'Je bricole des agents pour la maison.',
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  removedParts: [],
  favoriteTools: [
    { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
    { label: 'Python', slug: 'python', inCatalogue: true },
  ],
  isMe: false,
  isBlocked: false,
  isFollowed: false,
  followerCount: 3,
  projects: [summaryOf(projectWithPhotos)],
  // Tranche 7c : réservé aux administrateurs.
  moderation: null,
}

/**
 * La page de Léa vue par un membre qui l'a bloquée (tranche 7b) : l'en-tête seul (nom, pseudo,
 * photo), pour la débloquer ou signaler son profil. L'API ne donne ni bio, ni outils, ni projets,
 * ni abonnés (règle 6 de la relecture du plan).
 */
export const blockedLeaPage: Member = {
  ...leaPage,
  isBlocked: true,
  bio: '',
  favoriteTools: [],
  isFollowed: false,
  followerCount: 0,
  projects: [],
}
