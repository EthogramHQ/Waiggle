// Ce que la page « Modération » écrit d'un signalement, et où mène son lien « Voir ». Des fonctions
// pures, à part des hooks de api.ts : les tests de l'écran remplacent api.ts sans perdre celles-ci.
import type { ReportReason, StoredReportTarget } from '@ruche/contracts'
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
