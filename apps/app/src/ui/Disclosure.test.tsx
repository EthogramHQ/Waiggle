// Tests de la section repliable (Disclosure) : un titre qu'on touche pour déplier ou replier son
// contenu. Sur la page projet (R5a), elle porte « Les autres prompts · 2 » sous le prompt de départ.
//
// Relecture de l'interface du plan R5a (ui-15) : l'état replié ou déplié n'était donné que par
// `aria-expanded`, que lit le web ; VoiceOver et TalkBack le lisent dans `accessibilityState`
// (`expanded`). Les deux doivent dire la même chose, et le contenu replié n'existe pas pour les
// lecteurs d'écran ni pour la touche Tab.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Disclosure } from './Disclosure'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = 'Les autres prompts · 2'
const CONTENT = 'Ajoute un bouton pour exporter la liste.'

const sample = (initiallyOpen = false) => (
  <Disclosure title={TITLE} initiallyOpen={initiallyOpen}>
    <Text>{CONTENT}</Text>
    <Button label="Copier le prompt 2" onPress={() => {}} />
  </Disclosure>
)

type Host = { props: Record<string, unknown> }

/** L'état lu par VoiceOver et TalkBack : `accessibilityState.expanded` de l'élément natif. */
const nativeExpanded = (node: Host): unknown =>
  (node.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded

const toggle = () => screen.getByRole('button', { name: TITLE })

describe('Disclosure', () => {
  it('is a button named by its title', async () => {
    await renderWithProviders(sample())

    expect(toggle()).toBeTruthy()
  })

  it('tells native screen readers it is collapsed', async () => {
    await renderWithProviders(sample())

    expect(nativeExpanded(toggle() as unknown as Host)).toBe(false)
  })

  it('tells native screen readers it is expanded once touched', async () => {
    await renderWithProviders(sample())

    await fireEvent.press(toggle())

    expect(nativeExpanded(toggle() as unknown as Host)).toBe(true)
  })

  it('says it is collapsed again when touched a second time', async () => {
    await renderWithProviders(sample())

    await fireEvent.press(toggle())
    await fireEvent.press(toggle())

    expect(nativeExpanded(toggle() as unknown as Host)).toBe(false)
    expect(screen.queryByText(CONTENT, { includeHiddenElements: true })).toBeNull()
  })

  it('starts expanded when asked, and says so', async () => {
    await renderWithProviders(sample(true))

    expect(nativeExpanded(toggle() as unknown as Host)).toBe(true)
    expect(screen.getByText(CONTENT)).toBeTruthy()
  })

  it('keeps the same state on the web, through aria-expanded', async () => {
    // Le web lit `aria-expanded` ; l'état natif doit dire la même chose, pas l'inverse.
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(sample())
      const before = toggle() as unknown as Host
      expect(before.props['aria-expanded'] ?? nativeExpanded(before)).toBe(false)

      await fireEvent.press(toggle())

      const after = toggle() as unknown as Host
      expect(after.props['aria-expanded'] ?? nativeExpanded(after)).toBe(true)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('hides its content while collapsed, from sight, screen readers and Tab', async () => {
    await renderWithProviders(sample())

    expect(toggle()).toBeTruthy() // témoin
    expect(screen.queryByText(CONTENT, { includeHiddenElements: true })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Copier le prompt 2', includeHiddenElements: true }),
    ).toBeNull()
  })

  it('shows its content once expanded', async () => {
    await renderWithProviders(sample())

    await fireEvent.press(toggle())

    expect(screen.getByText(CONTENT)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copier le prompt 2' })).toBeTruthy()
  })
})
