// L'accord aux règles : le geste du membre qui accepte la version en vigueur (POST /v1/me/rules),
// et le hook qui le fait. L'API répond par le profil à jour (`rulesAccepted: true`) : on le pose
// dans le cache du profil, et tout ce qui lit `useMe()` (la garde des règles, la feuille du pseudo)
// se redessine sans nouvelle lecture.
import { type AcceptRules, Me, RULES_VERSION } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { request } from '../api/client'
import { ApiError } from '../api/errors'

/**
 * Enregistre l'accord (POST /v1/me/rules). Le corps redit ce que le membre a coché : la version
 * des règles qu'il a lue et ses deux accords (règles, âge) ; l'API refuse une autre version, ce qui
 * protège d'un onglet resté ouvert sur d'anciennes règles. L'écran n'appelle ce geste qu'une fois
 * les deux cases cochées. Lève une `ApiError` en cas de refus.
 */
export const acceptRules = async (): Promise<Me> => {
  const body: AcceptRules = { version: RULES_VERSION, acceptRules: true, ageDeclared: true }
  const result = await request(
    '/v1/me/rules',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    Me,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : accepter les règles. `accept()` rend une promesse qui se règle quand le profil est posé
 * dans le cache, et qui est rejetée (avec une `ApiError`) si l'API refuse : l'écran dit alors
 * « l'accord n'a pas pu être enregistré » et reste. Une seule demande part à la fois : un second
 * appel, pendant que la première est en vol (double tape), rend la même promesse.
 */
export const useAcceptRules = (): { accept: () => Promise<void>; busy: boolean } => {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  // La demande en vol, lue au toucher même (un état React ne serait pas encore à jour au 2e appel).
  const inFlight = useRef<Promise<void> | null>(null)

  const accept = useCallback(() => {
    if (inFlight.current) return inFlight.current
    setBusy(true)
    const pending = acceptRules()
      .then((me) => {
        queryClient.setQueryData(['me'], me)
      })
      .finally(() => {
        inFlight.current = null
        setBusy(false)
      })
    inFlight.current = pending
    return pending
  }, [queryClient])

  return { accept, busy }
}
