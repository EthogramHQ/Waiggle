// Tests de la barre des réactions pour un compte suspendu (tranche 7c) : les réactions verrouillées
// montrent leur nombre, celle qu'il a donnée garde son bouton pour la retirer. Les autres états de
// la barre sont testés dans components.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ReactionBar, type ReactionBarItem } from './ReactionBar'

const items: ReactionBarItem[] = [
  { kind: 'amazing', text: 'Bluffant', count: 0, mine: false, label: 'Bluffant, 0', locked: true },
  { kind: 'useful', text: 'Utile', count: 5, mine: false, label: 'Utile, 5', locked: true },
  { kind: 'bravo', text: 'Bravo', count: 3, mine: true, label: 'Bravo, réagi, 3' },
]

describe('ReactionBar with locked reactions', () => {
  it('keeps a button only for the reaction given, to take it back', async () => {
    const onToggle = jest.fn()
    await renderWithProviders(<ReactionBar items={items} onToggle={onToggle} label="Réagir" />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
    // Les nombres des autres restent lisibles, chacun un élément de la liste.
    expect(screen.getByLabelText('Utile, 5')).toBeTruthy()
    // (L'élément qui entoure le bouton n'est pas `accessible`, pour que le bouton reste atteignable
    // sur iOS : RNTL ne le trouve donc pas par son rôle ; seuls les deux nombres comptent ici.)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await fireEvent.press(screen.getByRole('button', { name: 'Bravo, réagi, 3' }))
    expect(onToggle).toHaveBeenCalledWith('bravo')
  })

  // Une réaction retirée pendant la visite : sa pastille reste à sa place (le focus aussi, la
  // rangée ne bouge pas sous le doigt), mais inactive. La remettre serait refusé par l'API.
  it('keeps the reaction just taken back in place, inactive, and sends nothing', async () => {
    const onToggle = jest.fn()
    const takenBack: ReactionBarItem[] = [
      items[0] as ReactionBarItem,
      { kind: 'bravo', text: 'Bravo', count: 2, mine: false, label: 'Bravo, 2', disabled: true },
    ]
    await renderWithProviders(<ReactionBar items={takenBack} onToggle={onToggle} label="Réagir" />)

    const chip = screen.getByRole('button', { name: 'Bravo, 2' })
    expect(chip).toBeDisabled()
    await fireEvent.press(chip)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('announces the inactive reaction to screen readers on the web, and keeps it focusable', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const takenBack: ReactionBarItem[] = [
        { kind: 'bravo', text: 'Bravo', count: 2, mine: false, label: 'Bravo, 2', disabled: true },
      ]
      await renderWithProviders(<ReactionBar items={takenBack} onToggle={jest.fn()} label="R" />)

      const chip = screen.getByRole('button', { name: 'Bravo, 2' })
      // aria-disabled (React Native le range dans l'état lu par les lecteurs d'écran).
      expect(chip).toBeDisabled()
      // Toujours atteignable au clavier : le focus ne se perd pas quand la réaction est retirée.
      expect(chip.props.focusable).not.toBe(false)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
