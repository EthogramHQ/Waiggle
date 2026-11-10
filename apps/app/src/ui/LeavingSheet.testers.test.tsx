// Tests de la ligne des testeurs sur la page de sortie (R7a, scénario « Rejoindre les testeurs »,
// relecture du plan, interface S4). Sur la page de sortie d'une démo venue d'un projet « Testable »,
// un membre qui n'est pas testeur lit « Tu veux aider Papi Jean ? Rejoins les testeurs depuis la
// page du projet. », la seconde phrase étant un lien vers la page du projet : sans lui, la phrase
// n'aurait pas d'issue. Ouvrir la démo ne rend jamais testeur tout seul.
//
// L'API fixée au lancement : `testers?: { name: string; onOpenProject: () => void } | null`. L'écran
// (`LeavingScreen`) décide quand la ligne a lieu d'être (projet testable, pas encore testeur, pas son
// projet) ; ce composant la pose, et garde sa place comme celle de `holdOrigin`.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { LeavingSheet } from './LeavingSheet'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LEAD = fr.t(($) => $.project.testers.leavingLead, { name: 'Papi Jean' })
const LINK = fr.t(($) => $.project.testers.leavingLink)

const origin = {
  text: 'La démo de Décollage !, ajoutée par Papi Jean',
  author: { name: 'Papi Jean', source: null },
}

/** La feuille de la démo de « Décollage ! », avec ou sans la ligne des testeurs. */
const show = async (testers?: { name: string; onOpenProject: () => void } | null) => {
  const onOpen = jest.fn()
  await renderWithProviders(
    <LeavingSheet
      host="decollage.example"
      href="https://decollage.example/"
      origin={origin}
      {...(testers !== undefined ? { testers } : null)}
      onOpen={onOpen}
      onStay={jest.fn()}
    />,
  )
  return { onOpen }
}

/** Passer la garde de double tape de la page (TAP_GUARD_MS après son arrivée). */
const passGuard = () => act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

describe('LeavingSheet, the line of the testers (R7a)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('invites to join the testers from the page of the project', async () => {
    await show({ name: 'Papi Jean', onOpenProject: jest.fn() })

    // Le lien peut suivre la phrase dans le même paragraphe : on la cherche dans un texte plus long.
    expect(screen.getByText(containing(LEAD))).toBeTruthy()
    expect(screen.getByRole('link', { name: LINK })).toBeTruthy()
  })

  it('leads to the page of the project from its link', async () => {
    const onOpenProject = jest.fn()
    await show({ name: 'Papi Jean', onOpenProject })
    await passGuard()

    await fireEvent.press(screen.getByRole('link', { name: LINK }))

    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it('never makes a tester by opening the demo', async () => {
    const onOpenProject = jest.fn()
    const { onOpen } = await show({ name: 'Papi Jean', onOpenProject })
    await passGuard()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.leaving.open) }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpenProject).not.toHaveBeenCalled()
    // Témoin : la ligne était bien là.
    expect(screen.getByRole('link', { name: LINK })).toBeTruthy()
  })

  it('says nothing of the testers without the line', async () => {
    await show(null)

    // Témoin : la feuille et sa ligne d'origine sont là.
    expect(screen.getByText(origin.text)).toBeTruthy()
    expect(screen.queryByText(/Tu veux aider/)).toBeNull()
    expect(screen.queryByRole('link', { name: LINK })).toBeNull()
  })
})
