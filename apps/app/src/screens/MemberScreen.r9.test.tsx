// Tests R9 de la page d'un membre (scénario refonte.md, ## R9) : la case « Signaler aussi son profil »
// de la fenêtre « Bloquer » (planche R9-Bloquer), les parties de son profil retirées par la
// modération, vues par leur seul auteur sur « Moi » (planche R9-Partie-Retiree, décision L2 de Louis :
// fondement, explication, date, « Contester » avec l'adresse écrite et son lien, la justice), et le
// bandeau du pseudo provisoire, qui reste sur « Moi » jusqu'au choix d'un autre pseudo.
//
// Comme MemberScreen.test.tsx : l'API (members/api, profile/api, blocks/api) est remplacée par de
// faux appels. Le bandeau se cherche sur la page « Moi » telle que la route la monte (app/me.tsx) :
// qu'il vive dans MemberScreen ou dans un écran qui l'enveloppe, le test le trouve.
import { contactEmail } from '@ruche/brand'
import type { Me, Member, RemovedPart } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { Linking } from 'react-native'
import MePage from '../../app/me'
import { useBlock, useUnblock } from '../blocks/api'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { pathOf, reportsOpened } from '../testing/navigation'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { MemberScreen } from './MemberScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../blocks/api', () => ({ useBlock: jest.fn(), useUnblock: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

const mockBlock = jest.fn()
const mockUnblock = jest.fn()

/** Le pseudo provisoire mis d'office par la modération (quatre signes au hasard, sans tiret). */
const provisionalHandle = 'membre_4f2a'

/** Une décision de la modération, le 12 novembre 2026 à 11 h, heure de Paris. */
const removal = {
  ground: 'rules' as const,
  explanation: 'Une bio qui renvoie vers un site de paris en ligne.',
  at: '2026-11-12T10:00:00.000Z',
  afterReport: true,
}
/** Le 12 novembre, tel qu'un texte `{{date}}` l'écrit (« 12 nov. », « 12 novembre », l'année ou non). */
const removalDay = '12 nov[a-zé.]*(?: 2026)?'

/** Sa bio retirée, que la page de son auteur relit (la colonne est vide pour tous). */
const removedBio: RemovedPart = {
  field: 'bio',
  mediaId: null,
  value: 'Mes pronostics gagnants sur paris-faciles.example',
  imageUrl: null,
  removal,
}

/** Son pseudo retiré : il est « @membre_4f2a » partout jusqu'à ce qu'il en choisisse un autre. */
const removedHandle: RemovedPart = {
  field: 'handle',
  mediaId: null,
  value: 'lea_la_vraie',
  imageUrl: null,
  removal,
}

/** Léa telle que /v1/me la décrit, pseudo provisoire ou non. */
const leaWith = (provisional: Me['provisional'], handle = leaMe.handle): Me => ({
  ...leaMe,
  handle,
  provisional,
})

/** Sa propre page (« Moi »), avec ces parties retirées. */
const myPage = (removedParts: RemovedPart[], changes: Partial<Member> = {}): Member => ({
  ...leaPage,
  isMe: true,
  removedParts,
  ...changes,
})

/** Ouvre le menu « … » de la page, une fois la page arrivée. */
const openMenu = async () => {
  await fireEvent.press(
    await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }),
  )
}

/** Un lien, ou à défaut un bouton, de ce nom (un geste qui mène ailleurs peut être l'un ou l'autre). */
const linkOrButton = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

/**
 * Le groupe de ce nom, une fois la page arrivée. Cherché par son nom, puis son rôle vérifié (comme
 * `group` de ui/RemovedPart.test.tsx) : `getByRole` ne trouve qu'une vue `accessible`, qui cacherait
 * à VoiceOver, sur iOS, les boutons et le lien qu'elle contient.
 */
const findGroup = async (name: string) => {
  const found = await screen.findByLabelText(name)
  expect(found.props.role ?? found.props.accessibilityRole).toBe('group')
  return found
}

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  mockBlock.mockReset().mockResolvedValue({ ok: true, data: null })
  mockUnblock.mockReset().mockResolvedValue({ ok: true, data: null })
  jest
    .mocked(useBlock)
    .mockReset()
    .mockReturnValue({ block: mockBlock } as unknown as ReturnType<typeof useBlock>)
  jest
    .mocked(useUnblock)
    .mockReset()
    .mockReturnValue({ unblock: mockUnblock } as unknown as ReturnType<typeof useUnblock>)
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest
    .mocked(getMember)
    .mockReset()
    .mockResolvedValue({ ...leaPage, removedParts: [] })
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, id: 'u2', name: 'Max', handle: 'max' })
  mockPush.mockReset()
  mockReplace.mockReset()
})

// --- Bloquer, et signaler aussi son profil (planche R9-Bloquer) ---

describe('blocking a member from her page, and reporting her profile too (R9)', () => {
  const alsoReport = fr.t(($) => $.block.alsoReport)

  /** Ouvre le menu, choisit « Bloquer », puis attend la fin de la garde des tapes de la fenêtre. */
  const askToBlock = async () => {
    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: fr.t(($) => $.block.action) }))
    await passTapGuard()
  }
  const confirm = () =>
    fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

  it('titles the window with her name and her handle', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()

    expect(
      screen.getByRole('header', {
        name: fr.t(($) => $.block.titleNamed, { name: 'Léa', handle: 'lea' }),
      }),
    ).toBeTruthy()
  })

  it('offers « Signaler aussi son profil » in the window, never checked beforehand', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()

    expect(screen.getByRole('checkbox', { name: alsoReport, checked: false })).toBeTruthy()
  })

  it('blocks her, then opens « Signaler ce profil » for her, when the box is checked', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('checkbox', { name: alsoReport }))
    await confirm()

    expect(mockBlock).toHaveBeenCalledTimes(1)
    expect(mockBlock).toHaveBeenCalledWith('u1')
    await waitFor(() =>
      expect(reportsOpened(mockPush, mockReplace)).toEqual([
        expect.objectContaining({ kind: 'member', id: 'u1' }),
      ]),
    )
    // D'abord le blocage, puis la feuille : le signalement ne part pas avant le geste confirmé.
    const blockedAt = mockBlock.mock.invocationCallOrder[0] ?? 0
    const openedAt = Math.max(
      ...mockPush.mock.invocationCallOrder,
      ...mockReplace.mock.invocationCallOrder,
    )
    expect(blockedAt).toBeLessThan(openedAt)
  })

  it('opens no report when the box is left unchecked', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await confirm()

    // Témoin : le blocage est parti, et la page le dit.
    expect(mockBlock).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(containing(fr.t(($) => $.block.notice, { handle: 'lea' }))),
    ).toBeTruthy()
    expect(reportsOpened(mockPush, mockReplace)).toEqual([])
  })

  it('opens no report when the block could not be saved', async () => {
    mockBlock.mockResolvedValue({ ok: false, error: 'internal' })
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('checkbox', { name: alsoReport }))
    await confirm()

    expect(await screen.findByText(containing(fr.t(($) => $.block.error)))).toBeTruthy()
    expect(reportsOpened(mockPush, mockReplace)).toEqual([])
  })
})

// --- Les parties de son profil retirées, vues par elle seule (planche R9-Partie-Retiree, L2) ---

describe('the removed parts of her own profile, on « Moi » (R9)', () => {
  beforeEach(() => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    jest.mocked(getMe).mockResolvedValue(leaWith({ name: false, handle: false }))
  })

  const bioTitle = fr.t(($) => $.removal.part.titles.bio)

  it('shows her removed bio as a group named by its title, with the ground, the explanation and the date', async () => {
    jest.mocked(getMember).mockResolvedValue(myPage([removedBio], { bio: '' }))
    await renderWithProviders(<MemberScreen id="u1" />)

    const group = await findGroup(bioTitle)
    const inside = within(group)
    expect(inside.getByText(containing(fr.t(($) => $.removal.grounds.rules)))).toBeTruthy()
    expect(inside.getByText(containing(removal.explanation))).toBeTruthy()
    const dated = fr
      .t(($) => $.removal.part.date, { date: 'DATE' })
      .replace(/\s+/g, ' ')
      .replace('DATE', removalDay)
    expect(inside.getByText(new RegExp(dated))).toBeTruthy()
    // Ce qui a été retiré, relu par son auteur seul : de quoi savoir quoi remplacer.
    expect(inside.getByText(containing(removedBio.value as string))).toBeTruthy()
  })

  it('writes the contact address in full next to « Contester », and names the courts', async () => {
    jest.mocked(getMember).mockResolvedValue(myPage([removedBio], { bio: '' }))
    await renderWithProviders(<MemberScreen id="u1" />)

    const inside = within(await findGroup(bioTitle))
    expect(inside.getByRole('link', { name: contactEmail })).toBeTruthy()
    expect(inside.getByText(containing(fr.t(($) => $.removal.part.court)))).toBeTruthy()
  })

  it('opens the mail with a subject naming the removal from her profile and its date', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      jest.mocked(getMember).mockResolvedValue(myPage([removedBio], { bio: '' }))
      await renderWithProviders(<MemberScreen id="u1" />)

      const inside = within(await findGroup(bioTitle))
      await fireEvent.press(inside.getByRole('link', { name: contactEmail }))

      expect(openURL).toHaveBeenCalledTimes(1)
      const [url] = openURL.mock.calls[0] ?? ['']
      const [address, query = ''] = url.split('?')
      expect(address).toBe(`mailto:${contactEmail}`)
      const subject = new URLSearchParams(query).get('subject') ?? ''
      // « Contestation : retrait de … de mon profil du 12 nov. » (J12) : la décision, puis sa date.
      const frame = fr.t(($) => $.removal.contestSubject, { decision: 'DECISION', date: 'DATE' })
      const [before = '', after = ''] = frame.split('DECISION')
      expect(subject.startsWith(before)).toBe(true)
      expect(subject).toContain(after.split('DATE')[0] ?? '')
      expect(subject).toMatch(new RegExp(removalDay))
      const ofMyProfile = fr
        .t(($) => $.removal.contestDecision.profilePart, { part: 'PART' })
        .split('PART')[1]
      expect(subject).toContain(ofMyProfile ?? '')
    } finally {
      openURL.mockRestore()
    }
  })

  it('shows her removed handle with the provisional one, and leads « Choisir mon pseudo » to her profile', async () => {
    jest.mocked(getMe).mockResolvedValue(leaWith({ name: false, handle: true }, provisionalHandle))
    jest.mocked(getMember).mockResolvedValue(myPage([removedHandle], { handle: provisionalHandle }))
    await renderWithProviders(<MemberScreen id="u1" />)

    const group = await findGroup(fr.t(($) => $.removal.part.titles.handle))
    expect(
      within(group).getByText(
        containing(fr.t(($) => $.removal.part.provisionalHandle, { handle: provisionalHandle })),
      ),
    ).toBeTruthy()
    await fireEvent.press(linkOrButton(fr.t(($) => $.removal.part.chooseHandle)))

    // La rubrique « Mon profil » des réglages, où se change le pseudo (comme « Modifier mon profil »).
    const went = [...mockPush.mock.calls, ...mockReplace.mock.calls].map(([href]) => pathOf(href))
    expect(went.some((path) => ['/settings/profile', '/profile'].includes(path))).toBe(true)
  })

  it('shows no removal on her page when nothing was removed', async () => {
    jest.mocked(getMember).mockResolvedValue(myPage([]))
    await renderWithProviders(<MemberScreen id="u1" />)

    // Témoin : sa page est là, avec sa bio.
    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText(leaPage.bio)).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.removal.part.court)))).toBeNull()
  })
})

// --- Le bandeau du pseudo provisoire, sur « Moi » (choix 6 de la session, décision L3) ---

describe('the provisional handle banner on « Moi » (R9)', () => {
  const banner = fr.t(($) => $.profile.provisional.bannerHandle, { handle: provisionalHandle })

  beforeEach(() => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
  })

  it('tells her the provisional handle on « Moi » until she chooses another one', async () => {
    jest.mocked(getMe).mockResolvedValue(leaWith({ name: false, handle: true }, provisionalHandle))
    jest.mocked(getMember).mockResolvedValue(myPage([removedHandle], { handle: provisionalHandle }))
    await renderWithProviders(<MePage />)

    expect(await screen.findByText(containing(banner))).toBeTruthy()
  })

  it('hides the provisional handle banner once the handle is restored', async () => {
    jest.mocked(getMe).mockResolvedValue(leaWith({ name: false, handle: true }, provisionalHandle))
    jest.mocked(getMember).mockResolvedValue(myPage([removedHandle], { handle: provisionalHandle }))
    const { queryClient } = await renderWithProviders(<MePage />)
    // Témoin : le bandeau est là tant que le pseudo est provisoire.
    expect(await screen.findByText(containing(banner))).toBeTruthy()

    // La modération rétablit son ancien pseudo : /v1/me et sa page relus le disent.
    jest.mocked(getMe).mockResolvedValue(leaWith({ name: false, handle: false }))
    jest.mocked(getMember).mockResolvedValue(myPage([]))
    await act(() => queryClient.invalidateQueries())

    await waitFor(() => expect(screen.queryByText(containing(banner))).toBeNull())
    expect(screen.getByText('@lea')).toBeTruthy()
  })

  it('shows no banner when her name and handle are her own', async () => {
    jest.mocked(getMe).mockResolvedValue(leaWith({ name: false, handle: false }))
    jest.mocked(getMember).mockResolvedValue(myPage([]))
    await renderWithProviders(<MePage />)

    // Témoin : sa page est là.
    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.queryByText(containing(banner))).toBeNull()
  })
})
