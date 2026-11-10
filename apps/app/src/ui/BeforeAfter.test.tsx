// Tests de l'avant / après d'une mise à jour (R7a, scénario « L'avant / après », F-Pr7) : deux photos
// superposées, l'« Avant » à gauche et l'« Après » à droite d'un trait, avec une poignée ronde au
// milieu. Pour un lecteur d'écran, la poignée est un curseur « Comparer avant et après », sa valeur
// en pour cent ; au clavier, les flèches la déplacent de 10 %, Début et Fin vont aux bords. Chaque
// photo garde sa description. Rien ne bouge sans le membre.
//
// L'interface attendue de `src/ui/BeforeAfter.tsx` (plan R7a, « Appli ») :
// `BeforeAfter({ before: GalleryPhoto; after: GalleryPhoto; height?; label? })`, rôle `adjustable`
// sur téléphone ou `slider` sur le web, valeur de 0 à 100, 50 au départ.
//
// Ce que Jest ne prouve pas, à vérifier dans le navigateur (essai --explore de U2) : le trait qui
// suit le doigt ou le pointeur, la tape sur l'image qui place le trait, le glisser seulement
// horizontal (la page défile encore sur une grande photo), et `preventDefault` sur les seules
// touches du curseur.
import { layout } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { BeforeAfter } from './BeforeAfter'
import type { GalleryPhoto } from './PhotoGallery'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Les deux photos du « décompte de la fusée », comme la page les donne à la galerie. */
const [day, night] = rocketUpdate.photos.map(
  (visual): GalleryPhoto => ({
    key: visual.id,
    source: { uri: visual.url },
    thumbhash: visual.thumbhash,
    description: visual.description,
  }),
) as [GalleryPhoto, GalleryPhoto]

const compare = fr.t(($) => $.project.updates.compare)
/** La valeur lue du curseur : « 50 % » (avec l'espace de la typographie française). */
const percent = (value: number) => fr.t(($) => $.project.updates.compareValue, { value })

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** Le curseur : le seul élément réglable de l'avant / après. */
const slider = () => {
  const found = [
    ...screen.queryAllByRole('adjustable'),
    ...screen.queryAllByRole('slider'),
  ] as unknown as Node[]
  expect(found).toHaveLength(1)
  return found[0] as Node
}

/** La valeur du curseur et ses bornes : `accessibilityValue`, ou `aria-value*` (web). */
const sliderValue = () => {
  const { props } = slider()
  const native = props.accessibilityValue as
    | { min?: number; max?: number; now?: number; text?: string }
    | undefined
  return {
    min: Number(native?.min ?? props['aria-valuemin']),
    max: Number(native?.max ?? props['aria-valuemax']),
    now: Number(native?.now ?? props['aria-valuenow']),
    text: native?.text ?? props['aria-valuetext'],
  }
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({
  key: name,
  shiftKey: false,
  repeat: false,
  preventDefault: jest.fn(),
})
const press = (name: string) => fireEvent(slider() as never, 'keyDown', key(name))
/** Le geste d'un lecteur d'écran sur un élément réglable (glisser vers le haut ou le bas). */
const adjust = (actionName: 'increment' | 'decrement') =>
  fireEvent(slider() as never, 'accessibilityAction', { nativeEvent: { actionName } })

/** Tous les éléments dessinés sous `node`, lui compris. */
const allNodes = (node: Node | string, found: Node[] = []): Node[] => {
  if (typeof node === 'string') return found
  found.push(node)
  for (const child of node.children) allNodes(child, found)
  return found
}

/** La zone qu'on peut toucher d'un élément : sa taille (ou sa taille minimale), plus son débord. */
const touchBox = (node: Node) => {
  const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
  const size = (exact: unknown, min: unknown) =>
    Math.max(typeof exact === 'number' ? exact : 0, typeof min === 'number' ? min : 0)
  const slop = node.props.hitSlop
  const around = (side: 'top' | 'bottom' | 'left' | 'right') =>
    typeof slop === 'number'
      ? slop
      : slop && typeof slop === 'object'
        ? Number((slop as Record<string, unknown>)[side] ?? 0)
        : 0
  return {
    width: size(style.width, style.minWidth) + around('left') + around('right'),
    height: size(style.height, style.minHeight) + around('top') + around('bottom'),
  }
}

describe('BeforeAfter', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  // Relecture du plan, interface A2 : `it('names the slider « Comparer avant et après » and reads
  // its value in percent')`.
  it('names the slider « Comparer avant et après » and reads its value in percent', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    expect(['adjustable', 'slider']).toContain(roleOf(slider().props))
    expect(
      screen.queryByRole('adjustable', { name: compare }) ??
        screen.getByRole('slider', { name: compare }),
    ).toBeTruthy()
    expect(sliderValue()).toEqual({ min: 0, max: 100, now: 50, text: percent(50) })
  })

  it('is a slider on the web, its value read in percent', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<BeforeAfter before={day} after={night} />)

      expect(roleOf(slider().props)).toBe('slider')
      expect(slider().props['aria-valuetext']).toBe(percent(50))
      expect(slider().props['aria-valuemin']).toBe(0)
      expect(slider().props['aria-valuemax']).toBe(100)
    } finally {
      restore.restore()
    }
  })

  // Relecture du plan, interface A2 : `it('moves by 10 % with the arrow keys and to the edges with
  // Home and End')` → `aria-valuenow` 60, 50, 0, 100.
  it('moves by 10 % with the arrow keys and to the edges with Home and End', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    await press('ArrowRight')
    expect(sliderValue().now).toBe(60)
    expect(sliderValue().text).toBe(percent(60))
    await press('ArrowLeft')
    expect(sliderValue().now).toBe(50)
    await press('Home')
    expect(sliderValue().now).toBe(0)
    await press('End')
    expect(sliderValue().now).toBe(100)
  })

  it('moves by 10 % with the up and down arrows too', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    await press('ArrowUp')
    expect(sliderValue().now).toBe(60)
    await press('ArrowDown')
    await press('ArrowDown')
    expect(sliderValue().now).toBe(40)
  })

  it('never goes beyond 0 or 100', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    await press('End')
    await press('ArrowRight')
    expect(sliderValue().now).toBe(100)
    await press('Home')
    await press('ArrowLeft')
    expect(sliderValue().now).toBe(0)
  })

  // Sur téléphone, le lecteur d'écran règle le curseur d'un glissé vers le haut ou le bas.
  it('moves by 10 % with the gestures of a screen reader', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    const actions = (slider().props.accessibilityActions ?? []) as { name: string }[]
    expect(actions.map((action) => action.name)).toEqual(
      expect.arrayContaining(['increment', 'decrement']),
    )
    await adjust('increment')
    expect(sliderValue().now).toBe(60)
    await adjust('decrement')
    await adjust('decrement')
    expect(sliderValue().now).toBe(40)
  })

  // Relecture du plan, interface A2 : `it('keeps the description of each photo for screen
  // readers')` → `getByLabelText('Avant : La fusée de jour')`.
  it('keeps the description of each photo for screen readers', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    expect(
      screen.getByLabelText(
        fr.t(($) => $.project.updates.beforeDescribed, { description: 'La fusée de jour' }),
      ),
    ).toBeTruthy()
    expect(
      screen.getByLabelText(
        fr.t(($) => $.project.updates.afterDescribed, { description: 'La fusée de nuit' }),
      ),
    ).toBeTruthy()
  })

  // Une photo sans description reste nommée par sa place (relecture du plan, interface A8).
  it('names a photo without a description « Avant » or « Après »', async () => {
    await renderWithProviders(
      <BeforeAfter before={{ ...day, description: null }} after={{ ...night, description: '' }} />,
    )

    // Au moins un élément nommé « Avant » (la photo ; l'étiquette de verre peut l'être aussi), et
    // aucun nom qui laisse une description vide (« Avant :  »).
    const before = fr.t(($) => $.project.updates.before)
    const after = fr.t(($) => $.project.updates.after)
    expect(screen.getAllByLabelText(before, { exact: true }).length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText(after, { exact: true }).length).toBeGreaterThan(0)
    expect(screen.queryAllByLabelText(/^(Avant|Après)\s*:/)).toHaveLength(0)
  })

  // Scénario : « avec les étiquettes « Avant » et « Après » en verre ».
  it('labels the two sides « Avant » and « Après »', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    expect(screen.getByText(fr.t(($) => $.project.updates.before))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.updates.after))).toBeTruthy()
  })

  // Relecture du plan, interface A2 : `it('gives the handle a 44-point touch area')`.
  it('gives the handle a 44-point touch area', async () => {
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    // La poignée est dans le curseur (ou est le curseur) : au moins un élément de 44 × 44 points.
    const boxes = allNodes(slider()).map(touchBox)
    expect(
      boxes.some((box) => box.width >= layout.touchTarget && box.height >= layout.touchTarget),
    ).toBe(true)
  })

  // Relecture du plan, interface A2 : `it('does not move on its own')` → valeur à 50 après 5 s.
  it('does not move on its own', async () => {
    jest.useFakeTimers()
    await renderWithProviders(<BeforeAfter before={day} after={night} />)

    await act(async () => {
      jest.advanceTimersByTime(5000)
    })

    expect(sliderValue().now).toBe(50)
  })
})
