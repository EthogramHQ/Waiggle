// Tests de la carte d'une décision dans l'historique de la modération (tranche 7c). Scénario
// « L'historique des décisions » : pour chaque décision, la date, l'administrateur, l'action
// (retrait, rétablissement, classement, suspension, levée), la cible avec un lien, le fondement et
// l'explication. Jamais qui a signalé : le contrat n'a aucun champ pour cela.
//
// L'interface attendue de `src/ui/DecisionCard.tsx` (écrit par ui-dev) :
// - `decision: DecisionHistoryItem`, la décision telle que l'API la donne ; la carte écrit elle-même
//   ses textes (`moderation.actions`, `decidedBy`, `memberLine`, `durationLine`…) ;
// - `onView?: () => void`, le lien « Voir » vers la cible (choisi par l'écran, qui connaît les
//   routes) ; sans lui, pas de lien. Une cible supprimée depuis n'a jamais de lien.
import type { DecisionHistoryItem } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import {
  dismissByGoneAdminDecision,
  goneTargetDecision,
  liftDecision,
  removeDecision,
  suspendDecision,
} from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { DecisionCard } from './DecisionCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const show = (decision: DecisionHistoryItem, onView?: () => void) =>
  renderWithProviders(<DecisionCard decision={decision} {...(onView ? { onView } : null)} />)

describe('DecisionCard', () => {
  // Une carte par action, un rendu par test (charte : deux rendus dans un test cassent les
  // suivants) : le nom de l'action, tiré des textes (« Retrait », « Suspension »…).
  it.each([
    removeDecision,
    { ...removeDecision, action: 'restore' as const, ground: null, explanation: null },
    dismissByGoneAdminDecision,
    suspendDecision,
    liftDecision,
  ])('names the action $action in words', async (decision) => {
    await show(decision)

    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.actions[decision.action]))),
    ).toBeTruthy()
  })

  it('shows the date, the administrator, the member aimed at, the ground and the explanation of a removal', async () => {
    await show(removeDecision)

    expect(screen.getByText(/^Le \d/)).toBeTruthy()
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.decidedBy, { name: 'Louis' }))),
    ).toBeTruthy()
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.memberLine, { name: 'Sam' }))),
    ).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.moderation.grounds.rules)))).toBeTruthy()
    expect(screen.getByText(containing(removeDecision.explanation ?? ''))).toBeTruthy()
  })

  it('shows the duration of a suspension', async () => {
    await show(suspendDecision)

    const duration = fr.t(($) => $.moderation.durations['7d'])
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.durationLine, { duration }))),
    ).toBeTruthy()
    expect(screen.getByText(containing(suspendDecision.explanation ?? ''))).toBeTruthy()
  })

  it('shows why a suspension was lifted, and its explanation', async () => {
    // Relecture juridique J10 : la raison de la levée (plus tôt, ou erreur) est gardée.
    await show(liftDecision)

    expect(screen.getByText(containing(fr.t(($) => $.moderation.lift.causes.early)))).toBeTruthy()
    expect(screen.getByText(containing(liftDecision.explanation ?? ''))).toBeTruthy()
  })

  it('says when the administrator who decided has deleted their account', async () => {
    await show(dismissByGoneAdminDecision)

    expect(screen.getByText(containing(fr.t(($) => $.moderation.decidedByGone)))).toBeTruthy()
    expect(screen.queryByText(/^Par (?!un administrateur)/)).toBeNull()
  })

  it('says when the content has been deleted since, and the member too, without any link', async () => {
    await show(goneTargetDecision, jest.fn())

    expect(screen.getByText(containing(fr.t(($) => $.moderation.targetGone)))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.moderation.memberGone)))).toBeTruthy()
    // Le fondement et l'explication restent : la trace de la décision ne s'efface pas.
    expect(screen.getByText(containing(goneTargetDecision.explanation ?? ''))).toBeTruthy()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('leads to its target through « Voir »', async () => {
    const onView = jest.fn()
    await show(removeDecision, onView)

    await fireEvent.press(screen.getByRole('link', { name: fr.t(($) => $.moderation.view) }))

    expect(onView).toHaveBeenCalledTimes(1)
  })

  it('has no link when it is given nowhere to lead', async () => {
    await show(removeDecision)

    expect(screen.getByText(containing(removeDecision.explanation ?? ''))).toBeTruthy() // témoin
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('shows the explanation as plain text, never as a link', async () => {
    // Règle 22 de 7a : ce qu'on a écrit ne devient jamais un lien à toucher dans la modération.
    const tricky = {
      ...removeDecision,
      explanation: 'Voir [la preuve](https://piege.example) et https://autre-piege.example',
    }
    await show(tricky, jest.fn())

    expect(screen.getByText(containing(tricky.explanation))).toBeTruthy()
    expect(screen.getAllByRole('link').map((link) => link.props.accessibilityLabel)).toEqual([
      fr.t(($) => $.moderation.view),
    ])
  })
})
