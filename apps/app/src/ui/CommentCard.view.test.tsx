// La vue que rend la poignée d'une carte de commentaire (`handle.view()`), que l'écran fait venir en
// vue (R21, « N nouveaux commentaires »). Relecture de design de R21 : la ligne de l'aperçu
// (`compact`) rendait `null`, et toucher le bouton de la page ne faisait rien défiler.
import { type ComponentProps, createRef } from 'react'
import { replyOf } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { CommentCard, type CommentCardHandle } from './CommentCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const props: ComponentProps<typeof CommentCard> = {
  comment: replyOf({ id: 'c1', body: 'Super idée, je teste ce soir.' }),
  kind: 'root',
  isMine: false,
  isProjectAuthor: false,
  menu: [],
  hiddenNote: null,
  onAuthorPress: () => {},
  onMemberPress: () => {},
}

describe('CommentCard, the view given to the screen', () => {
  it('gives a view for a preview line, so the page can bring it into view', async () => {
    const handle = createRef<CommentCardHandle>()
    await renderWithProviders(<CommentCard {...props} compact onPress={() => {}} handle={handle} />)

    expect(handle.current?.view()).toBeTruthy()
    // L'aperçu n'est qu'un bouton : le focus va sur lui (`focusCard`), pas sur un cadre.
    expect(handle.current?.focusSelf()).toBe(false)
  })

  it('gives its frame for a written card', async () => {
    const handle = createRef<CommentCardHandle>()
    await renderWithProviders(<CommentCard {...props} handle={handle} />)

    expect(handle.current?.view()).toBeTruthy()
  })
})
