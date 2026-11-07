// Tests d'un fil de commentaires (R5b, `CommentThread`, planche `R5b-Commentaires`) : la racine,
// puis ses réponses en retrait, de la plus ancienne à la plus récente, reliées à elle par un trait
// arrondi (un coude) qui part de la racine. Depuis R5b, « Répondre » est sous chaque commentaire
// (dans sa carte) et le champ est en bas de la feuille : le fil n'a plus ni « Répondre » ni champ
// à son bout. Un emplacement (« Commentaire supprimé ») garde ses réponses dessous, avec le trait.
//
// Les cartes sont données par l'écran (des `CommentCard`) ; ici, des textes simples tiennent leur
// place. Le trait est un dessin : il ne se lit pas, et n'existe que s'il y a des réponses.
import { act, screen } from '@testing-library/react-native'
import { Dimensions, TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CommentThread } from './CommentThread'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (en profondeur). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)
const place = (node: unknown) => all().indexOf(node as Host)

/** Un dessin caché aux lecteurs d'écran (web et téléphone), qui ne porte aucun texte. */
const decorations = () =>
  all().filter(
    (node) =>
      (node.props['aria-hidden'] === true ||
        node.props.importantForAccessibility === 'no-hide-descendants' ||
        node.props.accessibilityElementsHidden === true) &&
      !hostsOf(node).some((inner) => inner.children.some((child) => typeof child === 'string')),
  )

const replies = [
  <Text key="zoe">Zoé : Moi aussi, dis-nous !</Text>,
  <Text key="lea">Léa : Merci à vous deux.</Text>,
]

describe('CommentThread', () => {
  it('shows the root, then its replies in order', async () => {
    await renderWithProviders(
      <CommentThread root={<Text>Max : Super idée, je teste ce soir.</Text>} replies={replies} />,
    )

    const root = screen.getByText('Max : Super idée, je teste ce soir.')
    const zoe = screen.getByText('Zoé : Moi aussi, dis-nous !')
    const lea = screen.getByText('Léa : Merci à vous deux.')
    expect(place(root)).toBeLessThan(place(zoe))
    expect(place(zoe)).toBeLessThan(place(lea))
  })

  it('keeps the replies of a placeholder root under it', async () => {
    await renderWithProviders(
      <CommentThread root={<Text>Commentaire supprimé</Text>} replies={replies} />,
    )

    expect(place(screen.getByText('Commentaire supprimé'))).toBeLessThan(
      place(screen.getByText('Zoé : Moi aussi, dis-nous !')),
    )
  })

  it('has no « Répondre » nor field at the end of the thread any more', async () => {
    // Ce que le fil acceptait jusqu'à R5b (un « Répondre » au bout, le champ d'une réponse) n'existe
    // plus : le typage le refuse (les deux `@ts-expect-error`), et rien ne s'en dessine.
    await renderWithProviders(
      <CommentThread
        root={<Text>Max : Super idée, je teste ce soir.</Text>}
        replies={replies}
        // @ts-expect-error : R5b, « Répondre » est dans chaque carte, plus au bout du fil.
        replyAction={{ label: 'Répondre', onPress: () => {} }}
        // @ts-expect-error : R5b, le champ est en bas de la feuille, plus au bout du fil.
        composer={<TextInput accessibilityLabel="Ta réponse" />}
      />,
    )

    expect(screen.getByText('Léa : Merci à vous deux.')).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
    expect(screen.queryByText('Répondre')).toBeNull()
    expect(screen.queryByLabelText('Ta réponse')).toBeNull()
  })

  it('draws the elbow line to the replies as a decoration, hidden from screen readers', async () => {
    await renderWithProviders(
      <CommentThread root={<Text>Max : Super idée, je teste ce soir.</Text>} replies={replies} />,
    )

    // Un coude par réponse, ou un trait et ses coudes : au moins un dessin caché, sans texte.
    expect(decorations().length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Zoé : Moi aussi, dis-nous !')).toBeTruthy()
  })

  it('draws no line for a root without replies', async () => {
    await renderWithProviders(
      <CommentThread root={<Text>Zoé : Ça marche aussi en anglais ?</Text>} />,
    )

    expect(screen.getByText('Zoé : Ça marche aussi en anglais ?')).toBeTruthy() // témoin
    expect(decorations()).toHaveLength(0)
  })

  // Relecture de design de R5b : à partir de 150 %, le texte de la carte passe sous la photo. Le
  // morceau du trait qui descend de la photo de la racine passerait alors sous ce texte : il disparaît,
  // et le trait ne part plus que du bas de la racine.
  describe('with the text very enlarged', () => {
    const setFontScale = async (fontScale: number) => {
      const window = { width: 390, height: 844, scale: 3, fontScale }
      await act(async () => Dimensions.set({ window, screen: window }))
    }

    afterEach(async () => {
      await setFontScale(1)
    })

    const thread = (
      <CommentThread root={<Text>Max : Super idée, je teste ce soir.</Text>} replies={replies} />
    )

    it('draws the line from the photo of the root at the normal size', async () => {
      await renderWithProviders(thread)

      // Le départ sous la photo, puis pour chaque réponse un trait et un coude.
      expect(decorations()).toHaveLength(5)
    })

    it('draws no line under the text of the root from 150 %', async () => {
      await setFontScale(1.5)
      await renderWithProviders(thread)

      expect(screen.getByText('Zoé : Moi aussi, dis-nous !')).toBeTruthy() // témoin
      expect(decorations()).toHaveLength(4)
    })
  })
})
