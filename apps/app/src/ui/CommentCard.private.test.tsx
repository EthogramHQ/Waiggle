// La phrase d'un emplacement sur un projet privé (R5b, décision 22, jur-J6) : l'API rend `hidden` pour
// un commentaire qu'elle garde parce que le projet est devenu privé (`sees`, apps/api/src/comments/load.ts).
// Personne ne l'a masqué : la carte le dit autrement, et les autres emplacements ne changent pas.
import type { CommentState } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { maxComment } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentCard } from './CommentCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const placeholder = (state: CommentState, keptBecause?: 'private' | 'removed') => (
  <CommentCard
    comment={{
      ...maxComment,
      author: null,
      body: '',
      state,
      createdAt: null,
      editedAt: null,
      mentions: [],
    }}
    kind="root"
    isMine={false}
    isProjectAuthor={false}
    menu={[]}
    hiddenNote={null}
    onAuthorPress={() => {}}
    onMemberPress={() => {}}
    {...(keptBecause === undefined ? null : { keptBecause })}
  />
)

describe('CommentCard, a placeholder on a private project', () => {
  it('says the comment is kept when the project is private', async () => {
    await renderWithProviders(placeholder('hidden', 'private'))

    expect(screen.getByText(fr.t(($) => $.project.comments.privateKeptPlaceholder))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.comments.hiddenPlaceholder))).toBeNull()
  })

  it('says the comment is kept while the project is removed, not « masqué »', async () => {
    await renderWithProviders(placeholder('hidden', 'removed'))

    expect(screen.getByText(fr.t(($) => $.project.comments.removedKeptPlaceholder))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.comments.hiddenPlaceholder))).toBeNull()
    expect(screen.queryByText(fr.t(($) => $.project.comments.privateKeptPlaceholder))).toBeNull()
  })

  it('says « masqué » by default', async () => {
    await renderWithProviders(placeholder('hidden'))

    expect(screen.getByText(fr.t(($) => $.project.comments.hiddenPlaceholder))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.comments.privateKeptPlaceholder))).toBeNull()
  })

  it('keeps « supprimé » on a private project: that one was deleted', async () => {
    await renderWithProviders(placeholder('deleted', 'private'))

    expect(screen.getByText(fr.t(($) => $.project.comments.deletedPlaceholder))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.comments.privateKeptPlaceholder))).toBeNull()
  })
})
