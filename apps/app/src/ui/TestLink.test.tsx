// Tests de la pastille « Tester ↗ » (`TestLink`), commune à la carte du fil, à celle d'Explorer et à
// la ligne de la colonne du fil : un lien nommé d'après le projet, annoncé comme un site externe,
// que Entrée ouvre sur le web, et qui garde 44 points à toucher quelle que soit sa taille.
import { layout } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TestLink, type TestLinkSize } from './TestLink'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const title = 'Carnet de cafés'
const outside = fr.t(($) => $.common.externalSite)
const testName = fr.t(($) => $.explore.testProject, { title })
const shown = fr.t(($) => $.explore.test)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

const styleOf = (node: unknown) =>
  (StyleSheet.flatten((node as Node).props.style as object) ?? {}) as Record<string, unknown>

/** La pastille dessinée : le premier enfant du lien (la zone à toucher l'entoure). */
const pillOf = (link: unknown) => (link as Node).children[0]

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const press = (key: string) => ({ key, repeat: false, preventDefault: () => {} })

const link = () => screen.getByRole('link', { name: new RegExp(`^${testName}`) })

describe('TestLink', () => {
  afterEach(() => jest.restoreAllMocks())

  it('is a link named « Tester » and the project, with the label shown', async () => {
    await renderWithProviders(<TestLink title={title} onPress={() => {}} size="small" />)

    expect(link()).toBeTruthy()
    expect(screen.getByText(shown)).toBeTruthy()
    // La flèche décore : elle n'est pas dans le nom.
    expect(String(link().props.accessibilityLabel)).not.toContain('↗')
  })

  it('shows another label when given one, and keeps the project in the name', async () => {
    await renderWithProviders(
      <TestLink title={title} onPress={() => {}} size="small" label="Essayer" />,
    )

    expect(screen.getByText('Essayer')).toBeTruthy()
    expect(link()).toBeTruthy()
  })

  it('warns that it leaves the app through a hint on a phone', async () => {
    await renderWithProviders(<TestLink title={title} onPress={() => {}} size="small" />)

    expect(link()).toHaveProp('accessibilityHint', outside)
    expect(link()).toHaveProp('accessibilityLabel', testName)
  })

  it('says it in the name on the web, where the hint does not exist', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<TestLink title={title} onPress={() => {}} size="small" />)

    expect(screen.getByRole('link', { name: `${testName}, ${outside}` })).toBeTruthy()
    expect(link().props.accessibilityHint).toBeUndefined()
  })

  it.each<TestLinkSize>(['small', 'compact'])(
    'gives the %s link 44 points to touch, around a smaller or equal pill',
    async (size) => {
      await renderWithProviders(<TestLink title={title} onPress={() => {}} size={size} />)

      const zone = styleOf(link())
      expect(zone.minHeight).toBeGreaterThanOrEqual(layout.touchTarget)
      expect(zone.minWidth).toBeGreaterThanOrEqual(layout.touchTarget)
      // Jamais plus large que sa rangée, même à 200 % de texte.
      expect(zone.maxWidth).toBe('100%')
      expect(zone.flexShrink).toBe(1)
    },
  )

  it('draws the small pill lower than the compact one', async () => {
    await renderWithProviders(
      <>
        <TestLink title="Petit" onPress={() => {}} size="small" />
        <TestLink title="Grand" onPress={() => {}} size="compact" />
      </>,
    )

    const small = styleOf(pillOf(screen.getByRole('link', { name: /^Tester Petit/ })))
    const compact = styleOf(pillOf(screen.getByRole('link', { name: /^Tester Grand/ })))
    expect(small.minHeight).toBe(layout.controlHeight.small)
    expect(compact.minHeight).toBe(layout.controlHeight.compact)
  })

  it('lets the parent place it, without losing its touch zone', async () => {
    await renderWithProviders(
      <TestLink title={title} onPress={() => {}} size="small" style={{ marginLeft: 'auto' }} />,
    )

    const zone = styleOf(link())
    expect(zone.marginLeft).toBe('auto')
    expect(zone.minHeight).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<TestLink title={title} onPress={onPress} size="compact" />)

    await fireEvent.press(link())

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('opens with Enter on the web, once, and ignores other keys and a held key', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onPress = jest.fn()
    await renderWithProviders(<TestLink title={title} onPress={onPress} size="small" />)
    const web = screen.getByRole('link', { name: `${testName}, ${outside}` })

    await fireEvent(web, 'keyDown', press(' '))
    await fireEvent(web, 'keyDown', { ...press('Enter'), repeat: true })
    expect(onPress).not.toHaveBeenCalled()

    await fireEvent(web, 'keyDown', press('Enter'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('adds no keyboard handler on a phone', async () => {
    await renderWithProviders(<TestLink title={title} onPress={() => {}} size="small" />)

    expect(link().props.onKeyDown).toBeUndefined()
  })
})
