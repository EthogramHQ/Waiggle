// Tests de l'icône d'un bouton après son libellé (R5a, `iconAfter` : « Ouvrir le site ↗ ») : elle
// passe après le texte, le nom lu du bouton ne change pas, et sans `iconAfter` elle reste avant.
// Puis (R6a) le bouton inactif qui reste atteignable (`focusableWhenDisabled`).
// Les autres états du bouton sont vus dans components.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Le contenu du bouton dans l'ordre où il est dessiné : « icône » pour le dessin, le texte sinon. */
const drawnOrder = (node: Node | string): string[] => {
  if (typeof node === 'string') return [node]
  // Le dessin (react-native-svg) est caché aux lecteurs d'écran : c'est ce qui le distingue.
  if (node.props['aria-hidden'] === true) return ['icône']
  return node.children.flatMap(drawnOrder)
}

describe('Button icon', () => {
  it('draws the icon after the label with iconAfter, the spoken name unchanged', async () => {
    await renderWithProviders(
      <Button label="Ouvrir le site" icon="arrow-up-right" iconAfter onPress={() => {}} />,
    )

    const button = screen.getByRole('button', { name: 'Ouvrir le site' })
    expect(drawnOrder(button as unknown as Node)).toEqual(['Ouvrir le site', 'icône'])
  })

  it('keeps the icon before the label by default', async () => {
    await renderWithProviders(
      <Button label="Ouvrir le site" icon="arrow-up-right" onPress={() => {}} />,
    )

    const button = screen.getByRole('button', { name: 'Ouvrir le site' })
    expect(drawnOrder(button as unknown as Node)).toEqual(['icône', 'Ouvrir le site'])
  })
})

// R6a (scénario « Modifier » ; relecture du plan ui-B5) : « Enregistrer » est grisé tant que
// rien n'a changé, avec « Rien à enregistrer pour l'instant. ». Un bouton `disabled` ordinaire sort
// du parcours au clavier sur le web (react-native-web lui donne tabIndex -1) : on ne pourrait ni
// l'atteindre, ni entendre pourquoi il ne répond pas. Avec `focusableWhenDisabled`, il reste un arrêt
// de Tab, annoncé « désactivé » (`aria-disabled`), décrit par sa raison (`describedById` sur le web,
// `hint` sur téléphone), et un appui ne fait rien.
describe('Button focusableWhenDisabled (R6a)', () => {
  const SAVE = fr.t(($) => $.project.form.save)
  const REASON = fr.t(($) => $.project.form.unchanged)
  const REASON_ID = 'save-reason'

  const inactiveSave = (onPress: () => void) => (
    <Button
      label={SAVE}
      onPress={onPress}
      disabled
      focusableWhenDisabled
      describedById={REASON_ID}
      hint={REASON}
    />
  )

  describe('on the web', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
    })
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('stays in the Tab order, announced as disabled', async () => {
      await renderWithProviders(inactiveSave(() => {}))

      const button = screen.getByRole('button', { name: SAVE })
      // « désactivé » pour les lecteurs d'écran (`aria-disabled`, que Pressable traduit en état).
      expect(button).toBeDisabled()
      // react-native-web donnerait tabIndex -1 à un bouton `disabled` : le focus le sauterait.
      expect(button.props.tabIndex).toBe(0)
    })

    it('is described by its reason', async () => {
      await renderWithProviders(inactiveSave(() => {}))

      expect(screen.getByRole('button', { name: SAVE }).props['aria-describedby']).toBe(REASON_ID)
    })

    it('does nothing when pressed, nor with Enter or the space bar', async () => {
      const onPress = jest.fn()
      await renderWithProviders(inactiveSave(onPress))
      const button = screen.getByRole('button', { name: SAVE })

      await fireEvent.press(button)
      for (const key of ['Enter', ' ']) {
        await fireEvent(button, 'keyDown', { key, repeat: false, preventDefault: () => {} })
      }

      expect(onPress).not.toHaveBeenCalled()
    })

    it('leaves a plain disabled button out of the Tab order, as before (witness)', async () => {
      await renderWithProviders(<Button label={SAVE} onPress={() => {}} disabled />)

      expect(screen.getByRole('button', { name: SAVE }).props.tabIndex).not.toBe(0)
    })

    it('becomes an ordinary button again once enabled', async () => {
      const onPress = jest.fn()
      await renderWithProviders(
        <Button label={SAVE} onPress={onPress} focusableWhenDisabled describedById={REASON_ID} />,
      )

      const button = screen.getByRole('button', { name: SAVE })
      expect(button).not.toBeDisabled()
      await fireEvent.press(button)
      expect(onPress).toHaveBeenCalledTimes(1)
    })
  })

  describe('on a phone', () => {
    // Témoin : sur téléphone, il n'y a pas de Tab à garder ; le bouton reste ce qu'il était.
    it('reads its reason after its name, announced as disabled, and ignores a press (witness)', async () => {
      const onPress = jest.fn()
      await renderWithProviders(inactiveSave(onPress))

      const button = screen.getByRole('button', { name: SAVE })
      expect(button).toBeDisabled()
      expect(button.props.accessibilityHint).toBe(REASON)
      await fireEvent.press(button)
      expect(onPress).not.toHaveBeenCalled()
    })
  })
})
