// Ce qui dit à l'œil un retour d'Éclaireuse vu par son autrice (R20, « Mes retours » des réglages
// « Les Éclaireuses », planche R20-Reglages) : la sorte avec son icône, la gravité, le statut et sa
// couleur. L'icône de chaque sorte est celle de la page de tri (moderation/scouts/look.ts), pour que
// la même sorte ait partout le même dessin.
import type { ScoutReportKind, ScoutSeverity, ScoutStatus } from '@ruche/contracts'
import type { TFunction } from 'i18next'
import { kindIcon } from '../moderation/scouts/look'
import type { IconName } from '../ui/Icon'
import type { ScoutStatusLook } from '../ui/ScoutTriageRow'

/** La sorte d'un retour : son nom (« Bug ») et son icône. */
export const kindLook = (
  t: TFunction,
  kind: ScoutReportKind,
): { label: string; icon: IconName } => ({
  label: t(($) => $.scout.kinds[kind]),
  icon: kindIcon[kind],
})

/** La gravité d'un retour (« Gênant ») ; « Bloquant » s'écrit en encre, plus visible. */
export const severityLook = (t: TFunction, severity: ScoutSeverity | null) =>
  severity === null
    ? undefined
    : { label: t(($) => $.scout.severities[severity]), strong: severity === 'blocking' }

/**
 * Le statut tel que l'Éclaireuse le lit : « Envoyé » (l'administrateur lit « Nouveau »), Corrigé en
 * miel plein, Prévu en crème, les autres neutres (planche R20-Reglages : « Gardé de côté » n'est
 * annoncé nulle part, rien qui culpabilise).
 */
export const myStatusLook = (t: TFunction, status: ScoutStatus): ScoutStatusLook => {
  const label = t(($) => $.scout.statuses[status])
  if (status === 'fixed') return { label, tone: 'strong' }
  if (status === 'planned') return { label, tone: 'soft' }
  return { label, tone: 'neutral' }
}
