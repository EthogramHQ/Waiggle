// Les aides et données communes aux tests des commentaires d'un projet depuis R5b : l'aperçu sur
// la page, la feuille des commentaires, le champ du bas, le menu « … » de chaque carte, et où va le
// focus. Pas de suffixe « .test » : Jest ne le prend pas pour une suite de tests, il le charge
// seulement quand un fichier de test l'importe (ProjectComments.test.tsx et
// ProjectScreen.comment*.test.tsx). Les jest.mock restent écrits dans chaque fichier de test.
//
// Tout se retrouve par son rôle et son nom (ce que lit un lecteur d'écran), jamais par son style.
import type { Comment } from '@ruche/contracts'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { commentOf, maxComment, zoeComment } from '../testing/comments'
import { focusAndReveal, focusWithoutScroll } from '../ui/focus'

/** Un élément de l'arbre rendu, tel que Testing Library le donne : ses props, son parent. */
export type Host = ReturnType<typeof screen.getByText>

// --- Des commentaires de plus, pour atteindre 6 (l'aperçu en montre 3 sur téléphone, 5 sur
// ordinateur) ---

export const inesAuthor = { id: 'u5', name: 'Inès', handle: 'ines', avatarUrl: null }
export const hugoAuthor = { id: 'u7', name: 'Hugo', handle: 'hugo', avatarUrl: null }

/** Un fil plus ancien que celui de Zoé : Inès, sans réponse. */
export const inesComment = commentOf({
  id: '6e7f8091-a2b3-4c4d-9e5f-60718293a4b5',
  author: inesAuthor,
  body: 'Et pour les végétariens ?',
  createdAt: '2026-10-13T09:00:00.000Z',
})

/** Le fil le plus ancien : Hugo, sans réponse. */
export const hugoComment = commentOf({
  id: '7f8091a2-b3c4-4d5e-8f60-718293a4b5c6',
  author: hugoAuthor,
  body: 'Testé avec des restes de couscous.',
  createdAt: '2026-10-12T09:00:00.000Z',
})

/**
 * Six commentaires visibles, dans l'ordre de la feuille : le fil de Max (Max, puis les réponses de
 * Zoé et de Léa), puis les fils de Zoé, d'Inès et de Hugo.
 */
export const sixComments: Comment[] = [maxComment, zoeComment, inesComment, hugoComment]

/** Les textes des six, dans l'ordre de la feuille (le 6e est celui de Hugo). */
export const sixTexts = [
  'Super idée, je teste ce soir.',
  'Moi aussi, dis-nous !',
  'Merci à vous deux.',
  'Ça marche aussi en anglais ?',
  'Et pour les végétariens ?',
  'Testé avec des restes de couscous.',
]

/** Six fils sans réponse, du plus récent au plus ancien. */
export const sixThreads: Comment[] = Array.from({ length: 6 }, (_, index) =>
  commentOf({
    id: `8091a2b3-c4d5-4e6f-8071-8293a4b5c6d${index}`,
    author: { id: `u${10 + index}`, name: `Membre ${index + 1}`, handle: null, avatarUrl: null },
    body: `Fil numéro ${index + 1}`,
    createdAt: `2026-10-0${9 - index}T09:00:00.000Z`,
  }),
)

// --- L'aperçu ---

/** Le nom d'une carte compacte de l'aperçu : « Commentaire de Max : Super idée… » (ui-B7). */
export const lineOf = (name: string, start: string) =>
  new RegExp(`^Commentaire de ${name} : ${escapeRegExp(start)}`)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Les cartes compactes de l'aperçu, dans l'ordre de la page (hors de la feuille). */
export const previewLines = () => {
  const layer = sheetLayer()
  return screen
    .queryAllByRole('button', { name: /^Commentaire de / })
    .filter((line) => !layer || !isInside(line, layer))
}

/** Le nom lu de chaque carte de l'aperçu. */
export const previewNames = () =>
  previewLines().map((line) => String(line.props.accessibilityLabel ?? ''))

// --- La feuille ---

/**
 * La couche de la feuille des commentaires, ou null si elle est fermée : l'ancêtre du bouton
 * « Fermer » qui reçoit `onRequestClose` (le Modal : retour Android, Échap relâchée).
 */
export const sheetLayer = (): Host | null => {
  const close = screen.queryAllByRole('button', { name: 'Fermer' })[0]
  let node = close?.parent ?? null
  while (node && typeof node.props.onRequestClose !== 'function') node = node.parent
  return node
}

/** Vrai si la feuille des commentaires est ouverte. */
export const sheetIsOpen = () => sheetLayer() !== null

/** Ce qui est dans la feuille ouverte (les requêtes de Testing Library, limitées à elle). */
export const sheet = () => {
  const layer = sheetLayer()
  if (!layer) throw new Error('the comments sheet is not open')
  return within(layer)
}

/** Vrai si `node` est dans `ancestor`. */
export const isInside = (node: Host, ancestor: Host) => {
  for (let at: Host | null = node; at; at = at.parent) if (at === ancestor) return true
  return false
}

/**
 * Le bouton de l'aperçu qui ouvre la feuille : « Voir les N commentaires », « Commenter » (3 ou
 * moins) ou « Écrire un commentaire » (aucun).
 */
export const sheetOpener = () =>
  screen.queryByRole('button', { name: /^Voir (le commentaire|les \d+ commentaires)$/ }) ??
  screen.queryByRole('button', { name: 'Commenter' }) ??
  screen.getByRole('button', { name: 'Écrire un commentaire' })

/** Ouvre la feuille par le bouton de l'aperçu. */
export const openSheet = async () => {
  await fireEvent.press(sheetOpener())
}

/** La couche la plus proche au-dessus de `node` (un Modal : la feuille, le menu, la fenêtre). */
export const layerOf = (node: Host) => {
  let at: Host | null = node
  while (at && typeof at.props.onRequestClose !== 'function') at = at.parent
  return at
}

/**
 * Sur le web, le Modal de react-native-web appelle `onDismiss` une fois parti (le menu « … » rend
 * alors le focus à son bouton, puis lance l'action choisie) ; le Modal simulé de Jest, jamais : on
 * l'appelle, depuis la couche gardée avant sa fermeture.
 */
export const dismissed = async (layer: Host | null) => {
  const onDismiss = layer?.props.onDismiss
  if (typeof onDismiss === 'function') await act(async () => onDismiss())
}

/** Ferme la feuille par « Fermer ». */
export const closeSheet = async () => {
  await fireEvent.press(sheet().getByRole('button', { name: 'Fermer' }))
}

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const roleOf = (node: Node) => node.props.role ?? node.props.accessibilityRole

/** Tous les éléments sous `node`, en profondeur (RNTL 14 n'a plus `findAll`). */
const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/**
 * Les éléments de liste de la première liste de la feuille (les fils), sans ceux des listes
 * imbriquées (les réponses). Les listes ne sont pas des vues `accessible` sur téléphone :
 * `getByRole` ne les trouve pas, on parcourt l'arbre (charte, R5a).
 */
export const threadItems = () => {
  const layer = sheetLayer() as unknown as Node | null
  if (!layer) throw new Error('the comments sheet is not open')
  const lists = hostsOf(layer).filter((node) => roleOf(node) === 'list')
  const outer = lists[0]
  if (!outer) return []
  // Un élément de liste appartient à la liste la plus proche au-dessus de lui.
  const items: Node[] = []
  const walk = (node: Node, list: Node) => {
    for (const child of node.children) {
      if (typeof child === 'string') continue
      const role = roleOf(child)
      if (role === 'listitem' && list === outer) items.push(child)
      walk(child, role === 'list' ? child : list)
    }
  }
  walk(outer, outer)
  return items
}

// --- Le champ du bas ---

/**
 * Le champ du commentaire, nommé « Écrire un commentaire » (comme le bouton de l'aperçu sans
 * commentaire : on garde la saisie, pas le bouton). `scope` : la feuille, ou toute la page.
 */
export const queryCommentField = (scope: Pick<typeof screen, 'queryAllByLabelText'> = screen) =>
  scope.queryAllByLabelText('Écrire un commentaire').find((node) => node.type === 'TextInput') ??
  null

export const commentField = (scope: Pick<typeof screen, 'queryAllByLabelText'> = screen) => {
  const field = queryCommentField(scope)
  if (!field) throw new Error('no comment field')
  return field
}

/** Le bouton d'envoi : la flèche « Envoyer le commentaire » (sur ordinateur, « Envoyer »). */
export const sendButton = (scope: Pick<typeof screen, 'getByRole'> = screen) =>
  scope.getByRole('button', { name: /^Envoyer( le commentaire)?$/ })

/** Écrit ce texte dans le champ, puis touche l'envoi. */
export const writeAndSend = async (text: string) => {
  await fireEvent.changeText(commentField(), text)
  await fireEvent.press(sendButton())
}

// --- Les cartes et leur menu « … » ---

/**
 * La carte d'un commentaire : on remonte depuis son texte jusqu'au premier ensemble qui contient un
 * bouton (« Répondre », « … », « Lire la suite »). Les réponses ont chacune la leur.
 */
export const cardOf = (text: string, scope: Pick<typeof screen, 'getByText'> = sheet()) => {
  let node: Host | null = scope.getByText(text).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no card around the comment ${text}`)
  return within(node)
}

/** Le bouton « … » d'une carte, nommé « Actions du commentaire de … ». */
export const menuButtonOf = (card: ReturnType<typeof within>) =>
  card.getByRole('button', { name: /^Actions du commentaire de / })

/** Ouvre le menu « … » de la carte de ce texte et rend les noms de ses entrées. */
export const openMenuOf = async (text: string) => {
  await fireEvent.press(menuButtonOf(cardOf(text)))
  return screen.queryAllByRole('menuitem').map((item) => String(item.props.accessibilityLabel))
}

/** Ouvre le menu « … » de la carte de ce texte et y choisit cette entrée. */
export const chooseInMenu = async (text: string, entry: string) => {
  await fireEvent.press(menuButtonOf(cardOf(text)))
  const item = screen.getByRole('menuitem', { name: entry })
  const layer = layerOf(item)
  await fireEvent.press(item)
  await dismissed(layer)
}

/** Un lien ou un bouton de ce nom (« Démasquer » est un lien au texte, dans la carte). */
export const linkOrButton = (
  scope: Pick<typeof screen, 'queryByRole' | 'getByRole'>,
  name: string | RegExp,
) => scope.queryByRole('link', { name }) ?? scope.getByRole('button', { name })

/** La `ref` d'une vue posée à côté de l'écran : par elle, on atteint le prototype commun des vues. */
type Probe = { current: unknown }

// --- Les touches du clavier (web) ---

/**
 * Une touche tapée sur `element`, comme dans le navigateur : l'événement remonte l'arbre de React
 * (portails des couches compris), chaque `onKeyDown` rencontré le reçoit, jusqu'à ce que l'un
 * l'arrête ; puis la touche relâchée arrive à la couche la plus proche (son `onRequestClose` : le
 * Modal de react-native-web écoute Échap relâchée). `fireEvent` n'appellerait que le premier
 * gestionnaire, et la feuille ne verrait jamais une Échap prise avant elle.
 *
 * `target` : ce que la feuille lit pour savoir si la touche vient de son panneau (`contains`,
 * prêté par `lendContains`).
 */
export const pressKey = async (element: Host, key: string, target: unknown) => {
  const nativeEvent = {
    key,
    target,
    defaultPrevented: false,
    preventDefault: () => {
      nativeEvent.defaultPrevented = true
    },
  }
  let stopped = false
  const event = {
    key,
    repeat: false,
    shiftKey: false,
    target,
    nativeEvent,
    get defaultPrevented() {
      return nativeEvent.defaultPrevented
    },
    isDefaultPrevented: () => nativeEvent.defaultPrevented,
    preventDefault: () => nativeEvent.preventDefault(),
    stopPropagation: () => {
      stopped = true
    },
    isPropagationStopped: () => stopped,
  }
  const called = new Set<unknown>()
  let layer: Host | null = null
  await act(async () => {
    for (let node: Host | null = element; node && !stopped; node = node.parent) {
      // Un champ reçoit la touche par onKeyPress (react-native-web), les vues par onKeyDown.
      for (const name of node === element ? ['onKeyPress', 'onKeyDown'] : ['onKeyDown']) {
        const handler = node.props[name]
        if (typeof handler === 'function' && !called.has(handler)) {
          called.add(handler)
          handler(event)
        }
      }
      if (!layer && typeof node.props.onRequestClose === 'function') layer = node
    }
  })
  const top = layer as Host | null
  if (key === 'Escape' && top) await act(async () => top.props.onRequestClose())
}

/** Ce que la feuille lit d'une touche venue de son panneau, et d'une touche venue d'ailleurs. */
export const inside = { inside: true }
export const outside = { outside: true }

/**
 * Prête aux vues le `contains` du navigateur (la feuille vérifie que la touche vient de son
 * panneau) : tout le contient, sauf `outside` (une autre couche : le menu, la confirmation). La
 * `ref` d'une vue est l'instance d'une classe partagée : on passe par son prototype (charte, RF).
 * Rend la fonction qui remet tout comme avant.
 */
export const lendContains = (probe: Probe) => {
  const proto = Object.getPrototypeOf(probe.current) as { contains?: unknown }
  const had = Object.hasOwn(proto, 'contains')
  const original = proto.contains
  proto.contains = (node: unknown) => node !== outside
  return () => {
    if (had) proto.contains = original
    else delete proto.contains
  }
}

// --- Où va le focus ---

type Focused = { accessibilityLabel?: unknown; accessibilityHint?: unknown }

/**
 * Suit le focus posé par le code : par `focus()` d'une vue (espionné sur le prototype des vues,
 * qu'on lit par la `ref` de `probe`), ou par les aides de `ui/focus` quand le fichier de test les
 * remplace par de fausses fonctions. `last()` rend les props de la dernière vue qui l'a reçu.
 */
export const watchFocus = (probe: Probe) => {
  const proto = Object.getPrototypeOf(probe.current) as { focus?: unknown }
  const had = Object.hasOwn(proto, 'focus')
  const original = proto.focus
  if (typeof proto.focus !== 'function') proto.focus = () => {}
  const spy = jest.spyOn(proto as { focus: () => void }, 'focus')
  spy.mockClear()
  const helpers = [focusWithoutScroll, focusAndReveal].filter((fn) => jest.isMockFunction(fn))
  for (const helper of helpers) jest.mocked(helper).mockClear()
  return {
    /** Les props de la dernière vue qui a reçu le focus, ou null. */
    last: (): Focused | null => {
      const events: { order: number; node: unknown }[] = [
        ...spy.mock.contexts.map((node, index) => ({
          order: spy.mock.invocationCallOrder[index] ?? 0,
          node,
        })),
        ...helpers.flatMap((helper) => {
          const { calls, invocationCallOrder } = jest.mocked(helper).mock
          return calls.map((call, index) => ({
            order: invocationCallOrder[index] ?? 0,
            node: call[0],
          }))
        }),
      ].filter((event) => event.node)
      const last = events.sort((a, b) => a.order - b.order).at(-1)
      return ((last?.node as { props?: Focused } | undefined)?.props ?? null) as Focused | null
    },
    restore: () => {
      spy.mockRestore()
      if (had) proto.focus = original
      else delete proto.focus
    },
  }
}

/** Le nom lu et l'indice d'une vue focalisée, mis bout à bout (pour savoir de quelle carte elle est). */
export const describeFocused = (focused: Focused | null) =>
  focused
    ? `${String(focused.accessibilityLabel ?? '')} ${String(focused.accessibilityHint ?? '')}`
    : ''
