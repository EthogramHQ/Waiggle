// Tests du texte d'un commentaire avec ses mentions (tranche 6b, puis R5b). Un « @pseudo » que l'API a
// reconnu devient une pastille miel au nom actuel du membre, « @Inès Morel » (R5b : le nom suit la
// personne), qui ouvre sa page. Le lecteur d'écran la lit « Inès Morel, ouvre son profil », sans
// pseudo : le pseudo écrit peut être devenu celui d'un autre (décision D3, jur-P6). La pastille mène
// au membre gardé par son identifiant, jamais à « qui porte ce pseudo aujourd'hui ». Un pseudo que
// l'API n'a pas rendu reste du texte simple, et le texte autour reste un seul nœud lu.
//
// Changé en R5b (relecture du plan, ui-M5, D3) : avant, la mention restait le « @pseudo » écrit,
// souligné, et le lien portait ce nom (`@ines_morel`) ; ces tests cherchent désormais la pastille par
// son nom lu, et le texte entier avec le nom du membre à la place du pseudo.
import { fireEvent, screen } from '@testing-library/react-native'
import { inesMention } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MentionText } from './MentionText'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le nom lu d'une pastille (`mentions.pill`). */
const pill = (name: string) => fr.t(($) => $.mentions.pill, { name })

/** Un texte sans ses blancs : la pastille peut s'entourer d'espaces fines (ui-M5), au choix d'U2. */
const squash = (text: string) => text.replace(/\s+/g, '')

/**
 * Le texte entier, trouvé dans un seul nœud lu : « Demande à @Inès Morel, elle sait. ». Les blancs
 * ne comptent pas, seulement les lettres et leur ordre.
 */
const wholeText = (shown: string) =>
  screen.getAllByText(
    new RegExp(
      `^\\s*${Array.from(squash(shown), (char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')}\\s*$`,
    ),
  )

describe('MentionText', () => {
  it("shows a mention given by the API as a pill with the member's current name, keeping the whole text", async () => {
    await renderWithProviders(
      <MentionText
        text="Demande à @ines_morel, elle sait."
        mentions={[inesMention]}
        onMemberPress={jest.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: pill('Inès Morel') })
    expect(link).toHaveTextContent(/^\s*@Inès Morel\s*$/)
    // La phrase reste d'un seul tenant pour le lecteur d'écran.
    expect(wholeText('Demande à @Inès Morel, elle sait.')).toHaveLength(1)
  })

  it('opens the member kept with the mention, by its identifier', async () => {
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="Demande à @ines_morel, elle sait."
        mentions={[inesMention]}
        onMemberPress={onMemberPress}
      />,
    )

    await fireEvent.press(screen.getByRole('link', { name: pill('Inès Morel') }))

    // L'identifiant gardé avec la mention, jamais une recherche par pseudo.
    expect(onMemberPress).toHaveBeenCalledWith(inesMention.memberId)
  })

  it("never reads in the pill a handle that is no longer the mentioned member's", async () => {
    // Inès a changé de nom et de pseudo depuis : le texte garde « @ines_morel », qu'un autre membre
    // porte peut-être aujourd'hui. La pastille dit son nom actuel, et mène toujours à elle.
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="Merci @ines_morel"
        mentions={[{ handle: 'ines_morel', memberId: 'u5', name: 'Inès Dupont' }]}
        onMemberPress={onMemberPress}
      />,
    )

    const link = screen.getByRole('link', { name: pill('Inès Dupont') })
    expect(link).toHaveTextContent(/^\s*@Inès Dupont\s*$/)
    // Ni à l'œil, ni au lecteur d'écran : aucun « ines_morel » nulle part.
    expect(screen.queryByText(/ines_morel/, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByLabelText(/ines_morel/)).toBeNull()
    expect(String(link.props.accessibilityHint ?? '')).not.toMatch(/ines_morel/)
    await fireEvent.press(link)
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

    // Témoin : la mention connue est une pastille…
    expect(screen.getByRole('link', { name: pill('Inès Morel') })).toBeTruthy()
    // … l'autre reste du texte, tel qu'écrit.
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(wholeText('Salut @zoe_martin et @Inès Morel')).toHaveLength(1)
  })

  it('makes no pill at all without mentions', async () => {
    await renderWithProviders(
      <MentionText text="Bravo @ines_morel !" mentions={[]} onMemberPress={jest.fn()} />,
    )

    expect(screen.getByText('Bravo @ines_morel !')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('makes a pill of the mention whatever the case the author typed', async () => {
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="Merci @Ines_Morel"
        mentions={[inesMention]}
        onMemberPress={onMemberPress}
      />,
    )

    await fireEvent.press(screen.getByRole('link', { name: pill('Inès Morel') }))

    expect(onMemberPress).toHaveBeenCalledWith(inesMention.memberId)
  })

  it('makes a pill of every occurrence of the same mention', async () => {
    await renderWithProviders(
      <MentionText
        text="@ines_morel, tu as vu ? @ines_morel"
        mentions={[inesMention]}
        onMemberPress={jest.fn()}
      />,
    )

    expect(screen.getAllByRole('link', { name: pill('Inès Morel') })).toHaveLength(2)
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
