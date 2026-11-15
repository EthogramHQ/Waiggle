// Tests de l'alvéole d'une ruche (tranche R10, planches R10-Ruches, R10-Ruche, R10-Creer) : un
// hexagone miel où est posée l'icône choisie à la création (décision du 28/10). Les lecteurs d'écran
// lisent une seule image, nommée par la ruche (« Ruche Famille ») ; l'icône est un décor, jamais
// nommée ni par son sens ni par son code. Une ruche dont la modération a retiré le nom (`name` null)
// se lit « Ruche sans nom ». Trois tailles : 28 (« Tes ruches »), 44 (les lignes), 64 (le haut de
// la page d'une ruche).
//
// L'API (plan R10, « API au contrat ») :
//   HiveBadge({ icon: HiveIcon; name: string | null; size: 28 | 44 | 64 }).
import type { HiveIcon } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HiveBadge } from './HiveBadge'
import { iconPaths } from './icons.generated'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** « Ruche Famille », tel que le composant le tire des traductions. */
const badgeName = (hive: string) => fr.t(($) => $.hives.badge, { hive })
const UNNAMED = fr.t(($) => $.hives.unnamed)
/** Le sens d'une icône (« Maison »), que l'alvéole ne doit pas dire : elle est décorative. */
const meaning = (icon: HiveIcon) => fr.t(($) => $.hives.icons[icon])

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les éléments du rendu, de la racine aux feuilles. */
const everyNode = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : everyNode(child))),
]

/** L'icône est-elle dessinée ? On cherche son premier tracé (comme le test des onglets à icône). */
const draws = (icon: HiveIcon) =>
  everyNode(screen.root as unknown as Node).some((node) => node.props.d === iconPaths[icon][0])

/** Les images que les lecteurs d'écran annoncent (rôle `img` du web ou `image` du téléphone). */
// RNTL 14 ramène le rôle « image » à « img », sur l'élément comme dans la requête : la seule
// requête « img » trouve les deux, et les réunir comptait chaque image deux fois.
const images = () => screen.queryAllByRole('img')

/** La taille d'un élément : par son style, ou par ses props (un `<Svg width>`). */
const sizeOf = (node: ReturnType<typeof screen.getByRole>) => {
  const style = (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>
  return { width: style.width ?? node.props.width, height: style.height ?? node.props.height }
}

describe('HiveBadge', () => {
  it('is a single image named « Ruche Famille »', async () => {
    expect(badgeName('Famille')).toBe('Ruche Famille') // témoin des traductions
    await renderWithProviders(<HiveBadge icon="house-line" name="Famille" size={44} />)

    const found = images()
    expect(found).toHaveLength(1)
    const [badge] = found
    expect(badge?.props.accessibilityLabel ?? badge?.props['aria-label']).toBe('Ruche Famille')
  })

  it('reads « Ruche sans nom » when the moderation removed the name', async () => {
    expect(UNNAMED).toBe('Ruche sans nom')
    await renderWithProviders(<HiveBadge icon="heart" name={null} size={44} />)

    const [badge] = images()
    expect(badge?.props.accessibilityLabel ?? badge?.props['aria-label']).toBe(UNNAMED)
    // Jamais « Ruche null » ni un nom vide.
    expect(screen.queryByLabelText(/null/)).toBeNull()
  })

  it('draws the chosen icon, and only it', async () => {
    await renderWithProviders(<HiveBadge icon="leaf" name="Jardin" size={64} />)

    expect(draws('leaf')).toBe(true)
    expect(draws('house-line')).toBe(false)
  })

  it('keeps the icon decorative: neither its meaning nor its code is read', async () => {
    await renderWithProviders(<HiveBadge icon="house-line" name="Famille" size={44} />)

    expect(draws('house-line')).toBe(true) // témoin : l'icône est là
    expect(meaning('house-line')).toBe('Maison')
    for (const said of ['Maison', 'house-line']) {
      expect(screen.queryByLabelText(said)).toBeNull()
      expect(screen.queryByText(said)).toBeNull()
    }
  })

  // Un hexagone n'est pas carré : la taille donnée est sa plus grande dimension, l'autre est plus
  // petite ou égale (jamais plus grande : l'alvéole déborderait de la place prévue).
  it.each([28, 44, 64] as const)('fits in %i points', async (size) => {
    await renderWithProviders(<HiveBadge icon="coffee" name="Café du matin" size={size} />)

    const [badge] = images()
    expect(badge).toBeDefined()
    if (!badge) return
    const { width, height } = sizeOf(badge)
    expect(typeof width).toBe('number')
    expect(typeof height).toBe('number')
    expect(Math.max(Number(width), Number(height))).toBe(size)
  })
})
