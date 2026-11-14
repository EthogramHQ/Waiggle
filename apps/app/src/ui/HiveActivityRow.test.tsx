// Tests d'une ligne de l'actualité d'une ruche (tranche R10, planches R10-Ruche et R10-Activite ;
// relecture du plan, interface 13). Sur le modèle d'une ligne de l'Activité (`ui/NotificationCard`) :
// « Léa a publié Le plan de table », « Tante Odile a mis à jour Biscotte au parc · v2 », « Papi
// Jean a épinglé … », avec la date relative ; un projet réservé à la ruche porte la pastille
// « Réservé à Famille ». Toute la ligne est un lien vers le projet, lu en entier : la phrase, la
// pastille et la date.
//
// L'API (plan R10, « API au contrat ») :
//   HiveActivityRow({ item: HiveActivityItem; hiveName: string | null; onPress: () => void }).
import type { HiveActivityItem } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HiveActivityRow } from './HiveActivityRow'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// --- Les données ---------------------------------------------------------------------------------

/** Il y a 5 minutes : la date relative ne dépend pas de l'heure à laquelle le test tourne. */
const fiveMinutesAgo = () => new Date(Date.now() - 5 * 60_000).toISOString()
const FIVE_MINUTES = fr.t(($) => $.dates.minutes, { count: 5 })

/** « Léa a publié Le plan de table », un projet réservé à « Famille ». */
const published = (): HiveActivityItem => ({
  kind: 'published',
  actor: { id: 'u-lea', name: 'Léa', avatarUrl: null },
  project: { ...summaryOf(recipesProject), title: 'Le plan de table' },
  version: null,
  at: fiveMinutesAgo(),
  reserved: true,
})

/** Une phrase des traductions, sans ses balises de gras (`<b>…</b>`) : ce qu'on lit. */
const sentence = (marked: string) => marked.replace(/<\/?b>/g, '')

const text = {
  published: sentence(
    fr.t(($) => $.hives.page.published, { name: 'Léa', title: 'Le plan de table' }),
  ),
  reserved: fr.t(($) => $.hives.page.reserved, { hive: 'Famille' }),
}

/** Le nom lu d'un lien (web ou téléphone). */
const nameOf = (node: ReturnType<typeof screen.getByRole>) =>
  String(node.props.accessibilityLabel ?? node.props['aria-label'])

// --- Les tests -----------------------------------------------------------------------------------

describe('HiveActivityRow', () => {
  it('reads an activity line whole, with "Réservé à Famille"', async () => {
    expect(text.published).toBe('Léa a publié Le plan de table') // témoin des traductions
    expect(text.reserved).toBe('Réservé à Famille')
    await renderWithProviders(
      <HiveActivityRow item={published()} hiveName="Famille" onPress={() => {}} />,
    )

    const links = screen.getAllByRole('link')
    // Un seul lien pour toute la ligne : ni le nom ni le titre n'en font un autre.
    expect(links).toHaveLength(1)
    const [link] = links
    if (!link) return
    const name = nameOf(link)
    expect(name).toMatch(containing(text.published))
    expect(name).toMatch(containing(text.reserved))
    expect(name).toMatch(containing(FIVE_MINUTES))
  })

  it('shows the sentence, the « Réservé à Famille » pill and the date', async () => {
    await renderWithProviders(
      <HiveActivityRow item={published()} hiveName="Famille" onPress={() => {}} />,
    )

    // La phrase se lit d'un bloc ; le nom et le titre y sont imbriqués, en gras.
    expect(screen.getByText(containing(text.published))).toBeTruthy()
    expect(screen.getAllByText('Léa').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Le plan de table').length).toBeGreaterThan(0)
    expect(screen.getByText(text.reserved)).toBeTruthy()
    expect(screen.getByText(containing(FIVE_MINUTES))).toBeTruthy()
  })

  it('opens the project when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <HiveActivityRow item={published()} hiveName="Famille" onPress={onPress} />,
    )

    await fireEvent.press(screen.getByRole('link'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('opens with Enter on the web, like the other cards', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <HiveActivityRow item={published()} hiveName="Famille" onPress={onPress} />,
      )

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

  it('carries no « Réservé à » for a project shown to all members', async () => {
    await renderWithProviders(
      <HiveActivityRow
        item={{ ...published(), reserved: false }}
        hiveName="Famille"
        onPress={() => {}}
      />,
    )

    const name = nameOf(screen.getByRole('link'))
    expect(name).toMatch(containing(text.published)) // témoin
    expect(name).not.toMatch(/Réservé/)
    expect(screen.queryByText(/Réservé/)).toBeNull()
  })

  it('reads « Tante Odile a mis à jour Biscotte au parc · v2 »', async () => {
    const updated = sentence(
      fr.t(($) => $.hives.page.updatedVersion, {
        name: 'Tante Odile',
        title: 'Biscotte au parc',
        version: 'v2',
      }),
    )
    expect(updated).toBe('Tante Odile a mis à jour Biscotte au parc · v2')
    await renderWithProviders(
      <HiveActivityRow
        item={{
          ...published(),
          kind: 'updated',
          actor: { id: 'u-odile', name: 'Tante Odile', avatarUrl: null },
          project: { ...summaryOf(recipesProject), title: 'Biscotte au parc' },
          version: 'v2',
          reserved: false,
        }}
        hiveName="Famille"
        onPress={() => {}}
      />,
    )

    expect(nameOf(screen.getByRole('link'))).toMatch(containing(updated))
  })

  it('reads an update without version without the « · »', async () => {
    const updated = sentence(
      fr.t(($) => $.hives.page.updated, { name: 'Tante Odile', title: 'Biscotte au parc' }),
    )
    await renderWithProviders(
      <HiveActivityRow
        item={{
          ...published(),
          kind: 'updated',
          actor: { id: 'u-odile', name: 'Tante Odile', avatarUrl: null },
          project: { ...summaryOf(recipesProject), title: 'Biscotte au parc' },
          version: null,
          reserved: false,
        }}
        hiveName="Famille"
        onPress={() => {}}
      />,
    )

    const name = nameOf(screen.getByRole('link'))
    expect(name).toMatch(containing(updated))
    expect(name).not.toMatch(/·/)
    expect(name).not.toMatch(/null/)
  })

  it('reads « Papi Jean a épinglé Le plan de table »', async () => {
    const pinned = sentence(
      fr.t(($) => $.hives.page.pinnedLine, { name: 'Papi Jean', title: 'Le plan de table' }),
    )
    expect(pinned).toBe('Papi Jean a épinglé Le plan de table')
    await renderWithProviders(
      <HiveActivityRow
        item={{
          ...published(),
          kind: 'pinned',
          actor: { id: 'u-jean', name: 'Papi Jean', avatarUrl: null },
        }}
        hiveName="Famille"
        onPress={() => {}}
      />,
    )

    expect(nameOf(screen.getByRole('link'))).toMatch(containing(pinned))
  })
})
