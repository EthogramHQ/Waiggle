// Données d'exemple de la tranche R11 (« La conformité ») : « Mes commentaires », « Mes retours
// envoyés » et un membre qui n'a pas encore accepté la version des règles en vigueur. Les tests
// d'écran comme les captures (scripts/shots.mjs) les lisent : seuls des types viennent de
// @ruche/contracts, et ce fichier n'importe rien d'autre (Node lit les captures sans outil de
// construction, et un `import` d'un fichier voisin sans son extension n'y marcherait pas).
//
// Les contenus reprennent ceux des tests de R11 (MyCommentsScreen.test.tsx,
// MyTesterMessagesScreen.test.tsx) et des planches R11-Mes-Commentaires et R11-Mes-Retours : des
// projets d'autres membres que Léa (Sam, Hugo, Papi Jean, Inès), un projet qui n'est plus visible,
// un commentaire masqué par l'auteur du projet, un autre retiré par la modération, un coin fermé.
// Les dates sont celles de la mi-novembre 2026 ; les captures les ramènent à leur propre horloge.
import type {
  Me,
  MyComment,
  MyCommentsPage,
  MyDataProject,
  MyTesterMessage,
  MyTesterMessagesPage,
  TesterMedia,
} from '@ruche/contracts'

// --- Un membre sans l'accord des règles ----------------------------------------------------------

/**
 * « Ce qui change » de la capture `accepter-changements` et des tests qui en ont besoin. La clé est
 * inventée, comme dans AcceptRulesScreen.test.tsx : la première version des règles n'a rien
 * d'avant, donc `rules.changes` est vide dans les traductions.
 */
export const shownRulesChanges: string[] = ['hivesClarified']

/**
 * Le même membre, qui n'a pas accepté la version des règles en vigueur : l'écran « Accepter » passe
 * au-dessus de tout (rules/RulesGate). `changes` : vide, c'est sa première fois (un inscrit d'avant
 * R11) ; non vide, une nouvelle version, et l'écran montre « Ce qui change » au-dessus de « En bref ».
 * Une fonction plutôt qu'une constante : on part du membre voulu (Léa, Inès, un compte suspendu).
 */
export const withoutRules = (me: Me, changes: string[] = []): Me => ({
  ...me,
  rulesAccepted: false,
  rulesChanges: [...changes],
})

// --- Les projets des deux listes -----------------------------------------------------------------

/** Un projet de Sam : un commentaire de Léa avec des réponses, un autre modifié. */
export const tableauProject: MyDataProject = {
  id: '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0001',
  title: 'Raconte-moi un tableau',
  cover: null,
  author: { name: 'Sam Petit' },
}
/** Un projet de Papi Jean, dont Léa est testeuse (coin ouvert). */
export const jardinProject: MyDataProject = {
  id: '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0002',
  title: 'Le jardin qui parle',
  cover: null,
  author: { name: 'Papi Jean' },
}
/** Un projet d'Hugo : son coin est fermé à Léa (elle en est partie). */
export const recettesProject: MyDataProject = {
  id: '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0004',
  title: 'Mes recettes du dimanche',
  cover: null,
  author: { name: 'Hugo Lefèvre' },
}
/** Un projet d'Inès, celui d'un commentaire masqué par son autrice. */
export const balconProject: MyDataProject = {
  id: '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0005',
  title: 'La météo du balcon',
  cover: null,
  author: { name: 'Inès Haddad' },
}
/**
 * Un projet que Léa ne voit plus (devenu privé, ou d'une ruche qu'elle a quittée) : l'API ne donne
 * que son identifiant, jamais son titre ni son auteur.
 */
export const goneProjectId = '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0003'

// --- Mes commentaires ----------------------------------------------------------------------------

const myComment = (
  over: Partial<MyComment> & Pick<MyComment, 'id' | 'body' | 'createdAt'>,
): MyComment => ({
  projectId: tableauProject.id,
  project: tableauProject,
  replyTo: null,
  hasReplies: false,
  editedAt: null,
  hidden: false,
  removed: false,
  ...over,
})

/** Le curseur de la deuxième page (un marque-page opaque, de la forme de FeedCursor). */
export const myCommentsCursor = 'eyJhdCI6IjIwMjYtMTEtMDkifQ'

/**
 * Les commentaires et réponses de Léa, du plus récent au plus ancien, comme l'API les rend : une
 * racine qui a des réponses, une réponse, un commentaire masqué par l'autrice du projet, un sur un
 * projet qu'elle ne voit plus, un retiré par la modération, un modifié, un long (l'écran n'en montre
 * que le début).
 */
export const myComments: MyComment[] = [
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000001',
    body: 'Les couleurs du ciel sont superbes, bravo !',
    hasReplies: true,
    createdAt: '2026-11-14T18:00:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000002',
    projectId: jardinProject.id,
    project: jardinProject,
    replyTo: 'c0a8e7d2-6b1f-4f3e-8a2d-0000000000ff',
    body: 'Merci, ça marche aussi sur mon téléphone.',
    createdAt: '2026-11-13T09:30:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000005',
    projectId: balconProject.id,
    project: balconProject,
    body: 'Il annonce de la pluie depuis trois jours, et toujours pas une goutte ici.',
    hidden: true,
    createdAt: '2026-11-12T07:45:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000003',
    projectId: goneProjectId,
    project: null,
    body: 'Hâte de voir la suite de ce projet.',
    createdAt: '2026-11-10T20:15:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000006',
    projectId: recettesProject.id,
    project: recettesProject,
    body: 'Essaie plutôt mon appli de recettes, le lien est dans mon profil !',
    removed: true,
    createdAt: '2026-11-09T19:00:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000004',
    body: 'Le bouton Partager ne répond pas chez moi.',
    editedAt: '2026-11-09T12:20:00.000Z',
    createdAt: '2026-11-09T12:00:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000007',
    projectId: jardinProject.id,
    project: jardinProject,
    body: 'J’ai planté des tomates cerises à côté du basilic, comme il me le conseillait, et elles ont poussé bien plus vite que l’an dernier. La semaine prochaine, je lui demande quoi faire des feuilles qui jaunissent.',
    createdAt: '2026-11-07T16:40:00.000Z',
  }),
]

/** Plus anciens : la deuxième page (« Afficher la suite »). */
export const myCommentsMore: MyComment[] = [
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000008',
    projectId: balconProject.id,
    project: balconProject,
    replyTo: 'c0a8e7d2-6b1f-4f3e-8a2d-0000000000fe',
    body: 'Oui, la mienne aussi indique 3 degrés de trop au soleil.',
    createdAt: '2026-11-02T08:10:00.000Z',
  }),
  myComment({
    id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000009',
    body: 'Première version testée : il a reconnu la Nuit étoilée du premier coup.',
    createdAt: '2026-10-28T21:05:00.000Z',
  }),
]

/** La première page de « Mes commentaires », avec la suite. */
export const myCommentsPage: MyCommentsPage = { items: myComments, nextCursor: myCommentsCursor }
/** La dernière page. */
export const myCommentsLastPage: MyCommentsPage = { items: myCommentsMore, nextCursor: null }

// --- Mes retours envoyés -------------------------------------------------------------------------

/**
 * La capture d'un retour (une copie d'écran de téléphone, en hauteur). Son adresse suit celles des
 * images du coin, que les captures savent servir (`/media/testers/<id>.webp`).
 */
export const sentCapture: TesterMedia = {
  id: '9e7d6c5b-4a39-4281-9f0e-000000000001',
  url: 'http://localhost:3000/media/testers/9e7d6c5b-4a39-4281-9f0e-000000000001.webp',
  width: 1170,
  height: 2532,
  thumbhash: null,
  description: null,
}

const sent = (
  over: Partial<MyTesterMessage> & Pick<MyTesterMessage, 'id' | 'text' | 'createdAt'>,
): MyTesterMessage => ({
  projectId: jardinProject.id,
  project: jardinProject,
  closed: false,
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  media: null,
  removed: false,
  ...over,
})

/** Le curseur de la deuxième page (de la forme de TesterCursor). */
export const myTesterMessagesCursor = 'eyJhdCI6IjIwMjYtMTEtMDgifQ'

/**
 * Les retours et réponses que Léa a envoyés comme testeuse, liste à plat, la plus récente d'abord
 * (l'écran regroupe par projet) : un coin ouvert avec une capture, un coin fermé (« Mes recettes du
 * dimanche »), un projet qu'elle ne voit plus, un message retiré par la modération, et un retour
 * sans texte (l'issue seule).
 */
export const myTesterMessages: MyTesterMessage[] = [
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000001',
    text: 'La voix se coupe quand je change de page.',
    media: sentCapture,
    createdAt: '2026-11-14T18:00:00.000Z',
  }),
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000002',
    projectId: recettesProject.id,
    project: recettesProject,
    closed: true,
    text: 'Les quantités ne suivent pas le nombre de parts.',
    createdAt: '2026-11-13T10:00:00.000Z',
  }),
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000003',
    kind: 'reply',
    outcome: null,
    device: null,
    text: 'Oui, sur Android aussi.',
    createdAt: '2026-11-12T08:00:00.000Z',
  }),
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000005',
    projectId: tableauProject.id,
    project: tableauProject,
    outcome: 'yes',
    device: 'computer',
    text: null,
    createdAt: '2026-11-11T17:30:00.000Z',
  }),
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000004',
    projectId: goneProjectId,
    project: null,
    closed: true,
    outcome: 'no',
    text: 'Le bouton Valider ne répond pas.',
    createdAt: '2026-11-10T21:00:00.000Z',
  }),
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000006',
    projectId: tableauProject.id,
    project: tableauProject,
    kind: 'reply',
    outcome: null,
    device: null,
    text: 'Teste plutôt mon appli, le lien est dans mon profil !',
    removed: true,
    createdAt: '2026-11-09T09:15:00.000Z',
  }),
]

/** Plus anciens : la deuxième page. */
export const myTesterMessagesMore: MyTesterMessage[] = [
  sent({
    id: '0f1e2d3c-4b5a-4968-8776-000000000007',
    projectId: recettesProject.id,
    project: recettesProject,
    closed: true,
    outcome: 'yes',
    device: 'tablet',
    text: 'La liste de courses s’imprime bien.',
    createdAt: '2026-11-03T15:00:00.000Z',
  }),
]

/** La première page de « Mes retours envoyés », avec la suite. */
export const myTesterMessagesPage: MyTesterMessagesPage = {
  items: myTesterMessages,
  nextCursor: myTesterMessagesCursor,
}
/** La dernière page. */
export const myTesterMessagesLastPage: MyTesterMessagesPage = {
  items: myTesterMessagesMore,
  nextCursor: null,
}
