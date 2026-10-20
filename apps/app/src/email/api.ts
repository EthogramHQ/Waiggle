// Les e-mails de notification vus par l'appli (tranche 6c) : les deux réglages de « Mon profil »
// (le récap de la semaine, l'e-mail de mentions et de réponses), et la désinscription demandée par
// la page ouverte depuis un e-mail.
//
// Les réglages changent au toucher, comme « Suivre » (follows/api.ts) : l'interrupteur bascule
// tout de suite (« mise à jour optimiste »), le changement part ensuite, et revient en arrière si
// l'API refuse.
import {
  EmailPreferences,
  type EmailPreferencesUpdate,
  type UnsubscribeQuery,
} from '@ruche/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request } from '../api/client'
import { ApiError, type ApiErrorKey, type ApiResult, errorKey, errorKeyFor } from '../api/errors'
import { apiUrl } from '../config'

const path = '/v1/me/email-preferences'

/** La clé des réglages dans le cache de React Query. */
export const emailPreferencesQueryKey = ['email-preferences'] as const

/** Lit les deux réglages du membre connecté (GET /v1/me/email-preferences). */
export const getEmailPreferences = async (): Promise<EmailPreferences> => {
  const result = await request(path, { method: 'GET' }, EmailPreferences)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Change un réglage, ou les deux (PATCH). Seul ce qui change part : deux interrupteurs touchés
 * l'un après l'autre ne s'écrasent pas. L'API rend l'état complet.
 */
export const updateEmailPreferences = async (
  changes: EmailPreferencesUpdate,
): Promise<EmailPreferences> => {
  const result = await request(
    path,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    },
    EmailPreferences,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : les réglages, lus une fois puis gardés en cache. `enabled` : seulement connecté. */
export const useEmailPreferences = (enabled = true) =>
  useQuery({ queryKey: emailPreferencesQueryKey, queryFn: getEmailPreferences, enabled })

// Un changement, et les réglages d'avant pour revenir en arrière si l'API refuse.
type Change = { changes: EmailPreferencesUpdate; previous: EmailPreferences | undefined }

const mutationKey = ['email-preferences', 'update']

/**
 * Hook : `update` change un réglage ; `saved` dit que le dernier changement est enregistré ;
 * `error` qu'il a échoué, `failure` pourquoi (la clé du message `errors.*`), et `expired` si
 * c'est parce que la session a expiré (réessayer ne servirait à rien : il faut se reconnecter).
 */
export const useUpdateEmailPreferences = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ changes }: Change) => updateEmailPreferences(changes),
    // Une « portée » : les changements partent l'un après l'autre, jamais en même temps. Sinon le
    // serveur pourrait recevoir « coupé » puis « activé » dans le désordre.
    scope: { id: mutationKey.join(':') },
    // cancelQueries : une lecture déjà en route ne doit pas écraser le changement affiché.
    onMutate: () => queryClient.cancelQueries({ queryKey: emailPreferencesQueryKey }),
    // Refusé : les interrupteurs reviennent à ce qu'ils étaient avant ce toucher.
    onError: (_error, { previous }) => {
      if (previous) queryClient.setQueryData(emailPreferencesQueryKey, previous)
    },
    // Une fois le dernier changement fait, on relit les réglages enregistrés. Pas avant : relire
    // entre deux touchers rapides ferait sauter l'interrupteur. isMutating compte encore le
    // changement qui se termine, d'où « 1 ».
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: emailPreferencesQueryKey })
    },
  })
  const { mutate } = mutation
  const update = useCallback(
    (changes: EmailPreferencesUpdate) => {
      // L'interrupteur change ici même, au toucher, avant tout envoi : un second toucher, même
      // très rapide, lit déjà le nouvel état. On garde l'ancien pour revenir en arrière.
      const previous = queryClient.getQueryData<EmailPreferences>(emailPreferencesQueryKey)
      if (previous) {
        queryClient.setQueryData<EmailPreferences>(emailPreferencesQueryKey, {
          ...previous,
          ...changes,
        })
      }
      mutate({ changes, previous })
    },
    [queryClient, mutate],
  )
  const failure: ApiErrorKey | null = mutation.isError ? errorKey(mutation.error) : null
  return {
    update,
    saved: mutation.isSuccess,
    error: mutation.isError,
    failure,
    expired: failure === 'unauthorized',
  }
}

/**
 * Coupe un e-mail depuis le lien d'un e-mail (POST /v1/email/unsubscribe?token=…), ou les deux
 * avec `scope = 'all'` (« Tout couper »). La demande ne porte que le jeton du lien, jamais la
 * session : la page sert sans connexion, et l'API ne regarde que la signature du jeton. D'où un
 * `fetch` direct, sans passer par le client qui ajoute la session (api/client.ts), et
 * `credentials: 'omit'` pour que le navigateur n'y joigne aucun cookie. Elle répond 204.
 */
export const unsubscribe = async (
  token: string,
  scope?: NonNullable<UnsubscribeQuery['scope']>,
): Promise<ApiResult<null>> => {
  const query = new URLSearchParams({ token, ...(scope ? { scope } : null) })
  let res: Response
  try {
    res = await fetch(`${apiUrl}/v1/email/unsubscribe?${query}`, {
      method: 'POST',
      credentials: 'omit',
    })
  } catch {
    // fetch ne lève une erreur que si le serveur est injoignable.
    return { ok: false, error: 'network' }
  }
  if (res.ok) return { ok: true, data: null }
  // 400 (`unsubscribe_invalid`) devient « validation », que la page montre comme « Lien invalide ».
  return { ok: false, error: errorKeyFor(res.status) }
}
