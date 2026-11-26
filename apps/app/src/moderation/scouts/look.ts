// Ce qui dit à l'œil la sorte et le statut d'un retour d'Éclaireuse dans la page de tri (R20) :
// l'icône de chaque sorte, et le libellé et la couleur de chaque statut, partagés par la liste et
// le retour ouvert.
import type { ScoutReportKind, ScoutStatus } from '@ruche/contracts'
import type { TFunction } from 'i18next'
import type { IconName } from '../../ui/Icon'
import type { ScoutStatusLook } from '../../ui/ScoutTriageRow'

/** L'icône de chaque sorte (un repère pour l'œil : la sorte est toujours écrite à côté). */
export const kindIcon: Record<ScoutReportKind, IconName> = {
  bug: 'warning-circle',
  confusing: 'compass',
  idea: 'lightbulb',
  love: 'heart',
}

/**
 * Le statut tel que l'administrateur le lit : « Nouveau » pour un retour envoyé (option b3 des
 * planches ; « Envoyé » est le mot de l'Éclaireuse) ; Corrigé en miel plein, Nouveau et Prévu en
 * crème, les autres neutres.
 */
export const statusLook = (t: TFunction, status: ScoutStatus): ScoutStatusLook => {
  if (status === 'sent') return { label: t(($) => $.scout.triage.new), tone: 'soft' }
  const label = t(($) => $.scout.statuses[status])
  if (status === 'fixed') return { label, tone: 'strong' }
  if (status === 'planned') return { label, tone: 'soft' }
  return { label, tone: 'neutral' }
}
