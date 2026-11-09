// Outil des tests « où le focus arrive à l'ouverture d'une fenêtre » (R6a, correction C8, H3).
//
// `Dialog` pose le focus de l'ouverture sur la vue de `initialFocusRef` : sur un téléphone, par
// `AccessibilityInfo.sendAccessibilityEvent(vue, 'focus')` (ui/focus.ts, `moveReaderTo`). Jest n'a
// pas de navigateur : on espionne cet appel, et on lit le nom de la vue qui le reçoit.
//
// À appeler avant d'ouvrir la fenêtre ; `jest.restoreAllMocks()` dans `afterEach` le défait.
import { AccessibilityInfo } from 'react-native'
import { labelOf } from './arrivedFocus'

/** Le nom (le texte) de la dernière vue qui a reçu le focus, `undefined` si aucune. */
export const watchOpeningFocus = (): (() => string | undefined) => {
  const spy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
  spy.mockClear()
  return () => labelOf(spy.mock.calls.at(-1)?.[0])
}
