// Les sections du catalogue montées à l'approche (tranche R18, « Les finitions », choix 12 du
// plan). Le catalogue des composants montait tout d'un coup : 1 269 lignes d'exemples, dont
// plusieurs animations sans fin, et la page restait figée une vingtaine de secondes. Une section
// (`LazySection`) ne monte désormais ses exemples que quand elle approche de la vue
// (`IntersectionObserver`, le navigateur prévient quand un élément entre dans la fenêtre).
// Les captures, elles, veulent tout le catalogue d'un coup : l'adresse le demande (`?tout=1`).
//
// La page est pré-rendue sans connaître son adresse complète (infra/web/check-web.mjs) : avant
// l'hydratation, une section rend donc la même place réservée, que l'adresse demande tout ou non.
// `?tout=1` n'est lu qu'après `useHydrated()`, sinon React verrait deux pages différentes.
import { act, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { Platform, Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { LazySection } from './LazySection'

// L'adresse de la page, que chaque test choisit : lue par Expo Router (`useLocalSearchParams`) ou
// par le navigateur (`location.search`), les deux disent la même chose.
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useGlobalSearchParams: () => mockParams,
  usePathname: () => '/catalogue',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
}))
// L'hydratation, que chaque test peut retarder (la page web pré-rendue, avant que React la reprenne).
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))

// Un faux `IntersectionObserver` : il retient ce qu'on lui confie et ne prévient jamais d'une
// approche. Une section n'a donc que l'adresse pour monter ses exemples.
const observed: unknown[] = []
class SilentObserver {
  observe(target: unknown) {
    observed.push(target)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

type Place = { search: string; pathname: string; href: string }
const globals = globalThis as { IntersectionObserver?: unknown; location?: Place }
let savedObserver: unknown
let savedLocation: PropertyDescriptor | undefined

/** L'adresse de la page, des deux côtés : Expo Router et le navigateur. */
const visit = (search: string) => {
  mockParams = Object.fromEntries(new URLSearchParams(search))
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: { search, pathname: '/catalogue', href: `http://localhost/catalogue${search}` },
  })
}

// Les exemples d'une section : chacun note qu'il a été monté.
const mounted: string[] = []
function Sample({ name }: { name: string }) {
  useEffect(() => {
    mounted.push(name)
  }, [name])
  return <Text>{name}</Text>
}

const SECTIONS = ['Couleurs', 'Boutons', 'Champs', 'Listes', 'États']
const Catalogue = () => (
  <>
    {SECTIONS.map((title) => (
      <LazySection key={title} title={title}>
        <Sample name={`exemple ${title}`} />
      </LazySection>
    ))}
  </>
)

let restorePlatform: (() => void) | null = null
beforeEach(() => {
  restorePlatform = jest.replaceProperty(Platform, 'OS', 'web').restore
  savedObserver = globals.IntersectionObserver
  savedLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  globals.IntersectionObserver = SilentObserver
  observed.length = 0
  mounted.length = 0
  mockHydrated = true
  visit('')
})
afterEach(() => {
  restorePlatform?.()
  globals.IntersectionObserver = savedObserver
  if (savedLocation) Object.defineProperty(globalThis, 'location', savedLocation)
  else delete globals.location
})

describe('LazySection', () => {
  it('mounts every section at once when the address asks for everything (?tout=1)', async () => {
    visit('?tout=1')
    await renderWithProviders(<Catalogue />)
    await act(async () => {})

    expect([...mounted].sort()).toEqual(SECTIONS.map((title) => `exemple ${title}`).sort())
    for (const title of SECTIONS) expect(screen.getByText(`exemple ${title}`)).toBeTruthy()
  })

  // Témoin du précédent : sans `?tout=1`, et sans approche signalée, les exemples attendent.
  it('keeps the samples of a section unmounted until it nears the view, without ?tout=1', async () => {
    await renderWithProviders(<Catalogue />)
    await act(async () => {})

    expect(mounted).toEqual([])
    expect(screen.queryByText('exemple Couleurs')).toBeNull()
  })

  it('renders the same placeholders before hydration, whatever the address', async () => {
    mockHydrated = false
    visit('?tout=1')
    const asking = await renderWithProviders(<Catalogue />)
    const everything = JSON.stringify(asking.toJSON())
    await asking.unmount()

    visit('')
    const plain = await renderWithProviders(<Catalogue />)
    const nothing = JSON.stringify(plain.toJSON())

    // Une place réservée par section, la même pour les deux adresses, sans aucun exemple monté.
    expect(everything).not.toBe('null')
    expect(everything).toBe(nothing)
    expect(mounted).toEqual([])
  })
})
