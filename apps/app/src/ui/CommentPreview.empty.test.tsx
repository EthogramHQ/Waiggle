// La phrase de l'aperçu sans commentaire (R5b, décision 22, jur-J2) : un compteur à 0 n'est pas
// « aucun » pour qui lit un commentaire non compté ; et le titre donne sa `ref` à l'écran, qui y pose
// le focus quand plus rien n'est voisin (des-A7).
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentPreview } from './CommentPreview'
import type { Focusable } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const empty = fr.t(($) => $.project.comments.empty)

describe('CommentPreview, with a count of 0', () => {
  it('says there is no comment when there is nothing to read', async () => {
    await renderWithProviders(<CommentPreview count={0} action="write" onOpen={() => {}} />)

    expect(screen.getByText(empty)).toBeTruthy()
  })

  it('says nothing of the kind when the reader has a comment that the count leaves out', async () => {
    await renderWithProviders(
      <CommentPreview count={0} seeAllCount={1} action="all" onOpen={() => {}} />,
    )

    // Témoin : le bouton dit ce qu'il va lire.
    expect(screen.getByRole('button', { name: 'Voir le commentaire' })).toBeTruthy()
    expect(screen.queryByText(empty)).toBeNull()
  })

  it('gives its title to `titleRef`', async () => {
    const titleRef = createRef<Focusable>()
    await renderWithProviders(
      <CommentPreview count={0} action={null} onOpen={() => {}} titleRef={titleRef} />,
    )

    // Sous RNTL 14, la `ref` d'une vue native garde ses props : c'est bien le titre.
    expect((titleRef.current as unknown as { props: object }).props).toMatchObject({
      accessibilityRole: 'header',
    })
  })
})
