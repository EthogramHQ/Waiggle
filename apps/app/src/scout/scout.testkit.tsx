// Outils partagés par les tests des Éclaireuses (R20, docs/scenarios/refonte.md, « R20 — Les
// Éclaireuses ») : les données d'exemple (une Éclaireuse, ses retours, les missions de la semaine,
// la page de tri) et les faux modules `scout/api` et `moderation/scouts/api`.
//
// Les faux hooks tournent sur le vrai React Query (le cache de `renderWithProviders`) : un écran les
// lit comme les vrais (`data`, `isPending`, `error`, `mutate`, `mutateAsync`), et un test lit ce qui
// est parti dans les fausses fonctions de `scoutServer`, sans rien supposer de la façon dont l'écran
// s'en sert. Ce que ces faux hooks supposent du vrai module (l'API promise à l'interface) :
//
// `src/scout/api.ts` :
// - `useScoutMissions()` : `useQuery` de `ScoutMissions` (GET /v1/me/scout/missions) ;
// - `useMyScoutReports()` : `useQuery` de `MyScoutReports` (GET /v1/me/scout/reports) ;
// - `useSendScoutReport()` : `useMutation`, `mutate({ report, capture })` (`ScoutReportSend`),
//   rend le `ScoutReport` créé ; un refus est une `ApiError` (`api/errors.ts`) ;
// - `useDeleteScoutReport()` : `useMutation`, `mutate(id)` ;
// - `useJoinScouts()` : `useMutation`, `mutate({ code })`, rend le nouveau `Me` (mis en cache) ;
// - `useScoutSettings()` : `useMutation`, `mutate({ showDrop })`, rend le nouveau `Me`.
//
// `src/moderation/scouts/api.ts` :
// - `useScoutTriage()` : `useQuery` de `ScoutTriage` (GET /v1/moderation/scouts) ;
// - `useScoutReports(filters)` : `useInfiniteQuery` de `ScoutReportPage`, filtres
//   `{ status?, kind?, severity? }` (`ScoutReportsQuery` sans le marque-page) ;
// - `useLaunchScoutProgram()` : `mutate()` (POST /v1/moderation/scouts/program) ;
// - `useSaveScoutMissions()` : `mutate(ScoutMissionsInput)` ;
// - `usePatchScoutReport()` : `mutate({ id, patch })` (`ScoutReportPatch`) ;
// - `useRemoveScout()` : `mutate({ memberId, reason })`.
import type {
  JoinScouts,
  Me,
  MeScout,
  MyScoutReports,
  ScoutMissions,
  ScoutMissionsInput,
  ScoutReport,
  ScoutReportAdmin,
  ScoutReportInput,
  ScoutReportPage,
  ScoutReportPatch,
  ScoutReportsQuery,
  ScoutSettings,
  ScoutTriage,
} from '@ruche/contracts'
import { act, screen } from '@testing-library/react-native'
import type { PickedImage } from '../media/pick'
import { adminMe, leaMe } from '../testing/fixtures'

// --- Fermer une feuille comme Échap ou le Retour d'Android ---

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/**
 * Échap relâchée (web) ou retour d'Android : appelle `onRequestClose` de la couche (le Modal) qui
 * porte le titre `title`, comme dans TestersCorner.testkit.tsx.
 */
export const pressEscape = async (title: string) => {
  const layers = hostsOf(screen.root as unknown as Host).filter(
    (node) => typeof node.props.onRequestClose === 'function' && textOf(node).includes(title),
  )
  const layer = layers.at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
  if (!layer) throw new Error('no layer around the sheet')
  await act(() => layer.props.onRequestClose())
}

// --- Les données d'exemple ---

/** Léa est Éclaireuse depuis le 10 novembre ; le mois finit le 10 décembre à minuit de Paris. */
export const activeScout: MeScout = {
  active: true,
  joinedAt: '2026-11-10T09:00:00.000Z',
  removedAt: null,
  showDrop: true,
  programEndsAt: '2026-12-10T23:00:00.000Z',
  missionsLeft: 2,
}

/** Léa, Éclaireuse pendant le mois, avec deux missions à faire. */
export const scoutMe = (scout: Partial<MeScout> = {}): Me => ({
  ...leaMe,
  scout: { ...activeScout, ...scout },
})

/** Léa, membre qui n'a jamais été Éclaireuse. */
export const memberMe: Me = { ...leaMe, scout: null }

/** Léa, retirée des Éclaireuses le 20 novembre (un abus) : elle garde l'objet, inactif. */
export const removedScoutMe: Me = scoutMe({
  active: false,
  removedAt: '2026-11-20T10:00:00.000Z',
  missionsLeft: 0,
})

/** Léa, après le mois (fini le 10 décembre) : plus active, jamais retirée. */
export const endedScoutMe: Me = scoutMe({
  active: false,
  programEndsAt: '2026-11-25T23:00:00.000Z',
  missionsLeft: 0,
})

/** Louis, administrateur (la page de tri). */
export const adminScoutMe: Me = { ...adminMe, scout: null }

export const missionPhotoId = '0f1e2d3c-4b5a-4968-8776-655443322110'
export const missionPhoneId = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d'
export const missionSearchId = '2b3c4d5e-6f7a-4b9c-8d1e-2f3a4b5c6d7e'

/** Les missions de la semaine du 23 novembre : deux à faire, une faite. */
export const weekMissions: ScoutMissions = {
  week: '2026-11-23',
  missions: [
    { id: missionPhotoId, text: 'Publie un projet avec une photo', done: false },
    { id: missionSearchId, text: 'Cherche un outil par son nom', done: true },
    { id: missionPhoneId, text: 'Essaie Waiggle sur ton téléphone', done: false },
  ],
}

export const noMissions: ScoutMissions = { week: '2026-11-23', missions: [] }

export const bugReportId = '3c4d5e6f-7a8b-4c0d-9e1f-3a4b5c6d7e8f'
export const ideaReportId = '4d5e6f7a-8b9c-4d1e-8f2a-4b5c6d7e8f9a'
export const fixedReportId = '5e6f7a8b-9c0d-4e2f-9a3b-5c6d7e8f9a0b'

const context = {
  screen: '/projects/42',
  platform: 'ios',
  width: 390,
  appVersion: 'a1b2c3d',
  language: 'fr',
  scheme: 'day',
} as const

/** Un bug envoyé, une idée prévue, un bug corrigé avec la note de l'administrateur. */
export const myReports: ScoutReport[] = [
  {
    id: bugReportId,
    kind: 'bug',
    severity: 'annoying',
    text: 'Le bouton Publier se cache derrière le clavier',
    mission: null,
    context,
    mediaUrl: null,
    status: 'sent',
    fixedNote: null,
    createdAt: '2026-11-24T10:00:00.000Z',
    fixedAt: null,
  },
  {
    id: ideaReportId,
    kind: 'idea',
    severity: null,
    text: 'Pouvoir trier mes projets par date',
    mission: { id: missionPhotoId, text: 'Publie un projet avec une photo' },
    context: null,
    mediaUrl: null,
    status: 'planned',
    fixedNote: null,
    createdAt: '2026-11-23T09:00:00.000Z',
    fixedAt: null,
  },
  {
    id: fixedReportId,
    kind: 'bug',
    severity: 'blocking',
    text: 'La page de la ruche reste blanche',
    mission: null,
    context,
    mediaUrl: null,
    status: 'fixed',
    fixedNote: 'Corrigé le 28/11, merci !',
    createdAt: '2026-11-20T09:00:00.000Z',
    fixedAt: '2026-11-21T09:00:00.000Z',
  },
]

/** `count` retours envoyés depuis `since` (une minute d'écart) : pour la limite des 20 par jour. */
export const reportsSince = (since: Date, count: number): ScoutReport[] =>
  Array.from({ length: count }, (_, index) => ({
    ...(myReports[0] as ScoutReport),
    id: `6f7a8b9c-0d1e-4f3a-8b4c-${String(index).padStart(12, '0')}`,
    createdAt: new Date(since.getTime() + index * 60_000).toISOString(),
  }))

export const ines = { id: 'u5', name: 'Inès', handle: 'ines', avatarUrl: null }
export const papiJean = { id: 'u7', name: 'Papi Jean', handle: 'papijean', avatarUrl: null }

/** Le tri : un retour d'Inès (nouveau, un bug bloquant avec capture) et une idée de Papi Jean. */
export const inesReport: ScoutReportAdmin = {
  ...(myReports[0] as ScoutReport),
  id: '7a8b9c0d-1e2f-4a4b-9c5d-7e8f9a0b1c2d',
  severity: 'blocking',
  text: 'Le fil ne se recharge plus après une heure',
  mediaUrl: 'https://api.example.com/v1/media/scouts/capture.webp',
  author: ines,
  adminNote: null,
  updatedAt: '2026-11-24T10:00:00.000Z',
}
export const papiJeanReport: ScoutReportAdmin = {
  ...(myReports[1] as ScoutReport),
  id: '8b9c0d1e-2f3a-4b5c-8d6e-8f9a0b1c2d3e',
  text: 'Une ruche pour les petits-enfants',
  author: papiJean,
  adminNote: 'À voir avec la refonte des ruches',
  updatedAt: '2026-11-23T09:00:00.000Z',
}

/** Le mois en cours depuis le 15 novembre (jour 12 sur 30 le 26), 18 places prises. */
export const runningTriage: ScoutTriage = {
  program: { startedAt: '2026-11-15T09:00:00.000Z', endsAt: '2026-12-14T23:00:00.000Z' },
  places: { taken: 18, max: 30 },
  week: '2026-11-23',
  missions: [
    {
      id: missionPhotoId,
      position: 1,
      textFr: 'Publie un projet avec une photo',
      textEn: 'Publish a project with a photo',
    },
  ],
  scouts: [
    { member: ines, joinedAt: '2026-11-15T10:00:00.000Z', removedAt: null, reports: 4 },
    { member: papiJean, joinedAt: '2026-11-16T10:00:00.000Z', removedAt: null, reports: 1 },
  ],
}
export const notLaunchedTriage: ScoutTriage = {
  ...runningTriage,
  program: { startedAt: null, endsAt: null },
}
export const endedTriage: ScoutTriage = {
  ...runningTriage,
  program: { startedAt: '2026-10-01T09:00:00.000Z', endsAt: '2026-10-30T23:00:00.000Z' },
}

// --- Le faux serveur ---

/** Ce que reçoit `useSendScoutReport().mutate` : la partie `report` et la capture choisie. */
export type ScoutReportSend = { report: ScoutReportInput; capture: PickedImage | null }

/**
 * Ce que les faux hooks lisent et ce qu'ils reçoivent. Les lectures prennent la valeur du moment ;
 * chaque écriture passe par une fausse fonction (`jest.fn`), que le test règle (refus, attente).
 */
export const scoutServer = {
  missions: weekMissions as ScoutMissions,
  /** Un refus de GET /v1/me/scout/missions (`scout_only` pour qui n'est plus Éclaireuse). */
  missionsError: null as Error | null,
  reports: myReports as ScoutReport[],
  triage: runningTriage as ScoutTriage,
  adminReports: [inesReport, papiJeanReport] as ScoutReportAdmin[],
  /** Les filtres reçus par `useScoutReports`, dans l'ordre. */
  filters: [] as Omit<ScoutReportsQuery, 'cursor'>[],
  send: jest.fn<Promise<ScoutReport>, [ScoutReportSend]>(),
  remove: jest.fn<Promise<void>, [string]>(),
  join: jest.fn<Promise<Me>, [JoinScouts]>(),
  settings: jest.fn<Promise<Me>, [ScoutSettings]>(),
  launch: jest.fn<Promise<void>, []>(),
  saveMissions: jest.fn<Promise<void>, [ScoutMissionsInput]>(),
  patch: jest.fn<Promise<ScoutReportAdmin>, [{ id: string; patch: ScoutReportPatch }]>(),
  removeScout: jest.fn<Promise<void>, [{ memberId: string; reason: string }]>(),
}

/** Remet le faux serveur à son départ : une Éclaireuse, ses trois retours, trois missions. */
export const resetScoutServer = () => {
  scoutServer.missions = weekMissions
  scoutServer.missionsError = null
  scoutServer.reports = myReports
  scoutServer.triage = runningTriage
  scoutServer.adminReports = [inesReport, papiJeanReport]
  scoutServer.filters = []
  scoutServer.send.mockReset().mockImplementation(async ({ report }) => ({
    ...(myReports[0] as ScoutReport),
    kind: report.kind,
    severity: report.severity ?? null,
    text: report.text,
    context: report.context ?? null,
  }))
  scoutServer.remove.mockReset().mockResolvedValue(undefined)
  scoutServer.join.mockReset().mockResolvedValue(scoutMe())
  scoutServer.settings.mockReset().mockImplementation(async ({ showDrop }) => scoutMe({ showDrop }))
  scoutServer.launch.mockReset().mockResolvedValue(undefined)
  scoutServer.saveMissions.mockReset().mockResolvedValue(undefined)
  scoutServer.patch.mockReset().mockImplementation(async ({ id, patch }) => ({
    ...((scoutServer.adminReports.find((report) => report.id === id) ??
      inesReport) as ScoutReportAdmin),
    ...(patch.status ? { status: patch.status } : null),
    ...(patch.adminNote !== undefined ? { adminNote: patch.adminNote } : null),
    ...(patch.fixedNote !== undefined ? { fixedNote: patch.fixedNote } : null),
  }))
  scoutServer.removeScout.mockReset().mockResolvedValue(undefined)
}

/** Le faux `scout/api` (à rendre par `jest.mock('../scout/api', () => …mockScoutApi())`). */
export const mockScoutApi = () => {
  const { useMutation, useQuery, useQueryClient } =
    require('@tanstack/react-query') as typeof import('@tanstack/react-query')
  const meKey = ['me']
  return {
    useScoutMissions: () =>
      useQuery({
        queryKey: ['scout', 'missions'],
        queryFn: async () => {
          if (scoutServer.missionsError) throw scoutServer.missionsError
          return scoutServer.missions
        },
      }),
    useMyScoutReports: () =>
      useQuery({
        queryKey: ['scout', 'reports'],
        queryFn: async (): Promise<MyScoutReports> => ({ reports: scoutServer.reports }),
      }),
    useSendScoutReport: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (sent: ScoutReportSend) => scoutServer.send(sent),
        onSuccess: () => void client.invalidateQueries({ queryKey: ['scout'] }),
      })
    },
    useDeleteScoutReport: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (id: string) => scoutServer.remove(id),
        onSuccess: () => void client.invalidateQueries({ queryKey: ['scout', 'reports'] }),
      })
    },
    useJoinScouts: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (input: JoinScouts) => scoutServer.join(input),
        onSuccess: (me: Me) => client.setQueryData(meKey, me),
      })
    },
    useScoutSettings: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (input: ScoutSettings) => scoutServer.settings(input),
        onSuccess: (me: Me) => client.setQueryData(meKey, me),
      })
    },
  }
}

/** Le faux `moderation/scouts/api`. */
export const mockScoutTriageApi = () => {
  const { useInfiniteQuery, useMutation, useQuery, useQueryClient } =
    require('@tanstack/react-query') as typeof import('@tanstack/react-query')
  const refresh = (client: ReturnType<typeof useQueryClient>) =>
    void client.invalidateQueries({ queryKey: ['scout-triage'] })
  return {
    useScoutTriage: () =>
      useQuery({ queryKey: ['scout-triage', 'top'], queryFn: async () => scoutServer.triage }),
    useScoutReports: (filters: Omit<ScoutReportsQuery, 'cursor'> = {}) => {
      scoutServer.filters.push(filters)
      return useInfiniteQuery({
        queryKey: ['scout-triage', 'reports', filters],
        initialPageParam: null as string | null,
        queryFn: async (): Promise<ScoutReportPage> => ({
          reports: scoutServer.adminReports.filter(
            (report) =>
              (filters.status === undefined || report.status === filters.status) &&
              (filters.kind === undefined || report.kind === filters.kind) &&
              (filters.severity === undefined || report.severity === filters.severity),
          ),
          nextCursor: null,
        }),
        getNextPageParam: (page: ScoutReportPage) => page.nextCursor,
      })
    },
    useLaunchScoutProgram: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: () => scoutServer.launch(),
        onSuccess: () => refresh(client),
      })
    },
    useSaveScoutMissions: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (input: ScoutMissionsInput) => scoutServer.saveMissions(input),
        onSuccess: () => refresh(client),
      })
    },
    usePatchScoutReport: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (input: { id: string; patch: ScoutReportPatch }) => scoutServer.patch(input),
        onSuccess: () => refresh(client),
      })
    },
    useRemoveScout: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: (input: { memberId: string; reason: string }) => scoutServer.removeScout(input),
        onSuccess: () => refresh(client),
      })
    },
  }
}
