// Le message d'une décision de modération refusée (tranche 7c), commun à la file et à la page
// « Suspendre ». Deux refus y ont leur propre phrase, plus juste que le message général :
// - 429 : la limite de décisions par jour (J15), avec ce qu'on fait en urgence ; ou, si un mot de
//   passe vient d'être envoyé, trop de mots de passe faux dans la journée (S12) : l'API répond 429
//   dans les deux cas, et le mot de passe envoyé est le seul indice qui les sépare ;
// - un mot de passe faux, qui garde son message général (« Mot de passe incorrect »).
// Une fonction sans React : elle reçoit `t`, l'écran garde la main sur l'affichage.
import { MODERATION_DECISIONS_PER_DAY } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'

/** La fonction de traduction, telle que la donne useTranslation. */
type T = ReturnType<typeof useTranslation>['t']

export const decisionFailure = (
  t: T,
  error: ApiErrorKey,
  { passwordSent = false }: { passwordSent?: boolean } = {},
): string => {
  if (error === 'rateLimited') {
    return passwordSent
      ? t(($) => $.moderation.password.tooManyFailures)
      : t(($) => $.moderation.limited, { max: MODERATION_DECISIONS_PER_DAY })
  }
  return t(($) => $.errors[error])
}
