// La case « Signaler aussi son profil » (R9) ne survit pas d'une demande à l'autre : cochée puis
// annulée, la fenêtre rouverte pour un autre membre l'offre de nouveau décochée (jamais cochée
// d'avance). Et une case cochée part avec le blocage réussi (`onDone`, second argument).
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type BlockAsking, BlockDialog } from './BlockDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/members/u1',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

const lea: BlockAsking = { gesture: 'block', member: { id: 'u1', name: 'Léa', handle: 'lea' } }
const sam: BlockAsking = { gesture: 'block', member: { id: 'u2', name: 'Sam', handle: 'sam' } }
const alsoReport = fr.t(($) => $.block.alsoReport)

const dialog = (asking: BlockAsking | null, onDone = jest.fn()) => (
  <BlockDialog
    asking={asking}
    offerReport
    send={jest.fn().mockResolvedValue({ ok: true, data: null })}
    onDone={onDone}
    onCancel={jest.fn()}
  />
)

describe('BlockDialog « Signaler aussi » box', () => {
  it('is unchecked again for the next member', async () => {
    const { rerender } = await renderWithProviders(dialog(lea))
    await passTapGuard()
    await fireEvent.press(screen.getByRole('checkbox', { name: alsoReport }))
    expect(screen.getByRole('checkbox', { name: alsoReport, checked: true })).toBeTruthy()

    await rerender(dialog(null))
    await rerender(dialog(sam))
    await passTapGuard()

    expect(screen.getByRole('checkbox', { name: alsoReport, checked: false })).toBeTruthy()
  })

  it('tells the screen the box was checked, once blocked', async () => {
    const onDone = jest.fn()
    await renderWithProviders(dialog(lea, onDone))
    await passTapGuard()

    await fireEvent.press(screen.getByRole('checkbox', { name: alsoReport }))
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

    expect(onDone).toHaveBeenCalledWith(lea, true)
  })
})
