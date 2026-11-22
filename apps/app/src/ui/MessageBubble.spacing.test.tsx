// R18 : l'espace que le membre a tapée devant « ? » reste insécable à l'affichage de la bulle du fil des testeurs
// (la ponctuation des textes des membres). Les espaces spéciales sont écrites par leur numéro.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { MessageBubble } from './MessageBubble'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const NNBSP = String.fromCodePoint(0x202f)

// Le texte tel que dessiné : les requêtes de test normalisent les espaces (insécables comprises),
// on lit donc les enfants du nœud.
const drawn = (node: { props: { children?: unknown } }) => [node.props.children].flat().join('')

describe('MessageBubble', () => {
  it('keeps the typed space before ? non-breaking in a member text', async () => {
    await renderWithProviders(
      <MessageBubble
        from="tester"
        kind="reply"
        mine={false}
        name="Inès Haddad"
        text="Ça marche ?"
        at={new Date().toISOString()}
      />,
    )

    expect(drawn(screen.getByText(/marche/))).toBe(`Ça marche${NNBSP}?`)
  })
})
