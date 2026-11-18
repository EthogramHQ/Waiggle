// Tests du classement des passages de page (R17, scénario « Avancer et revenir, sur le web ») : la
// sorte d'un passage (plus profond, retour, onglet voisin, aucun) devinée d'après l'action de
// navigation d'Expo Router et la page d'où l'on part.
//
// Relecture de sécurité du plan, S1 : les actions ne sont jamais écrites à la main (une fausse
// `{ type: 'PUSH' }` n'existe pas dans Expo Router). Elles sont fabriquées par le vrai `router`
// (`router.push`, `replace`…), qui les dépose dans `routingQueue.add` : un « espion » (`jest.spyOn`)
// remplace cette fonction le temps du test et garde ce qu'elle a reçu. Seul `GO_BACK` est écrit tel
// que `router.back()` le dépose, car `back` exige une navigation montée (`assertIsReady`).
import { router } from 'expo-router/build/global-state/router'
import { routingQueue } from 'expo-router/build/global-state/routingQueue'
import { classifyPassage, type NavigationAction } from './classifyPassage'

/** L'action que dépose le vrai routeur pour ce geste (sans rien envoyer à la navigation). */
const actionOf = (gesture: () => void): NavigationAction => {
  const add = jest.spyOn(routingQueue, 'add').mockImplementation(() => {})
  try {
    gesture()
    expect(add).toHaveBeenCalledTimes(1)
    return add.mock.calls[0]?.[0] as NavigationAction
  } finally {
    add.mockRestore()
  }
}

/** Ce que dépose `router.back()` (routing.js, `goBack`), une fois la navigation montée. */
const GO_BACK: NavigationAction = { type: 'GO_BACK' }

describe('classifyPassage, going deeper and back', () => {
  it('goes deeper from the feed to a project', () => {
    const push = actionOf(() => router.push('/projects/p1'))
    expect(classifyPassage(push, '/feed')).toBe('deeper')
  })

  it('goes deeper by navigate and by a replace to a deeper page', () => {
    expect(
      classifyPassage(
        actionOf(() => router.navigate('/members/m1')),
        '/feed',
      ),
    ).toBe('deeper')
    expect(
      classifyPassage(
        actionOf(() => router.replace('/projects/p2')),
        '/projects/p1',
      ),
    ).toBe('deeper')
  })

  it('goes deeper with an href object, as the cards write it', () => {
    const push = actionOf(() =>
      router.push({ pathname: '/projects/[id]', params: { id: 'p1' } } as never),
    )
    expect(classifyPassage(push, '/feed')).toBe('deeper')
  })

  it('goes back with the page Back (GO_BACK)', () => {
    expect(classifyPassage(GO_BACK, '/projects/p1')).toBe('back')
  })

  it('goes back with dismiss and dismissAll (POP, POP_TO_TOP)', () => {
    expect(
      classifyPassage(
        actionOf(() => router.dismiss()),
        '/projects/p1',
      ),
    ).toBe('back')
    expect(
      classifyPassage(
        actionOf(() => router.dismissAll()),
        '/projects/p1',
      ),
    ).toBe('back')
  })

  it('goes back with the replace of the useGoBack fallback, announced as back', () => {
    // Arrivé par un lien direct, le Retour de la page remplace par sa page de secours : seule
    // l'annonce de `useGoBack` dit que c'est un retour.
    const replace = actionOf(() => router.replace('/feed'))
    expect(classifyPassage(replace, '/projects/p1', 'back')).toBe('back')
  })
})

describe('classifyPassage, between tabs', () => {
  it('is a sibling passage from the feed to Explore', () => {
    expect(
      classifyPassage(
        actionOf(() => router.push('/explore')),
        '/feed',
      ),
    ).toBe('sibling')
  })

  it('is a sibling passage to each tab root (feed, Explore, hives, me)', () => {
    for (const tab of ['/feed', '/explore', '/hives', '/me']) {
      expect(
        classifyPassage(
          actionOf(() => router.push(tab as never)),
          '/members/m1',
        ),
      ).toBe('sibling')
    }
  })

  it('is a sibling passage from a project to Explore by the tab bar (dismissTo)', () => {
    // La barre d'onglets revient à un onglet déjà ouvert par `router.dismissTo` (AppTabBar.tsx).
    const dismissTo = actionOf(() => router.dismissTo('/explore'))
    expect(classifyPassage(dismissTo, '/projects/p1')).toBe('sibling')
    expect(
      classifyPassage(
        actionOf(() => router.push('/explore')),
        '/projects/p1',
      ),
    ).toBe('sibling')
  })

  it('goes deeper from a tab to a page below it (témoin)', () => {
    expect(
      classifyPassage(
        actionOf(() => router.push('/hives/h1')),
        '/hives',
      ),
    ).toBe('deeper')
  })
})

describe('classifyPassage, no passage', () => {
  it('has no passage toward a sheet (report, publish)', () => {
    expect(
      classifyPassage(
        actionOf(() => router.push('/report?kind=project&id=p1')),
        '/projects/p1',
      ),
    ).toBe('none')
    expect(
      classifyPassage(
        actionOf(() => router.push('/projects/new')),
        '/feed',
      ),
    ).toBe('none')
    expect(
      classifyPassage(
        actionOf(() => router.push('/projects/p1/edit')),
        '/projects/p1',
      ),
    ).toBe('none')
  })

  it('has no passage on GO_BACK from a sheet', () => {
    expect(classifyPassage(GO_BACK, '/report')).toBe('none')
    expect(classifyPassage(GO_BACK, '/projects/p1/edit')).toBe('none')
  })

  it('has no passage for a prefetch (PRELOAD)', () => {
    expect(
      classifyPassage(
        actionOf(() => router.prefetch('/projects/p1')),
        '/feed',
      ),
    ).toBe('none')
  })

  it('has no passage toward the same page', () => {
    expect(
      classifyPassage(
        actionOf(() => router.push('/feed')),
        '/feed',
      ),
    ).toBe('none')
    expect(
      classifyPassage(
        actionOf(() => router.replace('/projects/p1')),
        '/projects/p1',
      ),
    ).toBe('none')
  })

  it('lets an announced kind win over the action', () => {
    // La vague de miel annonce `none` (elle couvre déjà l'écran) avant son `replace` vers le Fil.
    const replace = actionOf(() => router.replace('/feed'))
    expect(classifyPassage(replace, '/sign-in', 'none')).toBe('none')
    expect(classifyPassage(replace, '/sign-in', 'sibling')).toBe('sibling')
  })
})
