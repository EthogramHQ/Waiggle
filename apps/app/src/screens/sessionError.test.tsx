// Une lecture de session en échec n'est pas « personne de connecté » (PR « erreurs de session »).
// `useSession` de Better Auth rend `data: null` aussi quand la lecture échoue (429 « trop de
// demandes », serveur en panne, pas de réseau). Chaque écran réservé aux membres doit alors
// proposer « Réessayer » (SessionErrorScreen, screens/states.tsx), jamais « Réservé aux membres »
// ni « Me connecter » à un membre bien connecté. Les écrans passent pour cela par useMemberSession
// (accounts/session.ts, testé dans accounts/session.test.ts).
//
// Un seul fichier pour tous les écrans : `jest.mock` vaut pour tout un fichier, donc les faux
// modules ci-dessous réunissent ceux des tests de chaque écran (leurs fichiers `*.test.tsx`), avec
// les mêmes formes. Aucune donnée n'arrive : la page doit s'arrêter à l'erreur de session.
import type { Translation } from '@ruche/i18n'
import { fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import type { ReactElement } from 'react'
import { useSession } from '../accounts/api'
import { request } from '../api/client'
import { useBlock, useBlockedMembers, useUnblock } from '../blocks/api'
import { useFollow } from '../follows/api'
import { getMember, getTag } from '../members/api'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { getProject } from '../projects/api'
import { getReportTarget } from '../reports/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useHydrated } from '../ui/theme/hydration'
import { BlockedMembersScreen } from './BlockedMembersScreen'
import { ChangeEmailScreen } from './ChangeEmailScreen'
import { ChangePasswordScreen } from './ChangePasswordScreen'
import { DeleteAccountScreen } from './DeleteAccountScreen'
import { EmailChangeResultScreen } from './EmailChangeResultScreen'
import { MemberScreen } from './MemberScreen'
import { ModerationScreen } from './ModerationScreen'
import { NotificationsScreen } from './NotificationsScreen'
import { ProfileScreen } from './ProfileScreen'
import { ProjectFormScreen } from './ProjectFormScreen'
import { ProjectScreen } from './ProjectScreen'
import { ReportScreen } from './ReportScreen'
import { SettingsScreen } from './SettingsScreen'
import { SuspendScreen } from './SuspendScreen'
import { TagScreen } from './TagScreen'

// Les comptes : la session (choisie par chaque test) et les gestes des pages de R2.
jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  downloadMyData: jest.fn(),
  changePassword: jest.fn(),
  changeEmail: jest.fn(),
  deleteAccount: jest.fn(),
}))
// Le client réseau (réglages d'e-mail des réglages) : rien ne part sur le réseau.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Le profil (barre du haut, suspension, rôle d'administrateur) et ses gestes.
jest.mock('../profile/api', () => ({
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
// Les projets (page d'un projet, formulaire de création et de modification).
jest.mock('../projects/api', () => ({
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  pickVisual: jest.fn(),
  uploadVisual: jest.fn(),
  deleteVisual: jest.fn(),
}))
// Les gestes d'une page de projet ou de membre : de faux hooks.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../blocks/api', () => ({
  useBlock: jest.fn(),
  useUnblock: jest.fn(),
  useBlockedMembers: jest.fn(),
}))
// Les membres et les étiquettes : un vrai React Query autour de fausses lectures, comme dans
// MemberScreen.test.tsx, SuspendScreen.test.tsx et TagScreen.test.tsx.
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  const getTag = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
    getTag,
    useTag: (slug: string, enabled = true) =>
      useQuery({ queryKey: ['tag', slug], queryFn: () => getTag(slug), enabled }),
  }
})
jest.mock('../notifications/api', () => ({
  useNotifications: jest.fn(),
  useMarkSeen: jest.fn(),
  useUnreadCount: jest.fn(),
}))
jest.mock('../moderation/api', () => ({
  useModerationQueue: jest.fn(),
  useRemovedItems: jest.fn(),
  useDecide: jest.fn(),
  useDecisionHistory: jest.fn(),
}))
// Le signalement : la lecture de la cible par un vrai React Query, comme dans ReportScreen.test.tsx.
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
// La page « adresse changée » attend l'hydratation (ui/theme/hydration.ts) : vraie par défaut,
// imposée à « hydratée » pour son cas, comme dans EmailChangeResultScreen.test.tsx.
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))
// L'adresse de la page, choisie par chaque cas : les feuilles de R2 ne s'ouvrent que sur la leur.
let mockPathname = '/page/actuelle'
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports. Un `Link`
// d'Expo Router devient un simple texte au rôle de lien (comme dans SettingsScreen.test.tsx).
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => mockPathname,
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: jest.fn(),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

/** Une lecture qui n'arrive jamais : aucune donnée ne doit être nécessaire à l'état d'erreur. */
const never = () => new Promise<never>(() => {})

/** Ce que rend un useInfiniteQuery de React Query, vide (comme dans ModerationScreen.test.tsx). */
const emptyInfinite = () => ({
  data: { pages: [], pageParams: [] },
  status: 'success',
  isPending: false,
  isLoading: false,
  isSuccess: true,
  isError: false,
  isFetchNextPageError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

/**
 * La lecture de session en échec : pas de session, et une erreur (429, « trop de demandes »).
 * Renvoie la fausse fonction `refetch`, que « Réessayer » doit appeler.
 */
const failSessionRead = () => {
  const refetch = jest.fn().mockResolvedValue(undefined)
  jest.mocked(useSession).mockReturnValue({
    data: null,
    isPending: false,
    error: { status: 429 },
    refetch,
  } as unknown as ReturnType<typeof useSession>)
  return refetch
}

beforeEach(() => {
  mockPathname = '/page/actuelle'
  jest.mocked(useLocalSearchParams).mockReset().mockReturnValue({})
  const { useHydrated: hydrated } = jest.requireActual('../ui/theme/hydration')
  jest.mocked(useHydrated).mockReset().mockImplementation(hydrated)
  jest.mocked(request).mockReset().mockResolvedValue({ ok: false, error: 'notFound' })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(getProject).mockReset().mockImplementation(never)
  jest.mocked(getMember).mockReset().mockImplementation(never)
  jest.mocked(getTag).mockReset().mockImplementation(never)
  jest.mocked(getReportTarget).mockReset().mockImplementation(never)
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest
    .mocked(useBlock)
    .mockReset()
    .mockReturnValue({ block: jest.fn() } as unknown as ReturnType<typeof useBlock>)
  jest
    .mocked(useUnblock)
    .mockReset()
    .mockReturnValue({ unblock: jest.fn() } as unknown as ReturnType<typeof useUnblock>)
  jest
    .mocked(useBlockedMembers)
    .mockReset()
    .mockReturnValue(emptyInfinite() as unknown as ReturnType<typeof useBlockedMembers>)
  jest
    .mocked(useNotifications)
    .mockReset()
    .mockReturnValue(emptyInfinite() as unknown as ReturnType<typeof useNotifications>)
  jest.mocked(useMarkSeen).mockReset().mockReturnValue({ markSeen: jest.fn() })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  jest
    .mocked(useModerationQueue)
    .mockReset()
    .mockReturnValue(emptyInfinite() as unknown as ReturnType<typeof useModerationQueue>)
  jest
    .mocked(useRemovedItems)
    .mockReset()
    .mockReturnValue(emptyInfinite() as unknown as ReturnType<typeof useRemovedItems>)
  jest
    .mocked(useDecisionHistory)
    .mockReset()
    .mockReturnValue(emptyInfinite() as unknown as ReturnType<typeof useDecisionHistory>)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

// Chaque écran réservé aux membres : son nom, l'écran tel que l'ouvre sa route (mêmes props que
// dans son test), et l'adresse de sa page.
const screens: [string, () => ReactElement, string][] = [
  ['ProjectScreen', () => <ProjectScreen id={recipesProject.id} />, '/page/actuelle'],
  ['MemberScreen', () => <MemberScreen id="u1" />, '/page/actuelle'],
  ['NotificationsScreen', () => <NotificationsScreen />, '/notifications'],
  ['ModerationScreen', () => <ModerationScreen />, '/moderation'],
  ['ProjectFormScreen (new project)', () => <ProjectFormScreen />, '/page/actuelle'],
  [
    'ProjectFormScreen (editing)',
    () => <ProjectFormScreen id={recipesProject.id} />,
    '/page/actuelle',
  ],
  [
    'ReportScreen',
    () => <ReportScreen kind="comment" id="c0d1e2f3-0415-4a26-8b37-48596a7b8c9d" />,
    '/report',
  ],
  ['SuspendScreen', () => <SuspendScreen memberId="u1" />, '/suspend'],
  ['TagScreen', () => <TagScreen slug="claude-code" />, '/page/actuelle'],
  ['BlockedMembersScreen', () => <BlockedMembersScreen />, '/blocks'],
  ['ProfileScreen', () => <ProfileScreen />, '/page/actuelle'],
  // Les quatre écrans de R2, qui traitaient déjà l'erreur : témoins de la même attente.
  ['SettingsScreen', () => <SettingsScreen />, '/settings'],
  ['ChangePasswordScreen', () => <ChangePasswordScreen />, '/settings/security/password'],
  ['ChangeEmailScreen', () => <ChangeEmailScreen />, '/account/email'],
  ['DeleteAccountScreen', () => <DeleteAccountScreen />, '/page/actuelle'],
]

describe('a session that cannot be read', () => {
  it.each(screens)('%s offers to retry, not to sign in', async (_name, render, pathname) => {
    mockPathname = pathname
    const refetch = failSessionRead()
    await renderWithProviders(render())

    expect(
      await screen.findByRole('header', { name: fr.t(($) => $.states.errorTitle) }),
    ).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.states.signedOutTitle))).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('the « address changed » page, when the session cannot be read', () => {
  // Les textes de la page, tirés des traductions françaises (les mêmes que l'écran).
  const text = (key: keyof Translation['account']['emailChange']) =>
    fr.t(($) => $.account.emailChange[key])

  it('keeps its title, and offers to retry rather than to sign in', async () => {
    // Le second lien a réussi (aucun `?error=`) : l'adresse est bien changée, quoi qu'il arrive à
    // la session. Mais une lecture en échec ne dit pas que personne n'est connecté : ni
    // « Connecte-toi avec ta nouvelle adresse », ni « Me connecter ».
    mockPathname = '/email-change/done'
    jest.mocked(useHydrated).mockReturnValue(true)
    const refetch = failSessionRead()
    await renderWithProviders(<EmailChangeResultScreen step="done" />)

    expect(await screen.findByRole('header', { name: text('doneTitle') })).toBeTruthy()
    // `containing` : la phrase peut être coupée ou porter des espaces insécables (testing/text.ts).
    expect(screen.queryAllByText(containing(text('doneSignedOut')))).toHaveLength(0)
    expect(screen.queryByRole('button', { name: text('signIn') })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
