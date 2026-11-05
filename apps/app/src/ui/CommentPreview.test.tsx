// Tests de l'aperçu des commentaires sous un projet (R5b, `CommentPreview`, F-Pr11) : le titre
// « Commentaires 6 » (le nombre en gris, lu « Commentaires, 6 commentaires »), les premières lignes
// de la feuille données par l'écran, puis un bouton qui ouvre la feuille :
// - `all` : « Voir les 6 commentaires », quand il y en a plus que l'aperçu n'en montre ;
// - `comment` : « Commenter », quand l'aperçu les montre tous ;
// - `write` : aucun commentaire, « Aucun commentaire pour l'instant. » et « Écrire un
//   commentaire », qui ouvre la feuille le champ prêt ;
// - `null` : pas de bouton (sur ordinateur, 5 commentaires ou moins : le champ est déjà dans la
//   colonne ; relecture de l'interface ui-I4).
// Le bouton est donné à `openRef` : la feuille y rend le focus quand elle se ferme.
//
// Les lignes elles-mêmes (des cartes compactes) et le choix de l'action sont à l'écran ; ici, des
// textes simples tiennent leur place.
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import type { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentPreview } from './CommentPreview'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const seeAll = fr.t(($) => $.project.comments.seeAll, { count: 6 })
const comment = fr.t(($) => $.project.comments.addShort)
const write = fr.t(($) => $.project.comments.add)
const empty = fr.t(($) => $.project.comments.empty)

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (en profondeur). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const place = (node: unknown) => hostsOf(screen.root as unknown as Host).indexOf(node as Host)

/** Le texte affiché d'un élément, ses morceaux réunis et ses blancs ramenés à des espaces simples. */
const shown = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(shown).join('')
      : node && typeof node === 'object' && 'props' in node
        ? shown((node as { props: { children?: unknown } }).props.children)
        : ''

/** Trois lignes de la feuille, telles que l'écran les donne. */
const lines = (
  <>
    <Text>Max : Super idée, je teste ce soir.</Text>
    <Text>Zoé : Moi aussi, dis-nous !</Text>
    <Text>Léa : Merci à vous deux.</Text>
  </>
)

describe('CommentPreview', () => {
  it('is titled « Commentaires 6 », read « Commentaires, 6 commentaires »', async () => {
    await renderWithProviders(
      <CommentPreview count={6} action="all" onOpen={() => {}}>
        {lines}
      </CommentPreview>,
    )

    const title = screen.getByRole('header', { name: 'Commentaires, 6 commentaires' })
    expect(shown(title.props.children).replace(/\s+/g, ' ')).toBe('Commentaires 6')
  })

  it('shows the lines it is given, between the title and the button', async () => {
    await renderWithProviders(
      <CommentPreview count={6} action="all" onOpen={() => {}}>
        {lines}
      </CommentPreview>,
    )

    const title = screen.getByRole('header', { name: 'Commentaires, 6 commentaires' })
    const first = screen.getByText('Max : Super idée, je teste ce soir.')
    const last = screen.getByText('Léa : Merci à vous deux.')
    const button = screen.getByRole('button', { name: seeAll })
    expect(place(title)).toBeLessThan(place(first))
    expect(place(first)).toBeLessThan(place(last))
    expect(place(last)).toBeLessThan(place(button))
  })

  it("with action 'all', « Voir les 6 commentaires » opens the sheet", async () => {
    const onOpen = jest.fn()
    await renderWithProviders(
      <CommentPreview count={6} action="all" onOpen={onOpen}>
        {lines}
      </CommentPreview>,
    )

    expect(seeAll).toBe('Voir les 6 commentaires')
    await fireEvent.press(screen.getByRole('button', { name: seeAll }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(empty)).toBeNull()
  })

  it("with action 'comment', « Commenter » opens the sheet", async () => {
    const onOpen = jest.fn()
    await renderWithProviders(
      <CommentPreview count={3} action="comment" onOpen={onOpen}>
        {lines}
      </CommentPreview>,
    )

    await fireEvent.press(screen.getByRole('button', { name: comment }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Voir/ })).toBeNull()
  })

  it("with action 'write' and no comment, it says « Aucun commentaire pour l'instant. » and « Écrire un commentaire » opens the sheet", async () => {
    const onOpen = jest.fn()
    await renderWithProviders(<CommentPreview count={0} action="write" onOpen={onOpen} />)

    // Le titre seul, sans « 0 ».
    expect(screen.getByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText(empty)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: write }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('with no action there is no button under the comments', async () => {
    await renderWithProviders(
      <CommentPreview count={5} action={null} onOpen={() => {}}>
        {lines}
      </CommentPreview>,
    )

    expect(screen.getByRole('header', { name: 'Commentaires, 5 commentaires' })).toBeTruthy() // témoin
    expect(screen.getByText('Léa : Merci à vous deux.')).toBeTruthy()
    for (const name of [fr.t(($) => $.project.comments.seeAll, { count: 5 }), comment, write]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('gives its button to openRef, where the sheet gives the focus back', async () => {
    const openRef = createRef<View>()
    await renderWithProviders(
      <CommentPreview count={6} action="all" onOpen={() => {}} openRef={openRef}>
        {lines}
      </CommentPreview>,
    )

    // Sous RNTL 14, la `ref` d'une vue native garde ses props : c'est bien le bouton.
    expect(openRef.current).not.toBeNull()
    expect((openRef.current as unknown as Host).props.accessibilityLabel).toBe(seeAll)
  })
})
