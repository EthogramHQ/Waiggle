// Tests de la date relative affichée (refonte, tranche R4, décision F-Fil3) : `RelativeTime` montre
// « il y a 3 h », et un lecteur d'écran lit la date et l'heure complètes, à l'heure de Paris. Sur le
// web, le texte court est caché au lecteur d'écran et la date complète est écrite en texte masqué :
// un `Text` sans rôle n'y fait pas lire son `accessibilityLabel` (relecture de l'interface ui-B3).
//
// Avant l'hydratation, la page web est pré-rendue sans connaître l'heure du visiteur : le composant
// montre alors la date courte (« 20 oct. »), la même au serveur et au navigateur. Ensuite, toutes les
// dates de l'écran avancent ensemble, à la minute, sur une seule horloge ; un catalogue ou un test
// fixe l'heure par la prop `now`.
//
// `useRelativeDate(iso, now?)` rend les mêmes textes, pour une place qui n'accepte qu'une chaîne
// (le `detail` d'une ligne de liste : « Bloqué hier »).
import { act, renderHook, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Platform } from 'react-native'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { parisDateTime } from './parisTime'
import { RelativeTime, useRelativeDate } from './RelativeTime'
import { relativeDate } from './relativeDate'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La page est-elle hydratée ? Sur téléphone, toujours ; un test la met à faux pour voir le pré-rendu
// du web. Le préfixe `mock` permet à Jest de lire cette variable dans le remplacement du module.
let mockHydrated = true
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: () => mockHydrated,
}))

/** Les blancs d'Intl et de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

/** Le mardi 20 octobre 2026 à midi, heure de Paris. */
const now = new Date('2026-10-20T10:00:00.000Z')
/** Trois heures plus tôt : 9 h à Paris, le même jour. */
const threeHoursAgo = '2026-10-20T07:00:00.000Z'
const full = parisDateTime(threeHoursAgo, 'fr', now).dateTime
const shown = plain(fr.t(($) => $.dates.hours, { count: 3 }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: unknown[] }

/** Ce qui se lit sous ce nom : un élément nommé ainsi, ou un texte (masqué) qui le dit. */
const readAs = (name: string) =>
  screen.queryByLabelText(name) ?? screen.queryByText(plain(name), { exact: true })

/** Vrai si l'élément, ou un de ses ancêtres, est caché aux lecteurs d'écran. */
const hiddenFromReaders = (element: unknown): boolean => {
  for (let node = element as Node | null; node; node = node.parent) {
    const { props } = node
    if (
      props['aria-hidden'] === true ||
      props.accessibilityElementsHidden === true ||
      props.importantForAccessibility === 'no-hide-descendants'
    ) {
      return true
    }
  }
  return false
}

/** Tous les nœuds de l'arbre rendu, en profondeur. */
const allNodes = (): Node[] => {
  const found: Node[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object' || !('props' in node)) return
    found.push(node as Node)
    for (const child of (node as Node).children) visit(child)
  }
  visit(screen.root)
  return found
}

beforeEach(() => {
  mockHydrated = true
})

describe('RelativeTime', () => {
  it('shows how long ago, in words', async () => {
    await renderWithProviders(<RelativeTime date={threeHoursAgo} now={now} />)

    expect(screen.getByText(shown, { includeHiddenElements: true })).toBeTruthy()
  })

  it('reads the full Paris date', async () => {
    await renderWithProviders(<RelativeTime date={threeHoursAgo} now={now} />)

    expect(readAs(full)).not.toBeNull()
  })

  it('shows the short date before the page is hydrated', async () => {
    // Le pré-rendu du web : ni « il y a 3 h » (l'heure du serveur n'est pas celle du visiteur), ni
    // une date qui changerait à l'hydratation.
    mockHydrated = false
    await renderWithProviders(<RelativeTime date={threeHoursAgo} now={now} />)

    expect(screen.getByText('20 oct.', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText(shown, { includeHiddenElements: true })).toBeNull()
  })

  it('speaks the language of the app', async () => {
    await renderWithProviders(<RelativeTime date={threeHoursAgo} now={now} />, 'en')

    expect(screen.getByText('3 h ago', { includeHiddenElements: true })).toBeTruthy()
    expect(readAs(parisDateTime(threeHoursAgo, 'en', now).dateTime)).not.toBeNull()
  })

  it('follows the clock it is given', async () => {
    const { rerender } = await renderWithProviders(
      <RelativeTime date="2026-10-20T09:59:30.000Z" now={now} />,
    )
    expect(
      screen.getByText(plain(fr.t(($) => $.dates.now)), { includeHiddenElements: true }),
    ).toBeTruthy()

    // Le catalogue (ou l'écran) avance son horloge : la date suit, sans minuteur à elle.
    await rerender(
      <RelativeTime date="2026-10-20T09:59:30.000Z" now={new Date('2026-10-20T10:05:30.000Z')} />,
    )
    expect(
      screen.getByText(plain(fr.t(($) => $.dates.minutes, { count: 6 })), {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
  })
})

describe('RelativeTime, without a given clock', () => {
  beforeEach(() => jest.useFakeTimers({ now }))
  afterEach(() => jest.useRealTimers())

  it('moves on by itself every minute', async () => {
    await renderWithProviders(<RelativeTime date="2026-10-20T09:59:30.000Z" />)
    expect(
      screen.getByText(plain(fr.t(($) => $.dates.now)), { includeHiddenElements: true }),
    ).toBeTruthy()

    await act(() => jest.advanceTimersByTime(60_000))

    expect(
      screen.getByText(plain(fr.t(($) => $.dates.minutes, { count: 1 })), {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
  })

  it('shares one clock between all the dates of a screen', async () => {
    // Cinq dates puis une seule : autant de minuteurs dans les deux cas, pas un par date.
    const dates = (count: number) => (
      <>
        {Array.from({ length: count }, (_, n) => `2026-10-1${n}T08:00:00.000Z`).map((date) => (
          <RelativeTime key={date} date={date} />
        ))}
      </>
    )
    const { rerender } = await renderWithProviders(dates(5))
    const withFive = jest.getTimerCount()

    await rerender(dates(1))

    expect(screen.getAllByText(/./, { includeHiddenElements: true }).length).toBeGreaterThan(0)
    expect(jest.getTimerCount()).toBe(withFive)
  })
})

describe('RelativeTime on the web', () => {
  // Sur le web, la langue et la plateforme sont lues au rendu ; on les remet après chaque test.
  afterEach(() => jest.restoreAllMocks())

  it('hides the short text from screen readers and writes the full date for them', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<RelativeTime date={threeHoursAgo} now={now} />)

    // Le texte vu (« il y a 3 h ») est caché au lecteur d'écran…
    expect(hiddenFromReaders(screen.getByText(shown, { includeHiddenElements: true }))).toBe(true)
    // … qui lit à sa place la date complète, écrite en texte (masqué à l'œil).
    const spoken = screen.getByText(plain(full))
    expect(hiddenFromReaders(spoken)).toBe(false)
  })

  it('shows the full date on hover', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<RelativeTime date={threeHoursAgo} now={now} />)

    // L'attribut `title` du web : la bulle qui paraît au survol de la souris.
    expect(allNodes().some((node) => node.props.title === full)).toBe(true)
  })
})

describe('useRelativeDate', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={createI18n('fr')}>{children}</I18nextProvider>
  )

  it('gives plain text, for a place that takes only a string', async () => {
    const { result } = await renderHook(() => useRelativeDate(threeHoursAgo, now), { wrapper })

    expect(typeof result.current.label).toBe('string')
    expect(result.current).toEqual(relativeDate(threeHoursAgo, 'fr', now))
  })

  it('gives the form used after a verb: Bloqué hier', async () => {
    const yesterday = '2026-10-19T08:00:00.000Z'
    const { result } = await renderHook(() => useRelativeDate(yesterday, now), { wrapper })

    expect(plain(fr.t(($) => $.block.list.blockedWhen, { when: result.current.afterVerb }))).toBe(
      'Bloqué hier',
    )
  })

  it('stays on the short date before the page is hydrated', async () => {
    mockHydrated = false
    const { result } = await renderHook(() => useRelativeDate(threeHoursAgo, now), { wrapper })

    expect(plain(result.current.label)).toBe('20 oct.')
  })
})
