// R18 : l'espace que le membre a tapée devant « ? » reste insécable à l'affichage de la carte d'un projet à ranger
// (la ponctuation des textes des membres). Les espaces spéciales sont écrites par leur numéro.
import { screen } from '@testing-library/react-native'
import { birdhouseProject } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { UncategorizedCard } from './UncategorizedCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const NNBSP = String.fromCodePoint(0x202f)

// Le texte tel que dessiné : les requêtes de test normalisent les espaces (insécables comprises),
// on lit donc les enfants du nœud.
const drawn = (node: { props: { children?: unknown } }) => [node.props.children].flat().join('')

describe('UncategorizedCard', () => {
  it('keeps the typed space before ? non-breaking in a member text', async () => {
    await renderWithProviders(
      <UncategorizedCard
        project={{ ...birdhouseProject, title: 'Un nichoir ?', pitch: 'Pourquoi pas ?' }}
        filedInto={null}
        onFile={jest.fn()}
        onOpenProject={jest.fn()}
      />,
    )

    expect(drawn(screen.getByText(/Pourquoi/))).toBe(`Pourquoi pas${NNBSP}?`)
    expect(drawn(screen.getByText(/nichoir/))).toBe(`Un nichoir${NNBSP}?`)
  })
})
