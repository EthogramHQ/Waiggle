// Ce que Screen dit à sa place flottante de ce qui flotte plus haut qu'elle dans le coin (relecture
// de l'interface de R21) : la Goutte des Éclaireuses se pose au-dessus de la capsule des réactions,
// sur téléphone ; le bouton « N nouveaux commentaires », posé au-dessus de la capsule (`over`), doit
// monter au-dessus d'elle au lieu de la couvrir. `FloatingClearanceContext` : de combien les autres
// éléments flottants dépassent le haut de la place flottante de l'écran (0 : rien ne dépasse).
//
// Jest ne calcule aucune position : on donne une hauteur à la place flottante comme le ferait
// l'appareil (la vue vide qui la mesure), puis on lit la valeur reçue dedans.
import { space } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { useContext } from 'react'
import { renderWithProviders } from '../testing/render'
import { FloatingClearanceContext, useFloatingClaim } from './floatingSpace'
import { Screen } from './Screen'
import { Text } from './Text'
import { ToastProvider } from './theme/toast'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Ce que la place flottante reçoit, écrit en clair pour le lire. */
function Probe() {
  return <Text>{`clearance ${useContext(FloatingClearanceContext)}`}</Text>
}

/** La Goutte, qui réserve sa place dans le coin sans être la place flottante de l'écran. */
function CornerDrop({ top }: { top: number }) {
  useFloatingClaim(top)
  return null
}

/** La place flottante prend une hauteur : la vue vide sœur qui la mesure reçoit son `onLayout`. */
const measureFloating = async (height: number) => {
  let path = screen.getByText(/^clearance/) as unknown as Node
  for (let node = path.parent; node; path = node, node = node.parent) {
    const probe = node.children.find(
      (child): child is Node =>
        typeof child !== 'string' &&
        child !== path &&
        child.children.length === 0 &&
        typeof child.props.onLayout === 'function',
    )
    if (probe) {
      const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } }, persist() {} }
      await act(async () => (probe.props.onLayout as (event: typeof layout) => void)(layout))
      return
    }
  }
  throw new Error('Nothing measures the floating place')
}

const page = (drop: number | null) => (
  <ToastProvider>
    <Screen width="page" onBack={() => {}} floating={<Probe />}>
      <Text>La description du projet</Text>
    </Screen>
    {drop === null ? null : <CornerDrop top={drop} />}
  </ToastProvider>
)

describe('Screen, what floats higher than its floating place', () => {
  it('tells nothing rises above it without a drop in the corner', async () => {
    await renderWithProviders(page(null))
    await measureFloating(60)

    expect(screen.getByText('clearance 0')).toBeTruthy()
  })

  it('tells how far the scouts drop rises above its floating place', async () => {
    await renderWithProviders(page(200))
    await measureFloating(60)

    // La place : 60 points posés à `space.lg` du bas (sans zone sûre ni barre d'onglets ici).
    expect(screen.getByText(`clearance ${200 - (space.lg + 60)}`)).toBeTruthy()
  })

  it('tells nothing when the drop stands lower than its floating place', async () => {
    await renderWithProviders(page(40))
    await measureFloating(60)

    expect(screen.getByText('clearance 0')).toBeTruthy()
  })
})
