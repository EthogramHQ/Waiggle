// Tests du texte d'un commentaire replié (R5b) : `MentionText` passe `numberOfLines` au texte qui
// porte toute la phrase (un seul `Text` de src/ui, les pastilles imbriquées dedans), pour que
// `ReadMore` le replie après 10 lignes. Fichier à part de MentionText.test.tsx (écrit avant le code).
import { screen } from '@testing-library/react-native'
import { inesMention } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { MentionText } from './MentionText'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TEXT = 'Demande à @ines_morel, elle sait.'

describe('MentionText, folded', () => {
  it('stops the whole sentence after the lines it is given', async () => {
    await renderWithProviders(
      <MentionText
        text={TEXT}
        mentions={[inesMention]}
        onMemberPress={jest.fn()}
        numberOfLines={10}
      />,
    )

    // Témoin : la pastille est là, dans la phrase repliée.
    expect(screen.getByRole('link')).toBeTruthy()
    expect(screen.getByText(/^Demande à/).props.numberOfLines).toBe(10)
  })

  it('shows the whole text when no line count is given', async () => {
    await renderWithProviders(
      <MentionText text={TEXT} mentions={[inesMention]} onMemberPress={jest.fn()} />,
    )

    expect(screen.getByText(/^Demande à/).props.numberOfLines).toBeUndefined()
  })
})
