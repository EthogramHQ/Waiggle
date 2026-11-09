// Tests de la ligne de la catégorie d'un projet (R6a, scénario « La catégorie sur les cartes et la
// page ») : l'icône de la principale puis un seul texte (« Cuisine · Famille et enfants »), lu tel
// quel ; l'icône est un décor, cachée aux lecteurs d'écran ; la ligne rétrécit dans une colonne
// étroite au lieu d'en sortir.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CategoryLine } from './CategoryLine'
import { iconPaths } from './icons.generated'

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Ce qui est dessiné, dans l'ordre : une icône reconnue à son tracé, le texte sinon. */
const drawnOrder = (node: Host | string): string[] => {
  if (typeof node === 'string') return [node]
  const d = node.props.d
  if (typeof d === 'string') {
    const icon = Object.entries(iconPaths).find(([, paths]) => paths[0] === d)?.[0]
    return icon ? [`icône ${icon}`] : []
  }
  return node.children.flatMap(drawnOrder)
}

/** Tout ce qu'un lecteur d'écran peut lire : textes et noms, hors des parties qui lui sont cachées. */
const spoken = (node: Host | string): string[] => {
  if (typeof node === 'string') return [node]
  const props = node.props
  if (props.accessibilityElementsHidden === true || props['aria-hidden'] === true) return []
  const named = typeof props.accessibilityLabel === 'string' ? [props.accessibilityLabel] : []
  return [...named, ...node.children.flatMap(spoken)]
}

const both = fr.t(($) => $.project.page.categories, {
  primary: fr.t(($) => $.project.category.cooking),
  secondary: fr.t(($) => $.project.category.family),
})

describe('CategoryLine', () => {
  it('shows the two categories as one text, after the icon of the primary', async () => {
    await renderWithProviders(<CategoryLine label={both} icon="cooking-pot" />)

    expect(screen.getByText(both)).toBeTruthy()
    expect(drawnOrder(screen.root as unknown as Host)).toEqual(['icône cooking-pot', both])
  })

  it('hides the icon from screen readers: only the text is read', async () => {
    await renderWithProviders(<CategoryLine label={both} icon="cooking-pot" />)

    expect(spoken(screen.root as unknown as Host)).toEqual([both])
  })

  it('reads a label as written, markup included', async () => {
    const raw = '**Cuisine** <b>{{appName}}</b>'
    await renderWithProviders(<CategoryLine label={raw} icon="cooking-pot" />)

    expect(screen.getByText(raw)).toBeTruthy()
  })

  // La règle, pas la valeur : sur le web, une rangée ne rétrécit que bornée à sa colonne
  // (`maxWidth: '100%'`) et autorisée à rétrécir (`flexShrink`), sinon elle sort à 320 points.
  it('may shrink inside a narrow column instead of leaving it', async () => {
    await renderWithProviders(<CategoryLine label={both} icon="cooking-pot" />)

    // La rangée : le premier élément rangé en ligne (celui qui porte l'icône et le texte).
    const findRow = (node: Host | string): Record<string, unknown> | null => {
      if (typeof node === 'string') return null
      const style = node.props.style as Record<string, unknown> | undefined
      if (style?.flexDirection === 'row') return style
      for (const child of node.children) {
        const found = findRow(child)
        if (found) return found
      }
      return null
    }
    const row = findRow(screen.root as unknown as Host)
    if (!row) throw new Error('no row rendered')
    expect(row.maxWidth).toBe('100%')
    expect(row.flexShrink).toBeGreaterThan(0)
  })
})
