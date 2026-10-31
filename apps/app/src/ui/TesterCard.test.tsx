// Tests de la carte d'un projet qui cherche des testeurs (refonte, tranche R3, carrousel
// d'Explorer) : sa photo, son titre, son auteur ; « Tester ↗ » posé sur l'image est un lien nommé
// « Tester <titre> », annoncé comme un site externe (il passe par la page d'avertissement, comme
// « Voir le code ») ; la flèche « ↗ » est dessinée, pas lue ; une double tape n'ouvre la démo
// qu'une fois ; et le lien n'est jamais dans un autre lien (relecture de l'interface, ui-4).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TesterCard } from './TesterCard'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const title = 'Carnet de cafés'
const author = 'Sam Petit'
const image = {
  source: { uri: 'https://api.example/cafes.webp' },
  thumbhash: null,
  label: 'Photo de Carnet de cafés',
}
const external = fr.t(($) => $.common.externalSite)
const testName = fr.t(($) => $.explore.testProject, { title })

const card = (onTest: () => void) => (
  <TesterCard title={title} author={author} image={image} onTest={onTest} />
)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null }

/** Le lien « Tester », par son nom exact (la flèche n'en fait pas partie). */
const testLink = () => screen.getByRole('link', { name: testName })

/**
 * Vrai si le lien est annoncé comme un site externe : sur téléphone, par son indice ; sur le web,
 * par son nom (« …, ouvre un site externe », comme TextLink) ou par une description
 * (aria-describedby) vers un texte qui le dit.
 */
const announcedExternal = (link: { props: unknown }): boolean => {
  const props = link.props as Record<string, unknown>
  const direct = [props.accessibilityHint, props['aria-description'], props.accessibilityLabel]
  if (direct.some((value) => typeof value === 'string' && value.includes(external))) return true
  const id = props['aria-describedby']
  if (typeof id !== 'string') return false
  const described = screen.queryAllByText(new RegExp(external), { includeHiddenElements: true })
  return described.some((text) => {
    let node = text as unknown as Node | null
    while (node && node.props.nativeID !== id) node = node.parent
    return node !== null
  })
}

describe('TesterCard', () => {
  it('shows the photo, the title and the author', async () => {
    await renderWithProviders(card(() => {}))

    expect(screen.getByLabelText(image.label)).toBeTruthy()
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText(author)).toBeTruthy()
  })

  it('offers « Tester » as a link named after the project, announced as an external site', async () => {
    await renderWithProviders(card(() => {}))

    const link = testLink()
    expect(announcedExternal(link)).toBe(true)
    // Ce qui se voit sur la photo : « Tester » ; la flèche est hors du nom lu.
    expect(
      screen.getByText(
        fr.t(($) => $.explore.test),
        { includeHiddenElements: true },
      ),
    ).toBeTruthy()
    const spoken = String((link.props as Record<string, unknown>).accessibilityLabel)
    expect(spoken).not.toContain('↗')
  })

  it('announces the external site on the web too', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(card(() => {}))

      // Sur le web, le nom peut finir par « , ouvre un site externe » (TextLink) : on cherche le
      // lien par le début de son nom.
      const link = screen.getByRole('link', { name: new RegExp(`^${testName}`) })
      expect(announcedExternal(link)).toBe(true)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('opens the demo when « Tester » is touched', async () => {
    const onTest = jest.fn()
    await renderWithProviders(card(onTest))

    await fireEvent.press(testLink())

    expect(onTest).toHaveBeenCalledTimes(1)
  })

  it('opens with the Enter key on the web, like a real link', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onTest = jest.fn()
      await renderWithProviders(card(onTest))

      const link = screen.getByRole('link', { name: new RegExp(`^${testName}`) })
      await fireEvent(link, 'keyDown', { key: 'Enter', repeat: false, preventDefault: () => {} })

      expect(onTest).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps the « Tester » link out of any other link or button (ui-4)', async () => {
    await renderWithProviders(card(() => {}))

    let parent = (testLink() as unknown as Node).parent
    while (parent) {
      const role = parent.props.accessibilityRole
      expect(role === 'link' || role === 'button').toBe(false)
      parent = parent.parent
    }
  })

  // La page d'avertissement s'ouvre sous le doigt : la seconde tape d'une double tape ne doit pas
  // l'ouvrir deux fois (deux pages empilées, deux « Retour »). Même garde que les fenêtres
  // (TAP_GUARD_MS, tapGuard.ts).
  describe('against a double tap', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('opens the demo once for two taps in a row', async () => {
      const onTest = jest.fn()
      await renderWithProviders(card(onTest))

      await fireEvent.press(testLink())
      await fireEvent.press(testLink())

      expect(onTest).toHaveBeenCalledTimes(1)
    })

    it('opens the demo again for a tap that comes later', async () => {
      const onTest = jest.fn()
      await renderWithProviders(card(onTest))

      await fireEvent.press(testLink())
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent.press(testLink())

      expect(onTest).toHaveBeenCalledTimes(2)
    })
  })
})
