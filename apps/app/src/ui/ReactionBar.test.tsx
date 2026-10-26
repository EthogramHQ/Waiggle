// Tests de la barre des réactions pour un compte suspendu (tranche 7c) : les réactions verrouillées
// montrent leur nombre, celle qu'il a donnée garde son bouton pour la retirer. Les autres états de
// la barre sont testés dans components.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
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
})
