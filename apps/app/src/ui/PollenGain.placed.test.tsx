// Tests de la pastille de gain posée près du geste (R19, relecture d'interface UI-1) : la capsule
// des réactions la pose au-dessus de la réaction qui l'a rapportée, l'éventail au-dessus de sa
// ligne, le composeur au-dessus de son bouton d'envoi, et `PollenGainSpot` à côté de n'importe quel
// bouton (le coin des testeurs, « Envoyer un retour »). Sans gain, rien ne s'ajoute.
//
// La pastille est dessinée mais cachée aux lecteurs d'écran (ui/PollenGain.tsx) : on la cherche
// donc parmi les éléments cachés (`includeHiddenElements`). Sa place à l'écran ne se mesure pas
// sous Jest : on vérifie à quelle réaction ou à quel bouton elle est rattachée.
import type { ReactionKind } from '@ruche/contracts'
import { screen, userEvent, within } from '@testing-library/react-native'
import { createRef } from 'react'
import { Text, type TextInput, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentComposer } from './CommentComposer'
import { PollenGainSpot } from './PollenGainSpot'
import { type CapsuleReaction, ReactionCapsule } from './ReactionCapsule'
import { ReactionFanPanel } from './ReactionFan'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** « +2 pollen », le texte de la pastille. */
const pastille = (amount: number) => fr.t(($) => $.game.gain, { amount })
const pastilles = (amount: number) =>
  screen.queryAllByText(pastille(amount), { includeHiddenElements: true })
const labelOf = (kind: ReactionKind, count: number) =>
  fr.t(($) => $.project.reactions.label, { name: fr.t(($) => $.project.reactions[kind]), count })

const reactions: CapsuleReaction[] = [
  { kind: 'amazing', count: 3, mine: false },
  { kind: 'useful', count: 5, mine: false },
  { kind: 'bravo', count: 2, mine: true },
]

type Node = { props: Record<string, unknown>; parent: Node | null }
/** La boîte `testID` la plus proche au-dessus d'un élément. */
const ownerOf = (node: Node | null): string | undefined => {
  let current = node
  while (current) {
    if (typeof current.props.testID === 'string') return current.props.testID
    current = current.parent
  }
  return undefined
}

describe('ReactionCapsule gain', () => {
  it('shows nothing without a gain', async () => {
    await renderWithProviders(<ReactionCapsule reactions={reactions} onToggle={jest.fn()} />)
    expect(pastilles(2)).toHaveLength(0)
  })

  it('shows the badge once a posed reaction earns pollen', async () => {
    const user = userEvent.setup()
    const view = await renderWithProviders(
      <ReactionCapsule reactions={reactions} onToggle={jest.fn()} />,
    )
    await user.press(screen.getByRole('button', { name: labelOf('useful', 5) }))
    await view.rerender(
      <ReactionCapsule
        reactions={reactions}
        onToggle={jest.fn()}
        gain={{ amount: 2, trigger: 1, kind: 'useful' }}
      />,
    )
    expect(pastilles(2)).toHaveLength(1)
  })

  it('places the badge on the reaction that earned it, not on another one', async () => {
    await renderWithProviders(
      <ReactionCapsule
        reactions={reactions}
        onToggle={jest.fn()}
        gain={{ amount: 2, trigger: 1, kind: 'amazing' }}
      />,
    )
    const [badge] = pastilles(2)
    expect(ownerOf(badge as unknown as Node)).toBe('pollen-gain-amazing')
  })

  it('falls back to the reaction last posed in the capsule when the gain names none', async () => {
    const user = userEvent.setup()
    const view = await renderWithProviders(
      <ReactionCapsule reactions={reactions} onToggle={jest.fn()} />,
    )
    await user.press(screen.getByRole('button', { name: labelOf('amazing', 3) }))
    await view.rerender(
      <ReactionCapsule
        reactions={reactions}
        onToggle={jest.fn()}
        gain={{ amount: 3, trigger: 1 }}
      />,
    )
    const [badge] = pastilles(3)
    expect(ownerOf(badge as unknown as Node)).toBe('pollen-gain-amazing')
  })
})

describe('ReactionFanPanel gain', () => {
  it('shows the badge above the row of the reaction that earned it', async () => {
    await renderWithProviders(
      <ReactionFanPanel
        reactions={reactions}
        help={false}
        onToggle={jest.fn()}
        onUnderstood={jest.fn()}
        gain={{ amount: 2, trigger: 1, kind: 'bravo' }}
      />,
    )
    const [badge] = pastilles(2)
    expect(ownerOf(badge as unknown as Node)).toBe('pollen-gain-bravo')
  })

  it('shows nothing without a gain', async () => {
    await renderWithProviders(
      <ReactionFanPanel
        reactions={reactions}
        help={false}
        onToggle={jest.fn()}
        onUnderstood={jest.fn()}
      />,
    )
    expect(pastilles(2)).toHaveLength(0)
  })
})

describe('CommentComposer gain', () => {
  const composer = (gain?: { amount: number; trigger: number }) => (
    <CommentComposer
      value="Merci !"
      onChangeText={jest.fn()}
      onSend={jest.fn()}
      pending={false}
      banner={null}
      onCancelBanner={jest.fn()}
      caption="Visible par tous"
      memberName="Sam Petit"
      place="column"
      suggestions={[]}
      suggestionsFor={null}
      onQueryChange={jest.fn()}
      inputRef={createRef<TextInput>()}
      {...(gain ? { gain } : null)}
    />
  )

  it('shows the badge with the send button, which stays where it was', async () => {
    await renderWithProviders(composer({ amount: 4, trigger: 1 }))
    expect(pastilles(4)).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Envoyer/ })).toBeOnTheScreen()
  })

  it('shows nothing without a gain', async () => {
    await renderWithProviders(composer())
    expect(pastilles(4)).toHaveLength(0)
  })
})

describe('PollenGainSpot', () => {
  it('shows the badge next to the control it wraps', async () => {
    await renderWithProviders(
      <View testID="spot-parent">
        <PollenGainSpot gain={{ amount: 5, trigger: 1 }} placement="end">
          <Text>Le coin des testeurs</Text>
        </PollenGainSpot>
      </View>,
    )
    expect(pastilles(5)).toHaveLength(1)
    // Le contrôle enveloppé reste là, et la pastille est dans la même boîte que lui.
    const spot = screen.getByTestId('pollen-gain-spot')
    expect(within(spot).getByText('Le coin des testeurs')).toBeOnTheScreen()
    expect(
      within(spot).getAllByText(pastille(5), { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0)
  })

  it('shows only the control without a gain', async () => {
    await renderWithProviders(
      <PollenGainSpot gain={null} placement="above">
        <Text>Envoyer un retour</Text>
      </PollenGainSpot>,
    )
    expect(screen.getByText('Envoyer un retour')).toBeOnTheScreen()
    expect(pastilles(5)).toHaveLength(0)
  })
})
