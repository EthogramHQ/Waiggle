// La suspension du membre connecté (tranche 7c), telle que les écrans la lisent : pour retirer les
// actions qu'un compte suspendu n'a plus (publier, commenter, réagir, suivre, modifier son profil)
// et pour poser le bandeau qui le lui dit (`TopNav`).
//
// Elle vient du profil (GET /v1/me, `Me.suspension`), que l'appli lit déjà partout : aucune requête
// de plus. Tant que le profil n'est pas arrivé (ou n'a pas pu l'être), le membre n'est pas tenu pour
// suspendu : ses actions restent, et l'API refuserait de toute façon un geste interdit (403).
import type { Suspension } from '@ruche/contracts'
import { useSession } from '../accounts/api'
import { useMe } from '../profile/hooks'

export type SuspensionState = {
  /** La suspension en cours, telle que l'API la donne ; null si le compte ne l'est pas. */
  suspension: Suspension | null
  /** Vrai si le compte est suspendu : les écrans retirent alors les actions interdites. */
  suspended: boolean
  /** La fin prévue (date ISO) ; null pour une suspension sans fin, ou sans suspension. */
  endsAt: string | null
}

/**
 * Hook : la suspension du membre connecté. Il lit le profil partagé (`useMe`), sans relancer à son
 * apparition une lecture qui vient d'échouer (`retryOnMount: false`, comme la barre du haut) :
 * chaque écran de chargement ou d'erreur a sa barre, et une relecture à chaque barre ferait
 * boucler les requêtes sur un profil en panne.
 */
export const useSuspension = (): SuspensionState => {
  const { data: session } = useSession()
  const me = useMe(Boolean(session), { retryOnMount: false })
  // `?? null` : un profil d'avant la tranche 7c (en cache, ou d'un test) n'a pas le champ.
  const suspension = me.data?.suspension ?? null
  return { suspension, suspended: suspension !== null, endsAt: suspension?.endsAt ?? null }
}
