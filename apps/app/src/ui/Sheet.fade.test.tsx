// Le fondu au bas d'une feuille qui défile (R7b, relecture de design, correction 15) : à 1280 × 720,
// 249 points de « Ton retour » étaient cachés sous le pied sans aucun indice (barre de défilement
// de 0 point sur le web). Tant qu'il reste du contenu plus bas, un fondu de la couleur de la
// feuille se pose au bas de la zone qui défile ; il part quand on arrive au bout. Décoratif : il ne
// prend aucune tape (`pointerEvents="none"`) et n'est pas lu.
//
// Ce que Jest ne mesure pas : le dessin du dégradé et sa place exacte au-dessus du pied. C'est
// l'affaire des captures (« feuille-retour-erreur », « feuille-appel »).

import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Sheet } from './Sheet'
import { Text } from './Text'
import type { Appearance } from './theme/appearance'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = {
  type: unknown
  props: Record<string, unknown>
  parent: Host | null
  children: ReadonlyArray<Host | string>
}

const open = (appearance?: Appearance) =>
  renderWithProviders(
    <Sheet
      open
      title="Ton retour"
      onClose={jest.fn()}
      action={{ label: 'Envoyer', onPress: () => {} }}
    >
      <Text>Ça a marché ?</Text>
    </Sheet>,
    'fr',
    appearance,
  )

/** La zone qui défile de la feuille (la `ScrollView`, rendue en `RCTScrollView`). */
const scroller = (): Host => {
  for (
    let node = screen.getByText('Ça a marché ?') as unknown as Host | null;
    node;
    node = node.parent
  ) {
    if (node.type === 'RCTScrollView') return node
  }
  throw new Error('No scroll area around the content')
}

/**
 * La hauteur du contenu, telle que la zone la signale. La fausse `ScrollView` de Jest ne mesure pas
 * sa boîte de contenu : elle passe `onContentSizeChange` à l'élément, qu'on appelle directement.
 */
const contentHeight = (height: number) =>
  fireEvent(scroller() as never, 'contentSizeChange', 390, height)

// `persist` : sans gestionnaire sur la zone, l'évènement remonterait au `KeyboardAvoidingView` de
// la feuille, qui l'appelle.
const layout = (height: number) => ({
  persist: () => {},
  nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
})

/** Un défilement jusqu'à `offset`, avec la hauteur de la zone et du contenu. */
const scrolled = (offset: number, viewport: number, content: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y: offset },
    layoutMeasurement: { width: 390, height: viewport },
    contentSize: { width: 390, height: content },
  },
})

const fade = () => screen.queryByTestId('sheet-fade', { includeHiddenElements: true })

/** Mesure une zone de 400 points sur un contenu de 1 000 : il en reste 600 plus bas. */
const overflow = async () => {
  await fireEvent(scroller() as never, 'layout', layout(400))
  await contentHeight(1000)
}

describe('the fade at the bottom of a sheet that scrolls (R7b, correction 15)', () => {
  it('shows no fade while the content fits', async () => {
    await open()
    await fireEvent(scroller() as never, 'layout', layout(400))
    await contentHeight(300)

    // Témoin : la feuille et son contenu sont là.
    expect(screen.getByText('Ça a marché ?')).toBeTruthy()
    expect(fade()).toBeNull()
  })

  it('shows a fade while some content is hidden below', async () => {
    await open()
    await overflow()

    expect(fade()).not.toBeNull()
  })

  it('takes the fade away at the end of the content, and back when scrolling up', async () => {
    await open()
    await overflow()

    await fireEvent.scroll(scroller() as never, scrolled(600, 400, 1000))
    expect(fade()).toBeNull()

    await fireEvent.scroll(scroller() as never, scrolled(200, 400, 1000))
    expect(fade()).not.toBeNull()
  })

  it('lets every tap through the fade, and hides it from screen readers', async () => {
    await open()
    await overflow()

    const shown = fade() as unknown as Host
    expect(shown.props.pointerEvents).toBe('none')
    expect(shown.props['aria-hidden']).toBe(true)
  })

  it.each([
    ['day', palettes.day.sheet],
    ['night', palettes.night.surface],
  ] as const)('fades into the color of the sheet (%s)', async (appearance, color) => {
    await open(appearance)
    await overflow()

    const style = StyleSheet.flatten((fade() as unknown as Host).props.style as never) as Record<
      string,
      unknown
    >
    const gradient = String(style.experimental_backgroundImage ?? style.backgroundImage)
    expect(gradient).toContain(color)
  })
})
