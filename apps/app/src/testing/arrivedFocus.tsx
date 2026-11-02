// Outil des tests du focus « première carte arrivée » (RF, jur-RF2) : une liste par pages qui finit
// sans phrase donne le focus du clavier à la première carte arrivée avec la dernière page, au lieu
// de le laisser retomber sur `body`. Chaque composant de liste (Stack, ListGroup, Arrival,
// CommentList) branche la ref de cette carte à sa façon ; ce fichier rejoue le geste du membre
// (« Afficher la suite » au clavier, la page 2 arrive) et dit **quelle carte** a reçu le focus.
//
// Jest n'a pas de navigateur : on prête à la page web le peu que `FeedEnd` en lit (l'élément qui a le
// focus, « ce bouton le contient-il ? ») et on écoute `focus` sur les vues natives.
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, type ReactElement, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { renderWithProviders } from './render'

/** Le nom du bouton de `FeedEnd` dans ces tests. */
export const MORE = 'Afficher la suite'

export type PageState = 'more' | 'loading' | 'end'

type Patched = { contains?: unknown; focus?: unknown }

/**
 * Une page web prêtée, complète en apparence (un `document` partiel fait tomber ThemeProvider) :
 * tout ce qu'on y lit est un objet qui accepte tout, sauf l'élément qui a le focus.
 */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })

/**
 * Le texte de la carte portée par une vue : on descend dans les enfants de la vue (RNTL 14 garde
 * les `props` de la `ref` d'un natif) jusqu'à la première chaîne.
 */
export const labelOf = (node: unknown): string | undefined => {
  const props = (node as { props?: Record<string, unknown> } | null)?.props
  if (!props) return undefined
  if (typeof props.accessibilityLabel === 'string') return props.accessibilityLabel
  const search = (child: unknown): string | undefined => {
    if (typeof child === 'string') return child
    if (Array.isArray(child)) {
      for (const one of child) {
        const found = search(one)
        if (found !== undefined) return found
      }
      return undefined
    }
    const childProps = (child as { props?: { children?: unknown } } | null)?.props
    return childProps ? search(childProps.children) : undefined
  }
  return search(props.children)
}

/**
 * Passe en « web » le temps d'un fichier (à appeler dans `beforeEach`) ; renvoie ce qui défait tout
 * (à appeler dans `afterEach`, avec `jest.restoreAllMocks()`).
 */
export const lendWebPage = () => {
  jest.replaceProperty(Platform, 'OS', 'web')
  ;(globalThis as { document?: unknown }).document = new Proxy(
    { activeElement: { focused: true } } as Record<string | symbol, unknown>,
    { get: (target, key) => (key in target ? target[key] : loose()), set: () => true },
  )
  return () => {
    delete (globalThis as { document?: unknown }).document
  }
}

/**
 * Le membre prend « Afficher la suite » au clavier dans une liste de `first` cartes, puis la page 2
 * arrive (`all` cartes, la liste est finie). Rend le texte de chaque vue qui a reçu le focus.
 *
 * `ui(names, state)` dessine la liste et son bas (`FeedEnd`, bouton « Afficher la suite ») ; le
 * composant testé branche lui-même la ref de la première carte arrivée.
 */
export async function turnThePage(
  ui: (names: string[], state: PageState) => ReactNode,
  first: string[],
  all: string[],
): Promise<(string | undefined)[]> {
  // Une vue témoin : toutes les vues natives du rendu partagent son prototype.
  const probe = createRef<View>()
  const page = (names: string[], state: PageState): ReactElement => (
    <>
      <View ref={probe} />
      {ui(names, state)}
    </>
  )
  const view = await renderWithProviders(page(first, 'more'))
  const proto = Object.getPrototypeOf(probe.current) as Patched
  const hadContains = Object.hasOwn(proto, 'contains')
  const originalContains = proto.contains
  const hadFocus = Object.hasOwn(proto, 'focus')
  const originalFocus = proto.focus
  // « Le bouton contient le focus » : vrai pour toute vue (c'est lui qui l'a).
  proto.contains = () => true
  if (typeof proto.focus !== 'function') proto.focus = () => {}
  const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
  try {
    const button = screen.getByRole('button', { name: MORE })
    await fireEvent(button, 'focus')
    await fireEvent.press(button)
    await view.rerender(page(first, 'loading'))
    await view.rerender(page(all, 'end'))
    // Témoin : le bouton a disparu, la liste est finie.
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
    // Seules les vues de cette liste comptent : un minuteur d'un test précédent du même fichier
    // (le focus d'un choix radio) peut tomber sur le même prototype pendant celui-ci.
    return focus.mock.contexts.map(labelOf).filter((label) => label && all.includes(label))
  } finally {
    focus.mockRestore()
    if (hadContains) proto.contains = originalContains
    else delete proto.contains
    if (hadFocus) proto.focus = originalFocus
    else delete proto.focus
  }
}

/**
 * La suite commune des composants de liste : le même geste, le même attendu. `setup` rend la façon
 * de dessiner la liste (voir `turnThePage`) ; il est appelé dans le test, jamais à la définition.
 */
export function arrivedFocusSuite(
  title: string,
  setup: () => (names: string[], state: PageState) => ReactNode,
) {
  describe(title, () => {
    let restore: () => void
    beforeEach(() => {
      restore = lendWebPage()
    })
    afterEach(() => {
      restore()
      jest.restoreAllMocks()
    })

    const first = ['Carnet 1', 'Carnet 2', 'Carnet 3']

    it('moves the focus to the first card of page 2 when the list ends without a sentence', async () => {
      const focused = await turnThePage(setup(), first, [...first, 'Carnet 4', 'Carnet 5'])
      // Une seule vue a le focus, et c'est la première arrivée : jamais `body`, jamais la dernière.
      expect(focused).toEqual(['Carnet 4'])
    })

    it('keeps the focus on the last card when page 2 arrives empty', async () => {
      const focused = await turnThePage(setup(), first, first)
      expect(focused).toEqual(['Carnet 3'])
    })
  })
}
