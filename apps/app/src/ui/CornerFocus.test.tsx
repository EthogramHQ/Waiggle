// Tests des trois branchements ajoutés pour la page du coin des testeurs (R7b) : la vue de focus
// d'un appel (`CallCard focusRef`), le focus donné à un testeur de la liste (`TestersList handle`)
// et la colonne latérale posée à gauche (`Columns sideFirst`).
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { AccessibilityInfo } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CallCard } from './CallCard'
import { Columns } from './Columns'
import type { Focusable } from './focus'
import { TestersList, type TestersListHandle } from './TestersList'
import { Text } from './Text'

const AT = '2026-11-10T12:00:00.000Z'

describe('CallCard focusRef', () => {
  it('gives the view of the call text, where the reading continues', async () => {
    const ref = createRef<Focusable>()
    await renderWithProviders(<CallCard text="Essayez le niveau 3." at={AT} focusRef={ref} />)

    expect((ref.current as unknown as { props: { children: unknown } }).props.children).toBe(
      'Essayez le niveau 3.',
    )
  })
})

describe('TestersList handle', () => {
  const testers = ['Inès Martin', 'Sam Petit'].map((name, index) => ({
    id: `t${index}`,
    name,
    avatar: null,
    since: AT,
  }))

  it('moves the reader to the row of the tester asked, and says false for a hidden one', async () => {
    const handle = createRef<TestersListHandle>()
    const sent = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {})
    sent.mockClear()
    await renderWithProviders(
      <TestersList count={2} testers={testers} onRemove={() => {}} initiallyOpen handle={handle} />,
    )

    expect(handle.current?.focusTester('t1')).toBe(true)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(handle.current?.focusTester('unknown')).toBe(false)
    sent.mockRestore()
  })
})

describe('Columns sideFirst', () => {
  it('reads the side column before the main one', async () => {
    await renderWithProviders(
      <Columns sideFirst main={<Text>Le fil</Text>} side={<Text>La liste</Text>} />,
    )

    const order = screen.getAllByText(/Le fil|La liste/).map((node) => node.props.children)
    expect(order).toEqual(['La liste', 'Le fil'])
  })
})
