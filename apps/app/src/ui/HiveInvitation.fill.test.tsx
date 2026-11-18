// Test de l'invitation dans une grille de cartes (R16, planches R16-Ruches) : avec `fill`, la carte
// prend la hauteur de sa case (la plus haute de la rangée), et ses boutons descendent au bas de la
// carte. Constaté dans les captures à 1 440 : 270 contre 287 points quand un nom passait sur deux
// lignes.
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

type Node = { props: { style?: unknown }; parent: Node | null }

/** Les styles aplatis de la carte, de « Rejoindre » jusqu'en haut de l'arbre rendu. */
const ancestorsStyles = () => {
  const accept = fr.t(($) => $.hives.invitations.accept)
  let node = screen.getByRole('button', { name: new RegExp(accept) }) as unknown as Node | null
  const styles: Record<string, unknown>[] = []
  while (node) {
    styles.push((StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>)
    node = node.parent
  }
  return styles
}

const render = (fill: boolean) =>
  renderWithProviders(
    <HiveInvitation
      invitation={invitation}
      onAccept={() => Promise.resolve()}
      onRefuse={() => Promise.resolve()}
      fill={fill}
    />,
  )

describe('HiveInvitation fill', () => {
  it('takes the height of its grid cell and sends its buttons to the bottom', async () => {
    const grows = (styles: Record<string, unknown>[]) =>
      styles.filter((style) => style.flex === 1).length
    // Témoin : dans une liste, la carte garde sa hauteur.
    const plain = await render(false)
    const inList = grows(ancestorsStyles())
    plain.unmount()

    await render(true)

    const styles = ancestorsStyles()
    // La carte et sa surface grandissent : deux vues de plus à `flex: 1`.
    expect(grows(styles) - inList).toBe(2)
    // Les boutons, poussés au bas de la carte.
    expect(styles.some((style) => style.marginTop === 'auto')).toBe(true)
  })
})
