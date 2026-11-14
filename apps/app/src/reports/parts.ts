// Les parties qu'on peut signaler (R9, scénario « Les parties ») : la feuille « Signaler » demande
// d'abord « Quelle partie ? ». Ce fichier compose la liste de ses choix à partir de l'aperçu que
// rend l'API (`ReportTargetPreview.parts`) et donne un nom à chaque partie (« La 2e photo »).
//
// Des fonctions pures, à part des hooks de `reports/api.ts` : un test d'écran qui remplace ce
// module-là (`jest.mock('./api')`) ne perd pas celles-ci.
import type { ReportPart, ReportTargetKind, ReportTargetPreview } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'

type T = ReturnType<typeof useTranslation>['t']
type PreviewPart = ReportTargetPreview['parts'][number]

/** Un choix de l'étape « Quelle partie ? ». */
export type PartChoice = {
  /** Clé stable de la ligne : le champ, plus la photo visée (la couverture et la 1re photo diffèrent). */
  key: string
  /** Ce que l'API reçoit ; `null` : tout le contenu (aucune `part` envoyée). */
  part: ReportPart | null
  label: string
  /** Miniature d'une photo ou de la couverture ; `null` pour un texte et pour « tout ». */
  thumb: PreviewPart['thumb']
}

/** Les sortes de contenu qui ont un choix « Tout … » ; un commentaire n'a pas de partie. */
type WholeKind = Exclude<ReportTargetKind, 'comment'>

/** La partie telle que l'API la reçoit : la photo porte son identifiant, les autres rien. */
const toPart = (entry: PreviewPart): ReportPart =>
  entry.mediaId === null ? { field: entry.field } : { field: entry.field, mediaId: entry.mediaId }

/** Le rang d'une photo en toutes lettres : « 1re », puis « 2e », « 10e »… */
const rankOf = (position: number, t: T): string =>
  position === 1 ? t(($) => $.report.rank.first) : t(($) => $.report.rank.other, { n: position })

/**
 * Le nom d'une partie d'après l'aperçu. Une photo se nomme par son rang dans l'aperçu ; l'unique
 * image d'un message est « La capture », celle d'un appel « La photo » (rien à compter).
 */
export const partLabel = (part: ReportPart, preview: ReportTargetPreview, t: T): string => {
  const kind = preview.target.kind
  const { field } = part
  if (field === 'photo' && kind === 'message') return t(($) => $.report.parts.capture)
  if (field === 'photo' && kind === 'call') return t(($) => $.report.parts.callPhoto)
  if (field === 'photo' || field === 'photoDescription') {
    // Le rang vient de la ligne de l'aperçu qui porte cette photo (1 si elle a disparu entre-temps).
    const position =
      preview.parts.find((entry) => entry.field === 'photo' && entry.mediaId === part.mediaId)
        ?.position ?? 1
    const rank = rankOf(position, t)
    return field === 'photo'
      ? t(($) => $.report.parts.photo, { rank })
      : t(($) => $.report.parts.photoDescription, { rank })
  }
  return t(($) => $.report.parts[field])
}

/** « Tout le projet », « Tout le profil »… selon la sorte de contenu. */
const wholeLabel = (kind: WholeKind, t: T): string => t(($) => $.report.whole[kind])

/**
 * Les choix de l'étape « Quelle partie ? » : « Tout … » d'abord (sans partie, sans miniature), puis
 * les parties de l'aperçu dans son ordre (celui de `REPORTABLE_PARTS`). Un contenu sans partie (un
 * commentaire) : aucun choix, la feuille commence au motif.
 */
export const partChoices = (preview: ReportTargetPreview, t: T): PartChoice[] => {
  const kind = preview.target.kind
  if (kind === 'comment') return []
  const whole: PartChoice = { key: 'whole', part: null, label: wholeLabel(kind, t), thumb: null }
  const parts = preview.parts.map((entry): PartChoice => {
    const part = toPart(entry)
    return {
      key: `${entry.field}:${entry.mediaId ?? ''}`,
      part,
      label: partLabel(part, preview, t),
      thumb: entry.thumb,
    }
  })
  return [whole, ...parts]
}
