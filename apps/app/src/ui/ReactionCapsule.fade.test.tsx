// Tests de la capsule des réactions quand sa page arrive (relecture RF, sécurité A2) : sur le web,
// la capsule flotte en bas de la page d'un projet, hors du fondu du contenu (ui/ScreenFade.tsx), et
// prenait donc les tapes dès la première image d'un retour sur la page. La seconde tape d'une double
// tape (sur « Retour » d'une page posée au même endroit) posait une réaction sans le vouloir. Elle
// ignore désormais les tapes pendant TAP_GUARD_MS après chaque arrivée de sa page, comme une
// fenêtre qui s'ouvre (ui/tapGuard.ts) ; dans l'appli de téléphone, rien ne change.
//
// La route de la page (affichée ou non) vient d'un faux `screenFocus`, dont la valeur passe par un
// contexte : la changer redessine la capsule, comme le ferait la navigation.
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ComponentType, ReactNode } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type CapsuleReaction, ReactionCapsule } from './ReactionCapsule'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports.
jest.mock('./screenFocus', () => {
  const { createContext, useContext } = require('react')
  const Route = createContext({ focused: true, shown: 1 })
  return {
    MockRoute: Route.Provider,
    useScreenFocused: () => useContext(Route).focused,
    useScreenShownCount: () => useContext(Route).shown,
  }
})
type RouteState = { focused: boolean; shown: number }
const { MockRoute } = jest.requireMock<{
  MockRoute: ComponentType<{ value: RouteState; children: ReactNode }>
}>('./screenFocus')

const reactions: CapsuleReaction[] = [
  { kind: 'amazing', count: 3, mine: false },
  { kind: 'inspiring', count: 0, mine: false },
  { kind: 'useful', count: 5, mine: false },
  { kind: 'funny', count: 1, mine: false },
  { kind: 'bravo', count: 21, mine: true },
]

/** Le bouton d'une réaction d'un autre membre, par son nom lu (« Utile, 5 »). */
const button = (kind: 'amazing' | 'useful' | 'funny', count: number) =>
  screen.getByRole('button', {
    name: fr.t(($) => $.project.reactions.label, {
      name: fr.t(($) => $.project.reactions[kind]),
      count,
    }),
  })

const capsule = (route: RouteState, onToggle: (kind: string) => void) => (
  <MockRoute value={route}>
    <ReactionCapsule reactions={reactions} onToggle={onToggle} onOpenFan={jest.fn()} />
  </MockRoute>
)

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('ReactionCapsule when its page arrives (web)', () => {
  it('ignores taps right after its page is shown, then takes them', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onToggle = jest.fn()
    await renderWithProviders(capsule({ focused: true, shown: 1 }, onToggle))

    await fireEvent.press(button('useful', 5))
    expect(onToggle).not.toHaveBeenCalled()

    await wait(TAP_GUARD_MS)
    await fireEvent.press(button('amazing', 3))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('amazing')
  })

  // Le cas de la relecture : la page du projet, restée montée sous une autre, redevient affichée.
  it('ignores taps again when the member comes back to its page', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onToggle = jest.fn()
    const view = await renderWithProviders(capsule({ focused: true, shown: 1 }, onToggle))
    await wait(TAP_GUARD_MS)
    await view.rerender(capsule({ focused: false, shown: 1 }, onToggle))

    await view.rerender(capsule({ focused: true, shown: 2 }, onToggle))
    await fireEvent.press(button('useful', 5))
    expect(onToggle).not.toHaveBeenCalled()

    await wait(TAP_GUARD_MS)
    await fireEvent.press(button('funny', 1))
    expect(onToggle).toHaveBeenCalledWith('funny')
  })
})

// Dans l'appli de téléphone, la pile glisse et la capsule arrive avec la page : aucune garde.
describe('ReactionCapsule when its page arrives (iOS)', () => {
  it('takes a tap at once', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const onToggle = jest.fn()
    await renderWithProviders(capsule({ focused: true, shown: 1 }, onToggle))

    await fireEvent.press(button('useful', 5))

    expect(onToggle).toHaveBeenCalledWith('useful')
  })
})
