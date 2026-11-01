// Tests de la galerie de photos d'un projet (R5a, F-Pr6, F-Pr7, planches `R5a-Projet`,
// `R5a-Projet-Desktop`) : les photos glissent l'une après l'autre, aimantées ; des points et « 1 sur
// 3 » en bas (rien pour une seule photo) ; sur ordinateur, des flèches de verre et les flèches du
// clavier ; le lecteur d'écran lit « Photo 2 sur 3 » et passe d'une photo à l'autre sans glisser
// (rôle réglable). `onIndexChange` prévient la page, qui donne à la lumière d'ambiance la couleur de
// la photo montrée. Elle reprend de `Carousel` (Carousel.test.tsx) l'aimant et les flèches.
// Relecture du plan : ui-12 (rôle réglable, valeur « Photo 2 sur 3 », flèches du clavier seulement
// quand le focus est dans la galerie), ui-10 (flèches nommées).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const label = fr.t(($) => $.gallery.label)
const previous = fr.t(($) => $.gallery.previous)
const next = fr.t(($) => $.gallery.next)
/** Ce que lit le lecteur d'écran (« Photo 2 sur 3 »). */
const photoOf = (index: number, count: number) => fr.t(($) => $.gallery.photoOf, { index, count })
/** Ce qui s'affiche en bas de la photo (« 2 sur 3 »). */
const countOf = (index: number, count: number) => fr.t(($) => $.gallery.count, { index, count })

/** Trois photos d'un projet, comme les donne l'API (adresse et résumé flou). */
const photos: GalleryPhoto[] = [1, 2, 3].map((n) => ({
  key: `visual-${n}`,
  source: { uri: `https://media.example.test/visual-${n}.webp` },
  thumbhash: null,
}))

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole
/** La valeur lue d'un élément réglable : `accessibilityValue.text`, ou `aria-valuetext` (web). */
const valueTextOf = (props: Record<string, unknown>) =>
  (props.accessibilityValue as { text?: string } | undefined)?.text ?? props['aria-valuetext']

/** La galerie elle-même : l'élément nommé « Photos du projet ». */
const gallery = () => screen.getByLabelText(label)

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** La bande qui glisse : l'élément natif du ScrollView horizontal (RCTScrollView en test). */
const scrollViewProps = (): Record<string, unknown> => {
  let found: Node | null = null
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === 'RCTScrollView' && node.props.horizontal === true) found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error('no horizontal ScrollView rendered')
  return (found as Node).props
}

/**
 * Le doigt fait glisser la bande jusqu'à la photo `index` (sur un téléphone de 390 points) : la
 * mesure de la bande, puis la position où elle s'arrête, passées à chaque gestionnaire présent
 * (onLayout, onScroll, onMomentumScrollEnd), comme React Native les enverrait.
 */
const swipeTo = async (index: number) => {
  const props = scrollViewProps()
  const width = 390
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width, height: 300 } } }
  const scroll = {
    nativeEvent: {
      contentOffset: { x: index * width, y: 0 },
      layoutMeasurement: { width, height: 300 },
      contentSize: { width: width * photos.length, height: 300 },
    },
  }
  await act(async () => {
    if (typeof props.onLayout === 'function') props.onLayout(layout)
  })
  await act(async () => {
    for (const handler of ['onScroll', 'onScrollEndDrag', 'onMomentumScrollEnd']) {
      const fn = props[handler]
      if (typeof fn === 'function') fn(scroll)
    }
  })
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({
  key: name,
  shiftKey: false,
  repeat: false,
  preventDefault: jest.fn(),
})

describe('PhotoGallery', () => {
  it('shows « 1 sur 3 » under three photos', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} />)

    expect(screen.getByText(countOf(1, 3))).toBeTruthy()
  })

  // Scénario : « un projet à une seule photo n'a ni points ni « 1 sur 1 » ».
  it('shows no count for a single photo', async () => {
    await renderWithProviders(<PhotoGallery photos={photos.slice(0, 1)} />)

    expect(gallery()).toBeTruthy() // témoin : la galerie est là, avec sa photo
    expect(screen.queryByText(countOf(1, 1))).toBeNull()
    expect(screen.queryByText(/1\s+sur\s+1/)).toBeNull()
  })

  it('has no arrows for a single photo, even on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<PhotoGallery photos={photos.slice(0, 1)} />)

      expect(gallery()).toBeTruthy() // témoin
      expect(screen.queryByRole('button', { name: previous })).toBeNull()
      expect(screen.queryByRole('button', { name: next })).toBeNull()
    } finally {
      restore()
    }
  })

  it('glides from photo to photo, snapping on each', async () => {
    await renderWithProviders(<PhotoGallery photos={photos} />)

    const props = scrollViewProps()
    expect(
      props.pagingEnabled === true ||
        props.snapToInterval !== undefined ||
        props.snapToOffsets !== undefined,
    ).toBe(true)
  })

  it('follows the finger: « 2 sur 3 » and the page told, after a swipe', async () => {
    const onIndexChange = jest.fn()
    await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)

    await swipeTo(1)

    expect(screen.getByText(countOf(2, 3))).toBeTruthy()
    expect(onIndexChange).toHaveBeenLastCalledWith(1)
  })

  // ui-12 : un élément réglable, comme un curseur ; le lecteur d'écran lit sa valeur.
  describe('for screen readers', () => {
    it('is adjustable, named « Photos du projet », worth « Photo 1 sur 3 »', async () => {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      expect(['adjustable', 'slider']).toContain(roleOf(gallery().props))
      expect(valueTextOf(gallery().props)).toBe(photoOf(1, 3))
      const actions = (gallery().props.accessibilityActions ?? []) as { name: string }[]
      expect(actions.map((action) => action.name)).toEqual(
        expect.arrayContaining(['increment', 'decrement']),
      )
    })

    it('goes to the next photo without swiping: « Photo 2 sur 3 »', async () => {
      const onIndexChange = jest.fn()
      await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)

      await fireEvent(gallery(), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      })

      expect(valueTextOf(gallery().props)).toBe(photoOf(2, 3))
      expect(screen.getByText(countOf(2, 3))).toBeTruthy()
      expect(onIndexChange).toHaveBeenLastCalledWith(1)
    })

    it('comes back to the previous photo', async () => {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      await fireEvent(gallery(), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      })
      await fireEvent(gallery(), 'accessibilityAction', {
        nativeEvent: { actionName: 'decrement' },
      })

      expect(valueTextOf(gallery().props)).toBe(photoOf(1, 3))
    })

    it('stays on the first photo when asked to go back further', async () => {
      const onIndexChange = jest.fn()
      await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)

      await fireEvent(gallery(), 'accessibilityAction', {
        nativeEvent: { actionName: 'decrement' },
      })

      expect(valueTextOf(gallery().props)).toBe(photoOf(1, 3))
      expect(onIndexChange).not.toHaveBeenCalled()
    })

    it('stays on the last photo when asked to go further', async () => {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      for (let step = 0; step < 3; step += 1) {
        await fireEvent(gallery(), 'accessibilityAction', {
          nativeEvent: { actionName: 'increment' },
        })
      }

      expect(valueTextOf(gallery().props)).toBe(photoOf(3, 3))
    })
  })

  describe('on a phone', () => {
    it('has no arrows: the finger is enough', async () => {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      expect(screen.getByText(countOf(1, 3))).toBeTruthy() // témoin
      expect(screen.queryByRole('button', { name: previous })).toBeNull()
      expect(screen.queryByRole('button', { name: next })).toBeNull()
    })
  })

  describe('on a computer', () => {
    let restore: () => void = () => {}
    beforeEach(() => {
      restore = setDesktopWindow()
    })
    afterEach(() => restore())

    it('offers « Photo précédente » and « Photo suivante »', async () => {
      await renderWithProviders(<PhotoGallery photos={photos} />)

      expect(screen.getByRole('button', { name: previous })).toBeTruthy()
      expect(screen.getByRole('button', { name: next })).toBeTruthy()
    })

    it('shows the next photo when « Photo suivante » is touched', async () => {
      const onIndexChange = jest.fn()
      await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)

      await fireEvent.press(screen.getByRole('button', { name: next }))

      expect(screen.getByText(countOf(2, 3))).toBeTruthy()
      expect(onIndexChange).toHaveBeenLastCalledWith(1)
    })

    it('comes back with « Photo précédente »', async () => {
      const onIndexChange = jest.fn()
      await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)

      await fireEvent.press(screen.getByRole('button', { name: next }))
      await fireEvent.press(screen.getByRole('button', { name: previous }))

      expect(screen.getByText(countOf(1, 3))).toBeTruthy()
      expect(onIndexChange).toHaveBeenLastCalledWith(0)
    })

    describe('on the web, with the keyboard', () => {
      // Les écouteurs posés sur la page entière : il ne doit y en avoir aucun pour les touches.
      const listeners: unknown[][] = []
      beforeEach(() => {
        jest.replaceProperty(Platform, 'OS', 'web')
        listeners.length = 0
        for (const target of [globalThis, (globalThis as { document?: object }).document]) {
          const holder = target as { addEventListener?: (...args: unknown[]) => void } | undefined
          if (holder && typeof holder.addEventListener === 'function') {
            jest
              .spyOn(holder as Required<typeof holder>, 'addEventListener')
              .mockImplementation((...args: unknown[]) => {
                listeners.push(args)
              })
          }
        }
      })
      afterEach(() => jest.restoreAllMocks())

      it('can be reached with Tab', async () => {
        await renderWithProviders(<PhotoGallery photos={photos} />)

        const props = gallery().props
        expect(props.tabIndex === 0 || props.focusable === true).toBe(true)
      })

      it('shows the next photo on → while the focus is in the gallery', async () => {
        const onIndexChange = jest.fn()
        await renderWithProviders(<PhotoGallery photos={photos} onIndexChange={onIndexChange} />)

        const event = key('ArrowRight')
        await fireEvent(gallery(), 'keyDown', event)

        expect(screen.getByText(countOf(2, 3))).toBeTruthy()
        expect(onIndexChange).toHaveBeenLastCalledWith(1)
        // La page ne défile pas de côté en même temps.
        expect(event.preventDefault).toHaveBeenCalled()
      })

      it('comes back on ←', async () => {
        await renderWithProviders(<PhotoGallery photos={photos} />)

        await fireEvent(gallery(), 'keyDown', key('ArrowRight'))
        await fireEvent(gallery(), 'keyDown', key('ArrowLeft'))

        expect(screen.getByText(countOf(1, 3))).toBeTruthy()
      })

      // ui-12 : les flèches du clavier servent aussi à lire la page et à faire défiler ; la galerie
      // ne les prend que si le focus est chez elle (onKeyDown), jamais sur toute la page.
      it('listens to the arrow keys only from inside, never on the whole page', async () => {
        await renderWithProviders(<PhotoGallery photos={photos} />)

        expect(screen.getByText(countOf(1, 3))).toBeTruthy() // témoin
        const keyListeners = listeners.filter(
          ([type]) => typeof type === 'string' && /^key/.test(type),
        )
        expect(keyListeners).toHaveLength(0)
      })
    })
  })
})
