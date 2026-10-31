// L'extrait d'une description dans les résultats de la recherche (tranche R3) : quand le mot
// cherché n'est ni dans le titre ni dans le pitch, on montre la phrase de la description qui le
// contient, en texte simple (sans Markdown), « … » aux coupures. Fonctions pures, sans base.
import { foldWithMap, SEARCH_EXCERPT_MAX } from '@ruche/contracts'

/** La largeur visée d'un extrait, « … » non compris (le contrat permet 160). */
const EXCERPT_WIDTH = 120
/** Combien de caractères garder avant le mot trouvé, pour qu'il se lise dans sa phrase. */
const BEFORE_WORD = 40

/**
 * Le texte simple d'une description en Markdown : le texte des liens et des images sans leur
 * adresse, ni étoiles, ni titres, ni citations, ni puces ; tous les blancs ramenés à une espace.
 * Les expressions régulières ne lisent pas tout le Markdown (un tableau garde ses « | ») : c'est
 * assez pour une ligne d'aperçu, que l'appli affiche en texte simple, jamais en Markdown.
 * Le « _ » seul est gardé : il est courant dans un nom (« a_c »), rare comme mise en forme.
 */
export const plainText = (markdown: string): string =>
  markdown
    // ![texte](adresse) et [texte](adresse) : le texte seul.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // <https://…> : l'adresse, sans les chevrons.
    .replace(/<((?:https?|mailto):[^>\s]*)>/g, '$1')
    // En début de ligne : « # », « > », « - », « * », « + », « 1. ».
    .replace(/^[ \t]*(?:#{1,6}|>+|[-*+]|\d+[.)])[ \t]+/gm, '')
    // Gras, italique, barré, code : les signes seuls.
    .replace(/\*+|__|~~|`+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * L'extrait de `markdown` autour du premier des `words` (déjà repliés par `searchWords`) qui s'y
 * trouve : ~40 caractères avant, ~120 en tout, coupé à une espace pour ne pas trancher un mot (ni
 * un emoji, fait de deux unités UTF-16), « … » de chaque côté coupé. Le texte est replié avec sa
 * correspondance des positions (`foldWithMap` du contrat) : « eleve » trouve « Élève » ici comme
 * en SQL, et la position se lit dans le texte d'origine. Aucun mot trouvé (une lettre que la base
 * replie autrement) : le début de la description. Un texte vide : null.
 */
export const excerptOf = (markdown: string, words: string[]): string | null => {
  const text = plainText(markdown)
  if (!text) return null
  const { folded, map } = foldWithMap(text)
  let first = -1
  for (const word of words) {
    const found = folded.indexOf(word)
    if (found >= 0 && (first < 0 || found < first)) first = found
  }
  const at = first < 0 ? 0 : (map[first] ?? 0)

  let start = Math.max(0, at - BEFORE_WORD)
  let end = Math.min(text.length, start + EXCERPT_WIDTH)
  // Près de la fin : on recule le début, pour garder la même largeur.
  if (end === text.length) start = Math.max(0, end - EXCERPT_WIDTH)
  // Les coupures tombent sur une espace (sauf si le mot trouvé y perdrait sa place).
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space >= 0 && space < at) start = space + 1
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    if (space > at) end = space
  }
  // Une coupure au milieu d'un emoji (deux unités UTF-16) : on le laisse entier, hors de l'extrait.
  if (/[\uDC00-\uDFFF]/.test(text.charAt(start))) start += 1
  if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end -= 1

  const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
  // Par construction, 122 caractères au plus ; la borne du contrat est redite par prudence.
  return excerpt.slice(0, SEARCH_EXCERPT_MAX)
}
