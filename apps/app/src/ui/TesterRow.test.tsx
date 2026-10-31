// Tests d'une ligne de « Ils cherchent des testeurs », dans la colonne de droite du Fil sur
// ordinateur (R4, F-Fil11, planche R4-Fil-Desktop) : la vignette, le titre et l'auteur d'un projet,
// et « Tester ». Mêmes gardes que la carte d'Explorer (`TesterCard`, R3) :
// - la ligne (vignette, titre) est un lien vers la page du projet, nommé par le titre ;
// - « Tester » est un lien frère, jamais dans l'autre (relecture de l'interface, ui-4), nommé
//   « Tester <titre> » et annoncé comme un site externe ;
// - une double tape n'ouvre qu'une fois (TAP_GUARD_MS) ;
// - la ligne ne connaît pas l'adresse de la démo : « Tester » la confie à l'écran, qui passe par la
//   page d'avertissement `/out` (relecture de sécurité sec-A7), jamais un lien direct.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TesterRow } from './TesterRow'
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

const row = (handlers: { onTest?: () => void; onOpen?: () => void }) => (
  <TesterRow
    title={title}
    author={author}
    image={image}
    onTest={handlers.onTest ?? (() => {})}
    onOpen={handlers.onOpen ?? (() => {})}
  />
)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Le lien « Tester », par le début de son nom (sur le web, il peut finir par « , ouvre un site externe »). */
const testLink = () => screen.getByRole('link', { name: new RegExp(`^${testName}`) })
const openLink = () => screen.getByRole('link', { name: title })

/** Vrai si un ancêtre de l'élément est un lien ou un bouton. */
const insideControl = (element: unknown): boolean => {
  let parent = (element as Node).parent
  while (parent) {
    const role = parent.props.accessibilityRole ?? parent.props.role
    if (role === 'link' || role === 'button') return true
    parent = parent.parent
  }
  return false
}

/** Vrai si le lien est annoncé comme un site externe : par son indice, son nom ou une description. */
const announcedExternal = (link: { props: unknown }): boolean => {
  const props = link.props as Record<string, unknown>
  const direct = [props.accessibilityHint, props['aria-description'], props.accessibilityLabel]
  return direct.some((value) => typeof value === 'string' && value.includes(external))
}

/** Tous les nœuds sous `node`, lui compris. */
const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

describe('TesterRow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('shows the thumbnail, the title and the author', async () => {
    await renderWithProviders(row({}))

    expect(screen.getByLabelText(image.label, { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText(author)).toBeTruthy()
  })

  it('offers « Tester » as a link named after the project, announced as an external site', async () => {
    await renderWithProviders(row({}))

    const link = testLink()
    expect(announcedExternal(link)).toBe(true)
    expect(
      screen.getByText(
        fr.t(($) => $.explore.test),
        { includeHiddenElements: true },
      ),
    ).toBeTruthy()
    expect(String((link.props as Record<string, unknown>).accessibilityLabel)).not.toContain('↗')
  })

  it('announces the external site on the web too', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(row({}))

    expect(announcedExternal(testLink())).toBe(true)
  })

  it('opens the project page from the row, and the demo from « Tester » only', async () => {
    const onOpen = jest.fn()
    const onTest = jest.fn()
    await renderWithProviders(row({ onOpen, onTest }))

    await fireEvent.press(openLink())
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onTest).not.toHaveBeenCalled()

    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(testLink())
    expect(onTest).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('keeps the two links side by side, neither inside the other (ui-4)', async () => {
    await renderWithProviders(row({}))

    expect(insideControl(openLink())).toBe(false)
    expect(insideControl(testLink())).toBe(false)
  })

  it('opens the demo once for two taps in a row, again after the guard', async () => {
    const onTest = jest.fn()
    await renderWithProviders(row({ onTest }))

    await fireEvent.press(testLink())
    await fireEvent.press(testLink())
    expect(onTest).toHaveBeenCalledTimes(1)

    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(testLink())
    expect(onTest).toHaveBeenCalledTimes(2)
  })

  it('opens the project page once for a double tap', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(row({ onOpen }))

    await fireEvent.press(openLink())
    await fireEvent.press(openLink())

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  // La seconde tape d'un « Tester » ne tombe pas, à côté, sur le lien de la ligne : une seule garde.
  it('does not open the project page with the second tap of a « Tester » double tap', async () => {
    const onOpen = jest.fn()
    const onTest = jest.fn()
    await renderWithProviders(row({ onOpen, onTest }))

    await fireEvent.press(testLink())
    await fireEvent.press(openLink())

    expect(onTest).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  // sec-A7 : « Tester » passe par la page d'avertissement `/out`, que l'écran ouvre (useOpenOutside) ;
  // la ligne ne pose aucun lien direct vers la démo, même sur le web où un lien a une adresse.
  it('sends « Tester » through the /out warning page, never straight to the demo', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onTest = jest.fn()
    await renderWithProviders(row({ onTest }))

    await fireEvent.press(testLink())
    expect(onTest).toHaveBeenCalledTimes(1)
    const direct = everyNode(screen.root as unknown as Node).filter((node) => {
      const href = node.props.href
      return typeof href === 'string' && /^(https?:)?\/\//.test(href)
    })
    expect(direct).toHaveLength(0)
  })
})
