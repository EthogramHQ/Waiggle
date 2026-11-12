// Tests de deux branchements ajoutés pour le fil d'un testeur (R7b, relecture du plan ui-B8) :
// - `MessageBubble focusRef` : l'écran pose le focus sur un message (après « Afficher les
//   précédents » ou la suppression d'un voisin). Sur téléphone, la `ref` tient le texte caché qui
//   dit le nom du message, là où le lecteur d'écran doit aller ; sur le web, l'élément de liste ;
// - `Stack ownItems` : une liste dont les enfants posent eux-mêmes leur élément de liste (les
//   bulles) n'en ajoute pas un autre autour (un élément de liste dans un autre : React #418).
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, type View } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { MessageBubble } from './MessageBubble'
import { Stack } from './Stack'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const AT = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

const bubble = (focusRef?: React.Ref<View>, text = 'Le niveau 3 rame un peu.') => (
  <MessageBubble
    from="tester"
    kind="reply"
    mine={false}
    name="Inès Morel"
    text={text}
    at={AT}
    {...(focusRef ? { focusRef } : null)}
  />
)

/** Les rôles des vues de l'arbre rendu, de haut en bas. */
const roles = (): string[] => {
  type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
  const walk = (node: Host): string[] => [
    ...(typeof node.props.role === 'string' ? [node.props.role] : []),
    ...(typeof node.props.accessibilityRole === 'string' ? [node.props.accessibilityRole] : []),
    ...node.children.flatMap((child) => (typeof child === 'string' ? [] : walk(child))),
  ]
  return walk(screen.root as unknown as Host)
}

describe('MessageBubble focusRef', () => {
  it('gives the screen the spoken name of the message on a phone', async () => {
    const ref = createRef<View>()
    await renderWithProviders(bubble(ref))

    expect(labelOf(ref.current)).toMatch(/^Réponse d’Inès Morel, /)
  })

  it('gives the screen the named list item on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const ref = createRef<View>()
      await renderWithProviders(bubble(ref))

      const props = (ref.current as unknown as { props: Record<string, unknown> }).props
      expect(props.role).toBe('listitem')
      expect(props['aria-label']).toMatch(/^Réponse d’Inès Morel, /)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('Stack ownItems', () => {
  it('does not wrap children that are list items already', async () => {
    await renderWithProviders(
      <Stack accessibilityRole="list" ownItems>
        {bubble(undefined, 'Un')}
        {bubble(undefined, 'Deux')}
      </Stack>,
    )

    expect(roles().filter((role) => role === 'listitem')).toHaveLength(2)
  })

  it('still wraps each child of a list without it', async () => {
    await renderWithProviders(
      <Stack accessibilityRole="list">
        {bubble(undefined, 'Un')}
        {bubble(undefined, 'Deux')}
      </Stack>,
    )

    // Témoin : sans `ownItems`, chaque bulle reçoit un élément de liste de plus autour d'elle.
    expect(roles().filter((role) => role === 'listitem')).toHaveLength(4)
  })
})
