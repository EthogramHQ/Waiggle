// Tests de la ligne d'une ruche (tranche R10, planche R10-Ruches ; relecture du plan, interface 14) :
// dans l'onglet Ruches, chaque ruche a sa ligne : son alvéole, son nom, « 4 membres · animée par
// Papi Jean », la pile de quelques photos, et ses nouveautés (« 2 nouveautés », « rien de neuf »).
// Toute la ligne est un lien vers la page de la ruche, lu d'un bloc : « Famille, 4 membres, animée
// par Papi Jean, 2 nouveautés ». Sans animateur (compte supprimé, ou un blocage entre lui et le
// lecteur), « animée par » ne nomme personne ; un nom retiré par la modération se lit « Ruche sans
// nom ». En `compact` (« Tes ruches », la colonne du Fil sur ordinateur) : l'alvéole de 28, le nom
// et les nouveautés seulement.
//
// L'API (plan R10, « API au contrat ») :
//   HiveRow({ hive: HiveSummary; onPress: () => void; compact?: boolean }).
import type { HiveSummary } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HiveRow } from './HiveRow'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** « Famille », 4 membres, animée par Papi Jean, 2 nouveautés : la première ligne de la planche. */
const family: HiveSummary = {
  id: '0f5b8a64-2c1e-4c55-9d1a-6b7e4a3c2d10',
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: 'u-jean', name: 'Papi Jean' },
  faces: [
    { id: 'u-jean', name: 'Papi Jean', avatarUrl: null },
    { id: 'u-lea', name: 'Léa Moreau', avatarUrl: null },
    { id: 'u-odile', name: 'Tante Odile', avatarUrl: null },
    { id: 'u-ines', name: 'Inès Haddad', avatarUrl: null },
  ],
  news: 2,
  role: 'member',
}

/** Le nom lu d'une ligne, composé par les traductions comme le composant doit le faire. */
const members = (count: number) => fr.t(($) => $.hives.members, { count })
const news = (count: number) =>
  count === 0 ? fr.t(($) => $.hives.newsNone) : fr.t(($) => $.hives.news, { count })
const UNNAMED = fr.t(($) => $.hives.unnamed)

/** Le nom lu d'un lien (web ou téléphone). */
const nameOf = (node: ReturnType<typeof screen.getByRole>) =>
  String(node.props.accessibilityLabel ?? node.props['aria-label'])

describe('HiveRow', () => {
  it('reads "Famille, 4 membres, animée par Papi Jean, 2 nouveautés"', async () => {
    const expected = fr.t(($) => $.hives.rowName, {
      hive: 'Famille',
      members: members(4),
      animator: 'Papi Jean',
      news: news(2),
    })
    expect(expected).toBe('Famille, 4 membres, animée par Papi Jean, 2 nouveautés') // témoin
    await renderWithProviders(<HiveRow hive={family} onPress={() => {}} />)

    const links = screen.getAllByRole('link')
    // Toute la ligne est un seul lien : ni le nom, ni l'alvéole, ni les photos n'en font un autre.
    expect(links).toHaveLength(1)
    expect(links[0] && nameOf(links[0])).toBe(expected)
  })

  it('opens the hive when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<HiveRow hive={family} onPress={onPress} />)

    await fireEvent.press(screen.getByRole('link'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('opens the hive with Enter on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(<HiveRow hive={family} onPress={onPress} />)

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

  it('shows its name, « 4 membres », « animée par Papi Jean » and « 2 nouveautés »', async () => {
    await renderWithProviders(<HiveRow hive={family} onPress={() => {}} />)

    expect(screen.getByText('Famille')).toBeTruthy()
    expect(screen.getByText(containing(members(4)))).toBeTruthy()
    expect(screen.getByText(containing('Papi Jean'))).toBeTruthy()
    expect(screen.getByText(news(2))).toBeTruthy()
  })

  it('says « rien de neuf » when nothing is new since the last visit', async () => {
    expect(news(0)).toBe('rien de neuf')
    await renderWithProviders(<HiveRow hive={{ ...family, news: 0 }} onPress={() => {}} />)

    expect(nameOf(screen.getByRole('link'))).toBe(
      'Famille, 4 membres, animée par Papi Jean, rien de neuf',
    )
    expect(screen.getByText('rien de neuf')).toBeTruthy()
  })

  it('says « 1 membre » and « 1 nouveauté » in the singular', async () => {
    await renderWithProviders(
      <HiveRow hive={{ ...family, memberCount: 1, news: 1, faces: [] }} onPress={() => {}} />,
    )

    expect(nameOf(screen.getByRole('link'))).toBe(
      'Famille, 1 membre, animée par Papi Jean, 1 nouveauté',
    )
  })

  it('names nobody as animator when there is none to show', async () => {
    await renderWithProviders(<HiveRow hive={{ ...family, animator: null }} onPress={() => {}} />)

    const name = nameOf(screen.getByRole('link'))
    expect(name).toBe(
      fr.t(($) => $.hives.rowNameNoAnimator, {
        hive: 'Famille',
        members: members(4),
        news: news(2),
      }),
    )
    expect(name).toBe('Famille, 4 membres, 2 nouveautés')
    expect(screen.queryByText(/animée par/)).toBeNull()
  })

  it('reads « Ruche sans nom » when the moderation removed the name', async () => {
    await renderWithProviders(<HiveRow hive={{ ...family, name: null }} onPress={() => {}} />)

    expect(nameOf(screen.getByRole('link'))).toBe(
      `${UNNAMED}, 4 membres, animée par Papi Jean, 2 nouveautés`,
    )
    expect(screen.getByText(UNNAMED)).toBeTruthy()
  })

  it('keeps only the name and the news when compact', async () => {
    await renderWithProviders(<HiveRow hive={family} onPress={() => {}} compact />)

    const link = screen.getByRole('link')
    expect(nameOf(link)).toMatch(containing('Famille'))
    expect(nameOf(link)).toMatch(containing(news(2)))
    // À l'œil : le nom et les nouveautés, ni le nombre de membres ni l'animateur.
    expect(screen.getByText('Famille')).toBeTruthy()
    expect(screen.getByText(news(2))).toBeTruthy()
    expect(screen.queryByText(containing(members(4)))).toBeNull()
    expect(screen.queryByText(/animée par/)).toBeNull()
  })
})
