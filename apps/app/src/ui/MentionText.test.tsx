// Tests du texte d'un commentaire avec ses mentions (tranche 6b) : un « @pseudo » devient un lien
// vers la page du membre, mais seulement s'il figure dans les mentions rendues par l'API. Le lien
// mène au membre gardé par son identifiant, même s'il a changé de pseudo depuis.
import { fireEvent, screen } from '@testing-library/react-native'
import { inesMention } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { MentionText } from './MentionText'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('MentionText', () => {
  it('turns a mention given by the API into a link to the member, keeping the whole text', async () => {
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="Demande à @ines_morel, elle sait."
        mentions={[inesMention]}
        onMemberPress={onMemberPress}
      />,
    )

    expect(screen.getByText('Demande à @ines_morel, elle sait.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: '@ines_morel' }))

    // L'identifiant gardé avec la mention, jamais une recherche par pseudo.
    expect(onMemberPress).toHaveBeenCalledWith(inesMention.memberId)
  })

  it('leads to the member kept with the mention, even if the handle now belongs to nobody', async () => {
    // Inès s'appelle désormais @ines_m : le texte garde « @ines_morel », le lien mène toujours à elle.
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="Merci @ines_morel"
        mentions={[{ handle: 'ines_morel', memberId: 'u5' }]}
        onMemberPress={onMemberPress}
      />,
    )

    await fireEvent.press(screen.getByRole('link', { name: '@ines_morel' }))

    expect(onMemberPress).toHaveBeenCalledWith('u5')
  })

  it('leaves as plain text a handle the API did not resolve', async () => {
    await renderWithProviders(
      <MentionText
        text="Salut @zoe_martin et @ines_morel"
        mentions={[inesMention]}
        onMemberPress={jest.fn()}
      />,
    )

    // Témoin : la mention connue est un lien…
    expect(screen.getByRole('link', { name: '@ines_morel' })).toBeTruthy()
    // … l'autre reste du texte.
    expect(screen.queryByRole('link', { name: '@zoe_martin' })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Salut @zoe_martin et @ines_morel')).toBeTruthy()
  })

  it('makes no link at all without mentions', async () => {
    await renderWithProviders(
      <MentionText text="Bravo @ines_morel !" mentions={[]} onMemberPress={jest.fn()} />,
    )

    expect(screen.getByText('Bravo @ines_morel !')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('keeps the case the author typed, and links it all the same', async () => {
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="Merci @Ines_Morel"
        mentions={[inesMention]}
        onMemberPress={onMemberPress}
      />,
    )

    await fireEvent.press(screen.getByRole('link', { name: '@Ines_Morel' }))

    expect(onMemberPress).toHaveBeenCalledWith(inesMention.memberId)
  })

  it('links every occurrence of the same mention', async () => {
    await renderWithProviders(
      <MentionText
        text="@ines_morel, tu as vu ? @ines_morel"
        mentions={[inesMention]}
        onMemberPress={jest.fn()}
      />,
    )

    expect(screen.getAllByRole('link', { name: '@ines_morel' })).toHaveLength(2)
  })

  it('does not take an e-mail address for a mention', async () => {
    await renderWithProviders(
      <MentionText
        text="Écris à contact@ines_morel.fr"
        mentions={[inesMention]}
        onMemberPress={jest.fn()}
      />,
    )

    expect(screen.getByText('Écris à contact@ines_morel.fr')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
