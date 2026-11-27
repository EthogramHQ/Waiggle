// Tests de `floating`, `onListScroll` et `top()` (tranche R21, « Le temps réel ») : la feuille des
// commentaires porte le bouton « 1 nouveau commentaire » par-dessus le bas de sa liste, dit à
// l'écran où en est le défilement, et remonte tout en haut sur demande.
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { ScrollView } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { SheetPanel } from './Sheet'
import type { SheetReveal } from './sheetReveal'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** La zone qui défile de la feuille. */
const scroller = () => {
  const root = screen.root as unknown as Node
  const found = hostsOf(root).find((node) => 'scrollEventThrottle' in node.props)
  if (!found) throw new Error('the sheet does not scroll')
  return found
}

describe('Sheet floating', () => {
  it.each(['phone', 'desktop'] as const)(
    'shows what floats inside the sheet, after its content (%s)',
    async (layout) => {
      const go = jest.fn()
      await renderWithProviders(
        <SheetPanel
          title="Commentaires"
          layout={layout}
          onClose={() => {}}
          footer={<Text>Le champ</Text>}
          floating={<Button label="1 nouveau commentaire" onPress={go} />}
        >
          <Text>La liste</Text>
        </SheetPanel>,
      )

      // La fenêtre de la feuille (`role="dialog"`, nommée par son titre).
      const dialog = hostsOf(screen.root as unknown as Node).find(
        (node) => node.props.role === 'dialog',
      )
      if (!dialog) throw new Error('the sheet is not a dialog')
      await fireEvent.press(screen.getByRole('button', { name: '1 nouveau commentaire' }))

      expect(go).toHaveBeenCalledTimes(1)
      // Dans la feuille (sa fenêtre modale), pas sur la page dessous.
      expect(
        hostsOf(dialog as unknown as Node).some((node) =>
          node.children.includes('1 nouveau commentaire'),
        ),
      ).toBe(true)
      // Après le contenu dans l'ordre de lecture, avant le pied.
      const texts = hostsOf(dialog as unknown as Node)
        .flatMap((node) => node.children)
        .filter((child): child is string => typeof child === 'string')
      expect(texts.indexOf('La liste')).toBeLessThan(texts.indexOf('1 nouveau commentaire'))
      expect(texts.indexOf('1 nouveau commentaire')).toBeLessThan(texts.indexOf('Le champ'))
    },
  )

  it('draws nothing more without it', async () => {
    await renderWithProviders(
      <SheetPanel title="Commentaires" layout="phone" onClose={() => {}}>
        <Text>La liste</Text>
      </SheetPanel>,
    )

    expect(screen.queryByRole('button', { name: '1 nouveau commentaire' })).toBeNull()
  })

  it('tells the screen where its list is scrolled', async () => {
    const onListScroll = jest.fn()
    await renderWithProviders(
      <SheetPanel
        title="Commentaires"
        layout="phone"
        onClose={() => {}}
        onListScroll={onListScroll}
      >
        <Text>La liste</Text>
      </SheetPanel>,
    )

    await fireEvent.scroll(scroller() as never, {
      nativeEvent: {
        contentOffset: { x: 0, y: 640 },
        contentSize: { width: 390, height: 2400 },
        layoutMeasurement: { width: 390, height: 700 },
      },
    })

    expect(onListScroll).toHaveBeenLastCalledWith(640)
  })

  it('goes back to the top of its list on demand (top)', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    const reveal = createRef<SheetReveal>()
    await renderWithProviders(
      <SheetPanel title="Commentaires" layout="phone" onClose={() => {}} revealRef={reveal}>
        <Text>La liste</Text>
      </SheetPanel>,
    )
    scrollTo.mockClear()

    reveal.current?.top()

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }))
    scrollTo.mockRestore()
  })
})
