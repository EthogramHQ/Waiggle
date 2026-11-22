// R18 : l'espace que le membre a tapée devant « ? » reste insécable à l'affichage de la carte d'un appel
// (la ponctuation des textes des membres). Les espaces spéciales sont écrites par leur numéro.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { CallCard } from './CallCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const NNBSP = String.fromCodePoint(0x202f)

// Le texte tel que dessiné : les requêtes de test normalisent les espaces (insécables comprises),
// on lit donc les enfants du nœud.
const drawn = (node: { props: { children?: unknown } }) => [node.props.children].flat().join('')

describe('CallCard', () => {
  it('keeps the typed space before ? non-breaking in a member text', async () => {
    await renderWithProviders(<CallCard text="Qui veut essayer ?" at={new Date().toISOString()} />)

    expect(drawn(screen.getByText(/essayer/))).toBe(`Qui veut essayer${NNBSP}?`)
  })
})
