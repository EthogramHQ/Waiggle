// Tests de la hauteur de la galerie d'un projet selon la taille de l'écran (relecture de design de
// R5a, C3) : sur une tablette en une colonne (768 × 900), la grande hauteur d'ordinateur (520)
// poussait « Tester la démo » sous le premier écran ; la taille moyenne a sa propre hauteur
// (`layout.cover.medium`). Le reste de la galerie est testé dans PhotoGallery.test.tsx.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Dimensions, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const photos: GalleryPhoto[] = [1, 2].map((n) => ({
  key: `visual-${n}`,
  source: { uri: `https://media.example.test/visual-${n}.webp` },
  thumbhash: null,
}))

type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null }

/**
 * La hauteur du cadre de la galerie : le premier ancêtre de la bande qui glisse (le ScrollView
 * horizontal) dont le style donne une hauteur.
 */
const frameHeight = () => {
  // Une liste plutôt qu'une variable : TypeScript ne suit pas une affectation faite dans `visit`.
  const found: Node[] = []
  const visit = (node: Node & { children: (Node | string)[] }) => {
    if (node.type === 'RCTScrollView' && node.props.horizontal === true) found.push(node)
    for (const child of node.children) if (typeof child !== 'string') visit(child as never)
  }
  visit(screen.root as never)
  let node: Node | null = found[0] ?? null
  while (node) {
    const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
    if (typeof style?.height === 'number') return style.height
    node = node.parent
  }
  throw new Error('no gallery frame with a height')
}

/** Une fenêtre de tablette (768 × 900), puis le téléphone des tests, rendu à la fin. */
const setTabletWindow = () => {
  const restore = setDesktopWindow()
  const tablet = { width: 768, height: 900, scale: 2, fontScale: 1 }
  Dimensions.set({ window: tablet, screen: tablet })
  return restore
}

describe('the height of the gallery', () => {
  it('is the medium height on a tablet, lower than on a computer', async () => {
    const restore = setTabletWindow()
    try {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      expect(frameHeight()).toBe(layout.cover.medium)
      expect(layout.cover.medium).toBeLessThan(layout.cover.hero)
    } finally {
      restore()
    }
  })

  it('keeps the large height on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      expect(frameHeight()).toBe(layout.cover.hero)
    } finally {
      restore()
    }
  })

  it('keeps the band on a phone', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} />)

    expect(frameHeight()).toBe(layout.cover.band)
  })
})
