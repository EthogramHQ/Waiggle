// Tests des bords de l'avant / après (R7a, relecture de design C4) : à 0 %, l'étiquette « Avant » se
// posait sur la photo d'après (elle est fixe, en haut à gauche), et la poignée de 44 points sortait à
// moitié du cadre. Désormais : l'étiquette dont le côté est trop étroit se cache, et la poignée reste
// entière dans le cadre à 0 et à 100 %. Les positions réelles se mesurent dans le navigateur
// (`--explore`, essai « frise ») ; ici, ce que le composant décide.
import { layout } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { BeforeAfter } from './BeforeAfter'
import type { GalleryPhoto } from './PhotoGallery'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const before: GalleryPhoto = { key: 'a', source: { uri: 'https://example.test/a.webp' } }
const after: GalleryPhoto = { key: 'b', source: { uri: 'https://example.test/b.webp' } }
const BEFORE = fr.t(($) => $.project.updates.before)
const AFTER = fr.t(($) => $.project.updates.after)

type Host = { props: Record<string, unknown>; children: (Host | string)[] }

const slider = () => screen.getByRole('adjustable') as unknown as Host

/** La zone mesurée : 300 points de large. */
const measure = (width = 300) =>
  fireEvent(slider() as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 240 } },
  })

/** La poignée : le seul élément de 44 × 44 points du curseur ; sa place, en points depuis la gauche. */
const handleLeft = (): number | string => {
  const found: Record<string, unknown>[] = []
  const walk = (node: Host | string) => {
    if (typeof node === 'string') return
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    if (style.width === layout.touchTarget && style.height === layout.touchTarget) found.push(style)
    for (const child of node.children) walk(child)
  }
  walk(slider())
  const style = found[0]
  if (!style) throw new Error('no handle')
  const left = style.left as number | string
  return typeof left === 'number' ? left + Number(style.marginLeft ?? 0) : left
}

describe('BeforeAfter at its edges', () => {
  it('shows both labels with the line in the middle', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} />)
    await measure()

    expect(screen.getByText(BEFORE)).toBeTruthy()
    expect(screen.getByText(AFTER)).toBeTruthy()
  })

  it('hides « Avant » when the line is at 0 %, where it would sit on the after photo', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} initialValue={0} />)
    await measure()

    expect(screen.queryByText(BEFORE)).toBeNull()
    // Témoin : l'autre côté a toute la place.
    expect(screen.getByText(AFTER)).toBeTruthy()
  })

  it('hides « Après » when the line is at 100 %', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} initialValue={100} />)
    await measure()

    expect(screen.queryByText(AFTER)).toBeNull()
    expect(screen.getByText(BEFORE)).toBeTruthy()
  })

  it('keeps the whole handle inside the frame at 0 %', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} initialValue={0} />)
    await measure(300)

    expect(handleLeft()).toBe(0)
  })

  it('keeps the whole handle inside the frame at 100 %', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} initialValue={100} />)
    await measure(300)
    // Le bord droit de la poignée est le bord droit du cadre : sa gauche est à 300 − 44.
    expect(handleLeft()).toBe(300 - layout.touchTarget)
  })

  it('keeps the handle on the line in the middle', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} />)
    await measure(300)

    expect(handleLeft()).toBe(150 - layout.touchTarget / 2)
  })
})
