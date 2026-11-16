// Tests du titre caché de Screen (`titleHidden`, « Moins de mots », 16/11/2026) : sur le Fil
// (ordinateur), Explorer et Ruches, la barre d'onglets dit déjà où l'on est, le titre ne s'affiche
// plus. Il reste le titre de niveau 1 des lecteurs d'écran (trouvé par son rôle et son nom), mais
// n'occupe aucune place : une case d'un point hors du flux (position absolue). Ce qui était à côté
// de lui passe en haut à droite. Jest ne calcule aucune position : on lit l'arbre et les styles qui
// décident ; la place réelle se regarde sur les captures.
import { act, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import type { Focusable } from './focus'
import { IconButton } from './IconButton'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

const style = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>

/** Le premier ancêtre posé hors du flux (position absolue) : la case qui cache le titre. */
const frameOf = (node: Node): Node | null => {
  for (let at: Node | null = node.parent; at; at = at.parent)
    if (style(at).position === 'absolute') return at
  return null
}

/** Le premier ancêtre commun de deux éléments. */
const commonParent = (a: Node, b: Node): Node => {
  const above = new Set<Node>()
  for (let node: Node | null = a; node; node = node.parent) above.add(node)
  for (let node: Node | null = b.parent; node; node = node.parent) if (above.has(node)) return node
  throw new Error('aucun parent commun')
}

const create = <IconButton icon="plus" label="Créer une ruche" onPress={() => {}} />

describe('Screen titleHidden', () => {
  it('keeps the title as the one h1 that screen readers find, in a frame that takes no room', async () => {
    await renderWithProviders(
      <Screen width="page" title="Ruches" titleHidden>
        <Text>Le contenu</Text>
      </Screen>,
    )

    // Le titre se trouve par son rôle et son nom : les lecteurs d'écran le lisent toujours.
    const headings = screen.getAllByRole('header')
    expect(headings).toHaveLength(1)
    const title = screen.getByRole('header', { name: 'Ruches' }) as unknown as Node
    // Mais il n'occupe aucune place : une case d'un point, hors du flux.
    const frame = frameOf(title)
    expect(frame).not.toBeNull()
    expect(style(frame as Node)).toMatchObject({ position: 'absolute', width: 1, height: 1 })
    // Aucune colonne d'en-tête autour d'elle (elle ajouterait un écart au-dessus du contenu) : la
    // case est posée directement à côté du contenu de l'écran.
    const content = screen.getByText('Le contenu') as unknown as Node
    expect((frame as Node).parent).toBe(commonParent(frame as Node, content))
    expect(
      (frame as Node).parent?.children.some(
        (child) => typeof child !== 'string' && child !== frame,
      ),
    ).toBe(true)
  })

  it('shows the title when titleHidden is not set (control)', async () => {
    // Témoin : sans la prop, le titre est affiché, dans le flux.
    await renderWithProviders(
      <Screen width="page" title="Activité">
        <Text>Le contenu</Text>
      </Screen>,
    )

    const title = screen.getByRole('header', { name: 'Activité' }) as unknown as Node
    expect(frameOf(title)).toBeNull()
  })

  it('puts what was beside the title at the top right, after the hidden title', async () => {
    await renderWithProviders(
      <Screen width="page" title="Ruches" titleHidden titleAside={create}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    const title = screen.getByRole('header', { name: 'Ruches' }) as unknown as Node
    const button = screen.getByRole('button', { name: 'Créer une ruche' }) as unknown as Node
    // Le bouton n'est pas dans la case cachée…
    expect(frameOf(button)).toBeNull()
    // … il est sur une rangée rangée à droite…
    let row: Node | null = button.parent
    while (row && style(row).flexDirection !== 'row') row = row.parent
    expect(row).not.toBeNull()
    expect(style(row as Node)).toMatchObject({ justifyContent: 'flex-end' })
    // … et le titre caché passe avant lui dans l'ordre de lecture (même colonne, rang plus petit).
    const column = commonParent(title, button)
    const rank = (node: Node) =>
      column.children.findIndex((child) => {
        for (let at: Node | null = node; at; at = at.parent) if (at === child) return true
        return false
      })
    expect(rank(title)).toBeLessThan(rank(button))
  })

  it('still lets the screen put the focus on the hidden title', async () => {
    const titleRef = createRef<Focusable>()
    await renderWithProviders(
      <Screen width="page" title="Fil" titleHidden titleRef={titleRef}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    // La vue du titre caché est bien celle que tient la ref : le focus s'y pose (Fil, après les
    // nouveautés), comme quand le titre était affiché.
    await act(async () => {})
    expect(titleRef.current).not.toBeNull()
    expect(screen.getByRole('header', { name: 'Fil' })).toBeTruthy()
  })
})
