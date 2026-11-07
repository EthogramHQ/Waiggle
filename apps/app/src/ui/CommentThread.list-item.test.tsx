// `listItem={false}` d'un fil (ui-A4) : dans `CommentList`, qui pose déjà l'élément de liste autour de
// chaque fil, le fil n'en pose pas un second (`<li>` dans `<li>`, erreur React #418 au pré-rendu) ;
// ses réponses, elles, gardent le leur.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { CommentList } from './CommentList'
import { CommentThread } from './CommentThread'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = {
  props: Record<string, unknown>
  parent: Host | null
}

/** Les ancêtres de l'élément (lui compris) qui portent ce rôle (`role` ou `accessibilityRole`). */
const ancestorsWith = (node: unknown, role: string) => {
  const found: Host[] = []
  for (let at = node as Host | null; at; at = at.parent) {
    if (at.props.role === role || at.props.accessibilityRole === role) found.push(at)
  }
  return found
}

const replies = [<Text key="zoe">Zoé : Moi aussi, dis-nous !</Text>]

describe('CommentThread, without its own list item', () => {
  it('puts no list item around its root: alone, the root has none above it', async () => {
    await renderWithProviders(
      <CommentThread listItem={false} root={<Text>Max : Super idée.</Text>} replies={replies} />,
    )

    expect(ancestorsWith(screen.getByText('Max : Super idée.'), 'listitem')).toHaveLength(0)
  })

  it('keeps one list item per reply, in their own list', async () => {
    await renderWithProviders(
      <CommentThread listItem={false} root={<Text>Max : Super idée.</Text>} replies={replies} />,
    )

    const reply = screen.getByText('Zoé : Moi aussi, dis-nous !')
    expect(ancestorsWith(reply, 'listitem')).toHaveLength(1)
    expect(ancestorsWith(reply, 'list')).toHaveLength(1)
  })

  it('has one list item above the root by default (the witness)', async () => {
    await renderWithProviders(<CommentThread root={<Text>Max : Super idée.</Text>} />)

    expect(ancestorsWith(screen.getByText('Max : Super idée.'), 'listitem')).toHaveLength(1)
  })

  it('leaves the list item to CommentList: one above the root, never two', async () => {
    await renderWithProviders(
      <CommentList state="end" onMore={() => {}} moreLabel="Suite" empty="Rien">
        <CommentThread listItem={false} root={<Text>Max : Super idée.</Text>} replies={replies} />
      </CommentList>,
    )

    expect(ancestorsWith(screen.getByText('Max : Super idée.'), 'listitem')).toHaveLength(1)
    // La réponse : celui de sa case, et celui de la liste des fils autour du fil.
    expect(ancestorsWith(screen.getByText('Zoé : Moi aussi, dis-nous !'), 'listitem')).toHaveLength(
      2,
    )
  })
})
