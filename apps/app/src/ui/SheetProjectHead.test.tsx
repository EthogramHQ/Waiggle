// Tests de l'en-tête projet d'une feuille du coin des testeurs (R7b, planche validée 7, relecture du
// plan ui-B10) : sous le titre de la feuille (« Nouvel appel », « Ton retour »), la vignette du
// projet, son titre, une ligne qui dit pour qui l'on écrit (« Pour tes 12 testeurs », « Projet de
// Papi Jean »), et à droite une action (« Effacer le brouillon »), qui fait 44 points au moins.
//
// L'API (plan R7b, « API fixée à l'assemblage ») :
// `SheetProjectHead({ thumb: ImageSource | null; title: string; subtitle: string;
//   action?: { label: string; onPress: () => void } })`.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import type { ImageSource } from './image'
import { SheetProjectHead } from './SheetProjectHead'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const THUMB_URI = 'https://media.example/visuals/decollage-1.webp'
const thumb: ImageSource = { uri: THUMB_URI }
const title = 'Décollage !'
const forTesters = fr.t(($) => $.project.testers.calls.audience, { count: 12 })
const byAuthor = fr.t(($) => $.project.testers.feedback.byAuthor, { nameOf: 'de Papi Jean' })
const clearDraft = fr.t(($) => $.project.testers.feedback.clearDraft)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (en profondeur). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)
/** La place d'un élément dans l'ordre de lecture. */
const place = (node: unknown) => all().indexOf(node as Host)

/** Un élément de l'arbre affiche-t-il l'image de cette adresse ? */
const drawsUri = (uri: string) =>
  all().some((node) => JSON.stringify(node.props.source ?? null).includes(uri))

/** L'action, qu'elle soit écrite en lien ou en bouton (charte : `queryByRole('link') ?? …`). */
const actionNamed = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

describe('SheetProjectHead', () => {
  it('shows the project thumb, title and « Effacer le brouillon » in the sheet head', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <SheetProjectHead
        thumb={thumb}
        title={title}
        subtitle={byAuthor}
        action={{ label: clearDraft, onPress }}
      />,
    )

    expect(clearDraft).toBe('Effacer le brouillon')
    expect(drawsUri(THUMB_URI)).toBe(true)
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText(byAuthor)).toBeTruthy()
    // Le titre, puis pour qui ; l'action se lit après eux.
    expect(place(screen.getByText(title))).toBeLessThan(place(screen.getByText(byAuthor)))
    const action = actionNamed(clearDraft)
    expect(place(action)).toBeGreaterThan(place(screen.getByText(title)))

    await fireEvent.press(action)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says whom the author writes to, without an action', async () => {
    await renderWithProviders(
      <SheetProjectHead thumb={thumb} title={title} subtitle={forTesters} />,
    )

    expect(screen.getByText(forTesters)).toBeTruthy() // témoin
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('keeps the title and the line under it for a project without a photo', async () => {
    await renderWithProviders(
      <SheetProjectHead
        thumb={null}
        title={title}
        subtitle={byAuthor}
        action={{ label: clearDraft, onPress: () => {} }}
      />,
    )

    expect(drawsUri(THUMB_URI)).toBe(false)
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText(byAuthor)).toBeTruthy()
    expect(actionNamed(clearDraft)).toBeTruthy()
  })

  it('does not read the thumb: the title already names the project', async () => {
    // La vignette est un décor, comme `ProjectThumb` en tête de la fenêtre « Supprimer » : le titre
    // écrit à côté nomme déjà le projet.
    await renderWithProviders(<SheetProjectHead thumb={thumb} title={title} subtitle={byAuthor} />)

    expect(screen.getByText(title)).toBeTruthy() // témoin
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('image')).toBeNull()
  })
})
