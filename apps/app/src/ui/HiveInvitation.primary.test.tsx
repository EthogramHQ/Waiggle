// Tests de la carte d'invitation ajoutés après les relectures de R10 :
// - une seule action miel par écran (règle du design, notée au plan) : quand l'écran montre
//   plusieurs invitations, seule la première a « Rejoindre » en miel (`primary`, vrai par défaut) ;
//   les autres l'ont en blanc ;
// - une carte refusée n'a plus de « … » : l'API répond à l'invité qui a refusé comme pour une ruche
//   inconnue, « Signaler » menait à une feuille « introuvable » (relecture de l'interface, point 1).
// On lit la règle (« pas miel »), pas la couleur d'une variante.
import { palettes } from '@ruche/brand'
import type { HiveInvitation as Invitation } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HiveInvitation } from './HiveInvitation'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

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

const ACCEPT = fr.t(($) => $.hives.invitations.acceptNamed, { hive: 'Atelier IA' })
const MORE = fr.t(($) => $.hives.invitations.more, { hive: 'Atelier IA' })

const honey = (element: ReturnType<typeof screen.getByRole>) =>
  StyleSheet.flatten(element.props.style)?.backgroundColor === palettes.day.honey

const done = () => Promise.resolve()

describe('HiveInvitation, one honey action per screen (R10)', () => {
  it('has « Rejoindre » in honey by default (témoin)', async () => {
    await renderWithProviders(
      <HiveInvitation invitation={invitation} onAccept={done} onRefuse={done} />,
    )

    expect(honey(screen.getByRole('button', { name: ACCEPT }))).toBe(true)
  })

  it('has « Rejoindre » out of the honey when it is not the first invitation', async () => {
    await renderWithProviders(
      <HiveInvitation invitation={invitation} onAccept={done} onRefuse={done} primary={false} />,
    )

    const accept = screen.getByRole('button', { name: ACCEPT })
    expect(honey(accept)).toBe(false)
    expect(screen.getAllByRole('button').filter(honey)).toHaveLength(0)
  })
})

describe('HiveInvitation, refused, cannot be reported (R10)', () => {
  it('offers « … » on an invitation still open (témoin)', async () => {
    await renderWithProviders(
      <HiveInvitation
        invitation={invitation}
        onAccept={done}
        onRefuse={done}
        onReport={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: MORE })).toBeTruthy()
  })

  it('has no « … » once refused', async () => {
    await renderWithProviders(
      <HiveInvitation
        invitation={invitation}
        onAccept={done}
        onRefuse={done}
        onReport={() => {}}
        refused
      />,
    )

    expect(screen.getByText(fr.t(($) => $.hives.invitations.refused))).toBeTruthy()
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })
})
