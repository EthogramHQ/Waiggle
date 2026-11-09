// Tests de la pastille « Tester ↗ » seulement dessinée (`TestLink` sans `onPress`, R6a, design-C5) :
// l'aperçu de la carte dans la feuille de publication la montre comme sur la carte publiée, mais
// rien n'y est atteignable : ni lien, ni arrêt de Tab, ni nom lu.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TestLink } from './TestLink'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const shown = fr.t(($) => $.explore.test)

/** Un nœud de l'arbre rendu, le peu qu'on en lit. */
type Node = { props: Record<string, unknown>; parent: Node | null }

describe('TestLink, drawn only', () => {
  it('draws the pill without any link, hidden from screen readers', async () => {
    await renderWithProviders(<TestLink title="Carnet de cafés" size="compact" />)

    expect(screen.queryByRole('link')).toBeNull()
    const label = screen.getByText(shown, { includeHiddenElements: true }) as unknown as Node
    // Le texte est caché aux lecteurs d'écran (un aperçu ne fait que répéter la carte).
    expect(screen.queryByText(shown)).toBeNull()
    // Le cadre garde la hauteur d'une zone à toucher : la pastille tient la même place que la vraie.
    let frame: Node | null = label.parent
    while (frame && frame.props['aria-hidden'] !== true) frame = frame.parent
    expect(frame).not.toBeNull()
    const style = StyleSheet.flatten(frame?.props.style as object) as Record<string, unknown>
    expect(style.minHeight).toBe(layout.touchTarget)
    expect(frame?.props.pointerEvents).toBe('none')
  })

  it('stays a link when it can open the demo (témoin)', async () => {
    await renderWithProviders(
      <TestLink title="Carnet de cafés" size="compact" onPress={() => {}} />,
    )

    expect(screen.getByRole('link')).toBeTruthy()
  })
})
