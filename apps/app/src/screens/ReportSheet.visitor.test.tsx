// Tests de la feuille « Signaler » ouverte par un visiteur sans compte (tranche R12, scénario « Le
// signalement par un visiteur », planches R12-Visiteur-Signaler et R12-Visiteur-Signale) : la feuille
// de R9, en deux étapes (la partie, puis le motif), sur un projet public, une de ses mises à jour ou
// une page publique ; un champ « Ton adresse e‑mail, facultative » ; ni nom, ni « Bloquer aussi » ;
// « La modération lit chaque signalement. » ; « Signalement envoyé » ; au-delà de 5 par jour depuis
// une connexion, la phrase du quota avec l'adresse de contact (relecture juridique, 4).
//
// L'interface attendue (plan R12, UI-D, décisions 10 et 12) : la même feuille,
// `ReportSheet({ kind, id })` sur `/report?kind=…&id=…` ; sans session, elle lit
// GET /v1/public/reports/target?kind=&id= et envoie POST /v1/public/reports (`VisitorReport`),
// 204 sans corps (rapport de K1) ; 429 `visitor_report_quota` au-delà du quota. Le faux serveur, les
// données et le faux routeur : Public.testkit.tsx.
import { contactEmail } from '@ruche/brand'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  decollageId,
  decollageTarget,
  inesId,
  publicServer,
  requested,
  resetPublic,
  updateId,
} from './Public.testkit'
import { ReportSheet } from './ReportSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Bloquer demande un compte : la feuille d'un visiteur n'y touche jamais.
const mockBlock = jest.fn()
jest.mock('../blocks/api', () => ({ useBlock: () => ({ block: mockBlock }) }))
jest.mock('expo-router', () => {
  const kit = () => require('./Public.testkit').mockNav
  return {
    useRouter: () => kit().router,
    usePathname: () => kit().pathname,
    useNavigation: () => kit().navigation,
    useLocalSearchParams: () => kit().params,
    useGlobalSearchParams: () => kit().params,
    useSegments: () => [],
    useFocusEffect: () => {},
    useIsFocused: () => true,
  }
})

const T = {
  titleProject: fr.t(($) => $.report.project),
  titleUpdate: fr.t(($) => $.report.update),
  titleMember: fr.t(($) => $.report.member),
  partQuestion: fr.t(($) => $.report.partQuestion),
  reasonQuestion: fr.t(($) => $.report.reasonLabel),
  continue: fr.t(($) => $.report.continue),
  submit: fr.t(($) => $.report.submit),
  email: fr.t(($) => $.report.visitor.email),
  emailHint: fr.t(($) => $.report.visitor.emailHint),
  moderationReads: fr.t(($) => $.report.visitor.moderationReads),
  anonymity: fr.t(($) => $.report.anonymity),
  goodFaith: fr.t(($) => $.report.goodFaith),
  sentTitle: fr.t(($) => $.report.sentTitle),
  sentBody: fr.t(($) => $.report.visitor.sentBody),
  sentBodyEmail: fr.t(($) => $.report.visitor.sentBodyEmail),
  memberSentBody: fr.t(($) => $.report.sentBody),
  limited: fr.t(($) => $.report.visitor.limited, { contactEmail }),
  gone: fr.t(($) => $.report.gone),
  wholeProject: fr.t(($) => $.report.whole.project),
  wholeUpdate: fr.t(($) => $.report.whole.update),
  title: fr.t(($) => $.report.parts.title),
  updateText: fr.t(($) => $.report.parts.text),
  firstPhoto: fr.t(($) => $.report.parts.photo, { rank: fr.t(($) => $.report.rank.first) }),
  illegal: fr.t(($) => $.report.reasons.illegal),
  scam: fr.t(($) => $.report.reasons.scamSpam),
}

beforeEach(() => {
  resetPublic('/report', { kind: 'project', id: decollageId })
  mockSession(null)
  mockBlock.mockReset()
})

/** Ouvre la feuille sur cette cible et attend son titre, puis la fin de la garde des tapes. */
const openSheet = async (kind: string, id: string, title: string) => {
  await renderWithProviders(<ReportSheet kind={kind} id={id} />)
  await screen.findByRole('header', { name: title })
  await passTapGuard()
}
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }))
const radio = (label: string) => screen.getByRole('radio', { name: new RegExp(`^${label}`) })
const radioLabels = () =>
  screen.getAllByRole('radio').map((one) => String(one.props.accessibilityLabel ?? ''))
const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0
const emailField = () => screen.getByLabelText(containing(T.email))

/** De « Quelle partie ? » au motif. */
const toReason = async () => {
  await press(T.continue)
  await screen.findByText(containing(T.reasonQuestion))
}
/** Choisit un motif, écrit (ou non) une adresse, et envoie. */
const sendWith = async (reason: string, email?: string) => {
  await toReason()
  await fireEvent.press(radio(reason))
  if (email !== undefined) await fireEvent.changeText(emailField(), email)
  await passTapGuard()
  await press(T.submit)
}
const posted = () => publicServer.sent.filter(({ method }) => method === 'POST')

describe('the report sheet of a visitor (R12)', () => {
  it('reads the target from the public route, never from the members one', async () => {
    await openSheet('project', decollageId, T.titleProject)

    const read = publicServer.sent.find(({ path }) => path === '/v1/public/reports/target')
    expect(read?.query.get('kind')).toBe('project')
    expect(read?.query.get('id')).toBe(decollageId)
    expect(requested()).not.toContain('GET /v1/reports/target')
  })

  it('asks for the part of a public project first, « Tout le projet » chosen', async () => {
    await openSheet('project', decollageId, T.titleProject)

    expect(shown(T.partQuestion)).toBe(true)
    const labels = radioLabels()
    expect(labels[0]).toMatch(new RegExp(`^${T.wholeProject}`))
    expect(labels.some((label) => label.startsWith(T.title))).toBe(true)
    expect(labels.some((label) => label.startsWith(T.firstPhoto))).toBe(true)
    // Jamais le pseudo (Q8).
    expect(labels.some((label) => label.startsWith(fr.t(($) => $.report.parts.handle)))).toBe(false)
  })

  it('lists the parts of a public update before the reason', async () => {
    resetPublic('/report', { kind: 'update', id: updateId })
    await openSheet('update', updateId, T.titleUpdate)

    const labels = radioLabels()
    expect(labels[0]).toMatch(new RegExp(`^${T.wholeUpdate}`))
    expect(labels.some((label) => label.startsWith(T.updateText))).toBe(true)
    expect(labels.some((label) => label.startsWith(T.firstPhoto))).toBe(true)
  })

  it('reports a public profile', async () => {
    resetPublic('/report', { kind: 'member', id: inesId })
    await openSheet('member', inesId, T.titleMember)

    expect(shown('Inès Haddad')).toBe(true)
  })

  it('then offers the eight reasons of R9', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await toReason()

    const reasons = [
      fr.t(($) => $.report.reasons.illegal),
      fr.t(($) => $.report.reasons.harassment),
      fr.t(($) => $.report.reasons.sexualViolent),
      fr.t(($) => $.report.reasons.scamSpam),
      fr.t(($) => $.report.reasons.impersonation),
      fr.t(($) => $.report.reasons.privacy),
      fr.t(($) => $.report.reasons.dangerousLink),
      fr.t(($) => $.report.reasons.other),
    ]
    const labels = radioLabels()
    for (const reason of reasons) {
      expect(labels.some((label) => label.startsWith(reason))).toBe(true)
    }
  })

  it('asks for an optional e-mail address, named, typed as an e-mail, with its hint', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await toReason()

    const field = emailField()
    const props = field.props as Record<string, unknown>
    expect(
      props.keyboardType === 'email-address' ||
        props.inputMode === 'email' ||
        props.type === 'email',
    ).toBe(true)
    expect(shown(T.emailHint)).toBe(true)
  })

  it('has no name field and no « Bloquer aussi »', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await toReason()

    // Témoin : le champ d'adresse est là.
    expect(emailField()).toBeTruthy()
    expect(screen.queryByLabelText(/nom/i)).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(shown('Bloquer aussi')).toBe(false)
  })

  it('says « La modération lit chaque signalement. », not the anonymity sentence of a member', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await toReason()

    expect(shown(T.moderationReads)).toBe(true)
    expect(shown(T.anonymity)).toBe(false)
  })

  it('keeps the good-faith sentence for an illegal content', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await toReason()
    await fireEvent.press(radio(T.illegal))

    expect(shown(T.goodFaith)).toBe(true)
  })

  it('sends the report with the address to the public route, then says it was sent', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await sendWith(T.scam, 'yanis.papa@exemple.fr')

    expect(await screen.findByRole('header', { name: containing(T.sentTitle) })).toBeTruthy()
    expect(shown(T.sentBodyEmail)).toBe(true)
    expect(posted()).toHaveLength(1)
    expect(posted()[0]?.path).toBe('/v1/public/reports')
    expect(posted()[0]?.body).toMatchObject({
      target: { kind: 'project', id: decollageId },
      reason: 'scam_spam',
      email: 'yanis.papa@exemple.fr',
    })
    expect(mockBlock).not.toHaveBeenCalled()
  })

  it('without an address, says only that the moderation will look at it', async () => {
    await openSheet('project', decollageId, T.titleProject)
    await sendWith(T.scam)

    expect(await screen.findByRole('header', { name: containing(T.sentTitle) })).toBeTruthy()
    expect(shown(T.sentBodyEmail)).toBe(false)
    expect(shown(T.memberSentBody)).toBe(false)
    expect(shown(T.sentBody)).toBe(true)
    const body = posted()[0]?.body as Record<string, unknown> | undefined
    expect(body?.email === undefined || body?.email === '').toBe(true)
  })

  it('says the limit of the connection with the contact address when the API refuses', async () => {
    publicServer.reportReply = { status: 429, body: { error: { code: 'visitor_report_quota' } } }
    await openSheet('project', decollageId, T.titleProject)
    await sendWith(T.scam)

    await waitFor(() => expect(shown(T.limited)).toBe(true))
    expect(shown(contactEmail)).toBe(true)
  })

  it('says the limit as soon as it opens when the connection has none left today', async () => {
    publicServer.targets.set(`project:${decollageId}`, { ...decollageTarget, remainingToday: 0 })
    await renderWithProviders(<ReportSheet kind="project" id={decollageId} />)

    await waitFor(() => expect(shown(contactEmail)).toBe(true))
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
  })

  it('says « Ce contenu n’est plus là. » for a target that is not public', async () => {
    publicServer.targets.clear()
    await renderWithProviders(<ReportSheet kind="project" id={decollageId} />)

    await waitFor(() => expect(shown(T.gone)).toBe(true))
  })

  it('asks nothing of the API for a kind a visitor cannot report (a comment)', async () => {
    const commentId = 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d'
    resetPublic('/report', { kind: 'comment', id: commentId })
    await renderWithProviders(<ReportSheet kind="comment" id={commentId} />)
    // Témoin : la feuille est là, sous le titre de sa cible.
    await screen.findByRole('header', { name: fr.t(($) => $.report.comment) })
    await passTapGuard()

    expect(publicServer.sent).toHaveLength(0)
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    expect(screen.queryByRole('button', { name: T.continue })).toBeNull()
  })
})
