// Ce que la page « Modération » écrit d'un signalement, et où mène son lien « Voir ». Des fonctions
// pures, à part des hooks de api.ts : les tests de l'écran remplacent api.ts sans perdre celles-ci.
import type { ReportReason, ReportTarget } from '@ruche/contracts'
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
  other: 'other',
} as const satisfies Record<ReportReason, string>

/**
 * Où mène « Voir » : la page du membre pour un profil, sinon la page du projet qui porte le
 * contenu (un commentaire ou une note se lisent sur leur projet). Construit depuis la sorte et
 * l'identifiant, jamais depuis un texte écrit par un membre (règle 22 de la relecture du plan).
 */
export const viewHref = (target: ReportTarget, projectId: string | null): Href => {
  if (target.kind === 'member') return { pathname: '/members/[id]', params: { id: target.id } }
  // Pour un projet, son propre identifiant ; pour une note ou un commentaire, celui de son projet.
  const id = projectId ?? target.id
  return { pathname: '/projects/[id]', params: { id } }
}

/** Une clé stable pour une cible (« comment:c0d1… »), pour les listes et l'action en cours. */
export const targetKey = (target: ReportTarget) => `${target.kind}:${target.id}`
