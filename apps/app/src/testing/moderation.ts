// Signalements et retraits d'exemple pour les tests de l'appli (tranche 7a) : la file de modération
// telle que l'API la donne à Louis, administrateur (GET /v1/moderation/reports), les contenus
// retirés (GET /v1/moderation/removed), et le retrait que lit l'auteur d'un contenu retiré.
// Seuls des types viennent de @ruche/contracts : les captures (scripts/shots.mjs) lisent ce fichier.
import type {
  ModerationQueueItem,
  ModerationQueuePage,
  Removal,
  RemovedItem,
  RemovedPage,
} from '@ruche/contracts'

/** Le projet « Météo » d'Inès, où Sam a laissé un commentaire signalé. */
export const meteoProjectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'

/** Un retrait décidé après un signalement, au nom des règles de l'appli. */
export const removalAfterReport: Removal = {
  ground: 'rules',
  explanation: 'Demander un code de carte bancaire n’est pas permis ici.',
  at: '2026-10-21T09:00:00.000Z',
  afterReport: true,
}

/** Un retrait décidé sans signalement, au nom de la loi. */
export const removalByLaw: Removal = {
  ground: 'illegal',
  explanation: 'Ces photos montrent des personnes sans leur accord.',
  at: '2026-10-21T09:30:00.000Z',
  afterReport: false,
}

/** Le commentaire de Sam sur « Météo » : trois signalements, deux motifs, une précision. */
export const scamCommentItem: ModerationQueueItem = {
  target: { kind: 'comment', id: 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d' },
  projectId: meteoProjectId,
  // Tranche 7b : la copie est un tableau de champs, nommés comme au registre des entrées.
  snapshot: [
    { field: 'body', value: 'Envoie-moi le code de ta carte, je te débloque la version pro.' },
  ],
  images: [],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [
    { reason: 'scam_spam', count: 2 },
    { reason: 'harassment', count: 1 },
  ],
  details: ['Il a écrit la même chose sous trois projets.'],
  count: 3,
  firstReportedAt: '2026-10-20T08:00:00.000Z',
  lastReportedAt: '2026-10-21T07:30:00.000Z',
  // Tranche 7c : ce que la modération a déjà décidé pour le membre visé.
  authorRecord: {
    memberId: 'u5',
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/**
 * Un projet de Nora signalé une fois, sans précision. Tranche 7b : la copie garde tous ses textes
 * (titre, pitch, description, un prompt, outils, lien de démo), et ses images seulement par leur
 * état : la couverture est toujours là, une photo a été supprimée ou remplacée depuis. Le projet a
 * changé entre deux signalements (`snapshotsDiffer`) : la file montre la copie la plus récente.
 */
export const fakeReviewsItem: ModerationQueueItem = {
  target: { kind: 'project', id: 'd1e2f304-1526-4b37-9c48-596a7b8c9dae' },
  projectId: 'd1e2f304-1526-4b37-9c48-596a7b8c9dae',
  snapshot: [
    { field: 'title', value: 'Faux avis en masse' },
    { field: 'pitch', value: 'Cinquante avis cinq étoiles pour ta boutique, en un clic.' },
    {
      field: 'description',
      value: 'Colle l’adresse de ta boutique, choisis le nombre d’avis : le reste est automatique.',
    },
    { field: 'prompt', value: 'Écris 50 avis enthousiastes, chacun signé d’un prénom différent.' },
    { field: 'tools', value: 'Claude Code, Python' },
    { field: 'demoUrl', value: 'https://faux-avis.example/essai' },
  ],
  images: [
    { field: 'cover', state: 'present' },
    { field: 'photo', state: 'gone' },
  ],
  snapshotsDiffer: true,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'scam_spam', count: 1 }],
  details: [],
  count: 1,
  firstReportedAt: '2026-10-20T15:00:00.000Z',
  lastReportedAt: '2026-10-20T15:00:00.000Z',
  // Tranche 7c : ce que la modération a déjà décidé pour le membre visé.
  authorRecord: {
    memberId: 'u4',
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/** Le profil de « Lucas Martin », signalé pour usurpation : pas de projet, donc pas de lien vers un projet. */
export const impersonationItem: ModerationQueueItem = {
  target: { kind: 'member', id: 'u7' },
  projectId: null,
  snapshot: [
    { field: 'name', value: 'Lucas Martin' },
    { field: 'handle', value: 'lucas_martin' },
    { field: 'bio', value: 'Je fais partie de l’équipe, écris-moi pour un accès.' },
    { field: 'favoriteTools', value: 'Claude Code' },
  ],
  images: [{ field: 'avatar', state: 'present' }],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'impersonation', count: 1 }],
  details: ['Ce n’est pas le vrai Lucas, il est dans ma famille.'],
  count: 1,
  firstReportedAt: '2026-10-21T06:00:00.000Z',
  lastReportedAt: '2026-10-21T06:00:00.000Z',
  // Tranche 7c : ce que la modération a déjà décidé pour le membre visé.
  authorRecord: {
    memberId: 'u7',
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/** Une note de Louis lui-même : il ne peut pas en décider (« Te concerne »). */
export const ownNoteItem: ModerationQueueItem = {
  target: { kind: 'note', id: 'e2f30415-2637-4c48-8d59-6a7b8c9daebf' },
  projectId: 'f3041526-3748-4d59-9e6a-7b8c9daebfc0',
  // Une copie d'avant la tranche 7b : un seul champ `text`, le texte tel qu'on le gardait alors.
  snapshot: [{ field: 'text', value: 'v3 : export en PDF' }],
  images: [],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: true,
  reasons: [{ reason: 'other', count: 1 }],
  details: [],
  count: 1,
  firstReportedAt: '2026-10-21T08:00:00.000Z',
  lastReportedAt: '2026-10-21T08:00:00.000Z',
  // Tranche 7c : ce que la modération a déjà décidé pour le membre visé.
  authorRecord: {
    memberId: 'u9',
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: false,
  },
}

/** Toute la file, du plus ancien signalement au plus récent (l'ordre de l'API). */
export const moderationQueue: ModerationQueueItem[] = [
  scamCommentItem,
  fakeReviewsItem,
  impersonationItem,
  ownNoteItem,
]

/**
 * Le premier texte de la copie d'un signalement (le texte d'un commentaire, le titre d'un projet, le
 * nom d'un profil) : de quoi retrouver sa carte dans la file.
 */
export const firstTextOf = (item: ModerationQueueItem): string => item.snapshot[0]?.value ?? ''

export const moderationQueuePageOf = (
  items: ModerationQueueItem[] = moderationQueue,
  nextCursor: string | null = null,
): ModerationQueuePage => ({ items, nextCursor })

/** Le commentaire d'Alex sur « Météo », retiré hier : on peut le rétablir. */
export const removedCommentItem: RemovedItem = {
  target: { kind: 'comment', id: 'a7b8c9da-ebfc-4d0e-9f10-213243546576' },
  projectId: meteoProjectId,
  text: 'Clique ici pour gagner un téléphone.',
  ground: 'rules',
  explanation: 'Les liens d’arnaque ne sont pas permis ici.',
  removedAt: '2026-10-21T09:00:00.000Z',
  concernsMe: false,
}

/** Un projet retiré au nom de la loi. */
export const removedProjectItem: RemovedItem = {
  target: { kind: 'project', id: 'b8c9daeb-fc0d-4e1f-8021-324354657687' },
  projectId: 'b8c9daeb-fc0d-4e1f-8021-324354657687',
  text: 'Photos de la soirée — Toutes les photos de samedi, avec les noms.',
  ground: 'illegal',
  explanation: removalByLaw.explanation,
  removedAt: '2026-10-20T18:00:00.000Z',
  concernsMe: false,
}

export const removedItems: RemovedItem[] = [removedCommentItem, removedProjectItem]

export const removedPageOf = (
  items: RemovedItem[] = removedItems,
  nextCursor: string | null = null,
): RemovedPage => ({ items, nextCursor })
