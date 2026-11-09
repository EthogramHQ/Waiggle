// La pile des couches modales ouvertes sur le web (les feuilles, les fenêtres de confirmation), de
// la plus ancienne à celle du dessus. Elle sert à une seule question : un élément qui reçoit le focus
// est-il dans une couche ouverte **par-dessus** une autre ?
//
// Pourquoi (relecture de design R6a, N1) : chaque Modal de react-native-web a son piège à focus,
// qui ramène chez lui tout focus posé hors de son contenu. Seul le Modal du dessus est « actif »…
// mais il ne le devient qu'à la fin de son fondu d'ouverture. Pendant ce temps-là, une fenêtre
// ouverte depuis une feuille (« Supprimer ce projet ? ») posait le focus sur « Annuler », la feuille
// le reprenait aussitôt, puis la fenêtre, enfin active, l'envoyait sur son premier bouton :
// « Supprimer », où une Entrée par réflexe supprimait le projet. La feuille lit donc cette pile
// pour laisser le focus à la couche du dessus.
//
// L'ordre d'ouverture compte, pas l'ordre dans la page : react-native-web crée la place d'un Modal
// dans la page quand le composant paraît, même fermé ; une fenêtre montée avant la feuille peut donc
// être dessinée avant elle dans le document, et s'ouvrir quand même par-dessus.

/** Une couche ouverte : son identifiant, et de quoi savoir si un élément de la page est dedans. */
type Layer = { id: string; contains: (node: unknown) => boolean }

const layers: Layer[] = []

/**
 * Inscrit une couche qui vient de s'ouvrir, en haut de la pile. Rend la fonction qui l'en retire, à
 * appeler à sa fermeture (ou quand elle disparaît).
 */
export const openModalLayer = (id: string, contains: (node: unknown) => boolean): (() => void) => {
  const layer: Layer = { id, contains }
  layers.push(layer)
  return () => {
    const index = layers.indexOf(layer)
    if (index !== -1) layers.splice(index, 1)
  }
}

// Le peu du navigateur que lisent les aides suivantes. (Les types de React Native ne décrivent pas
// la page web.)
type WebNode = {
  parentElement?: WebNode | null
  contains?: (node: unknown) => boolean
  querySelector?: (selector: string) => { getAttribute?: (name: string) => string | null } | null
}

/**
 * Toute la couche d'un élément, sur le web : son ancêtre posé directement dans `<body>` (la place
 * que react-native-web crée pour chaque Modal). Elle contient aussi les deux bornes du piège à
 * focus, autour de la boîte de dialogue. Sans page web, l'élément lui-même.
 */
const layerRootOf = (node: unknown): WebNode | null => {
  const body = (globalThis as { document?: { body?: unknown } }).document?.body
  let current = node as WebNode | null
  while (current?.parentElement && current.parentElement !== body) current = current.parentElement
  return current ?? null
}

/** La couche de `inner` (une vue de la feuille ou de la fenêtre) contient-elle `node` ? */
export const sameLayer = (inner: unknown, node: unknown): boolean =>
  layerRootOf(inner)?.contains?.(node) === true

/**
 * La couche de `node` est-elle encore inactive, son fondu d'ouverture pas fini ? react-native-web ne
 * donne le rôle `dialog` à la boîte d'un Modal (`aria-modal`) qu'une fois active, quand son propre
 * piège à focus se met au travail. On lit la boîte de **toute la couche**, pas un ancêtre de
 * `node` : les deux bornes du piège, que Tab atteint en sortant du dernier bouton, sont à côté de
 * la boîte, pas dedans (lues comme « encore inactives », elles ne faisaient plus boucler Tab). Sans
 * page web, on la tient pour inactive.
 */
export const layerStillOpening = (node: unknown): boolean =>
  layerRootOf(node)?.querySelector?.('[aria-modal="true"]')?.getAttribute?.('role') !== 'dialog'

/** `node` est-il dans une couche ouverte après la couche `id`, donc par-dessus elle ? */
export const inLayerAbove = (id: string, node: unknown): boolean => {
  const index = layers.findIndex((layer) => layer.id === id)
  if (index === -1 || node == null) return false
  return layers.slice(index + 1).some((layer) => layer.contains(node))
}
