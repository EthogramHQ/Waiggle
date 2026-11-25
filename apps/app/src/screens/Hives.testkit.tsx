// Outils communs aux tests des écrans des ruches (R10, docs/scenarios/refonte.md, « R10 — Les
// Ruches ») : l'onglet Ruches, la page d'une ruche, les feuilles « Créer une ruche » et « Inviter »,
// les réglages de l'animateur. On y trouve les données d'exemple (les ruches « Famille », « Amis du
// jeudi », l'invitation dans « Atelier IA », leurs membres et leurs projets), le faux serveur de
// l'API, le faux routeur d'Expo Router et les textes cherchés à l'écran.
//
// Pourquoi un faux serveur branché sur `fetch` (comme ModerationCatalogue.testkit.tsx) : la forme des
// hooks de `hives/api.ts` est libre ; le test lit seulement ce que l'écran demande à l'API et ce
// qu'il montre. Le vrai client (`api/client.ts`) tourne : un refus de l'API (410
// `invitation_expired`, 409 `already_invited`) arrive à l'écran par le même chemin qu'en vrai.
//
// Chaque fichier de test pose ses `jest.mock` lui-même (Jest les remonte en tête de fichier) et les
// branche ici par des fonctions lues à l'appel (`require('./Hives.testkit')`) : ce fichier n'importe
// aucun écran.
//
// Ce que ces tests supposent du code (plan R10, « Appli », « Ce qui change au plan » 9 à 16, « API au
// contrat » ; à corriger si le code en décide autrement, en le disant) :
// - les adresses : `/hives` (onglet), `/hives/<id>` (page, `?tab=activity|projects|members`),
//   `/hives/new` et `/hives/<id>/invite` (feuilles ouvertes par `useRouteSheet`),
//   `/hives/<id>/settings` (page poussée) ;
// - les écrans reçoivent l'identifiant de la ruche en prop (`id`), comme `TestersCornerScreen` ;
//   le faux routeur le donne aussi par `useLocalSearchParams` ;
// - les réponses des écritures : POST /v1/hives → 201 `HiveSummary` ; PATCH /v1/hives/<id> → 200
//   `HivePage` ; POST …/invitations → 201 sans corps ; POST …/animator, DELETE …/members/<id>,
//   DELETE /v1/hives/<id>, DELETE /v1/hive-invitations/<id> → 204 ; POST …/accept → 200
//   `HiveSummary`.
import type {
  HiveActivityItem,
  HiveActivityPage,
  HiveIcon,
  HiveInvitation,
  HiveMember,
  HivePage,
  HiveProjectsPage,
  HiveSummary,
  InvitableMember,
  Me,
  MemberFace,
  MyHives,
  ProjectSummary,
} from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { containing, fr } from '../testing/text'

// --- Les membres ---

type Person = { id: string; name: string }

/** Léa, qui lit (la session) ; les autres membres des ruches de l'exemple. */
export const lea: Person = { id: leaMe.id, name: leaMe.name }
export const papiJean: Person = { id: 'u7', name: 'Papi Jean' }
export const odile: Person = { id: 'u8', name: 'Tante Odile' }
export const ines: Person = { id: 'u9', name: 'Inès Haddad' }
export const max: Person = { id: 'u2', name: 'Max Durand' }
export const nora: Person = { id: 'u10', name: 'Nora Benali' }

export const faceOf = (person: Person): MemberFace => ({
  id: person.id,
  name: person.name,
  avatarUrl: null,
})

/** Une date d'exemple : `hours` heures avant le 14 novembre 2026 à midi (UTC). */
export const hoursAgo = (hours: number) =>
  new Date(Date.UTC(2026, 10, 14, 12) - hours * 3_600_000).toISOString()

// --- Les ruches ---

export const hiveId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c01'
export const amisId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c02'
export const atelierId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c03'
export const invitationId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c04'
/** L'identifiant que le faux serveur donne à une ruche créée. */
export const createdId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c05'

/** « Famille » : 4 membres, animée par Papi Jean, 2 nouveautés ; Léa en est membre. */
export const famille: HiveSummary = {
  id: hiveId,
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: papiJean.id, name: papiJean.name },
  faces: [papiJean, lea, odile, ines].map(faceOf),
  news: 2,
  role: 'member',
}

/** « Amis du jeudi » : 6 membres, animée par Inès, rien de neuf. */
export const amis: HiveSummary = {
  id: amisId,
  name: 'Amis du jeudi',
  icon: 'coffee',
  memberCount: 6,
  animator: { id: ines.id, name: ines.name },
  faces: [ines, lea].map(faceOf),
  news: 0,
  role: 'member',
}

/** L'invitation de Nora Benali dans « Atelier IA » (6 membres, il y a 3 h). */
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

/** Ce que l'invitation donne une fois acceptée : la ruche « Atelier IA » dans la liste. */
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

export const myHives: MyHives = {
  hives: [famille, amis],
  invitations: [invitation],
  createdCount: 1,
}

/** N ruches d'exemple (« Ruche 1 »…), pour les limites (10 créées, 20 rejointes). */
export const manyHives = (count: number, role: HiveSummary['role'] = 'member'): HiveSummary[] =>
  Array.from({ length: count }, (_, index) => ({
    ...amis,
    id: `1b2c3d4e-5f60-4a7b-8c9d-${String(index).padStart(12, '0')}`,
    name: `Ruche ${index + 1}`,
    role,
  }))

// --- Les projets ---

const projectOf = (
  n: number,
  title: string,
  author: Person,
  reserved: boolean,
  changes: Partial<ProjectSummary> = {},
): ProjectSummary => ({
  ...summaryOf(recipesProject),
  id: `6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e${String(n).padStart(2, '0')}`,
  title,
  author: faceOf(author),
  visibility: reserved ? 'hive' : 'public',
  hive: reserved ? { id: hiveId, name: 'Famille' } : null,
  ...changes,
})

/** Le plan de table de Léa et Biscotte au parc de Tante Odile, réservés à Famille. */
export const planDeTable = projectOf(1, 'Le plan de table', lea, true)
export const biscotte = projectOf(2, 'Biscotte au parc', odile, true)
/** Le jeu de mémoire de Papi Jean, « Membres », qui cherche des testeurs. */
export const memo = projectOf(3, 'Le jeu de mémoire', papiJean, false, {
  status: 'testable',
  demoUrl: 'https://memo.example.com',
})

// --- La page d'une ruche ---

/** La page de Famille vue par Léa, simple membre : on peut inviter ; Le plan de table épinglé. */
export const memberPage: HivePage = {
  // R19 : la récolte, absente de ces fausses données.
  challenge: null,
  summary: famille,
  invite: 'allowed',
  invitePolicy: 'members',
  pendingInvitations: 0,
  pinned: { ...planDeTable, pinnedBy: { id: papiJean.id, name: papiJean.name } },
  seekingTesters: [memo],
  projectCount: 5,
  successor: null,
}

/** La même page vue par Léa animatrice : Papi Jean, le plus ancien, animerait après elle. */
export const animatorPage: HivePage = {
  ...memberPage,
  summary: { ...famille, role: 'animator', animator: { id: lea.id, name: lea.name } },
  successor: { name: papiJean.name },
}

/** Ruche pleine : 46 membres et 4 invités (option 9 des planches). */
export const fullPage: HivePage = {
  ...memberPage,
  summary: { ...famille, memberCount: 46 },
  invite: 'full',
  pendingInvitations: 4,
}

/** La ruche que Léa vient de créer : elle seule, aucune invitation (« Ta ruche est prête »). */
export const readyPage: HivePage = {
  // R19 : la récolte, absente de ces fausses données.
  challenge: null,
  summary: {
    id: createdId,
    name: 'Famille',
    icon: 'house-line',
    memberCount: 1,
    animator: { id: lea.id, name: lea.name },
    faces: [faceOf(lea)],
    news: 0,
    role: 'animator',
  },
  invite: 'allowed',
  invitePolicy: 'members',
  pendingInvitations: 0,
  pinned: null,
  seekingTesters: [],
  projectCount: 0,
  successor: null,
}

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

export const activity: HiveActivityPage = {
  items: [
    activityItem('published', lea, planDeTable, 2),
    activityItem('updated', odile, biscotte, 5, 'v2'),
  ],
  nextCursor: null,
}

export const projectsPage: HiveProjectsPage = { items: [planDeTable, biscotte], nextCursor: null }

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

/** Les membres de Famille : Papi Jean l'animateur, puis Léa, Tante Odile et Inès. */
export const members: HiveMember[] = [
  memberOf(papiJean, 'papijean', { role: 'animator' }),
  memberOf(lea, 'lea'),
  memberOf(odile, 'odile'),
  memberOf(ines, 'ines'),
]

/** Les mêmes membres quand Léa anime la ruche (Papi Jean redevenu simple membre). */
export const membersLeaAnimator: HiveMember[] = members.map((one) => ({
  ...one,
  role: one.isMe ? 'animator' : 'member',
}))

/** Ce que la recherche « Inviter » trouve : Max (à inviter), Inès (membre), Nora (invitée). */
export const invitable: InvitableMember[] = [
  { face: faceOf(max), handle: 'maxd', state: 'none' },
  { face: faceOf(ines), handle: 'ines', state: 'member' },
  { face: faceOf(nora), handle: 'nora', state: 'invited' },
]

// --- Le faux serveur ---

export type Sent = { method: string; path: string; query: URLSearchParams; body: unknown }
/** Une réponse : un statut et un corps JSON (aucun corps pour 204). */
export type Reply = { status: number; body?: unknown }
type Answer = Reply | Promise<Reply>

const ok = (body: unknown): Reply => ({ status: 200, body })
/** Un refus de l'API, avec le corps qu'elle envoie vraiment : `{ error: { code, message } }`. */
export const refusal = (status: number, code: string): Reply => ({
  status,
  body: { error: { code, message: `refus ${code}` } },
})
const notFound = refusal(404, 'not_found')

const HIVE = /^\/v1\/hives\/([^/]+)$/
const HIVE_PART =
  /^\/v1\/hives\/([^/]+)\/(activity|projects|members|invitable|invitations|animator)$/
const HIVE_MEMBER = /^\/v1\/hives\/([^/]+)\/members\/([^/]+)$/
const INVITATION = /^\/v1\/hive-invitations\/([^/]+)(\/accept)?$/

/**
 * Le faux serveur. Ses données changent avec les écritures, comme en vrai : une ruche créée entre
 * dans la liste, une invitation acceptée devient une ruche, un membre retiré quitte la liste.
 * `answer` impose une réponse (une attente, un refus), la plus récente l'emporte ; `sent` garde tout.
 */
export const hiveServer = {
  sent: [] as Sent[],
  me: leaMe as Me,
  mine: myHives as MyHives,
  pages: new Map<string, HivePage>(),
  activity: new Map<string, HiveActivityPage>(),
  projects: new Map<string, HiveProjectsPage>(),
  members: new Map<string, HiveMember[]>(),
  invitable: invitable as InvitableMember[],
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],

  reset() {
    this.sent = []
    this.me = leaMe
    this.mine = myHives
    this.pages = new Map([
      [hiveId, memberPage],
      [amisId, { ...memberPage, summary: amis, pinned: null, projectCount: 0 }],
    ])
    this.activity = new Map([[hiveId, activity]])
    this.projects = new Map([[hiveId, projectsPage]])
    this.members = new Map([[hiveId, members]])
    this.invitable = invitable
    this.overrides = []
  },

  /** Impose la réponse d'une demande (la plus récente l'emporte). */
  answer(method: string, path: RegExp, answer: (sent: Sent) => Answer) {
    this.overrides.unshift({ method, path, answer })
  },

  /** Les demandes reçues de cette méthode, vers une adresse qui répond à `path`. */
  received(method: string, path: RegExp): Sent[] {
    return this.sent.filter((one) => one.method === method && path.test(one.path))
  },

  /** Ce que la vraie API répondrait à cette demande, d'après l'état du faux serveur. */
  route({ method, path, query, body }: Sent): Reply {
    if (method === 'GET' && path === '/v1/me') return ok(this.me)
    if (path === '/v1/hives') {
      if (method === 'GET') return ok(this.mine)
      if (method === 'POST') {
        const { name, icon } = body as { name: string; icon: HiveIcon }
        const created: HiveSummary = { ...readyPage.summary, name, icon }
        this.mine = {
          ...this.mine,
          hives: [created, ...this.mine.hives],
          createdCount: this.mine.createdCount + 1,
        }
        this.pages.set(createdId, { ...readyPage, summary: created })
        return { status: 201, body: created }
      }
    }
    const member = HIVE_MEMBER.exec(path)
    if (member && method === 'DELETE') {
      const [, id = '', userId] = member
      if (!this.pages.has(id)) return notFound
      this.members.set(
        id,
        (this.members.get(id) ?? []).filter((one) => one.face.id !== userId),
      )
      if (userId === this.me.id) {
        this.pages.delete(id)
        this.mine = { ...this.mine, hives: this.mine.hives.filter((one) => one.id !== id) }
      }
      return { status: 204 }
    }
    const part = HIVE_PART.exec(path)
    if (part) {
      const [, id = '', name] = part
      const page = this.pages.get(id)
      if (!page) return notFound
      if (method === 'GET' && name === 'activity')
        return ok(this.activity.get(id) ?? { items: [], nextCursor: null })
      if (method === 'GET' && name === 'projects')
        return ok(this.projects.get(id) ?? { items: [], nextCursor: null })
      if (method === 'GET' && name === 'members') return ok({ members: this.members.get(id) ?? [] })
      if (method === 'GET' && name === 'invitable') {
        const q = (query.get('q') ?? '').toLowerCase()
        return ok({
          members: this.invitable.filter(
            (one) => one.face.name.toLowerCase().includes(q) || one.handle.includes(q),
          ),
        })
      }
      if (method === 'POST' && name === 'invitations') {
        const { userId } = body as { userId: string }
        this.invitable = this.invitable.map((one) =>
          one.face.id === userId ? { ...one, state: 'invited' } : one,
        )
        this.pages.set(id, { ...page, pendingInvitations: page.pendingInvitations + 1 })
        return { status: 201 }
      }
      if (method === 'POST' && name === 'animator') {
        const { userId } = body as { userId: string }
        const next = this.members.get(id)?.find((one) => one.face.id === userId)
        this.pages.set(id, {
          ...page,
          summary: {
            ...page.summary,
            role: 'member',
            animator: next ? { id: next.face.id, name: next.face.name } : page.summary.animator,
          },
          successor: null,
        })
        return { status: 204 }
      }
    }
    const hive = HIVE.exec(path)
    if (hive) {
      const [, id = ''] = hive
      const page = this.pages.get(id)
      if (!page) return notFound
      if (method === 'GET') return ok(page)
      if (method === 'PATCH') {
        const change = body as Partial<{ name: string; icon: HiveIcon; invitePolicy: string }>
        const next: HivePage = {
          ...page,
          summary: {
            ...page.summary,
            ...(change.name === undefined ? {} : { name: change.name }),
            ...(change.icon === undefined ? {} : { icon: change.icon }),
          },
          ...(change.invitePolicy === 'animator' || change.invitePolicy === 'members'
            ? { invitePolicy: change.invitePolicy }
            : {}),
        }
        this.pages.set(id, next)
        return ok(next)
      }
      if (method === 'DELETE') {
        this.pages.delete(id)
        this.mine = { ...this.mine, hives: this.mine.hives.filter((one) => one.id !== id) }
        return { status: 204 }
      }
    }
    const invited = INVITATION.exec(path)
    if (invited) {
      const [, id, accept] = invited
      const found = this.mine.invitations.find((one) => one.id === id)
      if (!found) return notFound
      const invitations = this.mine.invitations.filter((one) => one.id !== id)
      if (method === 'POST' && accept) {
        this.mine = { ...this.mine, hives: [atelier, ...this.mine.hives], invitations }
        this.pages.set(atelierId, { ...memberPage, summary: atelier, pinned: null })
        return ok(atelier)
      }
      if (method === 'DELETE' && !accept) {
        this.mine = { ...this.mine, invitations }
        return { status: 204 }
      }
    }
    return notFound
  },

  /** Reçoit une demande de `fetch` : la note, puis répond. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const { pathname, searchParams } = new URL(url)
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    const sent: Sent = { method, path: pathname, query: searchParams, body }
    this.sent.push(sent)
    const forced = this.overrides.find((one) => one.method === method && one.path.test(sent.path))
    const reply = forced ? await forced.answer(sent) : this.route(sent)
    return reply.body === undefined
      ? new Response(null, { status: reply.status })
      : new Response(JSON.stringify(reply.body), {
          status: reply.status,
          headers: { 'Content-Type': 'application/json' },
        })
  },
}

/**
 * Une réponse tenue en attente : le test la libère quand il veut (`release`), pour regarder l'écran
 * pendant l'écriture (double tape, fermeture refusée).
 */
export const heldReply = () => {
  let release: (reply: Reply) => void = () => {}
  const reply = new Promise<Reply>((resolve) => {
    release = resolve
  })
  return { reply, release: (value: Reply = { status: 204 }) => act(async () => release(value)) }
}

// --- La navigation ---

type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

/** Le faux routeur et le faux `useNavigation()` (ses écouteurs `beforeRemove`), et l'adresse. */
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
  params: {} as Record<string, string | undefined>,
  pathname: '/hives',
}

/** Le faux module `expo-router` : `setParams` change les paramètres, comme le ferait Expo Router. */
export const mockExpoRouter = () => {
  const { useEffect } = require('react') as typeof import('react')
  return {
    useRouter: () => mockNav.router,
    usePathname: () => mockNav.pathname,
    useNavigation: () => mockNav.navigation,
    useLocalSearchParams: () => mockNav.params,
    useGlobalSearchParams: () => mockNav.params,
    useSegments: () => [],
    useIsFocused: () => true,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(() => effect(), [effect])
    },
  }
}

/** Remet le faux serveur, le routeur et l'adresse à leur état de départ (dans `beforeEach`). */
export const resetHiveMocks = (
  pathname = '/hives',
  params: Record<string, string | undefined> = {},
) => {
  hiveServer.reset()
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    hiveServer.fetch(String(input), init),
  ) as typeof fetch
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockNav.router.canGoBack.mockImplementation(() => true)
  mockNav.router.setParams.mockImplementation((next: Record<string, string | undefined>) => {
    mockNav.params = { ...mockNav.params, ...next }
  })
  mockNav.listeners.clear()
  mockNav.navigation.dispatch.mockClear()
  mockNav.params = params
  mockNav.pathname = pathname
}

/** Les adresses demandées par push et navigate, dans l'ordre (chemins remplis). */
export const pushed = () =>
  [mockNav.router.push, mockNav.router.navigate].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )
export const replaced = () => mockNav.router.replace.mock.calls.map(([href]) => pathOf(href))
/** Toutes les adresses demandées, quelle que soit la façon (push, navigate, replace, dismissTo). */
export const visitedPaths = () =>
  [
    mockNav.router.push,
    mockNav.router.navigate,
    mockNav.router.replace,
    mockNav.router.dismissTo,
  ].flatMap((mock) => mock.mock.calls.map(([href]) => pathOf(href)))

/** Toutes les fois où une feuille ou une page a demandé à partir (retour, remplacement…). */
export const departures = () =>
  (['push', 'replace', 'navigate', 'back', 'dismiss', 'dismissTo'] as const).reduce(
    (count, name) => count + mockNav.router[name].mock.calls.length,
    0,
  )

/** Rejoue un `beforeRemove` (le retour du navigateur, le geste de retour) ; rend l'événement. */
export const navigatorRemoves = async (): Promise<BeforeRemove> => {
  const event: BeforeRemove = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }
  await act(async () => {
    for (const listener of mockNav.listeners) listener(event)
  })
  return event
}

// --- Les textes ---

const h = fr
export const T = {
  title: h.t(($) => $.hives.title),
  mine: h.t(($) => $.hives.mine),
  intro: h.t(($) => $.hives.intro),
  emptyTitle: h.t(($) => $.hives.emptyTitle),
  create: h.t(($) => $.hives.create),
  createdLimit: h.t(($) => $.hives.createdLimit),
  joinedLimit: h.t(($) => $.hives.joinedLimit),
  loadError: h.t(($) => $.hives.loadError),
  invitationsTitle: h.t(($) => $.hives.invitations.title),
  refuseHint: h.t(($) => $.hives.invitations.refuseHint),
  refused: h.t(($) => $.hives.invitations.refused),
  promises: [
    h.t(($) => $.hives.invitations.promiseFaces),
    h.t(($) => $.hives.invitations.promiseProjects),
    h.t(($) => $.hives.invitations.promiseLeave),
  ],
  expiredTitle: h.t(($) => $.hives.invitations.expiredTitle),
  expired: h.t(($) => $.hives.invitations.expired),
  close: h.t(($) => $.hives.invitations.close),
  sheetTitle: h.t(($) => $.hives.createSheet.title),
  nameField: h.t(($) => $.hives.createSheet.name),
  nameRequired: h.t(($) => $.hives.createSheet.nameRequired),
  iconGroup: h.t(($) => $.hives.createSheet.icon),
  submit: h.t(($) => $.hives.createSheet.submit),
  cancel: h.t(($) => $.hives.createSheet.cancel),
  createError: h.t(($) => $.hives.createSheet.error),
  readyTitle: h.t(($) => $.hives.ready.title),
  readyAction: h.t(($) => $.hives.ready.action),
  tabsLabel: h.t(($) => $.hives.page.tabsLabel),
  activityTab: h.t(($) => $.hives.page.activity),
  membersTab: h.t(($) => $.hives.page.members),
  invite: h.t(($) => $.hives.page.invite),
  full: h.t(($) => $.hives.page.full),
  animatorOnly: h.t(($) => $.hives.page.animatorOnly),
  settings: h.t(($) => $.hives.page.settings),
  report: h.t(($) => $.hives.page.report),
  leave: h.t(($) => $.hives.page.leave),
  inviteOne: h.t(($) => $.hives.page.inviteOne),
  membersPhrase: h.t(($) => $.hives.page.membersPhrase),
  // R11 (« Moins de mots ») : la phrase du récap quitte la colonne de droite. Écrite en clair, pour
  // dire son absence quand sa clé aura disparu.
  desktopNote: 'Une partie de la ruche arrive dans ton récap du dimanche.',
  hideFromSuggestions: h.t(($) => $.hives.hideFromSuggestions),
  inviteSearch: h.t(($) => $.hives.invite.search),
  inviteHint: h.t(($) => $.hives.invite.searchHint),
  invitePhrase: h.t(($) => $.hives.invite.phrase),
  inviteSent: h.t(($) => $.hives.invite.sent),
  inviteMember: h.t(($) => $.hives.invite.member),
  inviteError: h.t(($) => $.hives.invite.error),
  inviteClose: h.t(($) => $.hives.invite.close),
  settingsTitle: h.t(($) => $.hives.settings.title),
  settingsName: h.t(($) => $.hives.settings.name),
  nameError: h.t(($) => $.hives.settings.nameError),
  changeIcon: h.t(($) => $.hives.settings.changeIcon),
  policy: h.t(($) => $.hives.settings.policy),
  policyMembers: h.t(($) => $.hives.settings.policyMembers),
  policyAnimator: h.t(($) => $.hives.settings.policyAnimator),
  policyError: h.t(($) => $.hives.settings.policyError),
  handOver: h.t(($) => $.hives.settings.handOver),
  deleteHive: h.t(($) => $.hives.settings.delete),
  dialogCancel: h.t(($) => $.hives.dialogs.cancel),
  quitBody: h.t(($) => $.hives.dialogs.quitBody),
  quitComments: h.t(($) => $.hives.dialogs.quitComments),
  quitLast: h.t(($) => $.hives.dialogs.quitLast),
  quit: h.t(($) => $.hives.dialogs.quit),
  removeBody: h.t(($) => $.hives.dialogs.removeBody),
  remove: h.t(($) => $.hives.dialogs.remove),
  deleteConfirm: h.t(($) => $.hives.dialogs.delete),
  handOverConfirm: h.t(($) => $.hives.dialogs.handOver),
  notFound: h.t(($) => $.states.notFoundTitle),
  discard: h.t(($) => $.common.discard),
}

const members_ = (count: number) => h.t(($) => $.hives.members, { count })
const news_ = (count: number) =>
  count === 0 ? h.t(($) => $.hives.newsNone) : h.t(($) => $.hives.news, { count })

/** Le nom lu d'une ligne : « Famille, 4 membres, animée par Papi Jean, 2 nouveautés ». */
export const rowName = (hive: HiveSummary) =>
  hive.animator
    ? h.t(($) => $.hives.rowName, {
        hive: hive.name ?? h.t(($) => $.hives.unnamed),
        members: members_(hive.memberCount),
        animator: hive.animator.name,
        news: news_(hive.news),
      })
    : h.t(($) => $.hives.rowNameNoAnimator, {
        hive: hive.name ?? h.t(($) => $.hives.unnamed),
        members: members_(hive.memberCount),
        news: news_(hive.news),
      })
export const membersText = members_
export const acceptNamed = (hive: string) => h.t(($) => $.hives.invitations.acceptNamed, { hive })
export const refuseNamed = (name: string) =>
  h.t(($) => $.hives.invitations.refuseNamed, { nameOf: nameOf('fr', name) })
export const invitationLine = (name: string, hive: string) =>
  h.t(($) => $.hives.invitations.line, { name, hive })
export const invitationReport = (hive: string) => h.t(($) => $.hives.invitations.report, { hive })
export const invitationMore = (hive: string) => h.t(($) => $.hives.invitations.more, { hive })
export const myHiveNamed = (hive: string) => h.t(($) => $.hives.myHiveNamed, { hive })
export const badge = (hive: string) => h.t(($) => $.hives.badge, { hive })
export const iconName = (icon: HiveIcon) => h.t(($) => $.hives.icons[icon])
export const pageMenu = (hive: string) => h.t(($) => $.hives.page.menu, { hive })
export const projectsSpoken = (count: number) => h.t(($) => $.hives.page.projectsSpoken, { count })
export const membersAndInvited = (members: number, invited: number) =>
  h.t(($) => $.hives.page.membersAndInvited, {
    members: members_(members),
    invited: h.t(($) => $.hives.page.invited, { count: invited }),
  })
export const pinnedBy = (name: string) => h.t(($) => $.hives.page.pinnedBy, { name })
export const seekingOne = (name: string) => h.t(($) => $.hives.page.seekingOne, { name })
export const testNamed = (title: string) => h.t(($) => $.hives.page.testNamed, { title })
export const removeNamed = (name: string) => h.t(($) => $.hives.page.removeNamed, { name })
export const inviteTitle = (hive: string) => h.t(($) => $.hives.invite.title, { hive })
export const inviteNamed = (name: string) => h.t(($) => $.hives.invite.inviteNamed, { name })
export const quitTitle = (hive: string) => h.t(($) => $.hives.dialogs.quitTitle, { hive })
export const quitSuccessor = (name: string) => h.t(($) => $.hives.dialogs.quitSuccessor, { name })
export const removeTitle = (name: string) => h.t(($) => $.hives.dialogs.removeTitle, { name })
export const deleteTitle = (hive: string) => h.t(($) => $.hives.dialogs.deleteTitle, { hive })
export const deleteBody = (count: number) => h.t(($) => $.hives.dialogs.deleteBody, { count })
export const handOverTitle = (name: string) => h.t(($) => $.hives.dialogs.handOverTitle, { name })

// --- Retrouver les éléments ---

/** Vrai si l'écran montre ce texte (blancs de la typographie française compris), ou le lit. */
export const shown = (text: string) =>
  screen.queryAllByText(containing(text)).length > 0 ||
  screen.queryAllByLabelText(containing(text)).length > 0

/** Un bouton ou un lien de ce nom (exact, ou expression), ou null. */
export const control = (name: string | RegExp) =>
  screen.queryByRole('link', { name }) ?? screen.queryByRole('button', { name })

/** Le bouton ou le lien de ce nom ; lève une erreur lisible s'il manque. */
export const getControl = (name: string | RegExp) => {
  const found = control(name)
  if (!found) throw new Error(`no button or link named ${String(name)}`)
  return found
}

/**
 * Un élément qu'on touche, quel que soit son rôle (bouton, lien, choix d'une liste, d'un menu) :
 * pour un geste dont le plan ne fixe pas la forme (choisir le membre à qui confier l'animation).
 */
export const anyControl = (name: string | RegExp) => {
  for (const role of ['button', 'link', 'radio', 'menuitem', 'menuitemradio'] as const) {
    const found = screen.queryAllByRole(role, { name })
    if (found.length > 0) return found[0]
  }
  return null
}

/** Ouvre le menu « … » nommé `menu`, puis touche son choix `item`. */
export const chooseInMenu = async (menu: string, item: string) => {
  await fireEvent.press(screen.getByRole('button', { name: menu }))
  await fireEvent.press(await screen.findByRole('menuitem', { name: item }))
}

/** L'onglet de ce nom, et s'il est choisi (natif ou web). */
export const tab = (name: string | RegExp) => screen.getByRole('tab', { name })
export const isSelected = (name: string | RegExp) => {
  const found = tab(name)
  return Boolean(found.props.accessibilityState?.selected ?? found.props['aria-selected'] ?? false)
}

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Échap relâchée (web) ou retour d'Android : la couche du Modal qui porte le titre `title`. */
export const pressEscape = async (title: string) => {
  const layers = hostsOf(screen.root as unknown as Host).filter(
    (node) => typeof node.props.onRequestClose === 'function' && textOf(node).includes(title),
  )
  const layer = layers.at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
  if (!layer) throw new Error(`no layer around ${title}`)
  await act(() => layer.props.onRequestClose())
}

/** La ligne (le plus petit bloc) qui porte ce texte et un bouton de ce nom. */
export const rowWith = (text: string, button: string | RegExp) => {
  let node = screen.getAllByText(containing(text))[0]?.parent ?? null
  while (node && within(node).queryAllByRole('button', { name: button }).length === 0)
    node = node.parent
  if (!node) throw new Error(`no row around ${text} with ${String(button)}`)
  return within(node)
}
