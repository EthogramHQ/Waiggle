// Les e-mails de notification vus par l'appli (tranche 6c, R8) : les réglages de l'écran
// « Notifications » (le récap de la semaine, et depuis R8 un choix par type : « Tout de suite »,
// « Dans le récap » ou « Jamais »), et la désinscription demandée par la page ouverte depuis un
// e-mail.
//
// Les réglages changent au toucher, comme « Suivre » (follows/api.ts) : le choix se lit tout de
// suite (« mise à jour optimiste »), le changement part ensuite, et revient en arrière si l'API
// refuse. Chaque changement ne porte qu'un champ (EmailPreferencesPatch) : celui qu'on vient de
// toucher.
import {
  EmailPreferences,
  type EmailPreferencesPatch,
  type UnsubscribeQuery,
} from '@ruche/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { request } from '../api/client'
import { ApiError, type ApiErrorKey, type ApiResult, errorKey, errorKeyFor } from '../api/errors'
import { apiUrl } from '../config'

const path = '/v1/me/email-preferences'

/** La clé des réglages dans le cache de React Query. */
export const emailPreferencesQueryKey = ['email-preferences'] as const

/** Lit les réglages du membre connecté (GET /v1/me/email-preferences). */
export const getEmailPreferences = async (): Promise<EmailPreferences> => {
  const result = await request(path, { method: 'GET' }, EmailPreferences)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Change un seul réglage (PATCH). Seul ce qui change part : deux types touchés l'un après l'autre
 * ne s'écrasent pas. L'API rend l'état complet.
 */
export const updateEmailPreferences = async (
  changes: EmailPreferencesPatch,
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

type Field = keyof EmailPreferences

/** Le champ qu'un changement porte (un seul, EmailPreferencesPatch). */
const fieldOf = (changes: EmailPreferencesPatch) => Object.keys(changes)[0] as Field | undefined

const mutationKey = ['email-preferences', 'update']

/**
 * Hook : `update` change un réglage ; `saved` dit que le dernier changement est enregistré ;
 * `error` qu'il a échoué, `failure` pourquoi (la clé du message `errors.*`), `failedField` quel
 * réglage (la ligne qui montre l'erreur), et `expired` si c'est parce que la session a expiré
 * (réessayer ne servirait à rien : il faut se reconnecter).
 */
export const useUpdateEmailPreferences = () => {
  const queryClient = useQueryClient()
  // Par champ, la dernière valeur que le serveur a confirmée : la lecture d'origine, puis la
  // réponse de chaque PATCH réussi. C'est à elle qu'un échec remet le champ, jamais à « ce qu'il
  // y avait au toucher » : après deux changements rapides, cet instantané est déjà le premier
  // changement, pas la valeur du serveur. Et, par champ, combien de changements sont partis ou
  // attendent : tant qu'il en reste un, ce qu'on voit est le choix du dernier, et c'est lui qui
  // dira si le champ revient en arrière. Un seul objet, gardé d'un dessin à l'autre (le premier
  // `useState`) et modifié sur place : changer ce carnet ne redessine rien.
  const [confirmed] = useState<Record<string, unknown>>({})
  const [pending] = useState<Record<string, number>>({})
  const settle = (field: Field) => {
    pending[field] = Math.max(0, (pending[field] ?? 1) - 1)
    return pending[field] === 0
  }
  const mutation = useMutation({
    mutationKey,
    mutationFn: (changes: EmailPreferencesPatch) => updateEmailPreferences(changes),
    // Une « portée » : les changements partent l'un après l'autre, jamais en même temps. Sinon le
    // serveur pourrait recevoir « coupé » puis « activé » dans le désordre.
    scope: { id: mutationKey.join(':') },
    // cancelQueries : une lecture déjà en route ne doit pas écraser le changement affiché.
    onMutate: () => queryClient.cancelQueries({ queryKey: emailPreferencesQueryKey }),
    // Refusé : seul le champ de ce toucher revient, à sa dernière valeur confirmée, et seulement
    // s'il n'a plus de changement derrière lui (il déciderait lui-même ; sinon le choix du second
    // toucher clignoterait). Un autre champ, pris entre-temps, n'est pas touché.
    onError: (_error, changes) => {
      const field = fieldOf(changes)
      if (!field || !settle(field)) return
      const back = confirmed[field]
      if (back === undefined) return
      queryClient.setQueryData<EmailPreferences>(emailPreferencesQueryKey, (current) =>
        current ? { ...current, [field]: back } : current,
      )
    },
    // Accepté : la réponse confirme le champ envoyé, et lui seul. R8 : on ne relit plus tout l'état
    // (ni la réponse entière, ni une nouvelle lecture) : deux types changés vite partent l'un après
    // l'autre, et la réponse du premier, écrite avant le second, remettrait le second à son ancien
    // choix sous les yeux du membre. La page relira tout à sa prochaine ouverture.
    onSuccess: (saved, changes) => {
      const field = fieldOf(changes)
      if (!field) return
      confirmed[field] = saved[field]
      if (!settle(field)) return
      queryClient.setQueryData<EmailPreferences>(emailPreferencesQueryKey, (current) =>
        current ? { ...current, [field]: saved[field] } : saved,
      )
    },
  })
  const { mutate } = mutation
  const update = useCallback(
    (changes: EmailPreferencesPatch) => {
      const field = fieldOf(changes)
      const current = queryClient.getQueryData<EmailPreferences>(emailPreferencesQueryKey)
      // Le choix change ici même, au toucher, avant tout envoi : un second toucher, même très
      // rapide, lit déjà le nouvel état. Avant de le changer, on retient la valeur du champ si
      // personne ne l'a encore touché : c'est celle du serveur.
      if (field && current && confirmed[field] === undefined) confirmed[field] = current[field]
      if (current) {
        queryClient.setQueryData<EmailPreferences>(emailPreferencesQueryKey, {
          ...current,
          ...changes,
        })
      }
      if (field) pending[field] = (pending[field] ?? 0) + 1
      mutate(changes)
    },
    [queryClient, mutate, confirmed, pending],
  )
  const failure: ApiErrorKey | null = mutation.isError ? errorKey(mutation.error) : null
  return {
    update,
    saved: mutation.isSuccess,
    error: mutation.isError,
    failure,
    failedField:
      mutation.isError && mutation.variables ? (fieldOf(mutation.variables) ?? null) : null,
    expired: failure === 'unauthorized',
  }
}

/**
 * Coupe un e-mail depuis le lien d'un e-mail (POST /v1/email/unsubscribe?token=…), ou tous avec
 * `scope = 'all'` (« Tout couper »). R8 : pour le lien d'un e-mail « tout de suite », `choice` dit
 * ce que deviennent les types réglés ainsi, « Dans le récap » (`digest`) ou « Jamais » (`never`).
 * La demande ne porte que le jeton du lien, jamais la session : la page sert sans connexion, et
 * l'API ne regarde que la signature du jeton. D'où un `fetch` direct, sans passer par le client qui
 * ajoute la session (api/client.ts), et `credentials: 'omit'` pour que le navigateur n'y joigne
 * aucun cookie. Elle répond 204.
 */
export const unsubscribe = async (
  token: string,
  scope?: NonNullable<UnsubscribeQuery['scope']>,
  choice?: NonNullable<UnsubscribeQuery['choice']>,
): Promise<ApiResult<null>> => {
  const query = new URLSearchParams({
    token,
    ...(scope ? { scope } : null),
    ...(choice ? { choice } : null),
  })
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
