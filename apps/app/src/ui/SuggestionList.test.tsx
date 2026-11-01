// Tests de la liste « Proches à suivre » (R4, F-Fil10), seule liste des suggestions, au premier
// lancement comme dans la colonne de droite (relecture de l'interface, ui-B7). Ce qu'un membre et un
// lecteur d'écran en perçoivent :
// - un titre de section, et la légende qui dit le critère : « Des membres qui ont publié
//   récemment » (relecture juridique jur-J5) ;
// - « × » retire la ligne tout de suite, et la suivante monte à sa place ; une seule garde
//   (TAP_GUARD_MS) pour toutes les lignes : la seconde tape d'une double tape, qui tombe sur le
//   « × » de la ligne montée sous le doigt, ne l'écarte pas ;
// - le focus du clavier passe à la ligne suivante, au lieu de se perdre ;
// - « Tu ne verras plus Léa Martin ici. » propose « Annuler » pendant 5 secondes ; l'écart n'est
//   envoyé qu'à la fin de ce délai, ou quand le membre quitte la page avant (jur-J8, décision de
//   Louis du 31/10/2026) ;
// - si l'envoi échoue, la ligne revient, avec un message.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from './focus'
import { Notice } from './Notice'
import { SuggestionList } from './SuggestionList'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Le focus du clavier passe par focusWithoutScroll (ui/focus.ts) : on lit à quel élément il va.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Le délai pendant lequel « Annuler » est proposé (scénario R4, jur-J8). */
const UNDO_MS = 5_000

const member = (id: string, name: string, title: string) => ({
  id,
  name,
  avatar: null,
  project: { title, image: null },
  followed: false,
})
const lea = member('u1', 'Léa Martin', 'Carnet de cafés')
const sam = member('u2', 'Sam Petit', 'Mon agent de recettes')
const nora = member('u3', 'Nora Benali', 'Plantes au balcon')
const ines = member('u4', 'Inès Roux', 'Résumé de réunions')

const dismissName = (name: string) => fr.t(($) => $.suggestions.dismiss, { name })
const dismissedText = (name: string) => fr.t(($) => $.suggestions.dismissed, { name })
const undo = fr.t(($) => $.suggestions.undo)

type Props = {
  members?: (typeof lea)[]
  max?: number
  onDismiss?: (id: string) => Promise<{ ok: boolean }>
}

const List = ({ members = [lea, sam, nora], max, onDismiss }: Props) => (
  <SuggestionList
    members={members}
    {...(max ? { max } : null)}
    onFollow={() => {}}
    onOpenMember={() => {}}
    onOpenProject={() => {}}
    onDismiss={onDismiss ?? (async () => ({ ok: true }))}
  />
)

const shown = (name: string) => screen.queryByRole('link', { name })

/** Le nom lu d'un élément focalisé : celui de sa ref (un composant natif garde ses props). */
const spokenOf = (node: unknown): string => {
  const props = (node as { props?: Record<string, unknown> } | null)?.props ?? {}
  return String(props.accessibilityLabel ?? props['aria-label'] ?? '')
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(focusWithoutScroll).mockClear()
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('SuggestionList', () => {
  it('has a section title and says why these members are shown (jur-J5)', async () => {
    await renderWithProviders(<List />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.suggestions.title) })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.suggestions.caption))).toBeTruthy()
    expect(shown('Léa Martin')).toBeTruthy()
    expect(shown('Sam Petit')).toBeTruthy()
  })

  it('removes the row at once when « × » is touched', async () => {
    await renderWithProviders(<List />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))

    expect(shown('Léa Martin')).toBeNull()
    expect(shown('Sam Petit')).toBeTruthy()
  })

  it('lets another member take the place of the dismissed one, when there is one', async () => {
    await renderWithProviders(<List members={[lea, sam, nora, ines]} max={3} />)
    expect(shown('Inès Roux')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))

    expect(shown('Inès Roux')).toBeTruthy()
  })

  // ui-B7 : la ligne de Sam monte sous le doigt ; la seconde tape d'une double tape ne l'écarte pas.
  it('ignores a tap on the next row × within the tap guard', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: true }))
    await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await fireEvent.press(screen.getByRole('button', { name: dismissName('Sam Petit') }))

    expect(shown('Sam Petit')).toBeTruthy()
    await act(() => jest.advanceTimersByTime(UNDO_MS))
    expect(onDismiss.mock.calls.map(([id]) => id)).toEqual(['u1'])
  })

  it('takes a tap on the next row × once the guard is over', async () => {
    await renderWithProviders(<List />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(screen.getByRole('button', { name: dismissName('Sam Petit') }))

    expect(shown('Sam Petit')).toBeNull()
  })

  // ui-B7 : le « × » touché disparaît avec sa ligne ; le focus va à la ligne suivante.
  it('moves focus to the next row after dismissing (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<List />)
    expect(focusWithoutScroll).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await act(async () => {})

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map(([node]) => spokenOf(node))
    expect(focused.length).toBeGreaterThanOrEqual(1)
    expect(focused[focused.length - 1]).toContain('Sam Petit')
  })

  // jur-J8 : le message et « Annuler », pendant 5 secondes.
  it('says « Tu ne verras plus Léa Martin ici. » and offers « Annuler »', async () => {
    await renderWithProviders(<List />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))

    expect(screen.getByText(dismissedText('Léa Martin'))).toBeTruthy()
    expect(screen.getByRole('button', { name: undo })).toBeTruthy()
  })

  it('puts the row back and sends nothing when « Annuler » is touched', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: true }))
    await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    // Un geste à part, pas la seconde tape d'une double tape.
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(screen.getByRole('button', { name: undo }))

    expect(shown('Léa Martin')).toBeTruthy()
    await act(() => jest.advanceTimersByTime(UNDO_MS))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(shown('Léa Martin')).toBeTruthy()
  })

  it('sends the dismissal only once the 5 seconds are over', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: true }))
    await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await act(() => jest.advanceTimersByTime(UNDO_MS - 1))
    expect(onDismiss).not.toHaveBeenCalled()

    await act(() => jest.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith('u1')
    // Passé le délai, « Annuler » n'est plus proposé.
    expect(screen.queryByRole('button', { name: undo })).toBeNull()
  })

  it('sends the dismissal in progress when the member leaves the page', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: true }))
    const { unmount } = await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    expect(onDismiss).not.toHaveBeenCalled()
    await act(async () => unmount())

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith('u1')
  })

  // ui-B7 : l'API refuse (réseau, quota) : la ligne revient, et un message le dit.
  it('puts the row back when dismissing fails', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: false }))
    await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await act(() => jest.advanceTimersByTime(UNDO_MS))
    await act(async () => {})

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(shown('Léa Martin')).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.suggestions.dismissError))).toBeTruthy()
  })

  // Relecture design C2 (WCAG 2.2.1) : « Annuler » ne disparaît pas sous le focus du clavier. Le
  // délai s'arrête tant qu'il a le focus, et repart, pour le temps qui restait, quand il le perd.
  it('holds « Annuler » while it has the keyboard focus, then counts down again', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: true }))
    await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await act(() => jest.advanceTimersByTime(1_000))
    await fireEvent(screen.getByRole('button', { name: undo }), 'focus')
    await act(() => jest.advanceTimersByTime(UNDO_MS * 3))

    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: undo })).toBeTruthy()

    await fireEvent(screen.getByRole('button', { name: undo }), 'blur')
    await act(() => jest.advanceTimersByTime(UNDO_MS - 1_000 - 1))
    expect(onDismiss).not.toHaveBeenCalled()
    await act(() => jest.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: undo })).toBeNull()
  })

  // Même chose à la souris : le pointeur posé sur « Annuler » arrête le délai.
  it('holds « Annuler » while the pointer rests on it', async () => {
    const onDismiss = jest.fn(async (_id: string) => ({ ok: true }))
    await renderWithProviders(<List onDismiss={onDismiss} />)

    await fireEvent.press(screen.getByRole('button', { name: dismissName('Léa Martin') }))
    await fireEvent(screen.getByRole('button', { name: undo }), 'hoverIn')
    await act(() => jest.advanceTimersByTime(UNDO_MS * 3))
    expect(onDismiss).not.toHaveBeenCalled()

    await fireEvent(screen.getByRole('button', { name: undo }), 'hoverOut')
    await act(() => jest.advanceTimersByTime(UNDO_MS))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // Relecture design A8 : la lecture des suggestions échoue ; le titre de la section reste, et le
  // message se pose dessous, au lieu de flotter seul au-dessus de la section suivante.
  it('keeps its title above a notice that replaces the rows', async () => {
    await renderWithProviders(
      <SuggestionList
        members={[]}
        notice={<Notice message={fr.t(($) => $.suggestions.loadError)} />}
        onFollow={() => {}}
        onOpenMember={() => {}}
        onOpenProject={() => {}}
        onDismiss={async () => ({ ok: true })}
      />,
    )

    expect(screen.getByRole('header', { name: fr.t(($) => $.suggestions.title) })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.suggestions.loadError))).toBeTruthy()
  })
})
