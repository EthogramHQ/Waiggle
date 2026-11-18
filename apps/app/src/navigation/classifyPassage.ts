// La sorte d'un passage de page, devinée d'après l'action de navigation d'Expo Router (R17). Une
// fonction « pure » : elle ne lit que ses arguments, ce qui la rend facile à tester.
//
// Attention (relecture de sécurité du plan, S1) : `router.push`, `replace`, `navigate`, `dismissTo`
// et `prefetch` arrivent tous en `ROUTER_LINK` ; leur sorte est dans `payload.options.event`
// (`'PUSH'`, `'REPLACE'`, `'PRELOAD'`…) et l'adresse dans `payload.href`. Seuls `GO_BACK`, `POP` et
// `POP_TO_TOP` ont leur propre type.
import type { PassageKind } from '../ui/pageTransition'
import { isSheetPath } from './sheetRoutes'

/** Le peu d'une action de navigation que lit le classement. */
export type NavigationAction = {
  type: string
  payload?: { href?: string; options?: { event?: string } } | undefined
}

/**
 * La première page de chaque onglet (les adresses de navigation/AppTabBar.tsx) : y aller, d'où que
 * l'on vienne, est un passage entre pages sœurs.
 */
const TAB_ROOTS = new Set(['/feed', '/explore', '/hives', '/me'])

/** Les actions qui reviennent en arrière dans la pile. */
const BACK_TYPES = new Set(['GO_BACK', 'POP', 'POP_TO_TOP'])

/** L'adresse sans sa requête, son fragment ni sa barre finale (« /feed/?x=1 » donne « /feed »). */
const pathOf = (href: string): string => {
  const path = href.split(/[?#]/)[0] ?? ''
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/**
 * La sorte du passage que déclenche `action`, depuis la page `fromPath`. `hint`, s'il est donné
 * (`announcePassage`), l'emporte.
 */
export const classifyPassage = (
  action: NavigationAction,
  fromPath: string,
  hint?: PassageKind | null,
): PassageKind => {
  if (hint) return hint
  const from = pathOf(fromPath)
  // Partir d'une feuille ne fait pas de passage : la page dessous est déjà dessinée, et la feuille
  // anime elle-même sa sortie.
  if (isSheetPath(from)) return 'none'
  if (BACK_TYPES.has(action.type)) return 'back'
  if (action.type !== 'ROUTER_LINK') return 'none'

  const event = action.payload?.options?.event
  const href = action.payload?.href
  if (event === 'PRELOAD' || href === undefined) return 'none'
  const to = pathOf(href)
  if (to === from || isSheetPath(to)) return 'none'
  if (TAB_ROOTS.has(to)) return 'sibling'
  // `dismissTo` revient à une page déjà ouverte, plus haut dans la pile.
  return event === 'POP_TO' ? 'back' : 'deeper'
}
