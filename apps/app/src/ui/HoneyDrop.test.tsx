// Tests du bouton de la Goutte (R20, docs/scenarios/refonte.md, « La Goutte » ; planche R20-Goutte) :
// une goutte de miel ronde, nommée pour les lecteurs d'écran par ce qu'elle fait (« Faire un retour
// sur Waiggle, 2 missions à faire »), avec une pastille quand des missions restent à faire, jamais
// rouge. Repliée (appui long), elle devient une petite languette au bord de l'écran, sans pastille,
// qui la rouvre d'un geste (« Rouvrir la Goutte »).
//
// Le composant ne lit ni l'API ni la navigation (plan, « Appli ») : tout lui vient de ses
// propriétés, `HoneyDrop({ label, count?, folded, onPress, onLongPress, onUnfold })`. Le nom lu
// vient de l'écran (`label`) ; seul le nom de la languette est un texte du composant.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HoneyDrop } from './HoneyDrop'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.scout.drop.labelMissions, { count: 2 })
const UNFOLD = fr.t(($) => $.scout.drop.unfold)

const renderDrop = (props: Partial<Parameters<typeof HoneyDrop>[0]> = {}) => {
  const handlers = { onPress: jest.fn(), onLongPress: jest.fn(), onUnfold: jest.fn() }
  return renderWithProviders(
    <HoneyDrop label={LABEL} count={2} folded={false} {...handlers} {...props} />,
  ).then((view) => ({ ...view, ...handlers }))
}

describe('HoneyDrop', () => {
  it('is a button read by its label', async () => {
    await renderDrop()

    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy()
  })

  it('calls onPress when touched', async () => {
    const { onPress, onLongPress } = await renderDrop()

    fireEvent.press(screen.getByRole('button', { name: LABEL }))

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('calls onLongPress on a long press, and not onPress', async () => {
    const { onPress, onLongPress } = await renderDrop()

    fireEvent(screen.getByRole('button', { name: LABEL }), 'longPress')

    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })

  // La pastille dit le nombre aux yeux ; le nom du bouton le dit déjà aux lecteurs d'écran.
  it('shows the number of missions left in a badge', async () => {
    await renderDrop({ count: 2 })

    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy()
  })

  it('shows no badge without missions left', async () => {
    await renderDrop({ count: 0, label: fr.t(($) => $.scout.drop.label) })

    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
    // Témoin : le bouton est bien là.
    expect(screen.getByRole('button', { name: fr.t(($) => $.scout.drop.label) })).toBeTruthy()
  })

  it('shows no badge when no count is given', async () => {
    await renderDrop({ count: undefined, label: fr.t(($) => $.scout.drop.label) })

    expect(screen.queryByText(/^\d+$/, { includeHiddenElements: true })).toBeNull()
    // Témoin : le bouton est bien là.
    expect(screen.getByRole('button', { name: fr.t(($) => $.scout.drop.label) })).toBeTruthy()
  })

  describe('folded', () => {
    it('becomes a tab named « Rouvrir la Goutte », without the drop button', async () => {
      await renderDrop({ folded: true })

      expect(screen.getByRole('button', { name: UNFOLD })).toBeTruthy()
      expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
    })

    it('shows no badge on the tab', async () => {
      await renderDrop({ folded: true, count: 2 })

      expect(screen.queryByText('2', { includeHiddenElements: true })).toBeNull()
      // Témoin : la languette est bien là.
      expect(screen.getByRole('button', { name: UNFOLD })).toBeTruthy()
    })

    it('calls onUnfold when the tab is touched, and not onPress', async () => {
      const { onPress, onUnfold } = await renderDrop({ folded: true })

      fireEvent.press(screen.getByRole('button', { name: UNFOLD }))

      expect(onUnfold).toHaveBeenCalledTimes(1)
      expect(onPress).not.toHaveBeenCalled()
    })
  })

  it('reads its tab in English too', async () => {
    const handlers = { onPress: jest.fn(), onLongPress: jest.fn(), onUnfold: jest.fn() }
    await renderWithProviders(<HoneyDrop label="Give feedback" folded {...handlers} />, 'en')

    expect(screen.getByRole('button', { name: 'Reopen the Drop' })).toBeTruthy()
  })
})
