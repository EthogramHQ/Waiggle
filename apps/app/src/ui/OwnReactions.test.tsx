// Tests du bloc « Les réactions à ton projet » (R5a, planche `R5a-Auteur`) : l'auteur ne réagit pas
// à son propre projet ; à la place de la capsule, il lit chaque réaction avec son icône, son nom et
// son nombre, « 0 » compris, et la légende « Des nombres seulement : l'appli ne montre à personne
// qui a réagi. » (jur-2). Tant que tout est à zéro, une seule phrase : « Pas encore de réaction »
// (jur-14, décision de Louis du 1/11). Il remplace la `ReactionBar` en lecture seule, y compris pour
// un membre suspendu qui n'a aucune réaction à retirer (ui-3 : même rendu qu'aujourd'hui, légende
// « Les réactions à ce projet »).
import type { ReactionKind } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { OwnReactions } from './OwnReactions'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const kinds: ReactionKind[] = ['amazing', 'inspiring', 'useful', 'funny', 'bravo']

/** Le nom affiché d'une réaction (« Waggle ! » pour `bravo`). */
const nameOf = (kind: ReactionKind) => fr.t(($) => $.project.reactions[kind])
/** Le nom lu d'une pastille (« Bluffant, 0 »), le même que celui de la ReactionBar en lecture seule. */
const labelOf = (kind: ReactionKind, count: number) =>
  fr.t(($) => $.project.reactions.label, { name: nameOf(kind), count })

const title = fr.t(($) => $.project.reactions.own)
const caption = fr.t(($) => $.project.reactions.ownCaption)
const none = fr.t(($) => $.project.reactions.ownNone)
const readOnlyTitle = fr.t(($) => $.project.reactions.readOnly)

/** Les cinq réactions d'un projet, avec ces nombres (dans l'ordre de `kinds`). */
const counted = (counts: [number, number, number, number, number]) =>
  kinds.map((kind, index) => ({ kind, count: counts[index] as number }))

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

describe('OwnReactions', () => {
  it('shows five pills, one per reaction, with its name and count', async () => {
    await renderWithProviders(<OwnReactions reactions={counted([3, 0, 1, 0, 21])} />)

    expect(screen.getByText(title)).toBeTruthy()
    for (const kind of kinds) expect(screen.getByText(nameOf(kind))).toBeTruthy()
    // Une liste de cinq éléments, chacun lu d'un seul tenant (« Waggle !, 21 »).
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByLabelText(labelOf('bravo', 21))).toBeTruthy()
    expect(screen.getByLabelText(labelOf('amazing', 3))).toBeTruthy()
  })

  it('shows « 0 » for a reaction nobody gave yet', async () => {
    await renderWithProviders(<OwnReactions reactions={counted([3, 0, 1, 0, 21])} />)

    expect(screen.getByLabelText(labelOf('inspiring', 0))).toBeTruthy()
    expect(screen.getByLabelText(labelOf('funny', 0))).toBeTruthy()
    // Le chiffre lui-même est affiché, pas seulement lu.
    expect(screen.getAllByText('0')).toHaveLength(2)
  })

  it('is a list named by its title, without any button', async () => {
    await renderWithProviders(<OwnReactions reactions={counted([3, 0, 1, 0, 21])} />)

    expect(roleOf(screen.getByLabelText(title).props)).toBe('list')
    // Rien n'invite à toucher : l'auteur ne réagit pas à son propre projet.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  // jur-2 : la phrase dit ce que l'appli fait (personne ne voit qui a réagi), sous les nombres.
  it('says under the numbers that nobody is shown who reacted', async () => {
    await renderWithProviders(<OwnReactions reactions={counted([3, 0, 1, 0, 21])} />)

    expect(screen.getByText(caption)).toBeTruthy()
  })

  // jur-14 : cinq zéros diraient « personne ne t'aime » ; une phrase calme à la place.
  it('says « Pas encore de réaction » instead of five zeros', async () => {
    await renderWithProviders(<OwnReactions reactions={counted([0, 0, 0, 0, 0])} />)

    expect(screen.getByText(title)).toBeTruthy() // témoin : le bloc est là
    expect(screen.getByText(none)).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows the five pills again as soon as one reaction arrives', async () => {
    await renderWithProviders(<OwnReactions reactions={counted([0, 0, 0, 0, 1])} />)

    expect(screen.queryByText(none)).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByLabelText(labelOf('bravo', 1))).toBeTruthy()
  })

  // ui-3 : le membre suspendu qui n'a aucune réaction à retirer lit les nombres seuls, comme
  // aujourd'hui avec `ReactionBar readOnly` : la liste nommée « Les réactions à ce projet ».
  it('shows a suspended member the numbers alone, named « Les réactions à ce projet »', async () => {
    await renderWithProviders(
      <OwnReactions viewer="suspended" reactions={counted([2, 0, 0, 5, 9])} />,
    )

    expect(roleOf(screen.getByLabelText(readOnlyTitle).props)).toBe('list')
    expect(screen.queryByText(title)).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByLabelText(labelOf('funny', 5))).toBeTruthy()
    expect(screen.getByLabelText(labelOf('useful', 0))).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
