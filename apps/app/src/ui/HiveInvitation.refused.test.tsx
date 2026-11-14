// Tests du passage d'une invitation à « refusée » (tranche R10) : « Refuser » disparaît avec le
// focus, qui doit aller au message « Invitation refusée. » qui le remplace (sinon le lecteur
// d'écran du téléphone repart du haut de l'écran, et le clavier du web tombe sur la page). Une
// carte déjà refusée quand elle arrive ne prend rien : le focus ne bouge qu'après un geste.
import type { HiveInvitation as Invitation } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { moveReaderTo } from './focus'
import { HiveInvitation } from './HiveInvitation'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le lecteur d'écran du téléphone : on regarde où il est envoyé.
jest.mock('./focus', () => ({ ...jest.requireActual('./focus'), moveReaderTo: jest.fn() }))

const invitation: Invitation = {
  id: '6d1c2b8e-9f3a-4b7c-8e21-3a4f5b6c7d80',
  hive: {
    id: 'a3e4f5b6-1c2d-4e8f-9a0b-1c2d3e4f5a6b',
    name: 'Atelier IA',
    icon: 'code',
    memberCount: 6,
    animatorName: 'Nora Benali',
  },
  inviter: { id: 'u-nora', name: 'Nora Benali', avatarUrl: null },
  createdAt: '2026-11-14T09:00:00.000Z',
}

const REFUSE = fr.t(($) => $.hives.invitations.refuseNamed, { nameOf: 'de Nora Benali' })
const REFUSED = fr.t(($) => $.hives.invitations.refused)

beforeEach(() => {
  jest.mocked(moveReaderTo).mockClear()
})

describe('HiveInvitation, once refused', () => {
  it('takes the reader to « Invitation refusée. » after « Refuser »', async () => {
    const onRefuse = jest.fn(() => Promise.resolve())
    const card = (refused: boolean) => (
      <HiveInvitation
        invitation={invitation}
        onAccept={() => Promise.resolve()}
        onRefuse={onRefuse}
        refused={refused}
      />
    )
    const view = await renderWithProviders(card(false))

    await fireEvent.press(screen.getByRole('button', { name: REFUSE }))
    expect(onRefuse).toHaveBeenCalledTimes(1)
    // L'écran apprend que l'écriture a réussi, et passe la carte à « refusée ».
    await act(async () => {
      await view.rerender(card(true))
    })

    expect(screen.getByText(REFUSED)).toBeTruthy()
    expect(moveReaderTo).toHaveBeenCalledTimes(1)
    // Le message lui-même (le texte natif qui le porte), pas la carte ni la page.
    const target = jest.mocked(moveReaderTo).mock.calls[0]?.[0] as
      | { props?: { children?: unknown } }
      | null
      | undefined
    expect(target?.props?.children).toBe(REFUSED)
  })

  it('moves nothing when the invitation arrives already refused', async () => {
    await renderWithProviders(
      <HiveInvitation
        invitation={invitation}
        onAccept={() => Promise.resolve()}
        onRefuse={() => Promise.resolve()}
        refused
      />,
    )

    expect(screen.getByText(REFUSED)).toBeTruthy() // témoin
    expect(moveReaderTo).not.toHaveBeenCalled()
  })
})
