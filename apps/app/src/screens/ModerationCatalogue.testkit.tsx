// Les aides partagées des tests des pages « Outils » et « Catégories » de la Modération (tranche
// R6b) : un faux serveur de l'API, branché au plus bas (la fonction `fetch` du navigateur), et de
// quoi retrouver une carte, une feuille, une fenêtre ou son voile.
//
// Pourquoi `fetch` et pas les hooks : la forme des hooks de `moderation/catalogue-api.ts` est libre
// (U8) ; le test lit seulement ce que l'écran demande à l'API et ce qu'il montre. Et le vrai client
// (`api/client.ts`) tourne : un refus de l'API (409 `tool_name_taken`, 400 `unknown_category`,
// 403 `own_project`) arrive à l'écran par le même chemin qu'en vrai, code du corps compris.
//
// Les `jest.mock` restent dans chaque fichier de test (charte : un module remplacé se déclare là où
// il sert) ; ce fichier n'importe aucun écran.
import type {
  AdminCatalogueTool,
  CatalogueChange,
  Category,
  CategoryList,
  Me,
  PendingTool,
  ToolAdmit,
  ToolImpact,
  UncategorizedProject,
} from '@ruche/contracts'
import { screen, within } from '@testing-library/react-native'
import {
  adminToolOf,
  lovableTool,
  makeTool,
  pendingTools,
  uncategorizedProjects,
  zapierTool,
} from '../testing/catalogue'
import { categoryList } from '../testing/categories'
import { adminMe } from '../testing/fixtures'

export type Sent = { method: string; path: string; body: unknown }
/** Une réponse du faux serveur : un statut et un corps JSON (aucun corps pour 204). */
export type Reply = { status: number; body?: unknown }
type Answer = Reply | Promise<Reply>

const ok = (body: unknown): Reply => ({ status: 200, body })
/** Un refus de l'API, avec le corps qu'elle envoie vraiment : `{ error: { code, message } }`. */
export const refusal = (status: number, code: string): Reply => ({
  status,
  body: { error: { code, message: `refus ${code}` } },
})

const PENDING_TOOL_ACTION = /^\/v1\/moderation\/tools\/([^/?]+)\/(admit|merge|dismiss|impact)$/
const CATALOGUE_TOOL = /^\/v1\/moderation\/tools\/([^/?]+)$/
const PROJECT_CATEGORY = /^\/v1\/moderation\/projects\/([^/?]+)\/category$/

/**
 * Le faux serveur. Ses listes changent avec les écritures, comme en vrai : un « Autre » décidé
 * quitte « À vérifier », un projet rangé quitte « À ranger », une catégorie créée se place juste
 * avant « Autre ». `answer` impose une réponse (une attente, un refus) ; `sent` garde tout.
 */
export const catalogueServer = {
  sent: [] as Sent[],
  me: adminMe as Me,
  pending: [] as PendingTool[],
  uncategorized: [] as UncategorizedProject[],
  categories: categoryList('fr') as CategoryList,
  catalogue: [] as AdminCatalogueTool[],
  changes: [] as CatalogueChange[],
  impact: { projects: 3, profiles: 1 } as ToolImpact,
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],

  reset() {
    this.sent = []
    this.me = adminMe
    this.pending = [...pendingTools]
    this.uncategorized = [...uncategorizedProjects]
    this.categories = categoryList('fr', { cooking: 2, animals: 1, other: 2 })
    this.catalogue = [lovableTool, makeTool, zapierTool].map(adminToolOf)
    this.changes = []
    this.impact = { projects: 3, profiles: 1 }
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
  route({ method, path, body }: Sent): Reply {
    const [pathname = '', query = ''] = path.split('?')
    const params = new URLSearchParams(query)
    if (method === 'GET' && pathname === '/v1/me') return ok(this.me)
    if (method === 'GET' && pathname === '/v1/categories') return ok(this.categories)
    if (method === 'GET' && pathname === '/v1/tools') {
      const tools = this.catalogue.map(({ slug, name, family, aliases, projectCount }) => ({
        slug,
        name,
        family,
        aliases,
        projectCount,
      }))
      return ok({ tools, others: this.pending.map(({ name }) => ({ name })) })
    }
    if (method === 'GET' && pathname === '/v1/moderation/tools/pending') {
      return ok({ items: this.pending, nextCursor: null })
    }
    if (method === 'GET' && pathname === '/v1/moderation/categories/pending') {
      return ok({ items: this.uncategorized, nextCursor: null })
    }
    if (method === 'GET' && pathname === '/v1/moderation/catalogue-changes') {
      return ok({ items: this.changes, nextCursor: null })
    }
    if (method === 'GET' && pathname === '/v1/moderation/tools') {
      const q = params.get('q')?.toLowerCase()
      const items = q
        ? this.catalogue.filter((tool) => tool.name.toLowerCase().includes(q))
        : this.catalogue
      return ok({ items, nextCursor: null })
    }
    if (method === 'POST' && pathname === '/v1/moderation/tools') {
      const created: AdminCatalogueTool = {
        ...(body as ToolAdmit),
        slug: 'nouvel-outil',
        aliases: [],
        projectCount: 0,
      }
      this.catalogue.push(created)
      return { status: 201, body: created }
    }
    if (method === 'POST' && pathname === '/v1/moderation/categories') {
      const { nameFr, icon } = body as { nameFr: string; icon: Category['icon'] }
      const created: Category = { code: 'nouvelle', name: nameFr, icon, projectCount: 0 }
      const list = this.categories.categories
      this.categories = { categories: [...list.slice(0, -1), created, ...list.slice(-1)] }
      return { status: 201, body: created }
    }
    const action = PENDING_TOOL_ACTION.exec(pathname)
    if (action) {
      const [, slug, verb] = action
      const tool = this.pending.find((one) => one.slug === slug)
      if (!tool) return refusal(404, 'not_found')
      if (verb === 'impact' && method === 'GET') return ok(this.impact)
      if (method !== 'POST') return refusal(404, 'not_found')
      this.pending = this.pending.filter((one) => one.slug !== slug)
      if (verb === 'dismiss') return { status: 204 }
      if (verb === 'merge') {
        const into = (body as { into: string }).into
        const target = this.catalogue.find((one) => one.slug === into)
        return target ? ok(target) : refusal(404, 'not_found')
      }
      const admitted: AdminCatalogueTool = {
        ...(body as ToolAdmit),
        slug: tool.slug,
        aliases: [],
        projectCount: tool.projectCount,
      }
      this.catalogue.push(admitted)
      return ok(admitted)
    }
    const edited = CATALOGUE_TOOL.exec(pathname)
    if (edited && method === 'PATCH') {
      const tool = this.catalogue.find((one) => one.slug === edited[1])
      return tool ? ok({ ...tool, ...(body as object) }) : refusal(404, 'not_found')
    }
    const filed = PROJECT_CATEGORY.exec(pathname)
    if (filed && method === 'POST') {
      this.uncategorized = this.uncategorized.filter((one) => one.id !== filed[1])
      return { status: 204 }
    }
    return refusal(404, 'not_found')
  },

  /** Reçoit une demande de `fetch` : la note, puis répond. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const { pathname, search } = new URL(url)
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    const sent = { method, path: `${pathname}${search}`, body }
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

/** Branche le faux serveur à la place de `fetch`, vidé pour un nouveau test. */
export const installCatalogueServer = () => {
  catalogueServer.reset()
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    catalogueServer.fetch(String(input), init),
  ) as typeof fetch
}

/**
 * Une réponse tenue en attente : le test la libère quand il veut (`release`), pour regarder l'écran
 * pendant l'écriture.
 */
export const heldReply = () => {
  let release: (reply: Reply) => void = () => {}
  const reply = new Promise<Reply>((resolve) => {
    release = resolve
  })
  return { reply, release: (value: Reply = { status: 204 }) => release(value) }
}

// --- Retrouver les éléments ---

type Node = { props: Record<string, unknown>; children: (Node | string)[]; parent: Node | null }

/** Le nom lu d'une vue, qu'il soit écrit pour le natif ou pour le web. */
export const spokenName = (props: Record<string, unknown> | null | undefined) =>
  props?.accessibilityLabel ?? props?.['aria-label']

/**
 * La carte qui porte ce texte (un nom d'outil, un titre de projet) : on remonte depuis le texte
 * jusqu'au premier ensemble qui contient aussi `marker` (« Cité par… », un bouton…).
 */
export const cardOf = (text: string, marker: RegExp) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByText(marker).length === 0) node = node.parent
  if (!node) throw new Error(`no card around ${text}`)
  return within(node)
}

/** La ligne qui porte ce texte et ce bouton (« Zapier » et son « Modifier »). */
export const rowWithButton = (text: string, button: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('button', { name: button }).length === 0) {
    node = node.parent
  }
  if (!node) throw new Error(`no row around ${text} with ${button}`)
  return within(node)
}

/** Un élément qu'on touche, lien ou bouton, dans une partie de la page. */
export const pressableIn = (
  where: Pick<typeof screen, 'queryByRole' | 'getByRole'>,
  name: string | RegExp,
) => where.queryByRole('link', { name }) ?? where.getByRole('button', { name })

/** La couche (le Modal) la plus proche au-dessus d'un élément, qui reçoit `onRequestClose`. */
export const layerOf = (node: ReturnType<typeof screen.getByText>) => {
  let at: typeof node | null = node
  while (at && typeof at.props.onRequestClose !== 'function') at = at.parent
  if (!at) throw new Error('no Modal layer above this element')
  return at as typeof node & { props: { onRequestClose: () => void } }
}

const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le voile d'une couche : caché aux lecteurs d'écran, il se trouve par ce qui le cache. */
export const scrimOf = (layer: unknown) => {
  const found = hostsOf(layer as Node).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim in this layer')
  return found as never
}

/** Le contenu de la fenêtre (Dialog) qui porte ce titre : on remonte jusqu'à ses boutons. */
export const dialogTitled = (title: string | RegExp) => {
  let node = screen.getByRole('header', { name: title }).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no dialog titled ${String(title)}`)
  return within(node)
}

/** Les textes de la page qui répondent à `pattern`, dans l'ordre de lecture. */
export const shownInOrder = (pattern: RegExp) =>
  screen.getAllByText(pattern).map((node) => {
    const child = node.props.children
    return Array.isArray(child) ? child.join('') : String(child)
  })
