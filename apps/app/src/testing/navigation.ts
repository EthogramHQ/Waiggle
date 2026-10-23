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

/**
 * L'adresse réelle d'une destination (tranche 7a) : les parties variables du chemin sont remplies
 * par leurs paramètres. `{ pathname: '/projects/[id]', params: { id: 'abc' } }` et
 * `'/projects/abc'` donnent tous deux « /projects/abc » ; les autres paramètres restent après « ? ».
 */
export const pathOf = (href: unknown): string => {
  if (typeof href === 'object' && href !== null && 'pathname' in href) {
    const { pathname, params = {} } = href as {
      pathname: string
      params?: Record<string, string>
    }
    const rest: Record<string, string> = {}
    let path = pathname
    for (const [key, value] of Object.entries(params)) {
      if (path.includes(`[${key}]`)) path = path.replace(`[${key}]`, value)
      else rest[key] = value
    }
    const query = new URLSearchParams(rest).toString()
    return decodeURIComponent(query ? `${path}?${query}` : path)
  }
  return hrefOf(href)
}

/**
 * Les pages « Signaler » demandées par un test (tranche 7a) : pour chaque visite de /report, ses
 * paramètres (`kind`, `id`, et ce que l'écran ajoute). L'ordre des paramètres n'importe pas.
 */
export const reportsOpened = (...mocks: jest.Mock[]): Record<string, string>[] =>
  mocks
    .flatMap((mock) => mock.mock.calls.map(([href]) => pathOf(href)))
    .filter((path) => path === '/report' || path.startsWith('/report?'))
    .map((path) => Object.fromEntries(new URLSearchParams(path.slice('/report'.length))))

/** Toutes les adresses demandées aux faux router.push / router.replace d'un test, dans l'ordre. */
export const visited = (...mocks: jest.Mock[]): string[] =>
  mocks.flatMap((mock) => mock.mock.calls.map(([href]) => hrefOf(href)))
