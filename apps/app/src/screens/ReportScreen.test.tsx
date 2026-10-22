// Tests de la page « Signaler » (tranche 6d) : Malik signale le commentaire de Sam sur « Météo ». La
// page montre ce qu'il signale (lu par l'API, jamais pris de l'adresse), propose les sept motifs et
// une précision facultative, puis remercie. Chaque refus de l'API a son propre texte.
//
// L'interface attendue de `src/reports/api.ts` (écrit par ui-dev) :
// - `useReportTarget(target: ReportTarget | null)` : la lecture de la cible (React Query), par
//   GET /v1/reports/target (règle 26 du plan), qui rend un `ReportTargetPreview` (`target`,
//   `text` actuel, `projectId`) ; null quand l'adresse ne décrit aucune cible valable, et la page
//   ne demande rien ;
// - `getReportTarget(target)` : la lecture elle-même, que ce test remplace ;
// - `sendReport(report: CreateReport)` : l'envoi, qui rend un `ApiResult` (`{ ok: true, data }` ou
//   `{ ok: false, error }`, la clé du message d'erreur).
// La page elle-même reçoit les paramètres bruts de l'adresse (app/report.tsx) : `kind` et `id`.
import type { ReportTarget, ReportTargetPreview } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getReportTarget, sendReport } from '../reports/api'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ReportScreen } from './ReportScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La lecture de la cible passe par un vrai React Query, autour d'une fausse lecture ; l'envoi est
// une fausse fonction dont le test choisit la réponse.
jest.mock('../reports/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getReportTarget = jest.fn()
  return {
    getReportTarget,
    sendReport: jest.fn(),
    useReportTarget: (target: { kind: string; id: string } | null) =>
      useQuery({
        queryKey: ['report-target', target?.kind, target?.id],
        queryFn: () => getReportTarget(target),
        enabled: target !== null,
      }),
  }
})
const mockPush = jest.fn()
const mockBack = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/report',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/** Le commentaire de Sam sur « Météo », que Malik signale. */
const commentId = 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d'
const projectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
const commentText = 'Envoie-moi le code de ta carte, je te débloque la version pro.'
const target: ReportTarget = { kind: 'comment', id: commentId }
/** Ce que rend GET /v1/reports/target pour ce commentaire (ReportTargetPreview). */
const preview: ReportTargetPreview = { target, text: commentText, projectId }

/** La page « Signaler » de ce commentaire, telle que l'ouvre l'action « Signaler ». */
const reportComment = () =>
  renderWithProviders(<ReportScreen kind="comment" id={commentId} />)

/** Les sept motifs, dans l'ordre du contrat (ReportReason). */
const reasonLabels = [
  'Contenu illégal',
  'Harcèlement ou haine',
  'Contenu sexuel ou violent',
  'Arnaque ou spam',
  'Usurpation d’identité',
  'Une photo ou une information sur moi sans mon accord',
  'Autre chose',
]

/** Choisit un motif (un bouton radio), puis envoie. */
const sendWith = async (reason: string) => {
  await fireEvent.press(await screen.findByRole('radio', { name: new RegExp(`^${reason}`) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }))
}

beforeEach(() => {
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  jest.mocked(getReportTarget).mockReset().mockResolvedValue(preview)
  jest
    .mocked(sendReport)
    .mockReset()
    .mockResolvedValue({ ok: true, data: { id: '0f1e2d3c-4b5a-4968-8776-655443322110' } })
  mockPush.mockReset()
  mockBack.mockReset()
  mockReplace.mockReset()
})

describe('what is reported', () => {
  it('shows the comment reported, as the API gives it', async () => {
    await reportComment()

    expect(await screen.findByText(commentText)).toBeTruthy()
    expect(screen.getByText('Le commentaire signalé')).toBeTruthy()
    // La cible vient de l'adresse, mais son texte de l'API : un lien fabriqué ne fait pas
    // signaler autre chose que ce qu'on lit.
    expect(getReportTarget).toHaveBeenCalledWith(target)
  })

  it('says « not found » when the API does not give the content (unknown, private, removed)', async () => {
    jest.mocked(getReportTarget).mockRejectedValue(new ApiError('notFound'))
    await reportComment()

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull()
  })

  it('says « not found » for a link that names no valid kind, without asking the API', async () => {
    await renderWithProviders(<ReportScreen kind="password" id={commentId} />)

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(getReportTarget).not.toHaveBeenCalled()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('says « not found » for an id that does not fit its kind, without asking the API', async () => {
    // Un commentaire a un identifiant uuid (ReportTarget du contrat).
    await renderWithProviders(<ReportScreen kind="comment" id="../../v1/me" />)

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(getReportTarget).not.toHaveBeenCalled()
  })

  it('asks a visitor to sign in, without asking the API', async () => {
    mockSession(null)
    await reportComment()

    expect(await screen.findByRole('button', { name: 'Me connecter' })).toBeTruthy()
    expect(getReportTarget).not.toHaveBeenCalled()
  })

  it('names each kind of target', async () => {
    jest.mocked(getReportTarget).mockResolvedValue({
      target: { kind: 'member', id: 'u7' },
      text: 'Lucas Martin (@lucas_martin)',
      projectId: null,
    })
    await renderWithProviders(<ReportScreen kind="member" id="u7" />)

    expect(await screen.findByText('Lucas Martin (@lucas_martin)')).toBeTruthy()
    expect(screen.getByText('Le profil signalé')).toBeTruthy()
    expect(getReportTarget).toHaveBeenCalledWith({ kind: 'member', id: 'u7' })
  })
})

describe('the form', () => {
  it('offers the seven reasons as choices, in order', async () => {
    await reportComment()

    await screen.findByText(commentText)
    const radios = screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)
    // Les libellés commencent par le motif (une ligne peut ajouter une précision après).
    expect(radios).toHaveLength(7)
    radios.forEach((label, i) => {
      expect(label).toMatch(new RegExp(`^${reasonLabels[i]}`))
    })
  })

  it('says the person concerned will not know who reported, and that the moderation does', async () => {
    // Règle 20 : la base garde qui signale ; ne rien promettre de plus.
    await reportComment()

    await screen.findByText(commentText)
    expect(screen.getAllByText(containing(fr.t('report.anonymity'))).length).toBeGreaterThan(0)
  })

  it('asks not to add needless personal information', async () => {
    await reportComment()

    await screen.findByText(commentText)
    expect(screen.getAllByText(containing(fr.t('report.detailsHint'))).length).toBeGreaterThan(0)
  })

  it('says to call 112 when someone is in danger', async () => {
    await reportComment()

    await screen.findByText(commentText)
    expect(screen.getAllByText(containing(fr.t('report.danger'))).length).toBeGreaterThan(0)
  })

  it('offers an optional precision of 500 characters at most, with a counter', async () => {
    await reportComment()

    const field = await screen.findByLabelText('Précision (facultatif)')
    await fireEvent.changeText(field, 'Même message sous trois projets.')

    expect(screen.getByText('32 / 500')).toBeTruthy()
  })

  it('asks why, and for good faith, when the content is said to be illegal', async () => {
    // Règle 20 (article 16 du DSA) : pour un contenu illégal, « Dis-nous pourquoi » et une phrase
    // de bonne foi.
    await reportComment()

    await fireEvent.press(await screen.findByRole('radio', { name: /^Contenu illégal/ }))

    expect(screen.getByLabelText('Dis-nous pourquoi')).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t('report.illegalHint'))).length).toBeGreaterThan(0)
  })

  it('asks for no good faith for another reason', async () => {
    await reportComment()

    await fireEvent.press(await screen.findByRole('radio', { name: /^Arnaque ou spam/ }))

    // Témoin : le champ de la précision est là, sous son nom habituel.
    expect(screen.getByLabelText('Précision (facultatif)')).toBeTruthy()
    expect(screen.queryByText(containing(fr.t('report.illegalHint')))).toBeNull()
  })
})

describe('sending a report', () => {
  it('sends the target, the reason and the precision', async () => {
    await reportComment()

    await fireEvent.press(await screen.findByRole('radio', { name: /^Harcèlement ou haine/ }))
    await fireEvent.changeText(
      screen.getByLabelText('Précision (facultatif)'),
      'Même message sous trois projets.',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }))

    expect(sendReport).toHaveBeenCalledTimes(1)
    expect(sendReport).toHaveBeenCalledWith({
      target,
      reason: 'harassment',
      details: 'Même message sous trois projets.',
    })
  })

  it('sends nothing before a reason is chosen', async () => {
    await reportComment()

    await screen.findByText(commentText)
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }))

    expect(sendReport).not.toHaveBeenCalled()
  })

  it('thanks the member: the moderation will look at it', async () => {
    await reportComment()

    await sendWith('Arnaque ou spam')

    expect(await screen.findByText(containing('Merci, ton signalement a été envoyé.'))).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t('report.sent'))).length).toBeGreaterThan(0)
    // Le formulaire a laissé la place au remerciement.
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull()
  })

  it('goes back to the page it came from once thanked', async () => {
    await reportComment()
    await sendWith('Arnaque ou spam')

    await fireEvent.press(await screen.findByRole('button', { name: 'Revenir' }))

    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('sends only one report for a double tap', async () => {
    // La réponse reste en attente : le second appui arrive pendant l'envoi.
    type Sent = Awaited<ReturnType<typeof sendReport>>
    let answer: (value: Sent) => void = () => {}
    jest.mocked(sendReport).mockReturnValue(
      new Promise<Sent>((resolve) => {
        answer = resolve
      }),
    )
    await reportComment()

    await fireEvent.press(await screen.findByRole('radio', { name: /^Arnaque ou spam/ }))
    const send = screen.getByRole('button', { name: 'Envoyer' })
    await fireEvent.press(send)
    await fireEvent.press(send)

    expect(sendReport).toHaveBeenCalledTimes(1)
    await act(async () =>
      answer({ ok: true, data: { id: '0f1e2d3c-4b5a-4968-8776-655443322110' } }),
    )
  })
})

describe('a report refused by the API', () => {
  /** L'envoi refusé avec cette clé d'erreur (api/errors.ts). */
  const refuse = (error: string) =>
    jest
      .mocked(sendReport)
      .mockResolvedValue({ ok: false, error } as Awaited<ReturnType<typeof sendReport>>)

  it('says when the member already reported this content', async () => {
    refuse('alreadyReported')
    await reportComment()

    await sendWith('Arnaque ou spam')

    expect(await screen.findByText(containing(fr.t('errors.alreadyReported')))).toBeTruthy()
    expect(screen.queryByText(containing(fr.t('report.sent')))).toBeNull()
  })

  it('says when the daily limit of reports is reached', async () => {
    refuse('rateLimited')
    await reportComment()

    await sendWith('Arnaque ou spam')

    expect(await screen.findByText(containing(fr.t('errors.rateLimited')))).toBeTruthy()
    expect(screen.queryByText(containing(fr.t('report.sent')))).toBeNull()
  })

  it('says when the content is no longer there', async () => {
    refuse('notFound')
    await reportComment()

    await sendWith('Arnaque ou spam')

    expect(await screen.findByText(containing(fr.t('errors.notFound')))).toBeTruthy()
    expect(screen.queryByText(containing(fr.t('report.sent')))).toBeNull()
  })

  it('says one cannot report one’s own content', async () => {
    // Les points d'entrée ne le proposent jamais ; un lien fabriqué, si.
    refuse('ownContent')
    await reportComment()

    await sendWith('Arnaque ou spam')

    expect(await screen.findByText(containing(fr.t('errors.ownContent')))).toBeTruthy()
  })

  it('offers to sign in again, back to this page, when the session expired', async () => {
    refuse('unauthorized')
    await reportComment()

    await sendWith('Arnaque ou spam')

    expect(await screen.findByText(containing(fr.t('states.expired')))).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(visited(mockPush)).toContain('/sign-in?next=/report')
  })

  it('keeps the reason and the precision chosen, to send again', async () => {
    refuse('internal')
    await reportComment()

    await fireEvent.press(await screen.findByRole('radio', { name: /^Arnaque ou spam/ }))
    await fireEvent.changeText(screen.getByLabelText('Précision (facultatif)'), 'Trois fois.')
    await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText(containing(fr.t('errors.internal')))).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Arnaque ou spam/, checked: true })).toBeTruthy()
    expect(screen.getByLabelText('Précision (facultatif)')).toHaveDisplayValue('Trois fois.')
  })
})
