// Tests de la phrase d'erreur sous un groupe de choix (`FieldError`, R6b, correction U5) : une
// région `aria-live="polite"` toujours présente, vide sans message, que le groupe cite par son `id`
// dans `aria-describedby` ; avec un message, le texte se lit, et l'icône d'avertissement ne se lit
// pas en plus (elle redirait ce que dit la phrase).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FieldError } from './FieldError'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const MESSAGE = fr.t(($) => $.moderation.catalogue.familyRequired)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: (Host | string)[]; parent: Host | null }

/** La vue qui porte cet identifiant (`nativeID`), cherchée dans tout l'arbre rendu. */
const regionOf = (id: string): Host | null => {
  const walk = (node: Host | string): Host | null => {
    if (typeof node === 'string') return null
    if (node.props.nativeID === id) return node
    for (const child of node.children) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(screen.root as unknown as Host)
}

describe('FieldError', () => {
  it('reads its message in a polite live region carrying its id', async () => {
    await renderWithProviders(<FieldError id="family-error" message={MESSAGE} />)

    const text = screen.getByText(MESSAGE)
    let region = (text as unknown as Host).parent
    while (region && region.props['aria-live'] === undefined) region = region.parent
    expect(region?.props['aria-live']).toBe('polite')
    expect(region?.props.nativeID).toBe('family-error')
  })

  it('keeps the region, empty, without a message', async () => {
    await renderWithProviders(<FieldError id="family-error" message={undefined} />)

    const region = regionOf('family-error')
    expect(region).not.toBeNull()
    expect(region?.props['aria-live']).toBe('polite')
    expect(region?.children).toHaveLength(0)
    expect(screen.queryByText(MESSAGE)).toBeNull()
  })

  it('names nothing but its message: the warning icon is not read', async () => {
    await renderWithProviders(<FieldError id="family-error" message={MESSAGE} />)

    // Témoin : le message est là ; aucune image nommée ne s'y ajoute.
    expect(screen.getByText(MESSAGE)).toBeTruthy()
    expect(screen.queryAllByRole('image')).toHaveLength(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
