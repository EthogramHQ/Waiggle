// Les appels à l'API de la récolte (R19, la gamification) : « Ma récolte » (le rayon, le défi, le
// miel, les sceaux), ses réglages, la décoration du rayon, l'offre de miel à un projet et les
// classements de la semaine. Les écrans n'appellent que ces hooks ; les tests d'écran remplacent le
// client réseau (`api/client`), et ces hooks tournent pour de vrai sur ce faux serveur.
//
// Le cache (React Query) : la récolte vit sous `['harvest']`, une seule pour le membre connecté. Une
// écriture la relit une fois finie ; un geste qui rapporte du pollen (réagir, commenter…) l'invalide
// aussi, depuis son propre hook (`harvestQueryKey`).
import {
  type DecorationChoice,
  type GameSettingsUpdate,
  Harvest,
  Ranking,
  type RankingScope,
} from '@ruche/contracts'
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, errorKey } from '../api/errors'
import { projectQueryKey } from '../projects/hooks'
import { harvestQueryKey } from './keys'
import { reportPollen } from './pollen'

// La clé de « Ma récolte » vit dans keys.ts (les hooks de geste l'invalident sans importer ce
// fichier) ; on la garde exportée d'ici pour les écrans.
export { harvestQueryKey }

/** Les classements ont tous cette tête de clé (`['rankings', 'close']`, `['rankings', 'hive', id]`). */
export const rankingsQueryKey = ['rankings'] as const

const GAME_PATH = '/v1/me/game'

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Une écriture qui répond « 204 » : rien à lire, un refus devient une exception pour React Query. */
const send204 = async (path: string, init: RequestInit): Promise<void> => {
  const result = await requestWithoutBody(path, init)
  if (!result.ok) throw new ApiError(result.error)
  // Une écriture du jeu ne rapporte pas de pollen aujourd'hui ; si l'API en annonce un jour, il se
  // montre dans l'hôte global plutôt que de se perdre.
  if (result.pollen !== undefined) reportPollen(result.pollen, 'global')
}

// --- « Ma récolte » ---

/** GET /v1/me/harvest. Lève une ApiError en cas d'échec (404 pour le compte d'exemple). */
export const getHarvest = async (): Promise<Harvest> => {
  const result = await request('/v1/me/harvest', {}, Harvest)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la récolte du membre connecté. `enabled: false` (la page d'un autre membre, un visiteur) :
 * aucune requête. `staleTime: 0` : relue à chaque montage (« Ma récolte », la page « Moi », la
 * colonne du Fil, la feuille d'offre) ; le pollen et le miel changent à chaque geste, ailleurs que
 * sur la page qui les montre.
 */
export const useHarvest = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: harvestQueryKey, queryFn: getHarvest, enabled, staleTime: 0 })

// --- Les réglages et le défi perso (PATCH /v1/me/game) ---

/**
 * La récolte en cache après un réglage, tout de suite (avant la réponse de l'API) : l'interrupteur
 * ou la pastille change sous le doigt. Le défi perso, lui, n'y est pas : « Choisir ce défi » reste
 * en cours jusqu'à la réponse (l'API peut refuser un défi, `invalid_challenge`), et la relecture
 * montre le défi choisi.
 */
const withSettings = (harvest: Harvest, patch: GameSettingsUpdate): Harvest => {
  const { titleForm, pinnedFamily, inRankings, harvestNotices, levelSeen } = patch
  const settings = {
    ...harvest.settings,
    ...(titleForm !== undefined ? { titleForm } : null),
    ...(pinnedFamily !== undefined ? { pinnedFamily } : null),
    ...(inRankings !== undefined ? { inRankings } : null),
    ...(harvestNotices !== undefined ? { harvestNotices } : null),
  }
  // Le titre suit la forme et la famille épinglée ; « Selon mes gestes » (null) garde la famille
  // affichée jusqu'à la relecture, qui dit celle des 28 derniers jours.
  const title =
    harvest.title === null && pinnedFamily
      ? { family: pinnedFamily, form: settings.titleForm, pinned: true }
      : harvest.title && {
          family: pinnedFamily ?? harvest.title.family,
          form: settings.titleForm,
          pinned: pinnedFamily === undefined ? harvest.title.pinned : pinnedFamily !== null,
        }
  return { ...harvest, settings, title, levelSeen: levelSeen ?? harvest.levelSeen }
}

/** Relit ce que montrent les réglages : la récolte, et sa propre page (le titre y est écrit). */
const refreshAfterSettings = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: harvestQueryKey })
  void queryClient.invalidateQueries({ queryKey: ['member'], refetchType: 'active' })
}

/**
 * Hook : écrire un ou plusieurs réglages du jeu, ou le défi perso de la semaine.
 * `mutate({ inRankings: false })` envoie **le seul champ changé** (PATCH /v1/me/game, 204).
 *
 * Les réglages changent la récolte en cache au toucher (pas dans un `onMutate` asynchrone : un
 * second toucher rapide lirait l'ancien état), et y reviennent si l'API refuse. Une « portée »
 * (`scope`) fait partir les écritures l'une après l'autre ; la récolte n'est relue qu'après la
 * dernière (relire entre deux touchers ferait clignoter l'interrupteur).
 */
export const useGameSettings = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationKey: ['game', 'settings'],
    mutationFn: (patch: GameSettingsUpdate) => send204(GAME_PATH, jsonInit('PATCH', patch)),
    scope: { id: 'game-settings' },
    onError: (_error, patch) => {
      // Refusé : les réglages reviennent à ce que l'API sait, par la relecture de `onSettled`.
      // Entre-temps, on retire au moins ce changement-ci du cache (l'interrupteur se remet).
      const current = queryClient.getQueryData<Harvest>(harvestQueryKey)
      const before = previousOf.get(patch)
      if (current && before)
        queryClient.setQueryData(harvestQueryKey, withSettings(current, before))
    },
    onSettled: (_data, _error, patch) => {
      previousOf.delete(patch)
      if (queryClient.isMutating({ mutationKey: ['game', 'settings'] }) > 1) return
      refreshAfterSettings(queryClient)
    },
  })
  const { mutate: send, mutateAsync: sendAsync } = mutation
  // Le changement au toucher, avant tout envoi ; on garde la valeur d'avant de chaque champ changé
  // pour la remettre si l'API refuse.
  const apply = useCallback(
    (patch: GameSettingsUpdate) => {
      const harvest = queryClient.getQueryData<Harvest>(harvestQueryKey)
      if (!harvest) return
      previousOf.set(patch, previousValues(harvest, patch))
      queryClient.setQueryData(harvestQueryKey, withSettings(harvest, patch))
    },
    [queryClient],
  )
  const mutate = useCallback(
    (patch: GameSettingsUpdate) => {
      apply(patch)
      send(patch)
    },
    [apply, send],
  )
  const mutateAsync = useCallback(
    (patch: GameSettingsUpdate) => {
      apply(patch)
      return sendAsync(patch)
    },
    [apply, sendAsync],
  )
  // Le résultat de `useMutation` (`isPending`, `error`, `reset`…), avec les deux envois qui changent
  // d'abord le cache.
  return { ...mutation, mutate, mutateAsync }
}

// La valeur d'avant de chaque écriture en cours, retrouvée par l'objet du changement lui-même
// (`WeakMap` : oubliée seule quand l'écriture est finie et l'objet relâché).
const previousOf = new WeakMap<GameSettingsUpdate, GameSettingsUpdate>()

/** Les valeurs actuelles des champs que `patch` change (le défi perso ne se défait pas ainsi). */
const previousValues = (harvest: Harvest, patch: GameSettingsUpdate): GameSettingsUpdate => ({
  ...('titleForm' in patch ? { titleForm: harvest.settings.titleForm } : null),
  ...('pinnedFamily' in patch ? { pinnedFamily: harvest.settings.pinnedFamily } : null),
  ...('inRankings' in patch ? { inRankings: harvest.settings.inRankings } : null),
  ...('harvestNotices' in patch ? { harvestNotices: harvest.settings.harvestNotices } : null),
  ...('levelSeen' in patch ? { levelSeen: harvest.levelSeen } : null),
})

// --- La décoration du rayon (PUT /v1/me/game/decoration) ---

/**
 * Hook : choisir la teinte et le motif du rayon (`mutateAsync({ tint, pattern })`, 204). L'API débite
 * ce qui n'est pas encore acheté ; un solde trop court répond `honeyShort` (409, rien de débité),
 * que la feuille explique. Pas de changement au toucher : le prix dépend de ce que l'API sait, la
 * feuille attend la réponse (bouton en cours), puis la récolte relue montre le rayon et le solde.
 */
export const useDecorate = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['game', 'decoration'],
    mutationFn: (choice: DecorationChoice) =>
      send204(`${GAME_PATH}/decoration`, jsonInit('PUT', choice)),
    scope: { id: 'game-decoration' },
    onSuccess: (_data, choice) => {
      // La décoration choisie se voit tout de suite (la feuille se ferme sur le rayon décoré) ; le
      // solde et les achats viennent de la relecture.
      const harvest = queryClient.getQueryData<Harvest>(harvestQueryKey)
      if (harvest) queryClient.setQueryData(harvestQueryKey, { ...harvest, decoration: choice })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: harvestQueryKey })
      // Le rayon se voit aussi sur sa propre page (`Member.game.decoration`).
      void queryClient.invalidateQueries({ queryKey: ['member'], refetchType: 'active' })
    },
  })
}

// --- Offrir du miel (POST /v1/projects/{id}/honey) ---

/**
 * Hook : offrir 5 miel à l'auteur d'un projet (`mutateAsync()`, 204), une fois par projet. Refus
 * lisibles par `errorKey(mutation.error)` : `honeyShort` (solde trop court, rien de débité),
 * `honeyAlready` (déjà offert, sur un autre appareil). Après une offre, et après « déjà offert »,
 * la page du projet en cache dit `honeyGiven` (« Miel offert ») sans attendre sa relecture.
 */
export const useOfferHoney = (projectId: string) => {
  const queryClient = useQueryClient()
  const markGiven = useCallback(() => {
    const key = projectQueryKey(projectId)
    const project = queryClient.getQueryData<{ honeyGiven?: boolean }>(key)
    if (project) queryClient.setQueryData(key, { ...project, honeyGiven: true })
  }, [queryClient, projectId])
  return useMutation({
    mutationKey: ['game', 'honey', projectId],
    mutationFn: () =>
      send204(`/v1/projects/${encodeURIComponent(projectId)}/honey`, { method: 'POST' }),
    // Deux touchers rapides ne font partir qu'une offre à la fois ; la feuille garde aussi le sien.
    scope: { id: `game-honey:${projectId}` },
    onSuccess: markGiven,
    onError: (error) => {
      if (errorKey(error) === 'honeyAlready') markGiven()
    },
    onSettled: () => {
      // Le solde a baissé : « Ma récolte » le relit. La page du projet aussi (`honeyGiven`).
      void queryClient.invalidateQueries({ queryKey: harvestQueryKey })
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
    },
  })
}

// --- Les classements de la semaine (GET /v1/rankings) ---

/** La clé d'un classement : celui des proches, ou celui d'une ruche. */
export const rankingQueryKey = (scope: RankingScope, hiveId?: string) =>
  scope === 'hive'
    ? ([...rankingsQueryKey, 'hive', hiveId ?? ''] as const)
    : ([...rankingsQueryKey, 'close'] as const)

/** GET /v1/rankings?scope=close, ou ?scope=hive&hive=<id>. Lève une ApiError en cas d'échec. */
export const getRanking = async (scope: RankingScope, hiveId?: string): Promise<Ranking> => {
  const query = new URLSearchParams({ scope })
  if (scope === 'hive' && hiveId) query.set('hive', hiveId)
  const result = await request(`/v1/rankings?${query.toString()}`, {}, Ranking)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : le classement de la semaine, des proches (`'close'`) ou d'une ruche (`'hive'`, avec son
 * identifiant ; sans lui, aucune requête). Un membre retiré des classements reçoit `rankingsOff`
 * (403) : un refus définitif, jamais réessayé (`api/query-client.ts`), sans quoi la phrase du
 * retrait attendrait les reprises. `staleTime: 0` : le classement bouge à chaque geste des proches.
 */
export const useRankings = (scope: RankingScope, hiveId?: string, { enabled = true } = {}) =>
  useQuery({
    queryKey: rankingQueryKey(scope, hiveId),
    queryFn: () => getRanking(scope, hiveId),
    enabled: enabled && (scope === 'close' || Boolean(hiveId)),
    staleTime: 0,
  })
