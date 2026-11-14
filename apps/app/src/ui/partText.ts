// Le nom d'une partie d'un contenu en minuscules (« la photo 2 », « le titre »), pour les phrases de
// la modération. Il vit dans `src/ui` parce que la carte compacte d'une décision (DecisionCard) l'écrit
// elle-même et qu'un composant n'importe pas un dossier de domaine ; `moderation/present.ts` le
// ré-exporte, pour les écrans et les tests qui le lisent là.
import type { PartOut, StoredReportTarget } from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import type { useTranslation } from 'react-i18next'

/** Le nom de chaque partie dans les textes (`moderation.parts.*`) : le champ de l'API lui-même. */
type PartTextKey = keyof Translation['moderation']['parts']

type T = ReturnType<typeof useTranslation>['t']

/**
 * La partie en minuscules, après le genre du contenu (« la photo 2 », « le titre »). Une photo dit
 * son rang dans sa galerie (`position`) ; si la photo n'est plus là (rang inconnu), « la photo »
 * tout court, plutôt qu'un « {{n}} » écrit tel quel. `kind` : la sorte du contenu, pour nommer la
 * seule image d'un message (« la capture ») ou d'un appel (« la photo »).
 */
export const partText = (part: PartOut, t: T, kind?: StoredReportTarget['kind']): string => {
  const field: PartTextKey = part.field
  if (field === 'photo' && kind === 'message') return t(($) => $.moderation.parts.capture)
  if (field === 'photo' && kind === 'call') return t(($) => $.moderation.parts.callPhoto)
  if ((field === 'photo' || field === 'photoDescription') && part.position === null) {
    return t(($) => $.moderation.parts.callPhoto)
  }
  const n = part.position ?? undefined
  return t(($) => $.moderation.parts[field], { n })
}
