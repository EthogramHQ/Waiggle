// Le compteur de « Retours réglés » sur le web (relecture d'interface R7b, A8) : « 2 sur 3 »
// portait sa phrase lue (« 2 retours cochés sur 3 ») par un nom posé sur un texte sans rôle, que le
// navigateur ne lit pas. La phrase est maintenant écrite à côté, cachée à l'œil, et « 2 sur 3 » est
// caché au lecteur d'écran (comme `OutcomePill`).
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SettledFeedbackField } from './SettledFeedbackField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const items = ['f1', 'f2', 'f3'].map((id) => ({
  id,
  label: `Retour ${id}`,
  detail: 'Le score repart à zéro, 2 nov.',
  former: false,
}))

type Node = { props: Record<string, unknown>; parent: Node | null }
const hiddenFromReaders = (node: Node | null): boolean =>
  node !== null && (node.props['aria-hidden'] === true || hiddenFromReaders(node.parent))

describe('SettledFeedbackField on the web', () => {
  it('writes the spoken count as text, and hides « 2 sur 3 » from screen readers', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <SettledFeedbackField items={items} value={['f1', 'f2']} onChange={() => {}} max={20} />,
      )

      const spoken = fr.t(($) => $.project.testers.settledField.countSpoken, {
        count: 2,
        total: 3,
      })
      // La phrase lue est un texte (le navigateur le lit), pas un nom posé sur un texte sans rôle.
      const phrase = screen.getByText(spoken)
      expect(hiddenFromReaders(phrase as unknown as Node)).toBe(false)
      const shown = screen.getByText(
        fr.t(($) => $.project.testers.settledField.count, { count: 2, total: 3 }),
        // Caché au lecteur d'écran : RNTL ne le trouve qu'avec les éléments cachés.
        { includeHiddenElements: true },
      )
      expect(hiddenFromReaders(shown as unknown as Node)).toBe(true)
      expect(shown.props.accessibilityLabel).toBeUndefined()
    } finally {
      os.restore()
    }
  })
})
