// Outils de test pour la navigation : lire où un écran a demandé d'aller, quelle que soit la
// façon dont il l'a écrit pour Expo Router (un texte « /sign-in?next=/page » ou un objet
// { pathname, params }). Les tests vérifient la destination, pas la forme choisie par l'écran.

/** L'adresse d'une destination d'Expo Router, en texte décodé : « /sign-in?next=/page ». */
export const hrefOf = (href: unknown): string => {
  if (typeof href === 'string') return decodeURIComponent(href)
  if (typeof href === 'object' && href !== null && 'pathname' in href) {
    const { pathname, params } = href as { pathname: string; params?: Record<string, string> }
    const query = new URLSearchParams(params ?? {}).toString()
    return decodeURIComponent(query ? `${pathname}?${query}` : pathname)
  }
  return String(href)
}

/** Toutes les adresses demandées aux faux router.push / router.replace d'un test, dans l'ordre. */
export const visited = (...mocks: jest.Mock[]): string[] =>
  mocks.flatMap((mock) => mock.mock.calls.map(([href]) => hrefOf(href)))
