// Le kit commun des tests de ce que voit un visiteur sans compte (tranche R12) : les fausses données
// (« Décollage ! », le projet public de Papi Jean ; la page publique d'Inès ; la vitrine), un faux
// serveur branché sur `fetch`, et le faux routeur d'Expo Router. Il n'a pas le suffixe `.test` :
// Jest ne le prend pas pour une suite à lancer, et il n'importe aucun écran.
//
// Pourquoi un faux serveur sur `fetch` (comme Hives.testkit.tsx) : la forme des hooks de
// `public/api.ts` et de `showcase/api.ts` est libre ; les tests lisent seulement ce que l'écran
// demande à l'API (les adresses du plan R12, choix 2 et décision 10) et ce qu'il montre. Le vrai
// client (`api/client.ts`) tourne : un 404 ou un 429 arrive à l'écran par le même chemin qu'en vrai.
//
// Chaque fichier de test pose ses `jest.mock` lui-même (Jest les remonte en tête du fichier) et les
// branche ici par des fonctions lues à l'appel (`require('./Public.testkit')`).
//
// Ce que ces tests supposent du code (plan R12, « API des modules partagés » et « Relecture du
// plan », décisions 7, 10, 12, 13 et 16 ; à corriger si le code en décide autrement, en le disant) :
// - les lectures d'un visiteur : GET /v1/public/projects/<id>, …/<id>/updates,
//   GET /v1/public/members/<id>, GET /v1/public/showcase, GET /v1/public/reports/target?kind=&id= ;
//   l'envoi : POST /v1/public/reports, 204 sans corps (rapport de K1) ;
// - un membre lit la vitrine par GET /v1/showcase (le faux serveur répond aux deux) ;
// - les écrans reçoivent l'identifiant en prop (`id`), comme `ProjectScreen` ;
// - les adresses d'un visiteur passent par `src/publicPath.ts` (`/fr/projects/<id>`…).
import type {
  PublicMember,
  PublicProject,
  PublicReportTarget,
  PublicUpdate,
  ShowcaseItem,
} from '@ruche/contracts'
import { photo } from '../testing/projects'

// --- Les fausses données ---

export const decollageId = 'd1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6'
export const papillonId = 'e2f3a4b5-6c7d-4e8f-9a01-b2c3d4e5f607' // gitleaks:allow
export const cielId = 'f3a4b5c6-7d8e-4f90-8b12-c3d4e5f60718'
export const cafesId = 'a4b5c6d7-8e9f-4a01-9c23-d4e5f6071829'
export const updateId = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'
export const coverId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
export const papiId = 'u-papi'
export const inesId = 'u-ines'

/** L'heure des tests qui lisent une date relative (« Mis à jour hier »). */
export const now = new Date('2026-10-20T10:00:00.000Z')

/** La dernière mise à jour de « Décollage ! », publiée hier. */
export const countdownUpdate: PublicUpdate = {
  id: updateId,
  title: null,
  version: 'v1.2',
  lines: [
    { family: 'new', text: 'Un compte à rebours avant chaque question' },
    { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
  ],
  photos: [],
  beforeAfter: false,
  createdAt: '2026-10-19T09:00:00.000Z',
}

/** « Décollage ! », le projet public (`web`) de Papi Jean, tel qu'un visiteur le lit. */
export const decollage: PublicProject = {
  id: decollageId,
  author: { id: papiId, name: 'Papi Jean', avatarUrl: null, publicPage: true },
  title: 'Décollage !',
  pitch: 'Un quiz sur l’espace qui s’adapte à l’âge de Yanis, 8 ans.',
  description:
    'Ce quiz grandit avec Yanis : plus il répond juste, plus les questions deviennent difficiles.',
  status: 'testable',
  categories: [{ code: 'learn', name: 'Apprendre' }],
  tools: [
    { label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true },
    { label: 'Lovable', slug: 'lovable', inCatalogue: true },
  ],
  difficulty: 'easy',
  startedOn: '2026-03',
  prompts: ['Tu es animateur de planétarium. Pose à Yanis, 8 ans, une question sur l’espace.'],
  visuals: [photo(coverId, 1600, 900, 'La fusée sur son pas de tir, de nuit')],
  portraitCover: null,
  demo: { url: 'https://decollage.lovable.app/', domain: 'decollage.lovable.app' },
  reactionCount: 54,
  latestUpdate: countdownUpdate,
  updateCount: 3,
  latestUpdateAt: countdownUpdate.createdAt,
  version: 'v1.2',
  publishedAt: '2026-09-12T08:00:00.000Z',
  // Modifié ce matin : « Mis à jour » suit la mise à jour d'hier, jamais cette date (B5).
  updatedAt: '2026-10-20T08:00:00.000Z',
}

/** Une carte de la vitrine. */
const card = (
  id: string,
  title: string,
  name: string,
  status: ShowcaseItem['status'] = 'testable',
): ShowcaseItem => ({
  id,
  title,
  pitch: `${title}, en une phrase.`,
  status,
  cover: null,
  author: { name, avatarUrl: null },
})

/** La vitrine pleine, dans l'ordre choisi par la modération (planche R12-Visiteur-Desktop). */
export const showcase: ShowcaseItem[] = [
  card(decollageId, 'Décollage !', 'Papi Jean'),
  card(papillonId, 'Quel papillon ?', 'Hugo Lefèvre'),
  card(cielId, 'Le ciel de ce soir', 'Inès Haddad', 'done'),
  card(cafesId, 'Carnet de cafés', 'Léa Moreau'),
]

/** La page publique d'Inès, toutes cases cochées (abonnés compris). */
export const inesPublic: PublicMember = {
  id: inesId,
  name: 'Inès Haddad',
  avatarUrl: null,
  bio: 'Je photographie le ciel et je fais parler les étoiles avec des IA.',
  favoriteTools: [
    { label: 'Claude', slug: 'claude', inCatalogue: true },
    { label: 'Midjourney', slug: 'midjourney', inCatalogue: true },
  ],
  projects: [
    {
      id: cielId,
      title: 'Le ciel de ce soir',
      pitch: 'Ce qu’on verra dans le ciel ce soir, expliqué à un enfant.',
      status: 'done',
      cover: null,
    },
  ],
  followerCount: 12,
}

/** La même page, Inès n'ayant laissé que son nom et sa photo. */
export const inesNameOnly: PublicMember = { id: inesId, name: 'Inès Haddad', avatarUrl: null }

const thumb = {
  url: `http://localhost:3000/media/visuals/${coverId}.webp`,
  thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
}

/** La cible « Décollage ! », telle que GET /v1/public/reports/target la rend. */
export const decollageTarget: PublicReportTarget = {
  target: { kind: 'project', id: decollageId },
  text: 'Décollage ! · Un quiz sur l’espace qui s’adapte à l’âge de Yanis, 8 ans.',
  projectId: decollageId,
  head: { title: 'Décollage !', authorName: 'Papi Jean', image: thumb },
  parts: [
    { field: 'title', mediaId: null, position: null, thumb: null },
    { field: 'pitch', mediaId: null, position: null, thumb: null },
    { field: 'description', mediaId: null, position: null, thumb: null },
    { field: 'demoUrl', mediaId: null, position: null, thumb: null },
    { field: 'photo', mediaId: coverId, position: 1, thumb },
    { field: 'prompt', mediaId: null, position: null, thumb: null },
  ],
  remainingToday: 5,
}

/** La mise à jour d'hier, comme cible d'un signalement (B3) : son texte et sa photo. */
export const updateTarget: PublicReportTarget = {
  target: { kind: 'update', id: updateId },
  text: 'Un compte à rebours avant chaque question',
  projectId: decollageId,
  head: { title: 'Décollage !', authorName: 'Papi Jean', image: thumb },
  parts: [
    { field: 'text', mediaId: null, position: null, thumb: null },
    { field: 'photo', mediaId: coverId, position: 1, thumb },
  ],
  remainingToday: 5,
}

/** La page publique d'Inès, comme cible d'un signalement. */
export const inesTarget: PublicReportTarget = {
  target: { kind: 'member', id: inesId },
  text: 'Inès Haddad',
  projectId: null,
  head: { title: null, authorName: 'Inès Haddad', image: null },
  parts: [
    { field: 'name', mediaId: null, position: null, thumb: null },
    { field: 'bio', mediaId: null, position: null, thumb: null },
  ],
  remainingToday: 5,
}

// --- Le faux serveur ---

type Sent = {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  credentials: RequestCredentials | undefined
}
type Reply = { status: number; body?: unknown }

const notFound: Reply = { status: 404, body: { error: { code: 'not_found' } } }

export const publicServer = {
  /** Chaque demande reçue, dans l'ordre. */
  sent: [] as Sent[],
  projects: new Map<string, PublicProject>(),
  updates: new Map<string, PublicUpdate[]>(),
  members: new Map<string, PublicMember>(),
  targets: new Map<string, PublicReportTarget>(),
  showcase: [] as ShowcaseItem[],
  /** La réponse de POST /v1/public/reports (204 par défaut). */
  reportReply: { status: 204 } as Reply,

  reset() {
    this.sent = []
    this.projects = new Map([[decollageId, decollage]])
    this.updates = new Map([[decollageId, [countdownUpdate]]])
    this.members = new Map([[inesId, inesPublic]])
    this.targets = new Map([
      [`project:${decollageId}`, decollageTarget],
      [`update:${updateId}`, updateTarget],
      [`member:${inesId}`, inesTarget],
    ])
    this.showcase = [...showcase]
    this.reportReply = { status: 204 }
  },

  route({ method, path, query }: Sent): Reply {
    const parts = path.split('/').filter(Boolean)
    if (method === 'GET' && path === '/v1/public/showcase') {
      return { status: 200, body: { items: this.showcase } }
    }
    if (method === 'GET' && path === '/v1/showcase') {
      return { status: 200, body: { items: this.showcase } }
    }
    if (method === 'GET' && path === '/v1/public/reports/target') {
      const found = this.targets.get(`${query.get('kind')}:${query.get('id')}`)
      return found ? { status: 200, body: found } : notFound
    }
    if (method === 'POST' && path === '/v1/public/reports') return this.reportReply
    if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'public') {
      const [, , kind, id, sub, subId] = parts
      if (kind === 'projects' && id) {
        const project = this.projects.get(id)
        if (!project) return notFound
        if (sub === undefined) return { status: 200, body: project }
        const items = this.updates.get(id) ?? []
        if (sub === 'updates' && subId === undefined) {
          return { status: 200, body: { items, nextCursor: null } }
        }
        const one = items.find((update) => update.id === subId)
        return sub === 'updates' && one ? { status: 200, body: one } : notFound
      }
      if (kind === 'members' && id && sub === undefined) {
        const member = this.members.get(id)
        return member ? { status: 200, body: member } : notFound
      }
    }
    return notFound
  },

  /** Reçoit une demande de `fetch` : la note, puis répond. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const { pathname, searchParams } = new URL(url)
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    const sent: Sent = {
      method,
      path: pathname,
      query: searchParams,
      body,
      credentials: init.credentials,
    }
    this.sent.push(sent)
    const reply = this.route(sent)
    return reply.body === undefined
      ? new Response(null, { status: reply.status })
      : new Response(JSON.stringify(reply.body), {
          status: reply.status,
          headers: { 'Content-Type': 'application/json' },
        })
  },
}

/** Les chemins demandés à l'API, dans l'ordre (« GET /v1/public/showcase »). */
export const requested = () => publicServer.sent.map(({ method, path }) => `${method} ${path}`)

/** Vrai si toutes les demandes sont allées aux routes d'un visiteur, et qu'il y en a eu. */
export const onlyPublicRoutes = () =>
  publicServer.sent.length > 0 &&
  publicServer.sent.every(({ path }) => path.startsWith('/v1/public/'))

// --- Le faux routeur ---

type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

export const mockNav = {
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  },
  listeners: new Set<(event: BeforeRemove) => void>(),
  navigation: {
    addListener: jest.fn((_type: string, listener: (event: BeforeRemove) => void) => {
      mockNav.listeners.add(listener)
      return () => mockNav.listeners.delete(listener)
    }),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  pathname: '/fr/',
  params: {} as Record<string, string>,
}

/** Remet le faux serveur, le faux routeur et l'adresse de la page à zéro. */
export const resetPublic = (pathname: string, params: Record<string, string> = {}) => {
  publicServer.reset()
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    publicServer.fetch(String(input), init),
  ) as typeof fetch
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockNav.router.canGoBack.mockImplementation(() => true)
  mockNav.listeners.clear()
  mockNav.pathname = pathname
  mockNav.params = params
}
