// Tests d'un groupe dont les lignes chargent (R16 ; relecture de l'interface R16, A2) : son titre
// est là tout de suite, lu comme titre et hors du « Chargement… » ; les lignes vides sont sous un
// seul `Loading` ; à l'arrivée, les vraies lignes et le pied prennent leur place sous le même titre.
import { act, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow, ListRowSkeleton } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = 'Par e-mail'
const FOOTER = 'Les e-mails de sécurité partent toujours.'

const emptyRows = [<ListRowSkeleton key="a" />, <ListRowSkeleton key="b" />]

const group = (loading: boolean) => (
  <ListGroup title={TITLE} footer={FOOTER} pending={{ loading, rows: emptyRows }}>
    {loading ? null : <ListRow label="Commentaires" onPress={() => {}} />}
  </ListGroup>
)

/** Le nœud est-il dans la zone « Chargement… » (une progressbar) ? */
const inLoading = (node: { parent: unknown; props: Record<string, unknown> } | null): boolean => {
  for (let at = node; at; at = at.parent as typeof node) {
    if (at.props.accessibilityRole === 'progressbar' || at.props.role === 'progressbar') return true
  }
  return false
}

describe('ListGroup with pending rows', () => {
  it('shows and reads its title while its rows load, outside the « Chargement… »', async () => {
    await renderWithProviders(group(true))

    const heading = screen.getByRole('header', { name: TITLE })
    expect(inLoading(heading as never)).toBe(false)
    expect(
      screen.getByRole('progressbar', { name: 'Chargement…', includeHiddenElements: true }),
    ).toBeTruthy()
    // Le pied arrive avec les vraies lignes ; aucune ligne à toucher pendant l'attente.
    expect(screen.queryByText(FOOTER)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('puts the real rows and the footer under the same title once they arrive', async () => {
    const { rerender } = await renderWithProviders(group(true))
    const heading = screen.getByRole('header', { name: TITLE })

    await act(async () => rerender(group(false)))

    expect(screen.getByRole('button', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText(FOOTER)).toBeTruthy()
    // Le même titre, jamais remonté : il ne bouge ni ne se relit.
    expect(screen.getByRole('header', { name: TITLE })).toBe(heading)
  })

  it('keeps a plain group as before without pending (witness)', async () => {
    await renderWithProviders(
      <ListGroup title={TITLE} footer={FOOTER}>
        <ListRow label="Commentaires" onPress={() => {}} />
      </ListGroup>,
    )

    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy()
    expect(screen.getByText(FOOTER)).toBeTruthy()
    expect(screen.queryByRole('progressbar', { includeHiddenElements: true })).toBeNull()
  })
})
