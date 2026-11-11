// Tests du badge « Testeur » d'un commentaire (R7b ; planche validée 3, juridique J4 : la feuille
// « Rejoindre les testeurs » le promet). Dans les commentaires d'un projet, un testeur de ce projet
// porte le badge « Testeur », dessiné comme « Auteur ». Le lien de son nom le dit aussi
// (« Hugo Lefèvre, Testeur »), comme celui de l'auteur (« Léa Moreau, Auteur »). Les deux badges
// sont exclusifs : l'auteur du projet n'en porte qu'un, « Auteur ».
//
// Fichier à part de CommentCard.test.tsx : le badge vient de R7b, après les tests de la carte.
//
// L'API (plan R7b, « Briques du fil et du coin, API fixée ») : `CommentCard` gagne
// `isProjectTester?: boolean` ; l'écran le passe d'après `comment.author.isTester`.
import type { CommentAuthor, CommentReply } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import type { ComponentProps, ReactElement } from 'react'
import { replyOf } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentCard } from './CommentCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const NOW = new Date('2026-11-05T14:00:00.000Z')

const hugo: CommentAuthor = {
  id: 'u7',
  name: 'Hugo Lefèvre',
  handle: 'hugo_l',
  avatarUrl: null,
  isTester: true,
}

const hugoComment = (fields: Partial<CommentReply> = {}): CommentReply =>
  replyOf({
    id: '6e7f8091-a2b3-4c4d-9e5f-60718293a4b5',
    author: hugo,
    body: 'Testé ce matin sur tablette : tout marche.',
    createdAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    ...fields,
  })

const text = {
  tester: fr.t(($) => $.project.comments.tester),
  testerLink: (name: string) => fr.t(($) => $.project.comments.testerLink, { name }),
  author: fr.t(($) => $.project.comments.author),
  authorLink: (name: string) => fr.t(($) => $.project.comments.authorLink, { name }),
}

type CardProps = ComponentProps<typeof CommentCard>

const card = (props: Partial<CardProps> = {}): ReactElement => (
  <CommentCard
    comment={hugoComment()}
    kind="root"
    isMine={false}
    isProjectAuthor={false}
    menu={[]}
    hiddenNote={null}
    onAuthorPress={jest.fn()}
    onMemberPress={jest.fn()}
    now={NOW}
    {...props}
  />
)

describe('CommentCard, the « Testeur » badge', () => {
  it('shows « Testeur » next to the name of a tester of the project', async () => {
    await renderWithProviders(card({ isProjectTester: true }))

    expect(text.tester).toBe('Testeur')
    expect(screen.getByText(text.tester)).toBeTruthy()
  })

  it('reads the name link of a tester « Hugo Lefèvre, Testeur »', async () => {
    await renderWithProviders(card({ isProjectTester: true }))

    expect(text.testerLink('Hugo Lefèvre')).toBe('Hugo Lefèvre, Testeur')
    expect(screen.getByRole('link', { name: text.testerLink('Hugo Lefèvre') })).toBeTruthy()
  })

  it.each([
    ['missing', undefined],
    ['false', false],
  ] as const)('shows no « Testeur » badge when isProjectTester is %s', async (_case, value) => {
    await renderWithProviders(card({ isProjectTester: value }))

    // Témoin : le lien du nom, sans badge.
    expect(screen.getByRole('link', { name: 'Hugo Lefèvre' })).toBeTruthy()
    expect(screen.queryByText(text.tester)).toBeNull()
  })

  it('never shows « Testeur » and « Auteur » together: the project author keeps « Auteur »', async () => {
    await renderWithProviders(card({ isProjectAuthor: true, isProjectTester: true }))

    expect(screen.getByText(text.author)).toBeTruthy()
    expect(screen.getByRole('link', { name: text.authorLink('Hugo Lefèvre') })).toBeTruthy()
    expect(screen.queryByText(text.tester)).toBeNull()
  })

  it('keeps « Auteur » alone on the project author', async () => {
    await renderWithProviders(card({ isProjectAuthor: true }))

    expect(screen.getByText(text.author)).toBeTruthy() // témoin
    expect(screen.queryByText(text.tester)).toBeNull()
  })
})
