// Déplacer un élément dans l'ordre de la touche Tab sans le déplacer dans la page (web seulement).
//
// Le cas qui l'a demandé (relecture design C2, R4) : après « × » dans « Proches à suivre », le focus
// passe au « × » de la ligne suivante, et « Annuler » est posé sous la liste. Dans l'ordre de la
// page, il fallait treize Tab pour l'atteindre, et il disparaissait au bout de 5 secondes. Pendant
// que l'écart attend, on fait comme si « Annuler » suivait juste le « × » qui a reçu le focus : un
// Tab y mène, le suivant reprend la liste là où elle en était, et Maj+Tab refait le chemin à
// l'envers. Rien ne bouge à l'écran, et aucun `tabIndex` positif (qui dérangerait toute la page).
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

/**
 * L'élément où va le focus après `active`, dans l'ordre `order` (celui de la page) où `moved` est
 * placé juste après `anchor`. `null` quand cet ordre et celui de la page s'accordent : le navigateur
 * fait alors lui-même ce qu'il faut (et sort de la page au bout, ce qu'on ne sait pas imiter).
 * Une fonction pure, sans page, pour la tester seule.
 */
export function nextInTabOrder<T>(
  order: readonly T[],
  active: T,
  anchor: T,
  moved: T,
  backwards: boolean,
): T | null {
  if (!order.includes(anchor) || !order.includes(moved) || anchor === moved) return null
  const logical = order.filter((item) => item !== moved)
  logical.splice(logical.indexOf(anchor) + 1, 0, moved)
  const step = backwards ? -1 : 1
  const at = logical.indexOf(active)
  if (at < 0) return null
  const wanted = logical[at + step]
  const natural = order[order.indexOf(active) + step]
  return wanted !== undefined && wanted !== natural ? wanted : null
}

/** Les éléments que Tab atteint, dans l'ordre de la page (les pages cachées n'ont pas de boîte). */
const tabbables = (): HTMLElement[] =>
  [
    ...document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      element.getClientRects().length > 0,
  )

/**
 * Tant que `active` est vrai, l'élément de `moved` suit celui de `anchor` dans l'ordre de Tab (voir
 * plus haut). Sur le web seulement : ailleurs, ni Tab ni page. Les deux éléments sont demandés à
 * chaque touche (`anchor()`, `moved()`), puisque l'ancre peut changer d'un rendu à l'autre.
 */
export function useTabAfter(anchor: () => unknown, moved: () => unknown, active: boolean): void {
  // Les dernières fonctions reçues, gardées dans des refs : l'écoute de la touche ne se repose pas à
  // chaque rendu (les fonctions passées en ligne sont neuves à chaque fois).
  const latest = useRef({ anchor, moved })
  latest.current = { anchor, moved }
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof document === 'undefined') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      const elements = latest.current
      const from = elements.anchor() as HTMLElement | null | undefined
      const to = elements.moved() as HTMLElement | null | undefined
      const focused = document.activeElement as HTMLElement | null
      if (!from || !to || !focused) return
      const next = nextInTabOrder(tabbables(), focused, from, to, event.shiftKey)
      if (!next) return
      // preventDefault : le navigateur ne fait pas son propre pas de Tab en plus du nôtre. Pas de
      // preventScroll ici : un pas de Tab fait défiler jusqu'à l'élément, comme d'habitude.
      event.preventDefault()
      next.focus()
    }
    // En capture : avant tout gestionnaire de la page qui arrêterait la touche.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active])
}
