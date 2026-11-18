// La sorte d'un passage de page, devinée d'après l'action de navigation d'Expo Router (R17). Une
// fonction « pure » : elle ne lit que ses arguments, ce qui la rend facile à tester.
//
// Attention (relecture de sécurité du plan, S1) : `router.push`, `replace`, `navigate`, `dismissTo`
// et `prefetch` arrivent tous en `ROUTER_LINK` ; leur sorte est dans `payload.options.event`
// (`'PUSH'`, `'REPLACE'`, `'PRELOAD'`…) et l'adresse dans `payload.href`. Seuls `GO_BACK`, `POP` et
// `POP_TO_TOP` ont leur propre type.
import type { PassageKind } from '../ui/pageTransition'

/** Le peu d'une action de navigation que lit le classement. */
export type NavigationAction = {
  type: string
  payload?: { href?: string; options?: { event?: string } } | undefined
}

/**
 * La sorte du passage que déclenche `action`, depuis la page `fromPath`. `hint`, s'il est donné
 * (`announcePassage`), l'emporte.
 */
export const classifyPassage = (
  _action: NavigationAction,
  _fromPath: string,
  hint?: PassageKind | null,
): PassageKind => hint ?? 'none'
