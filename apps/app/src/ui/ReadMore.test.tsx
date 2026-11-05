// Tests du texte replié (R5b, scénario « Les états » : « un commentaire long se replie après
// 10 lignes, avec « Lire la suite » »). `ReadMore` ne dessine pas le texte lui-même : il donne au
// texte qu'on lui confie le nombre de lignes à montrer (`children(numberOfLines)`), 10 tant qu'il est
// replié, aucune limite une fois déplié. Il ne propose « Lire la suite » que si le texte dépasse :
// sur téléphone, il le sait par la mesure du texte (`onTextLayout`, une ligne par entrée). Le bouton
// dit s'il est déplié (`aria-expanded`), devient « Réduire », et reste le même bouton : le focus du
// clavier ne se perd pas.
//
// L'API attendue (relecture du plan R5b, ui-B5, colonne « API » d'U7) :
// `ReadMore({ lines = 10, children: (numberOfLines: number | undefined) => ReactNode })`.
//
// Ce que Jest ne mesure pas : sur le web, react-native-web n'a pas `onTextLayout`, et `ReadMore`
// mesure la hauteur (`onLayout`, une ligne × 10) ; c'est à essayer dans le navigateur (`--explore`).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ReadMore } from './ReadMore'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const READ_MORE = fr.t(($) => $.project.comments.readMore)
const READ_LESS = fr.t(($) => $.project.comments.readLess)

const LONG = 'Un long commentaire, qui raconte tout ce qui a marché et tout ce qui a raté.'

/** Le texte, et ce que `ReadMore` lui a demandé de montrer à chaque dessin. */
const folded = (seen: jest.Mock, lines?: number) => (
  <ReadMore lines={lines}>
    {(numberOfLines) => {
      seen(numberOfLines)
      return <Text numberOfLines={numberOfLines}>{LONG}</Text>
    }}
  </ReadMore>
)

/**
 * Le téléphone a mesuré le texte : `count` lignes (`onTextLayout`). L'évènement part du texte et
 * remonte jusqu'à celui qui l'écoute.
 */
const reportLines = async (count: number) => {
  const lines = Array.from({ length: count }, (_, index) => ({
    text: `ligne ${index + 1}`,
    x: 0,
    y: index * 24,
    width: 300,
    height: 24,
    ascender: 18,
    descender: 6,
    capHeight: 12,
    xHeight: 9,
  }))
  for (const node of screen.getAllByText(LONG)) {
    await fireEvent(node, 'textLayout', { nativeEvent: { lines } })
  }
}

describe('ReadMore', () => {
  it('shows « Lire la suite » only when the text is longer than 10 lines', async () => {
    await renderWithProviders(folded(jest.fn()))

    await reportLines(10)
    expect(screen.getByText(LONG)).toBeTruthy() // témoin : le texte est là
    expect(screen.queryByRole('button', { name: READ_MORE })).toBeNull()

    // Le texte s'agrandit (taille de texte de l'appareil) : il passe à 11 lignes.
    await reportLines(11)
    expect(screen.getByRole('button', { name: READ_MORE })).toBeTruthy()
  })

  it('« Lire la suite » reports aria-expanded and keeps the focus when it becomes « Réduire »', async () => {
    await renderWithProviders(folded(jest.fn()))
    await reportLines(14)

    const before = screen.getByRole('button', { name: READ_MORE, expanded: false })
    await fireEvent.press(before)

    const after = screen.getByRole('button', { name: READ_LESS, expanded: true })
    // Le même bouton, qui a changé de nom : React ne l'a pas remplacé, il garde le focus du clavier.
    // (Comparé par identité : `toBe` écrirait un écart sans fin entre deux éléments.)
    expect(after === before).toBe(true)
    expect(screen.queryByRole('button', { name: READ_MORE })).toBeNull()
  })

  it('asks the text for 10 lines while folded, and for no limit once unfolded', async () => {
    const seen = jest.fn()
    await renderWithProviders(folded(seen))
    await reportLines(14)

    expect(seen).toHaveBeenLastCalledWith(10)
    await fireEvent.press(screen.getByRole('button', { name: READ_MORE }))
    expect(seen).toHaveBeenLastCalledWith(undefined)
  })

  it('folds the text again with « Réduire »', async () => {
    const seen = jest.fn()
    await renderWithProviders(folded(seen))
    await reportLines(14)
    await fireEvent.press(screen.getByRole('button', { name: READ_MORE }))

    await fireEvent.press(screen.getByRole('button', { name: READ_LESS }))

    expect(screen.getByRole('button', { name: READ_MORE, expanded: false })).toBeTruthy()
    expect(seen).toHaveBeenLastCalledWith(10)
  })

  it('asks for no limit and offers nothing when the text fits', async () => {
    const seen = jest.fn()
    await renderWithProviders(folded(seen))

    await reportLines(3)

    expect(screen.queryByRole('button', { name: READ_MORE })).toBeNull()
    expect(seen).toHaveBeenLastCalledWith(undefined)
    // Témoin : la mesure est bien écoutée ; à 14 lignes, le texte se replie.
    await reportLines(14)
    expect(screen.getByRole('button', { name: READ_MORE })).toBeTruthy()
  })

  it('folds after the number of lines it is given', async () => {
    const seen = jest.fn()
    await renderWithProviders(folded(seen, 3))

    await reportLines(4)

    expect(screen.getByRole('button', { name: READ_MORE })).toBeTruthy()
    expect(seen).toHaveBeenLastCalledWith(3)
  })

  it('names « Lire la suite » in the language of the app', async () => {
    await renderWithProviders(folded(jest.fn()), 'en')
    await reportLines(14)

    // Le nom vient des textes de l'appli, dans la langue choisie.
    expect(screen.getByRole('button', { name: 'Read more' })).toBeTruthy()
  })
})
