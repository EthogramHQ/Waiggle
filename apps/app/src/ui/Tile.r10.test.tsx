// Tests de ce que la tuile d'un projet gagne en R10 (plan R10, « Tuile d'un projet ») : la pastille
// de visibilité (`badge` : « Privé », « Réservé à Famille »), lue après le nom du lien, qui reste le
// titre ; et le menu « … » (`menu`), posé à côté du lien, jamais dedans (« Épingler » dans une
// ruche). Fichier à part de Tile.test.tsx : un fichier par ajout de tranche.
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ActionMenu } from './ActionMenu'
import { ProjectTile } from './Tile'
import { TileMosaic } from './TileMosaic'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent: Host | null
}

/** Vrai si `node` est dans `ancestor` (ou est lui). */
const inside = (node: Host | null, ancestor: Host): boolean =>
  node === null ? false : node === ancestor || inside(node.parent, ancestor)

const menu = (onPin = jest.fn()) => (
  <ActionMenu
    label="Plus d’options pour Le plan de table"
    items={[{ label: 'Épingler', icon: 'push-pin', onPress: onPin }]}
  />
)

describe('ProjectTile, the visibility badge (R10)', () => {
  it('shows the badge on the tile, and keeps the title as the name of the link', async () => {
    await renderWithProviders(
      <ProjectTile
        title="Le plan de table"
        author="Léa"
        badge="Réservé à Famille"
        onPress={() => {}}
      />,
    )

    const link = screen.getByRole('link', { name: 'Le plan de table' })
    expect(
      within(link).getByText('Réservé à Famille', { includeHiddenElements: true }),
    ).toBeTruthy()
  })

  it('reads the badge after the name, as a hint on a phone', async () => {
    await renderWithProviders(
      <ProjectTile title="Le plan de table" author="Léa" badge="Privé" onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: 'Le plan de table' }).props.accessibilityHint).toBe(
      'Privé',
    )
  })

  it('describes the link by the badge on the web (aria-describedby)', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <ProjectTile title="Le plan de table" author="Léa" badge="Privé" onPress={() => {}} />,
      )
      const link = screen.getByRole('link', { name: 'Le plan de table' })
      const id = link.props['aria-describedby']
      expect(typeof id).toBe('string')
      const pill = screen.getByText('Privé', { includeHiddenElements: true })
      expect(pill.props.nativeID ?? pill.props.id).toBe(id)
    } finally {
      restore.restore()
    }
  })

  it('shows no badge and no description without one (témoin)', async () => {
    await renderWithProviders(
      <ProjectTile title="Le plan de table" author="Léa" onPress={() => {}} />,
    )

    const link = screen.getByRole('link', { name: 'Le plan de table' })
    expect(link.props.accessibilityHint).toBeUndefined()
    expect(screen.queryByText('Privé', { includeHiddenElements: true })).toBeNull()
  })
})

describe('ProjectTile, the « … » menu (R10)', () => {
  it('puts the menu next to the link, never inside it', async () => {
    await renderWithProviders(
      <ProjectTile title="Le plan de table" author="Léa" onPress={() => {}} menu={menu()} />,
    )

    const link = screen.getByRole('link', { name: 'Le plan de table' }) as unknown as Host
    const button = screen.getByRole('button', {
      name: 'Plus d’options pour Le plan de table',
    }) as unknown as Host
    expect(inside(button, link)).toBe(false)
  })

  it('opens the menu without opening the project', async () => {
    const onPress = jest.fn()
    const onPin = jest.fn()
    await renderWithProviders(
      <ProjectTile title="Le plan de table" author="Léa" onPress={onPress} menu={menu(onPin)} />,
    )

    await fireEvent.press(
      screen.getByRole('button', { name: 'Plus d’options pour Le plan de table' }),
    )
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Épingler' }))

    expect(onPin).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('keeps the menu inside the cell of its tile in a mosaic', async () => {
    await renderWithProviders(
      <TileMosaic columns={2}>
        <ProjectTile title="Le plan de table" author="Léa" onPress={() => {}} menu={menu()} />
        <ProjectTile title="Biscotte au parc" author="Léa" onPress={() => {}} />
      </TileMosaic>,
    )

    const button = screen.getByRole('button', {
      name: 'Plus d’options pour Le plan de table',
    }) as unknown as Host
    let cell: Host | null = button
    while (cell && cell.props.role !== 'listitem') cell = cell.parent
    expect(cell).not.toBeNull()
    expect(within(cell as never).getByRole('link', { name: 'Le plan de table' })).toBeTruthy()
  })

  it('has no button without a menu (témoin)', async () => {
    await renderWithProviders(
      <ProjectTile title="Le plan de table" author="Léa" onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: 'Le plan de table' })).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
