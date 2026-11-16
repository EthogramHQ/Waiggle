// Tests de la feuille « Partager » pour un projet public ou une page publique (tranche R12,
// docs/scenarios/refonte.md, « Partager », Q18, planche R12-Partager-Public) : le bandeau dit
// « Tout le monde pourra l'ouvrir. » à la place de « Seuls les membres… », le toast de « Copier le
// lien » le redit, et le lien est l'adresse de la page dans la langue de qui partage
// (`/fr/projects/<id>`, `/en/projects/<id>`), sans rien sur le membre qui partage. Une page
// publique se partage de même.
//
// Ce que ces tests supposent de la feuille (plan R12, UI-E et décision 11 de la relecture, B4 ; à
// corriger si le code en décide autrement, en le disant) :
// - `visibility` prend aussi `web` : un projet public (`<ShareSheet visibility={project.visibility}>`,
//   comme aujourd'hui) ou, pour `target.kind === 'member'`, une page publique (`Member.publicPage`,
//   la page du membre passe `visibility={member.publicPage ? 'web' : 'public'}`) ;
// - l'adresse d'une page publique vient de `navigation/publicPath.ts`, dans la langue de l'appli
//   de qui partage (i18n), sur l'adresse publique de l'appli (`webAppUrl`).
// L'adresse d'un projet « Membres » n'est pas fixée ici (question au rapport de R12).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { webAppUrl } from '../config'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { copyText } from './clipboard'
import { ShareSheet } from './ShareSheet'
import { shareLink } from './share'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./clipboard', () => ({ copyText: jest.fn() }))
jest.mock('./share', () => ({
  ...jest.requireActual('./share'),
  canShareNatively: jest.fn(() => true),
  shareLink: jest.fn(() => Promise.resolve()),
}))
// Les toasts : on note ce qui est affiché.
const mockToasts: string[] = []
jest.mock('./theme/toast', () => ({
  ...jest.requireActual('./theme/toast'),
  useToast: () => ({ show: (text: string) => mockToasts.push(text) }),
}))

const copy = jest.mocked(copyText)
const share = jest.mocked(shareLink)

const PROJECT = '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f'
const MEMBER = 'u-ines'

const t = {
  everyone: fr.t(($) => $.share.everyone),
  copiedEveryone: fr.t(($) => $.share.copiedEveryone),
  membersOnly: fr.t(($) => $.share.membersOnly),
  copiedMembers: fr.t(($) => $.share.copiedMembers),
  copy: fr.t(($) => $.share.copy),
  system: fr.t(($) => $.share.system),
}

/** L'adresse publique d'une page, sur l'adresse de l'appli. */
const addressOf = (path: string) => new URL(path, webAppUrl).href

type SheetProps = Partial<Parameters<typeof ShareSheet>[0]>

/** La feuille de « Décollage ! », public, ouverte. */
const PublicProjectSheet = (props: SheetProps) => (
  <ShareSheet
    open
    title="Décollage !"
    target={{ kind: 'project', id: PROJECT }}
    visibility="web"
    onClose={() => {}}
    {...props}
  />
)

/** La feuille de la page publique d'Inès, ouverte. */
const PublicPageSheet = (props: SheetProps) => (
  <ShareSheet
    open
    title="Inès Haddad"
    target={{ kind: 'member', id: MEMBER }}
    visibility="web"
    onClose={() => {}}
    {...props}
  />
)

beforeEach(() => {
  mockToasts.length = 0
  copy.mockReset()
  share.mockClear()
})

describe('ShareSheet, a public project (R12, Q18)', () => {
  it('says « Tout le monde pourra l’ouvrir. », never « Seuls les membres… »', async () => {
    await renderWithProviders(<PublicProjectSheet />)

    expect(screen.getByText(containing(t.everyone))).toBeTruthy()
    expect(screen.queryByText(containing(t.membersOnly))).toBeNull()
  })

  it('shows the address of the project in the language of the member who shares, French', async () => {
    await renderWithProviders(<PublicProjectSheet />)

    expect(screen.getByText(addressOf(`/fr/projects/${PROJECT}`))).toBeTruthy()
  })

  it('shows the English address to a member whose app is in English', async () => {
    await renderWithProviders(<PublicProjectSheet />, 'en')

    expect(screen.getByText(addressOf(`/en/projects/${PROJECT}`))).toBeTruthy()
  })

  it('copies that address, and nothing else, then says everyone can open it', async () => {
    copy.mockResolvedValue(true)
    await renderWithProviders(<PublicProjectSheet />)

    await fireEvent.press(screen.getByRole('button', { name: containing(t.copy) }))
    await act(async () => {})

    expect(copy).toHaveBeenCalledWith(addressOf(`/fr/projects/${PROJECT}`))
    expect(mockToasts).toEqual([t.copiedEveryone])
  })

  it('gives the same address to the share menu of the device', async () => {
    await renderWithProviders(<PublicProjectSheet />)

    await fireEvent.press(screen.getByRole('button', { name: containing(t.system) }))
    await act(async () => {})

    expect(share).toHaveBeenCalledWith(addressOf(`/fr/projects/${PROJECT}`))
  })

  it('still says « Seuls les membres… » for a project open to the members (témoin)', async () => {
    await renderWithProviders(<PublicProjectSheet visibility="public" />)

    expect(screen.getByText(containing(t.membersOnly))).toBeTruthy()
    expect(screen.queryByText(containing(t.everyone))).toBeNull()
  })
})

describe('ShareSheet, a public member page (R12)', () => {
  it('says « Tout le monde pourra l’ouvrir. » for a public page', async () => {
    await renderWithProviders(<PublicPageSheet />)

    expect(screen.getByText(containing(t.everyone))).toBeTruthy()
    expect(screen.queryByText(containing(t.membersOnly))).toBeNull()
  })

  it('shows the address of the page in the language of the member who shares', async () => {
    await renderWithProviders(<PublicPageSheet />)

    expect(screen.getByText(addressOf(`/fr/members/${MEMBER}`))).toBeTruthy()
  })

  it('says it again in the toast once the link is copied', async () => {
    copy.mockResolvedValue(true)
    await renderWithProviders(<PublicPageSheet />)

    await fireEvent.press(screen.getByRole('button', { name: containing(t.copy) }))
    await act(async () => {})

    expect(copy).toHaveBeenCalledWith(addressOf(`/fr/members/${MEMBER}`))
    expect(mockToasts).toEqual([t.copiedEveryone])
  })

  it('still says « Seuls les membres… » for a page that is not public (témoin)', async () => {
    await renderWithProviders(<PublicPageSheet visibility="public" />)

    expect(screen.getByText(containing(t.membersOnly))).toBeTruthy()
    expect(screen.queryByText(containing(t.everyone))).toBeNull()
  })
})
