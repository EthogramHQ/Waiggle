// Tests d'une ligne de « Proches à suivre » (R4, F-Fil10, planche R4-Fil-Premier) : la photo et le
// nom d'un membre qui a publié récemment, la vignette et le titre de son dernier projet, « Suivre »
// et « × ». Ce qu'un membre et un lecteur d'écran en perçoivent :
// - le nom ou la photo ouvre la page du membre, la vignette ouvre le projet ; « Suivre » et « × »
//   sont à part, jamais dans un lien (décision de Louis du 31/10/2026) ;
// - « Suivre » est un interrupteur « Suivre Léa Martin », qui devient « Tu suis » une fois touché ;
//   une double tape ne l'écrit qu'une fois (même garde que les fenêtres, TAP_GUARD_MS) ; inactif, à
//   sa place, pour un membre suspendu (comme Explorer) ;
// - « × » est nommé « Ne plus suggérer Léa Martin » ;
// - aucune preuve sociale : ni « suivi par », ni nombre d'abonnés (relecture juridique jur-J5).
// La ligne ne garde pas l'état « suivi » : l'écran le donne (ici un useState), comme FollowButton.
import { layout } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SuggestionRow } from './SuggestionRow'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const name = 'Léa Martin'
const projectTitle = 'Carnet de cafés'
const thumbnail = {
  source: { uri: 'https://api.example/cafes.webp' },
  thumbhash: null,
  label: 'Photo de Carnet de cafés',
}
const follow = fr.t(($) => $.follow.member, { name })
const following = fr.t(($) => $.follow.memberFollowing, { name })
const dismiss = fr.t(($) => $.suggestions.dismiss, { name })

type Handlers = {
  onFollow?: () => void
  onOpenMember?: () => void
  onOpenProject?: () => void
  onDismiss?: () => void
  followDisabled?: boolean
  initial?: boolean
}

/** La ligne telle qu'un écran la pose : l'écran garde l'état « suivi » et le change au toucher. */
const Row = ({ initial = false, followDisabled = false, ...handlers }: Handlers) => {
  // useState : une valeur gardée par React d'un rendu à l'autre ; la changer redessine la ligne.
  const [followed, setFollowed] = useState(initial)
  return (
    <SuggestionRow
      name={name}
      avatar={null}
      project={{ title: projectTitle, image: thumbnail }}
      followed={followed}
      followDisabled={followDisabled}
      onFollow={() => {
        handlers.onFollow?.()
        setFollowed((value) => !value)
      }}
      onOpenMember={handlers.onOpenMember ?? (() => {})}
      onOpenProject={handlers.onOpenProject ?? (() => {})}
      onDismiss={handlers.onDismiss ?? (() => {})}
    />
  )
}

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null }

/** Vrai si un ancêtre de l'élément est un lien ou un bouton. */
const insideControl = (element: unknown): boolean => {
  let parent = (element as Node).parent
  while (parent) {
    const role = parent.props.accessibilityRole ?? parent.props.role
    if (role === 'link' || role === 'button') return true
    parent = parent.parent
  }
  return false
}

const memberLink = () => screen.getByRole('link', { name })

/** La hauteur à toucher d'un lien : celle que son style lui donne (minHeight ou height). */
const touchHeight = (node: ReturnType<typeof screen.getByRole>): number => {
  const style = StyleSheet.flatten(node.props.style) as { minHeight?: unknown; height?: unknown }
  return Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
}

describe('SuggestionRow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('shows the member’s name and the title of her latest project', async () => {
    await renderWithProviders(<Row />)

    expect(screen.getByText(name)).toBeTruthy()
    expect(screen.getByText(projectTitle)).toBeTruthy()
  })

  it('opens the member’s page from her name', async () => {
    const onOpenMember = jest.fn()
    const onOpenProject = jest.fn()
    await renderWithProviders(<Row onOpenMember={onOpenMember} onOpenProject={onOpenProject} />)

    await fireEvent.press(memberLink())

    expect(onOpenMember).toHaveBeenCalledTimes(1)
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('opens the member’s page from her photo too', async () => {
    const onOpenMember = jest.fn()
    await renderWithProviders(<Row onOpenMember={onOpenMember} />)

    // Sans photo, ses initiales (« LM ») : décoratives, cachées aux lecteurs d'écran.
    await fireEvent.press(screen.getByText('LM', { includeHiddenElements: true }))

    expect(onOpenMember).toHaveBeenCalledTimes(1)
  })

  it('opens the project from its thumbnail', async () => {
    const onOpenMember = jest.fn()
    const onOpenProject = jest.fn()
    await renderWithProviders(<Row onOpenMember={onOpenMember} onOpenProject={onOpenProject} />)

    await fireEvent.press(screen.getByLabelText(thumbnail.label, { includeHiddenElements: true }))

    expect(onOpenProject).toHaveBeenCalledTimes(1)
    expect(onOpenMember).not.toHaveBeenCalled()
  })

  it('offers the project as a link named after its title', async () => {
    const onOpenProject = jest.fn()
    await renderWithProviders(<Row onOpenProject={onOpenProject} />)

    await fireEvent.press(screen.getByRole('link', { name: new RegExp(projectTitle) }))

    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it('opens the member’s page once for a double tap', async () => {
    const onOpenMember = jest.fn()
    await renderWithProviders(<Row onOpenMember={onOpenMember} />)

    await fireEvent.press(memberLink())
    await fireEvent.press(memberLink())

    expect(onOpenMember).toHaveBeenCalledTimes(1)
  })

  it('is a switch « Suivre Léa Martin », showing « Suivre », not checked', async () => {
    await renderWithProviders(<Row />)

    expect(screen.getByRole('switch', { name: follow })).not.toBeChecked()
    expect(screen.getByText(fr.t(($) => $.follow.follow))).toBeTruthy()
  })

  it('says « Tu suis » once touched, checked, and the row stays in place', async () => {
    const onFollow = jest.fn()
    await renderWithProviders(<Row onFollow={onFollow} />)

    await fireEvent.press(screen.getByRole('switch', { name: follow }))

    expect(onFollow).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('switch', { name: following })).toBeChecked()
    expect(
      screen.getByText(new RegExp(`^${fr.t(($) => $.suggestions.following)}`), {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
    expect(memberLink()).toBeTruthy()
  })

  it('follows once for two taps in a row, and stays followed', async () => {
    const onFollow = jest.fn()
    await renderWithProviders(<Row onFollow={onFollow} />)

    await fireEvent.press(screen.getByRole('switch', { name: follow }))
    await fireEvent.press(screen.getByRole('switch', { name: following }))

    expect(onFollow).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('switch', { name: following })).toBeChecked()
  })

  it('stops following when « Tu suis » is touched again later', async () => {
    const onFollow = jest.fn()
    await renderWithProviders(<Row onFollow={onFollow} />)

    await fireEvent.press(screen.getByRole('switch', { name: follow }))
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(screen.getByRole('switch', { name: following }))

    expect(onFollow).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('switch', { name: follow })).not.toBeChecked()
  })

  // Un compte suspendu ne suit plus personne de nouveau : « Suivre » reste à sa place, inactif,
  // au lieu de disparaître sous le doigt (comme la pastille d'Explorer, R3).
  it('keeps « Suivre » in place but disabled for a suspended member', async () => {
    const onFollow = jest.fn()
    await renderWithProviders(<Row onFollow={onFollow} followDisabled />)

    const toggle = screen.getByRole('switch', { name: follow })
    expect(toggle).toBeDisabled()
    await fireEvent.press(toggle)
    expect(onFollow).not.toHaveBeenCalled()
  })

  it('names « × » « Ne plus suggérer Léa Martin », and dismisses with it', async () => {
    const onDismiss = jest.fn()
    const onOpenMember = jest.fn()
    await renderWithProviders(<Row onDismiss={onDismiss} onOpenMember={onOpenMember} />)

    await fireEvent.press(screen.getByRole('button', { name: dismiss }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpenMember).not.toHaveBeenCalled()
  })

  it('keeps « Suivre » and « × » out of any link', async () => {
    await renderWithProviders(<Row />)

    expect(insideControl(screen.getByRole('switch', { name: follow }))).toBe(false)
    expect(insideControl(screen.getByRole('button', { name: dismiss }))).toBe(false)
    expect(insideControl(memberLink())).toBe(false)
  })

  // Relectures ui B1 et design C3 (décision de Louis du 1/11/2026) : le lien du nom et celui du
  // projet, empilés, ont chacun 44 points à toucher, dans les deux dessins de la ligne.
  it.each([false, true])(
    'gives the name and the project links 44 points to touch each (stacked: %s)',
    async (stacked) => {
      await renderWithProviders(
        <SuggestionRow
          name={name}
          avatar={null}
          project={{ title: projectTitle, image: thumbnail }}
          followed={false}
          stacked={stacked}
          onFollow={() => {}}
          onOpenMember={() => {}}
          onOpenProject={() => {}}
          onDismiss={() => {}}
        />,
      )

      for (const link of [memberLink(), screen.getByRole('link', { name: projectTitle })]) {
        expect(touchHeight(link)).toBeGreaterThanOrEqual(layout.touchTarget)
      }
    },
  )

  // Relecture design A1 : dans la colonne de droite, la ligne s'empile (photo et nom, le projet,
  // puis « Suivre » et « × ») ; les quatre gestes restent là, séparés, aucun dans un lien.
  it('keeps the four gestures apart when stacked', async () => {
    const onOpenMember = jest.fn()
    const onDismiss = jest.fn()
    await renderWithProviders(
      <SuggestionRow
        name={name}
        avatar={null}
        project={{ title: projectTitle, image: thumbnail }}
        followed={false}
        stacked
        onFollow={() => {}}
        onOpenMember={onOpenMember}
        onOpenProject={() => {}}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('link', { name: projectTitle })).toBeTruthy()
    expect(insideControl(screen.getByRole('switch', { name: follow }))).toBe(false)
    expect(insideControl(screen.getByRole('button', { name: dismiss }))).toBe(false)
    await fireEvent.press(memberLink())
    expect(onOpenMember).toHaveBeenCalledTimes(1)
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(screen.getByRole('button', { name: dismiss }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // jur-J5 : la ligne ne dit jamais qui suit ce membre, ni combien ils sont.
  it('shows no social proof: neither who follows her nor how many', async () => {
    await renderWithProviders(<Row />)

    expect(memberLink()).toBeTruthy() // témoin
    expect(screen.queryByText(/abonné|suivie? par/i, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByText(/\d/, { includeHiddenElements: true })).toBeNull()
  })
})
