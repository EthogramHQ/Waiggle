// Tests de la page de suppression du compte : on ne supprime qu'avec le bon mot de passe, et on
// peut d'abord télécharger ses données.
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { deleteAccount, downloadMyData } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { DeleteAccountScreen } from './DeleteAccountScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  deleteAccount: jest.fn(),
  downloadMyData: jest.fn(),
}))
const mockReplace = jest.fn()
const mockPush = jest.fn()
// R2 : la feuille se ferme en revenant aux réglages (back, ou replace sans historique).
const mockBack = jest.fn()
// Les états partagés (screens/states.tsx) importent la barre de navigation, qui importe le module du
// profil : on le remplace aussi, comme dans les autres tests d'écran.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}))

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(deleteAccount).mockReset()
  jest.mocked(downloadMyData).mockReset()
  jest.mocked(getMe).mockReset()
  mockReplace.mockReset()
  mockPush.mockReset()
  mockBack.mockReset()
})

describe('DeleteAccountScreen', () => {
  it('says what disappears with the account', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByText('Ton profil et ta photo')).toBeTruthy()
    expect(screen.getByText('Tes projets')).toBeTruthy()
    expect(screen.getByText('C’est immédiat et sans retour.')).toBeTruthy()
  })

  it('says that the reactions and comments of the member go with the account', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByText('Tes réactions et tes commentaires')).toBeTruthy()
  })

  it('says that the handle becomes free at once (slice 6a)', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByText('Ton pseudo')).toBeTruthy()
  })

  it('says that the notifications and mentions of the member go too (slice 6b)', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(
      screen.getByText('Tes notifications, et les liens vers toi dans les commentaires des autres'),
    ).toBeTruthy()
    // Le pseudo reste écrit dans le texte des autres : l'écran le dit, sans rien promettre de plus.
    expect(
      screen.getByText(/Ton pseudo y reste écrit, en texte simple, sans lien vers toi\./),
    ).toBeTruthy()
  })

  it('lets the member download their data first', async () => {
    jest.mocked(downloadMyData).mockResolvedValue({ ok: true })
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Télécharger mes données' }))

    expect(await screen.findByText('Tes données ont été téléchargées.')).toBeTruthy()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('cannot delete without typing the password first', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByRole('button', { name: 'Supprimer définitivement' })).toBeDisabled()
  })

  it('keeps the account and says so when the password is wrong', async () => {
    jest.mocked(deleteAccount).mockResolvedValue({ ok: false, error: 'wrongPassword' })
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.changeText(screen.getByLabelText('Confirme avec ton mot de passe'), 'nope')
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(deleteAccount).toHaveBeenCalledWith('nope')
    expect(screen.getByText('Mot de passe incorrect.')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('deletes the account once the password is confirmed, then goes home', async () => {
    jest.mocked(deleteAccount).mockResolvedValue({ ok: true })
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.changeText(
      screen.getByLabelText('Confirme avec ton mot de passe'),
      'correct-horse-battery',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('names the handle that becomes free (slice 6a)', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithI18n(<DeleteAccountScreen />)

    expect(
      await screen.findByText(
        '@lea, et l’ancien s’il t’est réservé : ils redeviennent libres aussitôt',
      ),
    ).toBeTruthy()
  })
})

// --- Tranche 7a : ce qui reste après la suppression (règle 24 de la relecture du plan) ---

describe('what remains after deleting the account', () => {
  it('says that the reports of the member and a trace of the removals stay one year', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(
      screen.getAllByText(containing(fr.t(($) => $.account.delete.remains.title))).length,
    ).toBe(1)
    // « Tes signalements restent, sans ton nom, un an »
    expect(
      screen.getAllByText(containing(fr.t(($) => $.account.delete.remains.reports))).length,
    ).toBeGreaterThan(0)
    // « Une trace des retraits de tes contenus reste un an »
    expect(
      screen.getAllByText(containing(fr.t(($) => $.account.delete.remains.removals))).length,
    ).toBeGreaterThan(0)
  })

  // Tranche 7b (relecture juridique du plan, J11) : la copie des textes signalés reste un temps.
  // Au conditionnel (« Si tes contenus ont été signalés »), car l'écran s'affiche pour tous.
  it('says that the copy of the texts reported stays 30 days, or one year if removed (slice 7b)', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(
      screen.getAllByText(containing(fr.t(($) => $.account.delete.remains.reportCopies))).length,
    ).toBeGreaterThan(0)
  })
})

// --- Tranche 7b : les blocages partent avec le compte ---

describe('the blocks of the member', () => {
  it('says that the members blocked, and the blocks aimed at the member, go with the account', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    // « Les membres que tu as bloqués », dans la liste de ce qui disparaît, avec son détail.
    expect(screen.getAllByText(containing(fr.t(($) => $.account.delete.blocksItem))).length).toBe(1)
    expect(
      screen.getAllByText(containing(fr.t(($) => $.account.delete.blocksDetail))).length,
    ).toBeGreaterThan(0)
  })
})

// --- Tranche R2 : la suppression dans une feuille posée sur les réglages (jur-12) ---
// Ce que Jest ne mesure pas : la photo du membre et les vignettes de ses projets en tête de la
// feuille (l'affaire des captures). Tout ce que la page disait reste : les tests ci-dessus le
// gardent ; ceux-ci vérifient que c'est bien dans la feuille.

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole
/** La feuille : l'élément nommé par son titre « Supprimer ton compte » (comme dans Sheet.test.tsx). */
const sheet = () => screen.getByLabelText(fr.t(($) => $.account.delete.sheetTitle))

describe('DeleteAccountScreen in a sheet (R2)', () => {
  it('opens as a modal dialog named « Supprimer ton compte », with a « Fermer » button', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(roleOf(sheet().props)).toBe('dialog')
    expect(
      sheet().props['aria-modal'] === true || sheet().props.accessibilityViewIsModal === true,
    ).toBe(true)
    expect(screen.getByRole('button', { name: fr.t(($) => $.common.close) })).toBeTruthy()
  })

  it('keeps everything the page said, inside the sheet: what goes, the handle, what remains, the export, « définitif », « Annuler »', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithI18n(<DeleteAccountScreen />)
    await screen.findByText(containing('@lea'))

    const inside = within(sheet())
    for (const sentence of [
      fr.t(($) => $.account.delete.intro),
      fr.t(($) => $.account.delete.profileItem),
      fr.t(($) => $.account.delete.projectsItem),
      fr.t(($) => $.account.delete.handleItem),
      fr.t(($) => $.account.delete.handleDetail, { handle: 'lea' }),
      fr.t(($) => $.account.delete.reactionsItem),
      fr.t(($) => $.account.delete.notificationsItem),
      fr.t(($) => $.account.delete.blocksItem),
      fr.t(($) => $.account.delete.remains.title),
      fr.t(($) => $.account.delete.remains.reports),
      fr.t(($) => $.account.delete.remains.removals),
      fr.t(($) => $.account.delete.remains.reportCopies),
      fr.t(($) => $.account.delete.exportHint),
      fr.t(($) => $.account.delete.warning),
    ]) {
      expect({ sentence, found: inside.queryAllByText(containing(sentence)).length > 0 }).toEqual({
        sentence,
        found: true,
      })
    }
    expect(inside.getByRole('button', { name: fr.t(($) => $.account.export.button) })).toBeTruthy()
    expect(inside.getByRole('button', { name: fr.t(($) => $.account.delete.submit) })).toBeTruthy()
    expect(inside.getByRole('button', { name: fr.t(($) => $.common.cancel) })).toBeTruthy()
    expect(inside.getByLabelText(fr.t(($) => $.account.delete.password))).toBeTruthy()
  })

  it('leaves the sheet through « Annuler » or « Fermer » without deleting anything', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.cancel) }))

    expect(deleteAccount).not.toHaveBeenCalled()
    const left =
      mockBack.mock.calls.length > 0 || visited(mockReplace, mockPush).includes('/settings')
    expect(left).toBe(true)
  })

  it('offers « Mot de passe oublié ? » next to the password', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.press(
      screen.getByRole('link', { name: fr.t(($) => $.auth.signIn.forgotPassword) }),
    )

    expect(visited(mockPush, mockReplace).map(pathOf)).toContain('/forgot-password')
  })

  it('shows neither a sad mascot nor a text that blames the member (jur-12)', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    // Aucune pose de la mascotte (ses textes de remplacement) n'est lue sur cette feuille.
    for (const alt of [
      fr.t(($) => $.mascot.search),
      fr.t(($) => $.mascot.wave),
      fr.t(($) => $.mascot.fly),
      fr.t(($) => $.mascot.sleep),
    ]) {
      expect(screen.queryAllByLabelText(containing(alt))).toEqual([])
    }
    // Témoin : la feuille est bien là.
    expect(screen.getByText(fr.t(($) => $.account.delete.warning))).toBeTruthy()
  })
})

// --- Relecture de l'interface (R2, B1) : pendant la suppression, rien ne quitte la feuille ---
// La suppression continue côté serveur : fermer la feuille ferait mentir « Annuler » sur une action
// définitive, puis l'appli renverrait quand même à l'accueil.

/** Tape le mot de passe et lance une suppression qui ne répond pas encore. */
const startSlowDeletion = async () => {
  let answer: (value: { ok: false; error: 'wrongPassword' }) => void = () => {}
  jest.mocked(deleteAccount).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve
    }),
  )
  await renderWithI18n(<DeleteAccountScreen />)
  await fireEvent.changeText(screen.getByLabelText('Confirme avec ton mot de passe'), 'secret')
  await fireEvent.press(screen.getByRole('button', { name: 'Supprimer définitivement' }))
  return () => act(async () => answer({ ok: false, error: 'wrongPassword' }))
}

/** La couche du Modal : l'élément qui reçoit onRequestClose (retour Android, Échap relâchée). */
const modalLayer = (): { props: { onRequestClose: () => void } } => {
  type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
  const all = (node: Host): Host[] => [
    node,
    ...node.children.flatMap((child) => (typeof child === 'string' ? [] : all(child))),
  ]
  const found = all(screen.root as unknown as Host).find(
    (node) => typeof node.props.onRequestClose === 'function',
  )
  if (!found) throw new Error('no Modal layer')
  return found as never
}

describe('while the account is being deleted', () => {
  it('disables « Annuler », « Fermer » and « Mot de passe oublié ? »', async () => {
    await startSlowDeletion()

    expect(screen.getByRole('button', { name: fr.t(($) => $.common.cancel) })).toBeDisabled()
    expect(screen.getByRole('button', { name: fr.t(($) => $.common.close) })).toBeDisabled()
    expect(
      screen.getByRole('link', { name: fr.t(($) => $.auth.signIn.forgotPassword) }),
    ).toBeDisabled()
  })

  it('does not leave the sheet through « Annuler », « Fermer » or the back button', async () => {
    await startSlowDeletion()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.cancel) }))
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))
    await act(() => modalLayer().props.onRequestClose())

    expect(mockBack).not.toHaveBeenCalled()
    expect(visited(mockReplace, mockPush)).toEqual([])
  })

  it('lets the member leave again once the deletion has failed (témoin)', async () => {
    const answer = await startSlowDeletion()
    await answer()

    expect(await screen.findByText('Mot de passe incorrect.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.cancel) }))

    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
