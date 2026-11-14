// Tests du bandeau d'un compte suspendu (tranche 7c), tel que le membre suspendu le lit en haut de
// chaque page : que son compte est suspendu, jusqu'à quand (date et heure de Paris, ou « jusqu'à
// nouvel ordre »), après un signalement ou non, le fondement, l'explication, ce qu'il peut encore
// faire, et comment contester (relecture juridique, J2, J3 et J4). Dans son propre fichier plutôt que dans
// components.test.tsx, partagé par toute l'interface.
//
// Le composant reçoit la suspension telle que l'API la donne (`Me.suspension`) et écrit lui-même
// ses phrases : l'écran n'a qu'à le poser. Depuis la décision de Louis du 27/10/2026, il est replié
// (la ligne forte et « Détails ») sauf sur l'accueil (`initiallyOpen`) et à la première visite
// après une suspension nouvelle ou changée, mémorisée sur l'appareil.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { contactEmail } from '@ruche/brand'
import type { Suspension } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { indefiniteSuspension, sevenDaySuspension, withParisEnd } from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SuspensionBanner } from './SuspensionBanner'
import { suspensionSignature } from './suspensionMemory'

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

/** Le bandeau déplié (comme sur l'accueil), avec cette suspension. */
const renderBanner = async (suspension: Suspension = sevenDaySuspension) => {
  await renderWithProviders(<SuspensionBanner suspension={suspension} initiallyOpen />)
  // Le bandeau attend d'être dans le navigateur (useHydrated) : on attend sa ligne forte.
  await screen.findByText(containing(fr.t(($) => $.suspension.title)))
}

/** Le bandeau tel qu'une autre page le pose : ouvert ou non selon la mémoire de l'appareil. */
const renderElsewhere = async (suspension: Suspension = sevenDaySuspension) => {
  await renderWithProviders(<SuspensionBanner suspension={suspension} />)
  return screen.findByRole('button', { name: fr.t(($) => $.suspension.details) })
}

/** Cette suspension, déjà vue sur cet appareil. */
const alreadySeen = (suspension: Suspension = sevenDaySuspension) =>
  AsyncStorage.setItem('suspension-seen', suspensionSignature(suspension))

/**
 * Vrai si ce bouton « Détails » se dit déplié (aria-expanded, que RNTL lit comme l'état
 * « expanded »). On compare un booléen, jamais deux éléments par toBe (code.md, pièges de l'appli).
 */
const isUnfolded = (button: Element) =>
  screen
    .queryAllByRole('button', { name: fr.t(($) => $.suspension.details), expanded: true })
    .includes(button)

/**
 * L'e-mail ouvert par le dernier appel de `Linking.openURL` : l'adresse (« mailto:… ») et l'objet,
 * décodé (R9, `ContactLink` : `mailto:<contactEmail>?subject=…`).
 */
const mailOf = (openURL: jest.SpyInstance) => {
  const url = String(openURL.mock.calls.at(-1)?.[0] ?? '')
  const [address = '', query = ''] = url.split('?')
  return { address, subject: new URLSearchParams(query).get('subject') }
}

/** Ce texte de l'appli est à l'écran, seul ou dans un paragraphe plus long. */
const shows = (text: string) => screen.queryAllByText(containing(text)).length > 0

// Le stockage simulé d'AsyncStorage garde ses valeurs d'un test à l'autre : on le vide.
beforeEach(() => AsyncStorage.clear())

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

    // La fin, 23 h 30 UTC le 2 novembre : le 3 novembre à 00:30, heure de Paris (J4). Le 2
    // novembre ou 23 h 30 trahiraient une heure UTC.
    expect(
      screen.getByText(
        withParisEnd(fr.t(($) => $.suspension.headline, { date: 'DATE', time: 'TIME' })),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/23(?: h |:)30/)).toBeNull()
    expect(shows(fr.t(($) => $.suspension.headlineIndefinite))).toBe(false)
  })

  it('says « until further notice » when the suspension has no end', async () => {
    await renderBanner(indefiniteSuspension)

    expect(shows(fr.t(($) => $.suspension.headlineIndefinite))).toBe(true)
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

  it('tells how to contest: by an e-mail link, or before a court', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      await renderBanner()

      // L'adresse de contact est un lien qui ouvre la messagerie ; la justice est nommée (J3).
      expect(shows(fr.t(($) => $.suspension.contestLead))).toBe(true)
      expect(contactEmail).toMatch(/@/)
      await fireEvent.press(screen.getByRole('link', { name: contactEmail }))
      // R9 (J12) : l'e-mail part vers l'adresse de contact, avec un objet (test suivant).
      expect(openURL).toHaveBeenCalledTimes(1)
      expect(mailOf(openURL).address).toBe(`mailto:${contactEmail}`)
      expect(fr.t(($) => $.suspension.contestCourt)).toMatch(/justice/)
      expect(shows(fr.t(($) => $.suspension.contestCourt))).toBe(true)
    } finally {
      openURL.mockRestore()
    }
  })

  // R9 (J12, compliance-backlog n° 17) : « Contester » est un `ContactLink` dont l'objet nomme la
  // décision et sa date, « Contestation : suspension de mon compte du 27 oct. ». La suspension a
  // été posée le 26 octobre à 23 h 30 UTC : le 27 à 0 h 30, heure de Paris (J4) ; le 26 trahirait
  // une date UTC.
  it('opens mailto with a subject naming the decision and its date', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      await renderBanner()

      await fireEvent.press(screen.getByRole('link', { name: contactEmail }))

      const { address, subject } = mailOf(openURL)
      expect(address).toBe(`mailto:${contactEmail}`)
      const decision = fr.t(($) => $.removal.contestDecision.suspension)
      const expected = fr
        .t(($) => $.removal.contestSubject, { decision, date: 'DATE' })
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace('DATE', '27 oct[a-zé.]*(?: 2026)?')
      expect(subject).toMatch(new RegExp(`^${expected}$`))
    } finally {
      openURL.mockRestore()
    }
  })
})

// Décision de Louis du 27/10/2026 : replié hors de l'accueil, une fois la suspension vue.
describe('SuspensionBanner, folded', () => {
  it('shows only the strong line and « Détails » once the suspension was seen', async () => {
    await alreadySeen()
    const details = await renderElsewhere()

    expect(isUnfolded(details)).toBe(false)
    expect(
      screen.getByText(
        withParisEnd(fr.t(($) => $.suspension.headline, { date: 'DATE', time: 'TIME' })),
      ),
    ).toBeTruthy()
    // Rien du détail n'est dessiné : le lecteur d'écran ne le lit pas non plus.
    expect(shows(fr.t(($) => $.suspension.afterReport))).toBe(false)
    expect(shows(fr.t(($) => $.suspension.canStill))).toBe(false)
    expect(screen.queryByRole('link', { name: contactEmail })).toBeNull()
  })

  it('unfolds in place with « Détails », and folds back, never hiding the strong line', async () => {
    await alreadySeen()
    const details = await renderElsewhere()

    await fireEvent.press(details)
    const unfolded = screen.getByRole('button', {
      name: fr.t(($) => $.suspension.details),
      expanded: true,
    })
    expect(shows(fr.t(($) => $.suspension.afterReport))).toBe(true)
    expect(screen.getByRole('link', { name: contactEmail })).toBeTruthy()

    await fireEvent.press(unfolded)
    expect(shows(fr.t(($) => $.suspension.afterReport))).toBe(false)
    expect(shows(fr.t(($) => $.suspension.title))).toBe(true)
  })

  it('opens unfolded on the first visit after a new suspension, then remembers it', async () => {
    const details = await renderElsewhere()

    expect(isUnfolded(details)).toBe(true)
    expect(shows(fr.t(($) => $.suspension.afterReport))).toBe(true)
    expect(await AsyncStorage.getItem('suspension-seen')).toBe(
      suspensionSignature(sevenDaySuspension),
    )
  })

  it('opens unfolded again when the suspension changed (a new end)', async () => {
    await alreadySeen()
    const details = await renderElsewhere({
      ...sevenDaySuspension,
      endsAt: '2026-11-25T23:30:00.000Z',
    })

    expect(isUnfolded(details)).toBe(true)
  })

  it('opens unfolded on the home screen, even when already seen', async () => {
    await alreadySeen()
    await renderBanner()

    expect(
      screen.getByRole('button', { name: fr.t(($) => $.suspension.details), expanded: true }),
    ).toBeTruthy()
  })

  it('still shows, unfolded, when the storage of the device fails', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('private'))
    try {
      const details = await renderElsewhere(indefiniteSuspension)

      expect(isUnfolded(details)).toBe(true)
      expect(shows(fr.t(($) => $.suspension.headlineIndefinite))).toBe(true)
    } finally {
      getItem.mockRestore()
    }
  })
})
