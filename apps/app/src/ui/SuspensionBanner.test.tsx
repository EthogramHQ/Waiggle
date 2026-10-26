// Tests du bandeau d'un compte suspendu (tranche 7c), tel que le membre suspendu le lit en haut de
// chaque page : que son compte est suspendu, jusqu'à quand (date et heure de Paris, ou « jusqu'à
// nouvel ordre »), après un signalement ou non, le fondement, l'explication, ce qu'il peut encore
// faire, et comment contester (relecture juridique, J2, J3 et J4). À part de components.test.tsx,
// partagé avec les autres agents de la tranche.
//
// Le composant reçoit la suspension telle que l'API la donne (`Me.suspension`) et écrit lui-même
// ses phrases : l'écran n'a qu'à le poser.
import type { Suspension } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { indefiniteSuspension, sevenDaySuspension, withParisEnd } from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SuspensionBanner } from './SuspensionBanner'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Element = ReturnType<typeof screen.getByText>

/**
 * Vrai si ce texte est dans un « statut » (role status) : on remonte ses parents. Le bandeau est
 * lu par le lecteur d'écran sans l'interrompre, quel que soit l'élément qui porte le rôle.
 */
const insideStatus = (element: Element): boolean => {
  for (let node: Element | null = element; node; node = node.parent) {
    const { role, accessibilityRole } = node.props
    if (role === 'status' || accessibilityRole === 'status') return true
  }
  return false
}

/** Le bandeau, avec cette suspension. */
const renderBanner = (suspension: Suspension = sevenDaySuspension) =>
  renderWithProviders(<SuspensionBanner suspension={suspension} />)

/** Ce texte de l'appli est à l'écran, seul ou dans un paragraphe plus long. */
const shows = (text: string) => screen.queryAllByText(containing(text)).length > 0

describe('SuspensionBanner', () => {
  it('says the account is suspended, as a status read without interrupting', async () => {
    await renderBanner()

    const title = screen.getByText(containing(fr.t(($) => $.suspension.title)))
    expect(insideStatus(title)).toBe(true)
    // Ce n'est pas une alerte : le bandeau est là dès l'ouverture de la page.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('writes the end with its date and its time in Paris', async () => {
    await renderBanner()

    // La fin, 23 h 30 UTC le 2 novembre : le 3 novembre à 0 h 30, heure de Paris (J4). Le 2
    // novembre ou 23 h 30 trahiraient une heure UTC.
    expect(
      screen.getByText(
        withParisEnd(fr.t(($) => $.suspension.until, { date: 'DATE', time: 'TIME' })),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/23(?: h |:)30/)).toBeNull()
    expect(shows(fr.t(($) => $.suspension.indefinite))).toBe(false)
  })

  it('says « until further notice » when the suspension has no end', async () => {
    await renderBanner(indefiniteSuspension)

    expect(shows(fr.t(($) => $.suspension.indefinite))).toBe(true)
    expect(screen.queryByText(/heure de Paris/)).toBeNull()
  })

  it('says a report came first, never by whom', async () => {
    await renderBanner()

    expect(shows(fr.t(($) => $.suspension.afterReport))).toBe(true)
    expect(shows(fr.t(($) => $.suspension.direct))).toBe(false)
  })

  it('says the moderation decided on its own when no report came first', async () => {
    await renderBanner(indefiniteSuspension)

    expect(shows(fr.t(($) => $.suspension.direct))).toBe(true)
    expect(shows(fr.t(($) => $.suspension.afterReport))).toBe(false)
  })

  it('gives the ground and the explanation', async () => {
    await renderBanner()

    expect(shows(fr.t(($) => $.removal.grounds.rules))).toBe(true)
    expect(
      shows(fr.t(($) => $.suspension.explanation, { explanation: sevenDaySuspension.explanation })),
    ).toBe(true)
  })

  it('gives the ground of the law when that is the ground', async () => {
    await renderBanner(indefiniteSuspension)

    expect(shows(fr.t(($) => $.removal.grounds.illegal))).toBe(true)
    expect(shows(fr.t(($) => $.removal.grounds.rules))).toBe(false)
  })

  it('writes the explanation as typed, characters included', async () => {
    await renderBanner({ ...sevenDaySuspension, explanation: 'Pas de <b>gras</b> & co.' })

    expect(screen.getByText(/Pas de <b>gras<\/b> & co\./)).toBeTruthy()
  })

  it('says what the member can still do', async () => {
    await renderBanner()

    expect(shows(fr.t(($) => $.suspension.canStill))).toBe(true)
  })

  it('tells how to contest: by e-mail, or before a court', async () => {
    await renderBanner()

    // L'adresse de contact est remplie par i18n ({{contactEmail}}) ; la justice est nommée (J3).
    const contest = fr.t(($) => $.suspension.contest)
    expect(contest).toMatch(/@/)
    expect(contest).toMatch(/justice/)
    expect(shows(contest)).toBe(true)
  })
})
