// Ce que la page « Modération » écrit d'un signalement, et où mène son lien « Voir ». Des fonctions
// pures, à part des hooks de api.ts : les tests de l'écran remplacent api.ts sans perdre celles-ci.
import {
  isReportablePart,
  type PartOut,
  ReportPart,
  type ReportReason,
  StoredReportTarget,
} from '@ruche/contracts'
import type { Href } from 'expo-router'

/**
 * Le nom de chaque motif dans les textes (`report.reasons.*`) : l'API écrit les motifs en
 * « snake_case » (scam_spam), les textes en « camelCase » (scamSpam).
 */
export const reasonTextKey = {
  illegal: 'illegal',
  harassment: 'harassment',
  sexual_violent: 'sexualViolent',
  scam_spam: 'scamSpam',
  impersonation: 'impersonation',
  privacy: 'privacy',
  dangerous_link: 'dangerousLink',
  other: 'other',
} as const satisfies Record<ReportReason, string>

/**
 * Où mène « Voir » : la page du membre pour un profil, sinon la page du projet qui porte le
 * contenu (un commentaire ou une note se lisent sur leur projet). Construit depuis la sorte et
 * l'identifiant, jamais depuis un texte écrit par un membre (règle 22 de la relecture du plan).
 */
export const viewHref = (target: StoredReportTarget, projectId: string | null): Href => {
  if (target.kind === 'member') return { pathname: '/members/[id]', params: { id: target.id } }
  // Pour un projet, son propre identifiant ; pour une note ou un commentaire, celui de son projet.
  const id = projectId ?? target.id
  // R7b : un appel ou un message du coin des testeurs se lit dans le coin, jamais sur la page du
  // projet (le fil est privé). L'appel : l'onglet « Appels » ; le message : l'onglet « Retours »
  // (la cible ne donne pas le testeur, donc pas le fil lui-même).
  if (target.kind === 'call' || target.kind === 'message') {
    return {
      pathname: '/projects/[id]/testers',
      params: { id, tab: target.kind === 'call' ? 'calls' : 'feedback' },
    }
  }
  return { pathname: '/projects/[id]', params: { id } }
}

/** Une clé stable pour une cible (« comment:c0d1… »), pour les listes et l'action en cours. */
export const targetKey = (target: StoredReportTarget) => `${target.kind}:${target.id}`

/** Le nom d'une partie en minuscules : écrit dans `ui/partText.ts` (la carte compacte le lit aussi). */
export { partText } from '../ui/partText'

// Une clé d'élément tient dans une adresse (`?item=`) : seulement des lettres, chiffres, « : », « - »
// et « _ ». Forme : `sorte:id` pour le contenu entier, `sorte:id:champ` pour une partie,
// `sorte:id:champ:photo` pour une photo. Les identifiants (uuid, id de membre) n'ont pas de « : ».
const SEPARATOR = ':'

/**
 * La clé d'un élément de la file : la cible **et** la partie. Deux éléments d'un même projet (le
 * projet entier, sa 2e photo) ont deux clés. `part` : celle d'un élément de l'API (`PartOut`), d'une
 * décision (`ReportPart`), ou `null` pour le contenu entier.
 */
export const itemKey = (target: StoredReportTarget, part: PartOut | ReportPart | null): string =>
  part
    ? [target.kind, target.id, part.field, ...(part.mediaId ? [part.mediaId] : [])].join(SEPARATOR)
    : targetKey(target)

/**
 * L'inverse d'`itemKey`, pour lire `?item=` : la cible et la partie, ou `null` si la clé est mal
 * formée. Tout passe par les schémas du contrat : une adresse écrite à la main ne donne jamais une
 * cible ou une partie que l'API refuserait.
 */
export const parseItemKey = (
  key: string,
): { target: StoredReportTarget; part: ReportPart | null } | null => {
  const [kind, id, field, mediaId, ...rest] = key.split(SEPARATOR)
  if (rest.length > 0) return null
  const target = StoredReportTarget.safeParse({ kind, id })
  if (!target.success) return null
  if (field === undefined) return mediaId === undefined ? { target: target.data, part: null } : null
  const part = ReportPart.safeParse({ field, ...(mediaId === undefined ? {} : { mediaId }) })
  // Une partie que cette sorte de contenu n'a pas (une photo d'un commentaire) n'existe pas.
  if (!part.success || !isReportablePart(target.data.kind, part.data.field)) return null
  return { target: target.data, part: part.data }
}
