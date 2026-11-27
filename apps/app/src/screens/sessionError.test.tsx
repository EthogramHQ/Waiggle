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
//
// R16 (« La garde de session et les pages lisibles sans compte ») : les écrans réservés aux
// membres partagent une même garde, `SessionGate` (accounts/SessionGate.tsx). Le tableau ci-dessous
// est leur liste complète, avec ce que voit un visiteur : la page « Réservé aux membres »
// (`signIn`), la page introuvable (`notFound`, le coin des testeurs, qui ne dit même pas qu'il
// existe) ou la feuille qui le dit elle-même (`sheet`). Chaque écran y passe dans les trois états
// qui précèdent la page : session en lecture, illisible, absente. Un inventaire du code vérifie que
// le tableau n'oublie aucun écran (relecture de sécurité du plan R16, C4).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Translation } from '@ruche/i18n'
import { fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import type { ReactElement } from 'react'
import { useSession } from '../accounts/api'
import { request } from '../api/client'
import { useBlock, useBlockedMembers, useUnblock } from '../blocks/api'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { SuspendSheet } from '../moderation/SuspendSheet'
import { nextAfterSignIn } from '../navigation/signInAgain'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { getProject } from '../projects/api'
import { getReportTarget } from '../reports/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useHydrated } from '../ui/theme/hydration'
import { BlockedMembersScreen } from './BlockedMembersScreen'
import { CallSheet } from './CallSheet'
import { ChangeEmailScreen } from './ChangeEmailScreen'
import { ChangePasswordScreen } from './ChangePasswordScreen'
import { DeleteAccountScreen } from './DeleteAccountScreen'
import { EmailChangeResultScreen } from './EmailChangeResultScreen'
import { ExploreScreen } from './ExploreScreen'
import { FeedbackSheet } from './FeedbackSheet'
import { HarvestScreen } from './HarvestScreen'
import { HiveScreen } from './HiveScreen'
import { HiveSettingsScreen } from './HiveSettingsScreen'
import { HivesScreen } from './HivesScreen'
import { HomeScreen } from './HomeScreen'
import { MemberScreen } from './MemberScreen'
import { ModerationCategoriesScreen } from './ModerationCategoriesScreen'
import { ModerationScreen } from './ModerationScreen'
import { ModerationToolsScreen } from './ModerationToolsScreen'
import { MyCommentsScreen } from './MyCommentsScreen'
import { MyTesterMessagesScreen } from './MyTesterMessagesScreen'
import { NotificationsScreen } from './NotificationsScreen'
import { ProfileScreen } from './ProfileScreen'
import { ProjectFormScreen } from './ProjectFormScreen'
import { ProjectScreen } from './ProjectScreen'
import { ProjectUpdatesScreen } from './ProjectUpdatesScreen'
import { PublicPageSettingsScreen } from './PublicPageSettingsScreen'
import { RankingsScreen } from './RankingsScreen'
import { ReportSheet } from './ReportSheet'
import { ScoutMissionsScreen } from './ScoutMissionsScreen'
import { ScoutSettingsScreen } from './ScoutSettingsScreen'
import { ScoutTriageScreen } from './ScoutTriageScreen'
import { SearchScreen } from './SearchScreen'
import { SettingsScreen } from './SettingsScreen'
import { TagScreen } from './TagScreen'
import { TestersCornerScreen } from './TestersCornerScreen'
import { TesterThreadScreen } from './TesterThreadScreen'
import { ToolsScreen } from './ToolsScreen'
import { UpdateSheet } from './UpdateSheet'

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
  ...jest.requireActual('../profile/api'),
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
// Les projets (page d'un projet, formulaire de création et de modification).
jest.mock('../projects/api', () => ({
  ...jest.requireActual('../projects/api'),
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  pickVisual: jest.fn(),
  uploadVisual: jest.fn(),
  deleteVisual: jest.fn(),
}))
// Les gestes d'une page de projet ou de membre : de faux hooks.
jest.mock('../follows/api', () => ({
  ...jest.requireActual('../follows/api'),
  useFollow: jest.fn(),
}))
jest.mock('../updates/api', () => ({
  ...jest.requireActual('../updates/api'),
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
jest.mock('../reactions/api', () => ({
  ...jest.requireActual('../reactions/api'),
  useReaction: jest.fn(),
}))
jest.mock('../comments/api', () => ({
  ...jest.requireActual('../comments/api'),
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../blocks/api', () => ({
  ...jest.requireActual('../blocks/api'),
  useBlock: jest.fn(),
  useUnblock: jest.fn(),
  useBlockedMembers: jest.fn(),
}))
// Les membres : un vrai React Query autour de fausses lectures, comme dans
// MemberScreen.test.tsx et SuspendScreen.test.tsx.
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    ...jest.requireActual('../members/api'),
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
jest.mock('../notifications/api', () => ({
  ...jest.requireActual('../notifications/api'),
  useNotifications: jest.fn(),
  useMarkSeen: jest.fn(),
  useUnreadCount: jest.fn(),
}))
jest.mock('../moderation/api', () => ({
  ...jest.requireActual('../moderation/api'),
  useModerationQueue: jest.fn(),
  useRemovedItems: jest.fn(),
  useDecide: jest.fn(),
  useDecisionHistory: jest.fn(),
}))
// Le signalement : la lecture de la cible par un vrai React Query, comme dans ReportSheet.test.tsx.
jest.mock('../reports/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getReportTarget = jest.fn()
  return {
    ...jest.requireActual('../reports/api'),
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
// R16 : « Me connecter » ouvre la connexion par `push` ; une seule fausse fonction pour tout le
// fichier, pour lire où elle mène.
const mockPush = jest.fn()
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports. Un `Link`
// d'Expo Router devient un simple texte au rôle de lien (comme dans SettingsScreen.test.tsx).
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => mockPathname,
    useRouter: () => ({
      push: mockPush,
      replace: jest.fn(),
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: jest.fn(),
    // R9 : la feuille « Signaler » garde une précision écrite contre le retour (useLeaveGuard, qui
    // écoute `beforeRemove`) ; ici, aucun retour n'arrive.
    useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
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
  mockPush.mockReset()
  jest.mocked(useLocalSearchParams).mockReset().mockReturnValue({})
  const { useHydrated: hydrated } = jest.requireActual('../ui/theme/hydration')
  jest.mocked(useHydrated).mockReset().mockImplementation(hydrated)
  jest.mocked(request).mockReset().mockResolvedValue({ ok: false, error: 'notFound' })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(getProject).mockReset().mockImplementation(never)
  jest.mocked(getMember).mockReset().mockImplementation(never)
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

/** Ce que voit un visiteur sur un écran réservé aux membres (R16, choix 14). */
type Visitor = 'signIn' | 'notFound' | 'sheet'

/**
 * Un écran à garde : son nom, l'écran tel que l'ouvre sa route (mêmes props que dans son test),
 * l'adresse de sa page, son fichier (sous `apps/app`, pour l'inventaire) et ce que voit un visiteur.
 */
type Guarded = {
  name: string
  render: () => ReactElement
  pathname: string
  file: string
  visitor: Visitor
}

const hiveId = '9f0e1d2c-3b4a-4596-8778-695a4b3c2d1e'
const memberId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

// Le tableau complet des écrans qui attendent la session (R16, relecture de sécurité C4). Les
// feuilles (`sheet`) passent leur propre « Réservé aux membres » à la garde (prop `signedOut`) ; le
// coin et le fil des testeurs, leur page introuvable (décision R7b, L5).
const guarded: Guarded[] = [
  {
    name: 'BlockedMembersScreen',
    render: () => <BlockedMembersScreen />,
    pathname: '/blocks',
    file: 'src/screens/BlockedMembersScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'CallSheet',
    render: () => <CallSheet id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}/testers/call`,
    file: 'src/screens/CallSheet.tsx',
    visitor: 'sheet',
  },
  {
    name: 'ChangeEmailScreen',
    render: () => <ChangeEmailScreen />,
    pathname: '/account/email',
    file: 'src/screens/ChangeEmailScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ChangePasswordScreen',
    render: () => <ChangePasswordScreen />,
    pathname: '/settings/security/password',
    file: 'src/screens/ChangePasswordScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'DeleteAccountScreen',
    render: () => <DeleteAccountScreen />,
    pathname: '/settings/account/delete',
    file: 'src/screens/DeleteAccountScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ExploreScreen',
    render: () => <ExploreScreen />,
    pathname: '/explore',
    file: 'src/screens/ExploreScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'FeedbackSheet',
    render: () => <FeedbackSheet id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}/feedback`,
    file: 'src/screens/FeedbackSheet.tsx',
    visitor: 'sheet',
  },
  {
    name: 'HarvestScreen',
    render: () => <HarvestScreen />,
    pathname: '/harvest',
    file: 'src/screens/HarvestScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'HiveScreen',
    render: () => <HiveScreen id={hiveId} />,
    pathname: `/hives/${hiveId}`,
    file: 'src/screens/HiveScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'HiveSettingsScreen',
    render: () => <HiveSettingsScreen id={hiveId} />,
    pathname: `/hives/${hiveId}/settings`,
    file: 'src/screens/HiveSettingsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'HivesScreen',
    render: () => <HivesScreen />,
    pathname: '/hives',
    file: 'src/screens/HivesScreen.tsx',
    visitor: 'signIn',
  },
  // R16 (sécurité, plan 2, A1) : le Fil passe à la garde ; un visiteur n'y voit plus jamais
  // l'accueil des visiteurs, qui vit à `/` (ShowcaseScreen).
  {
    name: 'HomeScreen',
    render: () => <HomeScreen />,
    pathname: '/feed',
    file: 'src/screens/HomeScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'MemberScreen',
    render: () => <MemberScreen id="u1" />,
    pathname: '/members/u1',
    file: 'src/screens/MemberScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ModerationCategoriesScreen',
    render: () => <ModerationCategoriesScreen />,
    pathname: '/moderation/categories',
    file: 'src/screens/ModerationCategoriesScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ModerationScreen',
    render: () => <ModerationScreen />,
    pathname: '/moderation',
    file: 'src/screens/ModerationScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ModerationToolsScreen',
    render: () => <ModerationToolsScreen />,
    pathname: '/moderation/tools',
    file: 'src/screens/ModerationToolsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'MyCommentsScreen',
    render: () => <MyCommentsScreen />,
    pathname: '/me/comments',
    file: 'src/screens/MyCommentsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'MyTesterMessagesScreen',
    render: () => <MyTesterMessagesScreen />,
    pathname: '/me/tester-messages',
    file: 'src/screens/MyTesterMessagesScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'NotificationsScreen',
    render: () => <NotificationsScreen />,
    pathname: '/notifications',
    file: 'src/screens/NotificationsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ProfileScreen',
    render: () => <ProfileScreen />,
    pathname: '/profile',
    file: 'src/screens/ProfileScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ProjectFormScreen (new project)',
    render: () => <ProjectFormScreen />,
    pathname: '/projects/new',
    file: 'src/screens/ProjectFormScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ProjectFormScreen (editing)',
    render: () => <ProjectFormScreen id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}/edit`,
    file: 'src/screens/ProjectFormScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ProjectScreen',
    render: () => <ProjectScreen id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}`,
    file: 'src/screens/ProjectScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ProjectUpdatesScreen',
    render: () => <ProjectUpdatesScreen id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}/updates`,
    file: 'src/screens/ProjectUpdatesScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'PublicPageSettingsScreen',
    render: () => <PublicPageSettingsScreen />,
    pathname: '/settings/public-page',
    file: 'src/screens/PublicPageSettingsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'RankingsScreen',
    render: () => <RankingsScreen />,
    pathname: '/harvest/rankings',
    file: 'src/screens/RankingsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ScoutMissionsScreen',
    render: () => <ScoutMissionsScreen />,
    pathname: '/scout/missions',
    file: 'src/screens/ScoutMissionsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ScoutSettingsScreen',
    render: () => <ScoutSettingsScreen />,
    pathname: '/settings/scouts',
    file: 'src/screens/ScoutSettingsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'ScoutTriageScreen',
    render: () => <ScoutTriageScreen />,
    pathname: '/moderation/scouts',
    file: 'src/screens/ScoutTriageScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'SearchScreen',
    render: () => <SearchScreen />,
    pathname: '/search',
    file: 'src/screens/SearchScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'SettingsScreen',
    render: () => <SettingsScreen />,
    pathname: '/settings',
    file: 'src/screens/SettingsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'TagScreen',
    render: () => <TagScreen slug="claude-code" />,
    pathname: '/tools/claude-code',
    file: 'src/screens/TagScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'TesterThreadScreen',
    render: () => <TesterThreadScreen id={recipesProject.id} member={memberId} />,
    pathname: `/projects/${recipesProject.id}/testers/${memberId}`,
    file: 'src/screens/TesterThreadScreen.tsx',
    visitor: 'notFound',
  },
  {
    name: 'TestersCornerScreen',
    render: () => <TestersCornerScreen id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}/testers`,
    file: 'src/screens/TestersCornerScreen.tsx',
    visitor: 'notFound',
  },
  {
    name: 'ToolsScreen',
    render: () => <ToolsScreen />,
    pathname: '/tools',
    file: 'src/screens/ToolsScreen.tsx',
    visitor: 'signIn',
  },
  {
    name: 'UpdateSheet',
    render: () => <UpdateSheet id={recipesProject.id} />,
    pathname: `/projects/${recipesProject.id}/update`,
    file: 'src/screens/UpdateSheet.tsx',
    visitor: 'sheet',
  },
]

/**
 * Les fichiers qui lisent la session sans être des écrans à garde (R16, choix 14), chacun avec sa
 * raison. Leur attente ne change que de forme.
 */
const excluded: Record<string, string> = {
  'src/accounts/session.ts': 'la lecture de la session elle-même',
  'src/accounts/SessionGate.tsx': 'la garde elle-même',
  'src/accounts/memberMarker.ts': 'le repère du membre, posé et effacé par la session',
  'src/navigation/AppTabBar.tsx': 'un aiguillage, pas un écran',
  'src/navigation/HomeRoute.tsx': 'un aiguillage, pas un écran',
  'src/navigation/MemberOrVisitor.tsx': 'un aiguillage, pas un écran',
  'src/navigation/PageLanguage.tsx': 'un aiguillage, pas un écran',
  'src/navigation/chunks/preload.ts': 'un aiguillage, pas un écran',
  'src/moderation/SuspendSheet.tsx': 'une feuille de la modération, gardée telle quelle',
  'src/projects/ProjectActions.tsx':
    'lit seulement le nom du membre pour la feuille d’offre de miel, n’attend pas la session',
  'src/screens/HiveInviteSheet.tsx': 'rend `null` sans session',
  'src/scout/ScoutDrop.tsx': 'la Goutte flottante (R20) : rend `null` sans session',
  'src/live/connection.tsx':
    'le flux du temps réel (R21) : rend `null`, ne s’ouvre que pour un membre',
  'src/screens/ReportSheet.tsx': 'sa branche visiteur de R12',
  'src/screens/ShowcaseScreen.tsx': 'l’accueil public, pré-rendu pour le visiteur',
  'src/screens/EmailChangeResultScreen.tsx': 'ses pages parlent aussi à un visiteur',
  'app/me.tsx': 'pas de garde à lui',
  'app/suspend.tsx': 'pas de garde à lui',
}

/** Les cas d'un `it.each` : le nom de l'écran en premier (le `%s` du titre), puis sa ligne. */
const cases = (rows: Guarded[]) => rows.map((row) => [row.name, row] as const)
const signInScreens = guarded.filter((row) => row.visitor !== 'notFound')
const notFoundScreens = guarded.filter((row) => row.visitor === 'notFound')

/** Aucune donnée réservée n'est demandée (relecture de sécurité de la PR #62, S1). */
const expectNothingRead = () => {
  for (const read of [request, getMe, getProject, getMember, getReportTarget]) {
    expect(read).not.toHaveBeenCalled()
  }
}

describe('the session guard of every member screen (R16)', () => {
  it.each(cases(signInScreens))(
    '%s offers to sign in, and shows nothing of the member page, to a visitor',
    async (_name, row) => {
      mockPathname = row.pathname
      mockSession(null)
      await renderWithProviders(row.render())

      expect(
        await screen.findByRole('header', { name: fr.t(($) => $.states.signedOutTitle) }),
      ).toBeTruthy()
      // « Me connecter » ramène sur cette même page (`next`, calculé une fois par nextAfterSignIn).
      await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.home.signIn) }))
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/sign-in',
        params: { next: nextAfterSignIn(row.pathname) },
      })
      // Ni l'accueil des visiteurs (le Fil, avant R16), ni une erreur à réessayer.
      expect(screen.queryByRole('button', { name: fr.t(($) => $.home.haveAccount) })).toBeNull()
      expect(screen.queryByRole('button', { name: fr.t(($) => $.common.retry) })).toBeNull()
      expectNothingRead()
    },
  )

  it.each(cases(notFoundScreens))(
    '%s shows the page not found to a visitor, never the sign-in screen',
    async (_name, row) => {
      mockPathname = row.pathname
      mockSession(null)
      await renderWithProviders(row.render())

      expect(
        await screen.findByRole('header', { name: fr.t(($) => $.project.page.notFoundTitle) }),
      ).toBeTruthy()
      expect(screen.queryByText(fr.t(($) => $.states.signedOutTitle))).toBeNull()
      expect(screen.queryByRole('button', { name: fr.t(($) => $.home.signIn) })).toBeNull()
      expectNothingRead()
    },
  )

  it.each(cases(guarded))(
    '%s shows only its skeleton while the session is read',
    async (_name, row) => {
      mockPathname = row.pathname
      mockSession(null, true)
      await renderWithProviders(row.render())

      expect(
        await screen.findByRole('progressbar', { name: fr.t(($) => $.common.loading) }),
      ).toBeTruthy()
      // Rien de ce qui suit la lecture : ni « Réservé aux membres », ni l'erreur, ni la page
      // introuvable, ni l'accueil des visiteurs.
      for (const title of [
        fr.t(($) => $.states.signedOutTitle),
        fr.t(($) => $.states.errorTitle),
        fr.t(($) => $.project.page.notFoundTitle),
      ]) {
        expect(screen.queryByText(title)).toBeNull()
      }
      for (const label of [
        fr.t(($) => $.home.signIn),
        fr.t(($) => $.home.signUp),
        fr.t(($) => $.home.haveAccount),
        fr.t(($) => $.common.retry),
      ]) {
        expect(screen.queryByRole('button', { name: label })).toBeNull()
      }
      expectNothingRead()
    },
  )

  // Le code lu comme du texte (comme retryButtons.test.ts) : tout fichier de `src/` ou d'`app/` qui
  // importe la garde ou la lecture de la session est dans le tableau, ou dans les exclus nommés.
  const root = join(__dirname, '..', '..')
  const sources = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(join(root, path)).isDirectory()) return sources(path)
      if (!/\.tsx?$/.test(entry) || /\.(test|testkit)\./.test(entry)) return []
      return [path.replaceAll('\\', '/')]
    })
  const read = (file: string) => readFileSync(join(root, file), 'utf8')
  const imports = (source: string, name: string) =>
    new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(source)
  const waiting = [...sources('src'), ...sources('app')].filter((file) => {
    const source = read(file)
    return imports(source, 'useMemberSession') || imports(source, 'SessionGate')
  })

  it('lists every screen that waits for the session', () => {
    expect(waiting).toContain('src/screens/ProjectScreen.tsx') // témoin : l'inventaire lit bien
    const listed = new Set([...guarded.map((row) => row.file), ...Object.keys(excluded)])
    expect(waiting.filter((file) => !listed.has(file))).toEqual([])
  })

  it('guards every screen of the table with SessionGate, never with its own reading', () => {
    // R16, choix 14 : chaque écran du tableau passe une fois à `SessionGate` ; aucun ne relit la
    // session de son côté (la fonction passée à la garde reçoit la session).
    const files = [...new Set(guarded.map((row) => row.file))]
    expect(files.filter((file) => !/<SessionGate\b/.test(read(file)))).toEqual([])
    expect(files.filter((file) => /\buseMemberSession\(/.test(read(file)))).toEqual([])
  })
})

// Les écrans exclus de la garde qui disaient déjà « Réessayer » : témoins de la même attente.
const alsoRetrying: Guarded[] = [
  // R9 : la page `/report` est devenue la feuille « Signaler » (ReportSheet), mêmes props.
  {
    name: 'ReportSheet',
    render: () => <ReportSheet kind="comment" id="c0d1e2f3-0415-4a26-8b37-48596a7b8c9d" />,
    pathname: '/report',
    file: 'src/screens/ReportSheet.tsx',
    visitor: 'sheet',
  },
  // R9 : la page `/suspend` est devenue la fenêtre « Suspendre » (moderation/SuspendSheet), ouverte
  // par sa route ; la même attente vaut pour elle.
  {
    name: 'SuspendSheet',
    render: () => <SuspendSheet memberId="u1" open onClose={jest.fn()} />,
    pathname: '/suspend',
    file: 'src/moderation/SuspendSheet.tsx',
    visitor: 'sheet',
  },
]

describe('a session that cannot be read', () => {
  it.each(cases([...guarded, ...alsoRetrying]))(
    '%s offers to retry, not to sign in',
    async (_name, row) => {
      mockPathname = row.pathname
      const refetch = failSessionRead()
      await renderWithProviders(row.render())

      expect(
        await screen.findByRole('header', { name: fr.t(($) => $.states.errorTitle) }),
      ).toBeTruthy()
      expect(screen.queryByText(fr.t(($) => $.states.signedOutTitle))).toBeNull()
      await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
      expect(refetch).toHaveBeenCalledTimes(1)
      // Relecture de sécurité (PR #62, S1) : sans session lue, aucune donnée réservée n'est demandée.
      expectNothingRead()
    },
  )
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
