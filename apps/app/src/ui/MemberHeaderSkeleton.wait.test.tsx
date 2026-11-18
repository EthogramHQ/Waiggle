// Tests de l'en-tête vide d'un membre (R16) ouvert depuis une carte, au-delà de
// MemberHeaderSkeleton.test.tsx : la ligne des abonnés tient sa place au-dessus du bouton (sinon
// « Projets » descendait à l'arrivée), et les formes vides attendent les 160 ms du « Chargement… »
// de la page alors que le vrai nom se lit tout de suite.
import { durations, layout, textStyles } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { drawnSizes, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { MemberHeaderSkeleton } from './MemberHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

/** Les lignes vides à la hauteur d'une ligne de `callout` (le pseudo, les abonnés). */
const calloutLines = () =>
  drawnSizes().heights.filter((height) => height === textStyles.callout.lineHeight).length

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }

/** Les éléments sous le cadre cachés aux lecteurs d'écran (web : `aria-hidden`). */
const hiddenParts = () => {
  let count = 0
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    if (node.props['aria-hidden'] === true) count += 1
    for (const child of node.children) visit(child)
  }
  visit(screen.getByTestId('empty-piece-host', { includeHiddenElements: true }) as unknown as Node)
  return count
}

beforeEach(() => {
  jest.useFakeTimers()
})

describe('MemberHeaderSkeleton opened from a card (R16)', () => {
  it('keeps the place of the follower count above the action button', async () => {
    const view = await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton action={false} />
      </PieceHost>,
    )
    const without = calloutLines()

    await view.rerender(
      <PieceHost>
        <MemberHeaderSkeleton />
      </PieceHost>,
    )
    // Une ligne de plus, celle des abonnés, avec le bouton vide.
    expect(calloutLines()).toBe(without + 1)
    expect(drawnSizes().heights).toContain(layout.controlHeight.regular)
  })

  it('lets its empty shapes wait 160 ms while the known name is read at once', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton name="Léa Moreau" avatar={null} />
      </PieceHost>,
    )

    // Le nom se lit tout de suite ; les formes, cachées, attendent.
    expect(screen.getByRole('header', { name: 'Léa Moreau' })).toBeTruthy()
    expect(hiddenParts()).toBeGreaterThan(0)

    await wait(durations.quick + 40)
    expect(hiddenParts()).toBe(0)
    expect(screen.getByRole('header', { name: 'Léa Moreau' })).toBeTruthy()
  })

  it('does not wait on its own when it is all shapes, already under the loading zone', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton />
      </PieceHost>,
    )
    expect(hiddenParts()).toBe(0)
  })
})
