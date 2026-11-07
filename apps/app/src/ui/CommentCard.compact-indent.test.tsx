// Le retrait du texte d'une ligne de l'aperçu (R5b, des-A10, décision 21) : sous le nom, comme dans la
// feuille, pour que dérouler la liste ne décale pas le texte de 44 points. Jest ne mesure pas de
// position : on compare les retraits écrits dans les styles (la somme des marges gauches entre la
// carte et le texte) ; le x réel est mesuré dans le navigateur (`--explore`).
import { act, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { Dimensions, StyleSheet, type ViewStyle } from 'react-native'
import { replyOf } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { COMMENT_AVATAR, CommentCard } from './CommentCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const BODY = 'Super idée, je teste ce soir.'

type Node = { props: Record<string, unknown>; parent: Node | null }
const flat = (node: Node) => (StyleSheet.flatten(node.props.style as never) ?? {}) as ViewStyle

/** Ce qu'une vue pousse à sa gauche : son retrait, ou la marge qu'elle prend à sa gauche. */
const leftOf = (node: Node) => {
  const style = flat(node)
  return Number(style.paddingLeft ?? style.paddingHorizontal ?? style.padding ?? 0)
}

/** Le retrait du texte : la somme des retraits gauches, du texte jusqu'à la racine. */
const indentOf = (value: string) => {
  let sum = 0
  for (let at = screen.getByText(value) as unknown as Node | null; at; at = at.parent) {
    sum += leftOf(at)
  }
  return sum
}

const props: ComponentProps<typeof CommentCard> = {
  comment: replyOf({ id: 'c1', body: BODY }),
  kind: 'root',
  isMine: false,
  isProjectAuthor: false,
  menu: [],
  hiddenNote: null,
  onAuthorPress: () => {},
  onMemberPress: () => {},
}

describe('CommentCard, the text of a preview line (des-A10)', () => {
  it('sits at the same indent as the same card in the sheet: under the name', async () => {
    await renderWithProviders(<CommentCard {...props} />)
    const unrolled = indentOf(BODY)
    await screen.unmount()

    await renderWithProviders(<CommentCard {...props} compact />)

    expect(indentOf(BODY)).toBe(unrolled)
    // Témoin : ce retrait passe bien sous la photo (colonne de la photo + écart).
    expect(unrolled).toBeGreaterThanOrEqual(COMMENT_AVATAR.root)
  })

  it('goes under the photo at 150 % of text and more, like the card in the sheet', async () => {
    const window = { width: 320, height: 844, scale: 3, fontScale: 1.5 }
    await act(async () => Dimensions.set({ window, screen: window }))
    try {
      await renderWithProviders(<CommentCard {...props} />)
      const unrolled = indentOf(BODY)
      await screen.unmount()

      await renderWithProviders(<CommentCard {...props} compact />)

      expect(indentOf(BODY)).toBe(unrolled)
    } finally {
      const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
      await act(async () => Dimensions.set({ window: phone, screen: phone }))
    }
  })
})
