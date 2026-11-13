// Tests de la fenêtre « Bloquer Nom (@pseudo) ? » refaite en R9 (planche R9-Bloquer, A7, F-S4) :
// le nom et le pseudo dans le titre, l'avatar et sa pastille « bloqué », un résumé en gras, quatre
// puces courtes toujours visibles, puis le texte complet d'aujourd'hui (rien du texte juridique ne
// disparaît), et la case « Signaler aussi son profil », jamais cochée d'avance.
//
// L'API fixée au plan (« Ce qui change au plan », Appli) : `BlockAsking.member` gagne `name`
// (`{ id, name, handle }`) ; `offerReport` (faux par défaut) montre la case. Elle n'existe pas quand
// la fenêtre vient de « Bloquer aussi » d'un signalement : le signalement est déjà parti.
//
// Ce que la case déclenche (« Bloquer » bloque, puis ouvre la feuille « Signaler ce profil ») se
// vérifie depuis la page du membre (MemberScreen.r9.test.tsx) : la fenêtre peut le faire elle-même
// ou le laisser à l'écran, le plan ne le fixe pas.
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { blockSentences, containing, fr, missingSentences } from '../testing/text'
import { type BlockAsking, BlockDialog } from './BlockDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le routeur, au cas où la fenêtre ouvre elle-même « Signaler » : rien ne part vraiment.
jest.mock('expo-router', () => ({
  usePathname: () => '/members/u1',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

/** Léa, telle que la page d'un membre la passe à la fenêtre. */
const lea = { id: 'u1', name: 'Léa Martin', handle: 'lea' }
const blocking: BlockAsking = { gesture: 'block', member: lea }

const mockSend = jest.fn()

/** La fenêtre ouverte pour bloquer Léa, avec ou sans la case, la garde des tapes passée. */
const renderDialog = async ({ offerReport }: { offerReport?: boolean } = {}) => {
  await renderWithProviders(
    <BlockDialog
      asking={blocking}
      send={mockSend}
      onDone={jest.fn()}
      onCancel={jest.fn()}
      {...(offerReport === undefined ? null : { offerReport })}
    />,
  )
  await passTapGuard()
}

const titleNamed = fr.t(($) => $.block.titleNamed, { name: lea.name, handle: lea.handle })
const alsoReport = fr.t(($) => $.block.alsoReport)

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ ok: true, data: null })
})

describe('BlockDialog (R9)', () => {
  it('titles the window with the name and the handle of the member', async () => {
    await renderDialog()

    expect(screen.getByRole('header', { name: titleNamed })).toBeTruthy()
  })

  it('shows the « bloqué » badge on the avatar of the member', async () => {
    await renderDialog()

    // La pastille se lit (son nom, ou son texte) : la couleur seule ne dirait rien.
    const badge = fr.t(($) => $.block.badge)
    const found = screen.queryAllByLabelText(badge).length + screen.queryAllByText(badge).length
    expect(found).toBeGreaterThan(0)
  })

  it('shows the summary, the four short bullets, then the whole text of today', async () => {
    await renderDialog()

    const short = [
      fr.t(($) => $.block.summary, { name: lea.name }),
      fr.t(($) => $.block.bullets.content),
      fr.t(($) => $.block.bullets.follows),
      fr.t(($) => $.block.bullets.notTold),
      fr.t(($) => $.block.bullets.moderation),
    ]
    // Toujours visibles, sans rien déplier : ni les puces, ni le texte juridique complet.
    expect(missingSentences(short, screen)).toEqual([])
    expect(missingSentences(blockSentences(lea.handle), screen)).toEqual([])
  })

  it('offers « Signaler aussi son profil », never checked beforehand', async () => {
    await renderDialog({ offerReport: true })

    expect(screen.getByRole('checkbox', { name: alsoReport, checked: false })).toBeTruthy()
  })

  it('checks the box with a touch, without blocking yet', async () => {
    await renderDialog({ offerReport: true })

    await fireEvent.press(screen.getByRole('checkbox', { name: alsoReport }))

    expect(screen.getByRole('checkbox', { name: alsoReport, checked: true })).toBeTruthy()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('blocks once confirmed, the box checked', async () => {
    await renderDialog({ offerReport: true })

    await fireEvent.press(screen.getByRole('checkbox', { name: alsoReport }))
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(blocking)
  })

  it('offers no « report too » box when blocking from a report', async () => {
    // Sans `offerReport` : la fenêtre ouverte par « Bloquer aussi » d'un signalement déjà parti.
    await renderDialog()

    // Témoin : la fenêtre est là, avec son texte.
    expect(screen.getByRole('header', { name: titleNamed })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: alsoReport })).toBeNull()
    expect(screen.queryByText(containing(alsoReport))).toBeNull()
  })

  it('keeps « Débloquer @x ? » for unblocking, with no box', async () => {
    await renderWithProviders(
      <BlockDialog
        asking={{ gesture: 'unblock', member: lea }}
        offerReport
        send={mockSend}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )
    await passTapGuard()

    expect(
      screen.getByRole('header', {
        name: fr.t(($) => $.block.unblockTitle, { handle: lea.handle }),
      }),
    ).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: alsoReport })).toBeNull()
  })
})
