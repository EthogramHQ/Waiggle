// Tests de la place gardée sous la carte de l'ambiance de marque (ui/BrandAmbiance.tsx,
// useHoldUnderCard), sur ordinateur : une seule place à la fois, la dernière posée l'emporte, et
// un contenu qui retire la sienne ne retire jamais celle d'un autre.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { BrandAmbiance, useHoldUnderCard } from './BrandAmbiance'
import { Text } from './Text'

function FirstHold() {
  return <Text>première place</Text>
}
function SecondHold() {
  return <Text>seconde place</Text>
}

/** Un contenu de la carte qui fait garder la place de `Hold`, s'il en a une. */
function Holder({ Hold }: { Hold: typeof FirstHold | null }) {
  useHoldUnderCard(Hold)
  return <Text>contenu</Text>
}

const card = (first: boolean, second: boolean) => (
  <BrandAmbiance size="wide" hero={null}>
    {first ? <Holder Hold={FirstHold} /> : null}
    {second ? <Holder Hold={SecondHold} /> : null}
  </BrandAmbiance>
)

const shown = (text: string) => screen.queryByText(text, { includeHiddenElements: true }) !== null

describe('the room kept under the brand card', () => {
  it('keeps the last room asked, and leaves it when an earlier one is withdrawn', async () => {
    const { rerender } = await renderWithProviders(card(true, true))
    expect(shown('seconde place')).toBe(true)
    expect(shown('première place')).toBe(false)

    // Le premier contenu s'en va : la place du second reste.
    await rerender(card(false, true))
    expect(shown('seconde place')).toBe(true)

    // Le second s'en va aussi : plus de place.
    await rerender(card(false, false))
    expect(shown('seconde place')).toBe(false)
  })
})
