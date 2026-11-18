// Tests de la carte d'une ruche (R16, planches R16-Ruches) : un seul lien, nommé comme la ligne
// d'aujourd'hui (« Famille, 4 membres, animée par Papi Jean, 2 nouveautés »), qui ouvre la ruche au
// toucher et à Entrée sur le web ; elle montre le nom, « 4 membres · animée par Papi Jean » et ses
// nouveautés. Et la carte vide, sans rôle ni nom.
import type { HiveSummary } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HiveCard, HiveCardSkeleton } from './HiveCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const family: HiveSummary = {
  id: '0f5b8a64-2c1e-4c55-9d1a-6b7e4a3c2d10',
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: 'u-jean', name: 'Papi Jean' },
  faces: [
    { id: 'u-jean', name: 'Papi Jean', avatarUrl: null },
    { id: 'u-lea', name: 'Léa Moreau', avatarUrl: null },
  ],
  news: 2,
  role: 'member',
}

const FAMILY_NAME = 'Famille, 4 membres, animée par Papi Jean, 2 nouveautés'

describe('HiveCard', () => {
  it('is one link, named like the row of the hive', async () => {
    await renderWithProviders(<HiveCard hive={family} onPress={() => {}} />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(screen.getByRole('link', { name: FAMILY_NAME })).toBeTruthy()
    // Ni l'alvéole ni les visages ne font un arrêt de plus.
    expect(screen.queryByRole('image')).toBeNull()
  })

  it('shows the name, the members and animator, and the news', async () => {
    await renderWithProviders(<HiveCard hive={family} onPress={() => {}} />)

    expect(screen.getByText('Famille')).toBeTruthy()
    expect(
      screen.getByText(
        `${fr.t(($) => $.hives.members, { count: 4 })} · ${fr.t(($) => $.hives.animatedBy, { name: 'Papi Jean' })}`,
      ),
    ).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.hives.news, { count: 2 }))).toBeTruthy()
  })

  it('says « rien de neuf » and « Ruche sans nom » when it has to', async () => {
    await renderWithProviders(
      <HiveCard hive={{ ...family, name: null, news: 0, faces: [] }} onPress={() => {}} />,
    )

    expect(screen.getByText(fr.t(($) => $.hives.unnamed))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.hives.newsNone))).toBeTruthy()
  })

  it('opens the hive when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<HiveCard hive={family} onPress={onPress} />)

    await fireEvent.press(screen.getByRole('link', { name: FAMILY_NAME }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('opens the hive with Enter on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(<HiveCard hive={family} onPress={onPress} />)

      await fireEvent(screen.getByRole('link'), 'keyDown', {
        key: 'Enter',
        repeat: false,
        preventDefault: () => {},
      })
      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('HiveCardSkeleton', () => {
  it('draws an empty card, with no role and no name', async () => {
    await renderWithProviders(
      <PieceHost>
        <HiveCardSkeleton />
      </PieceHost>,
    )

    expect(emptyPiece().drawn).toBeGreaterThan(0)
    expect(emptyPiece().spoken).toEqual([])
  })
})
