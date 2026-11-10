// Tests de la pastille d'une famille de mise à jour (R7a, scénario « Publier une mise à jour ») :
// une pastille ronde avec son icône, « Nouveau » (étincelle, ambre), « Réparé » (clé, vert),
// « Plus joli » (palette, encre discrète). Elle est décorative : le nom de la famille est un texte
// posé à côté par le composant parent (la ligne de la feuille, de la frise ou de la carte), qui la
// fait lire « Nouveau : … » (décision, interface B4). Lue seule, elle ne dirait que
// sa couleur : elle reste donc cachée aux lecteurs d'écran.
//
// L'interface attendue de `src/ui/UpdateFamilyBadge.tsx` (plan R7a, « Appli ») :
// `UpdateFamilyBadge({ family: UpdateFamily; size?: 'small' | 'regular' })`, couleurs lues dans les
// rôles `family<New|Fixed|Polish><Surface|Icon>` de `packages/brand` (colors.test.ts).
import { palettes } from '@ruche/brand'
import type { UpdateFamily } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { UpdateFamilyBadge } from './UpdateFamilyBadge'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

const families: UpdateFamily[] = ['new', 'fixed', 'polish']
/** Le nom des rôles de couleur d'une famille : `familyNew…`, `familyFixed…`, `familyPolish…`. */
const roleName = { new: 'New', fixed: 'Fixed', polish: 'Polish' } as const
/** L'icône de chaque famille (scénario : étincelle, clé, palette). */
const iconOf = { new: 'sparkle', fixed: 'wrench', polish: 'palette' } as const

/** Tous les éléments dessinés sous `node`, lui compris. */
const allNodes = (node: Node | string, found: Node[] = []): Node[] => {
  if (typeof node === 'string') return found
  found.push(node)
  for (const child of node.children) allNodes(child, found)
  return found
}

/** Les couleurs de fond posées dans ce qui est dessiné (la pastille et ce qui l'entoure). */
const backgrounds = () =>
  allNodes(screen.root as unknown as Node).map(
    (node) => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.backgroundColor,
  )
/** Les couleurs de remplissage des dessins (l'icône est un SVG rempli d'une couleur). */
const fills = () => allNodes(screen.root as unknown as Node).map((node) => node.props.fill)

/** Le chemin de dessin de l'icône d'une famille, tel que le composant `Icon` le pose. */
const iconPaths = (): string[] =>
  allNodes(screen.root as unknown as Node)
    .map((node) => node.props.d)
    .filter((d): d is string => typeof d === 'string')

describe('UpdateFamilyBadge', () => {
  it.each(families)(
    'stays hidden from screen readers, its name told by its parent (%s)',
    async (family) => {
      await renderWithProviders(<UpdateFamilyBadge family={family} />)

      // Rien à lire : ni image nommée, ni nom de famille écrit par la pastille elle-même.
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.queryByRole('image')).toBeNull()
      expect(screen.queryByText(fr.t(($) => $.update.family[family]))).toBeNull()
      expect(screen.queryByLabelText(fr.t(($) => $.update.family[family]))).toBeNull()
      // Et elle est décorative : son icône est dessinée, mais rien en elle ne porte un nom ni ne
      // se déclare élément à visiter pour le lecteur d'écran.
      expect(iconPaths().length).toBeGreaterThan(0)
      const named = allNodes(screen.root as unknown as Node).filter(
        (node) =>
          node.props.accessible === true ||
          typeof node.props.accessibilityLabel === 'string' ||
          typeof node.props['aria-label'] === 'string',
      )
      expect(named).toEqual([])
    },
  )

  // Scénario : « Nouveau » (ambre), « Réparé » (vert), « Plus joli » (encre discrète), de jour.
  it.each(families)('paints its own surface and icon colors by day (%s)', async (family) => {
    await renderWithProviders(<UpdateFamilyBadge family={family} />, 'fr', 'day')

    const day = palettes.day as Record<string, string | undefined>
    const surface = day[`family${roleName[family]}Surface`]
    const icon = day[`family${roleName[family]}Icon`]
    expect(surface).toEqual(expect.any(String))
    expect(icon).toEqual(expect.any(String))
    expect(backgrounds()).toContain(surface)
    expect(fills()).toContain(icon)
  })

  it.each(families)('takes the night colors at night (%s)', async (family) => {
    await renderWithProviders(<UpdateFamilyBadge family={family} />, 'fr', 'night')

    const night = palettes.night as Record<string, string | undefined>
    const surface = night[`family${roleName[family]}Surface`]
    expect(surface).toEqual(expect.any(String))
    expect(backgrounds()).toContain(surface)
  })

  // Scénario : l'étincelle, la clé, la palette. Le dessin de chaque icône vient d'`icons.generated`.
  it.each(families)('draws the icon of its family (%s)', async (family) => {
    const { iconPaths: generated } = jest.requireActual<{
      iconPaths: Record<string, string[] | undefined>
    }>('./icons.generated')
    const expected = generated[iconOf[family]]
    expect(expected).toEqual(expect.any(Array))

    await renderWithProviders(<UpdateFamilyBadge family={family} />)

    expect(iconPaths()).toEqual(expect.arrayContaining(expected ?? ['(no such icon)']))
  })

  it('draws three different badges for the three families', async () => {
    const { rerender } = await renderWithProviders(<UpdateFamilyBadge family="new" />)
    const drawn: string[] = [iconPaths().join('|')]
    await rerender(<UpdateFamilyBadge family="fixed" />)
    drawn.push(iconPaths().join('|'))
    await rerender(<UpdateFamilyBadge family="polish" />)
    drawn.push(iconPaths().join('|'))

    expect(drawn.every((paths) => paths.length > 0)).toBe(true)
    expect(new Set(drawn).size).toBe(3)
  })

  it('comes in a small size, smaller than the regular one', async () => {
    /** La plus grande largeur en points posée dans ce qui est dessiné (pastille ou icône). */
    const widest = () =>
      Math.max(
        ...allNodes(screen.root as unknown as Node).map((node) => {
          const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
          const sizes = [style?.width, style?.minWidth, style?.height, node.props.width]
          return Math.max(0, ...sizes.map((size) => (typeof size === 'number' ? size : 0)))
        }),
      )
    const { rerender } = await renderWithProviders(<UpdateFamilyBadge family="new" />)
    const regular = widest()
    await rerender(<UpdateFamilyBadge family="new" size="small" />)

    expect(regular).toBeGreaterThan(0)
    expect(widest()).toBeLessThan(regular)
  })
})
