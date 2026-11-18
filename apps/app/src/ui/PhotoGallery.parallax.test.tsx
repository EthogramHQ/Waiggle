// Tests de la parallaxe de la galerie (R17, scénario « La photo d'un projet qui défile moins vite ») :
// avec `parallax`, dans un Screen, les photos descendent de 45 % du défilement de la page, mais pas
// « 2 sur 3 » ni les points ; sans `parallax` (la galerie d'une mise à jour), rien ne bouge.
import { act, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'
import { ScreenScrollContext, type ScrollEvent, useScreenScrollChannel } from './scrollLight'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const countOf = (index: number, count: number) => fr.t(($) => $.gallery.count, { index, count })

const photos: GalleryPhoto[] = [1, 2, 3].map((n) => ({
  key: `visual-${n}`,
  source: { uri: `https://media.example.test/visual-${n}.webp` },
  thumbhash: null,
}))

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

/** Le décalage vertical posé sur un nœud, par son style fixe ou par Reanimated. */
const shiftOf = (node: Node): number => {
  const fixed = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
  const moving =
    (node.props.jestAnimatedStyle as { value?: Record<string, unknown> } | undefined)?.value ?? {}
  const transform = (moving.transform ?? fixed.transform ?? []) as { translateY?: number }[]
  return transform.reduce((sum, part) => sum + (part.translateY ?? 0), 0)
}

/** Le décalage vu d'un nœud : le sien et celui de ses ancêtres. */
const seenShift = (node: Node): number => {
  let sum = 0
  for (let at: Node | null = node; at; at = at.parent) sum += shiftOf(at)
  return sum
}

const anyShift = () =>
  everyNode(screen.root as unknown as Node).reduce((sum, node) => sum + shiftOf(node), 0)

let scrollTo: (y: number) => void = () => {}

/** Un écran minimal : le canal de défilement de Screen. */
function FakeScreen({ children }: { children: ReactNode }) {
  const scroll = useScreenScrollChannel()
  scrollTo = (y) =>
    scroll.handleScroll({ nativeEvent: { contentOffset: { x: 0, y } } } as unknown as ScrollEvent)
  return (
    <ScreenScrollContext.Provider value={scroll.channel}>{children}</ScreenScrollContext.Provider>
  )
}

const scroll = async (y: number) => {
  await act(async () => {
    scrollTo(y)
    jest.advanceTimersByTime(32)
  })
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('PhotoGallery parallax', () => {
  it('moves the photos, not the count, at 45 % of the page scroll', async () => {
    await renderWithProviders(
      <FakeScreen>
        <PhotoGallery photos={photos} parallax />
      </FakeScreen>,
    )
    await scroll(100)

    expect(anyShift()).toBeCloseTo(45)
    expect(seenShift(screen.getByText(countOf(1, 3)) as unknown as Node)).toBe(0)
  })

  it('leaves a gallery without parallax in place, as on an update', async () => {
    await renderWithProviders(
      <FakeScreen>
        <PhotoGallery photos={photos} />
      </FakeScreen>,
    )
    await scroll(100)

    expect(anyShift()).toBe(0)
  })
})
