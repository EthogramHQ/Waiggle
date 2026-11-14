// Signalements et retraits d'exemple pour les tests de l'appli (tranche 7a) : la file de modération
// telle que l'API la donne à Louis, administrateur (GET /v1/moderation/reports), les contenus
// retirés (GET /v1/moderation/removed), et le retrait que lit l'auteur d'un contenu retiré.
// Seuls des types viennent de @ruche/contracts : les captures (scripts/shots.mjs) lisent ce fichier.
import type {
  DecisionHistoryItem,
  DecisionHistoryPage,
  ModerationQueueItem,
  ModerationQueuePage,
  Removal,
  RemovedItem,
  RemovedPage,
  RemovedPart,
  ReportTargetPreview,
  Suspension,
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
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  context: null,
  contentCreatedAt: '2026-10-20T07:00:00.000Z',
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
  // Tranche 7c : ce que la modération a déjà décidé pour Sam, l'auteur : deux retraits et une
  // suspension, finie depuis. Il peut être suspendu de nouveau.
  authorRecord: {
    memberId: 'u5',
    name: 'Sam',
    handle: 'sam',
    joinedAt: '2026-08-14T09:00:00.000Z',
    // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests (les comptes).
    projectCount: 3,
    commentCount: 7,
    removals: 2,
    suspensions: 1,
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
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  context: null,
  contentCreatedAt: '2026-10-20T07:00:00.000Z',
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
    name: 'Nora',
    handle: 'nora',
    joinedAt: '2026-08-14T09:00:00.000Z',
    // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests (les comptes).
    projectCount: 3,
    commentCount: 7,
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/** Le profil de « Lucas Martin », signalé pour usurpation : pas de projet, donc pas de lien vers un projet. */
export const impersonationItem: ModerationQueueItem = {
  target: { kind: 'member', id: 'u7' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  context: null,
  contentCreatedAt: '2026-10-20T07:00:00.000Z',
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
    name: 'Jules',
    handle: 'jules',
    joinedAt: '2026-08-14T09:00:00.000Z',
    // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests (les comptes).
    projectCount: 3,
    commentCount: 7,
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/** Une note de Louis lui-même : il ne peut pas en décider (« Te concerne »). */
export const ownNoteItem: ModerationQueueItem = {
  target: { kind: 'note', id: 'e2f30415-2637-4c48-8d59-6a7b8c9daebf' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  context: null,
  contentCreatedAt: '2026-10-20T07:00:00.000Z',
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
    name: 'Maya',
    handle: 'maya',
    joinedAt: '2026-08-14T09:00:00.000Z',
    // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests (les comptes).
    projectCount: 3,
    commentCount: 7,
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
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
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
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
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

// --- Tranche 7c : une suspension en cours ---

/**
 * Une suspension de 7 jours posée le 26 octobre à 23 h 30 UTC : elle finit le 2 novembre à 23 h 30
 * UTC, soit le **3 novembre à 0 h 30, heure de Paris** (relecture juridique, J4 : l'appli écrit la
 * fin dans le fuseau de Paris, jamais dans celui de l'appareil ni en UTC).
 */
export const sevenDaySuspension: Suspension = {
  since: '2026-10-26T23:30:00.000Z',
  endsAt: '2026-11-02T23:30:00.000Z',
  ground: 'rules',
  explanation: 'Trois messages d’arnaque en deux jours, après deux retraits.',
  afterReport: true,
}

/** Une suspension sans fin, décidée sans signalement, au nom de la loi. */
export const indefiniteSuspension: Suspension = {
  since: '2026-10-25T08:00:00.000Z',
  endsAt: null,
  ground: 'illegal',
  explanation: 'Publication répétée de photos de personnes sans leur accord.',
  afterReport: false,
}

/**
 * La fin de `sevenDaySuspension`, telle qu'un texte `{{date}} à {{time}}` doit l'écrire : le
 * 3 novembre (« 3 nov. », « 3 novembre », avec ou sans l'année), à 0 h 30 (« 0 h 30 », « 00:30 »).
 * Le 2 novembre, ou 23 h 30, trahiraient une heure UTC ; une autre heure, le fuseau de l'appareil.
 */
export const parisEndDate = '3 nov[a-zé.]*(?: 2026)?'
export const parisEndTime = '(?:0|00)(?: h |:)30'

/**
 * Une expression qui retrouve à l'écran un texte qui écrit la fin de `sevenDaySuspension`. On lui
 * donne le texte traduit avec « DATE » et « TIME » à la place des paramètres
 * (`fr.t(($) => $.suspension.headline, { date: 'DATE', time: 'TIME' })`) : le reste du texte est
 * cherché tel quel, les blancs ramenés à des espaces simples, comme le fait getByText.
 */
export const withParisEnd = (text: string): RegExp =>
  new RegExp(
    text
      .replace(/\s+/g, ' ')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('DATE', parisEndDate)
      .replace('TIME', parisEndTime),
  )

// --- Tranche 7c : l'historique des décisions (GET /v1/moderation/decisions) ---
//
// Ce que lit un administrateur dans l'onglet « Historique » : chaque décision, la plus récente
// d'abord, avec l'administrateur qui l'a prise, la cible, le membre visé, le fondement et
// l'explication. Jamais qui a signalé (le contrat n'a aucun champ pour cela).

/** Louis, l'administrateur qui a pris la plupart de ces décisions. */
export const louisAdmin = { id: 'u0', name: 'Louis', handle: 'louis' }
/** Sam, visé par la suspension et le retrait ci-dessous. */
export const samMember = { id: 'u5', name: 'Sam', handle: 'sam' }
/** Nora, l'autrice du projet « Faux avis en masse ». */
export const noraMember = { id: 'u4', name: 'Nora', handle: 'nora' }

/** Sam suspendu 7 jours, après le signalement de son commentaire, au nom des règles. */
export const suspendDecision: DecisionHistoryItem = {
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  action: 'suspend',
  at: '2026-10-22T10:00:00.000Z',
  admin: louisAdmin,
  target: { kind: 'member', id: samMember.id },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  projectId: null,
  member: samMember,
  ground: 'rules',
  explanation: 'Trois messages d’arnaque en deux jours, après deux retraits.',
  duration: '7d',
  liftCause: null,
  afterReport: true,
}

/** La suspension de Sam levée plus tôt que prévu. */
export const liftDecision: DecisionHistoryItem = {
  id: '1b2c3d4e-5f60-4b7c-9d8e-0f1a2b3c4d5e',
  action: 'lift',
  at: '2026-10-24T09:00:00.000Z',
  admin: louisAdmin,
  target: { kind: 'member', id: samMember.id },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  projectId: null,
  member: samMember,
  ground: null,
  explanation: 'Sam s’est excusé et a supprimé ses messages.',
  duration: null,
  liftCause: 'early',
  afterReport: false,
}

/** Le commentaire de Sam sur « Météo », retiré au nom des règles. */
export const removeDecision: DecisionHistoryItem = {
  id: '2c3d4e5f-6071-4c8d-8e9f-1a2b3c4d5e6f',
  action: 'remove',
  at: '2026-10-21T09:00:00.000Z',
  admin: louisAdmin,
  target: { kind: 'comment', id: 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  projectId: meteoProjectId,
  member: samMember,
  ground: 'rules',
  explanation: 'Demander un code de carte bancaire n’est pas permis ici.',
  duration: null,
  liftCause: null,
  afterReport: false,
}

/** Le signalement du projet de Nora, classé sans suite par une administratrice partie depuis. */
export const dismissByGoneAdminDecision: DecisionHistoryItem = {
  id: '3d4e5f60-7182-4d9e-9fa0-2b3c4d5e6f70',
  action: 'dismiss',
  at: '2026-10-20T16:00:00.000Z',
  admin: null,
  target: { kind: 'project', id: 'd1e2f304-1526-4b37-9c48-596a7b8c9dae' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  projectId: 'd1e2f304-1526-4b37-9c48-596a7b8c9dae',
  member: noraMember,
  ground: null,
  explanation: null,
  duration: null,
  liftCause: null,
  afterReport: false,
}

/** Une note retirée, supprimée depuis par son autrice, qui a aussi supprimé son compte. */
export const goneTargetDecision: DecisionHistoryItem = {
  id: '4e5f6071-8293-4eaf-8ab1-3c4d5e6f7081',
  action: 'remove',
  at: '2026-10-19T08:00:00.000Z',
  admin: louisAdmin,
  target: { kind: 'note', id: 'e2f30415-2637-4c48-8d59-6a7b8c9daebf' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  projectId: null,
  member: null,
  ground: 'illegal',
  explanation: 'Ces photos montrent des personnes sans leur accord.',
  duration: null,
  liftCause: null,
  afterReport: false,
}

/** Tout l'historique, de la décision la plus récente à la plus ancienne (l'ordre de l'API). */
export const decisionHistory: DecisionHistoryItem[] = [
  liftDecision,
  suspendDecision,
  removeDecision,
  dismissByGoneAdminDecision,
  goneTargetDecision,
]

/** Les décisions qui visent Sam (le filtre `?member=u5`). */
export const samDecisions: DecisionHistoryItem[] = [liftDecision, suspendDecision, removeDecision]

export const decisionHistoryPageOf = (
  items: DecisionHistoryItem[] = decisionHistory,
  nextCursor: string | null = null,
): DecisionHistoryPage => ({ items, nextCursor })

// --- R9 (7d) : une partie retirée seule (docs/scenarios/refonte.md, « Retirer une partie ») ---
//
// La modération retire une partie d'un contenu (la 2e photo de « Météo ») ; le reste reste affiché.
// L'auteur seul la lit encore, dans `removedParts` (contrat `RemovedPart`) : le champ, la photo
// visée, la valeur retirée (un texte, une liste, ou null pour une photo, qui reste dans sa galerie),
// et le retrait (fondement, explication, date, après un signalement ou non). Tout autre membre
// reçoit une liste vide, et la partie n'est plus là pour lui, comme si elle n'avait jamais existé.

/**
 * La 2e photo retirée au nom de la loi, après un signalement, le 12 novembre à midi, heure de Paris
 * (11 h UTC : le même jour quel que soit le fuseau des tests).
 */
export const photoRemoval: Removal = {
  ground: 'illegal',
  explanation: 'Cette photo montre une personne reconnaissable sur son balcon, sans son accord.',
  at: '2026-11-12T11:00:00.000Z',
  afterReport: true,
}

/** Une description retirée au nom des règles, sans signalement, le 12 novembre à 16 h (Paris). */
export const descriptionRemoval: Removal = {
  ground: 'rules',
  explanation: 'La description renvoie vers un faux site de paiement.',
  at: '2026-11-12T15:00:00.000Z',
  afterReport: false,
}

/** Une photo retirée seule, désignée par son identifiant : elle reste dans la galerie de l'auteur. */
export const removedPhotoPart = (
  mediaId: string,
  removal: Removal = photoRemoval,
): RemovedPart => ({
  field: 'photo',
  mediaId,
  value: null,
  imageUrl: null,
  removal,
})

/**
 * Un texte retiré seul (description, lien de la démo, outils, prompts) : la valeur est sortie de sa
 * colonne, l'auteur la relit ici pour savoir quoi remplacer.
 */
export const removedTextPart = (
  field: 'description' | 'demoUrl' | 'tools' | 'prompt',
  value: string | string[],
  removal: Removal = descriptionRemoval,
): RemovedPart => ({ field, mediaId: null, value, imageUrl: null, removal })

/** L'identifiant de la 2e photo de « Météo », signalée puis retirée. */
export const meteoSecondPhotoId = '7a8b9cad-becf-4d0e-8f1a-2b3c4d5e6f70'

/**
 * La 2e photo de « Météo » d'Inès, signalée par deux membres comme « Une photo ou une information
 * sur moi sans mon accord » : un élément de la file qui vise une partie, avec son projet porteur
 * (`context`) et la fiche d'Inès, inscrite il y a moins de 14 jours (« Compte récent »).
 */
export const meteoPhotoItem: ModerationQueueItem = {
  target: { kind: 'project', id: meteoProjectId },
  part: { field: 'photo', mediaId: meteoSecondPhotoId, position: 2 },
  context: { projectId: meteoProjectId, title: 'Météo', image: null },
  contentCreatedAt: '2026-11-08T18:00:00.000Z',
  projectId: meteoProjectId,
  snapshot: [{ field: 'title', value: 'Météo' }],
  images: [{ field: 'photo', state: 'present' }],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'privacy', count: 2 }],
  details: ['On me reconnaît sur mon balcon, je n’ai rien demandé.'],
  count: 2,
  firstReportedAt: '2026-11-12T07:30:00.000Z',
  lastReportedAt: '2026-11-12T09:10:00.000Z',
  authorRecord: {
    memberId: 'ines-id',
    name: 'Inès Haddad',
    handle: 'ines_haddad',
    joinedAt: '2026-11-03T10:00:00.000Z',
    projectCount: 2,
    commentCount: 5,
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/** La file de R9 : la photo de « Météo » en tête, puis la file d'avant. */
export const moderationQueueR9: ModerationQueueItem[] = [meteoPhotoItem, ...moderationQueue]

/**
 * Ce que la feuille « Signaler » lit de « Météo » (GET /v1/reports/target) : le rappel en tête, les
 * parties présentes dans l'ordre du registre (trois photos, la description, les outils, le lien de
 * la démo ; pas de prompt), 20 signalements encore possibles aujourd'hui. Inès n'est ni bloquée ni
 * administratrice : « Bloquer aussi » est proposé.
 */
export const meteoPreview: ReportTargetPreview = {
  target: { kind: 'project', id: meteoProjectId },
  text: 'Météo — La météo de mon balcon, chaque matin.',
  projectId: meteoProjectId,
  author: {
    id: 'ines-id',
    name: 'Inès Haddad',
    handle: 'ines_haddad',
    isBlocked: false,
  },
  head: { title: 'Météo', authorName: 'Inès Haddad', image: null },
  parts: [
    { field: 'description', mediaId: null, position: null, thumb: null, reportedByMe: false },
    { field: 'tools', mediaId: null, position: null, thumb: null, reportedByMe: false },
    { field: 'demoUrl', mediaId: null, position: null, thumb: null, reportedByMe: false },
    {
      field: 'photo',
      mediaId: '6f708192-a3b4-4c5d-8e6f-708192a3b4c5',
      position: 1,
      thumb: null,
      reportedByMe: false,
    },
    { field: 'photo', mediaId: meteoSecondPhotoId, position: 2, thumb: null, reportedByMe: false },
  ],
  reportedByMe: false,
  remainingToday: 20,
}
