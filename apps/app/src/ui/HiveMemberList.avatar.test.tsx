// La photo d'un membre est un décor dans la liste des membres d'une ruche (tranche R10) : le lien
// de la ligne la contient, et ses initiales (« LM ») se lisaient dans le lien, en plus de son nom
// (relevé dans le navigateur, `ariaSnapshot()` : « link "Voir la page de Léa Moreau" — img: LM »).
import type { HiveMember } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { HiveMemberList } from './HiveMemberList'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LEA: HiveMember = {
  face: { id: 'u-lea', name: 'Léa Moreau', avatarUrl: null },
  handle: 'lea_moreau',
  role: 'member',
  isMe: false,
  reduced: false,
}

describe('HiveMemberList, the photo', () => {
  it('hides a member’s initials from screen readers: the name already says who', async () => {
    await renderWithProviders(
      <HiveMemberList members={[LEA]} canRemove={false} onOpen={() => {}} onRemove={() => {}} />,
    )

    expect(screen.getByRole('link', { name: containing('Léa Moreau') })).toBeTruthy() // témoin
    // Dessinées (témoin), mais cachées aux lecteurs d'écran.
    expect(screen.getByText('LM', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('LM')).toBeNull()
  })
})
