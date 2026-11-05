// Deux fonctions pures des commentaires d'un projet (R5b) : les lignes de l'aperçu sous le projet,
// et le début du champ quand on répond. Sans écran ni réseau : on leur donne les commentaires tels
// que l'API les rend et on lit ce qu'elles rendent.
import type { Comment, CommentReply } from '@ruche/contracts'

/**
 * Une ligne de l'aperçu : le commentaire à dessiner, s'il ouvre un fil (`root`) ou en fait partie
 * (`reply`), et l'identifiant de la racine de son fil (celui de la ligne elle-même pour une racine).
 */
export type PreviewLine = {
  comment: CommentReply
  kind: 'root' | 'reply'
  rootId: string
}

/**
 * Un commentaire que tout le monde lit tel quel : visible, et avec son auteur. Un masqué, un retiré
 * (que seul son auteur lit) ou un emplacement (supprimé, bloqué, indisponible, masqué vu par un
 * tiers : `author === null`) reste dans la feuille, jamais dans l'aperçu (jur-P4, ui-B7).
 */
const isShown = (comment: CommentReply): boolean =>
  comment.state === 'visible' && comment.author !== null

/**
 * Les `max` premières lignes de l'aperçu, dans l'ordre de la feuille : chaque fil, puis ses
 * réponses. Une ligne écartée ne prend aucune place (le compte porte sur les lignes gardées).
 * Les réponses visibles d'une racine supprimée ou masquée restent, rattachées à leur fil : elles
 * sont lisibles de tous, même si leur racine ne l'est pas.
 */
export function previewLines(items: Comment[], max: number): PreviewLine[] {
  const lines: PreviewLine[] = []
  for (const root of items) {
    if (isShown(root)) lines.push({ comment: root, kind: 'root', rootId: root.id })
    for (const reply of root.replies) {
      if (isShown(reply)) lines.push({ comment: reply, kind: 'reply', rootId: root.id })
    }
    if (lines.length >= max) break
  }
  return lines.slice(0, Math.max(0, max))
}

/**
 * Le début du champ quand on répond à `target` : « @pseudo » et une espace pour la réponse d'un
 * autre membre, afin qu'on sache à qui l'on répond. Rien pour une racine (la réponse va à son propre
 * fil), pour sa propre réponse, ni pour un auteur sans pseudo (lu malgré un blocage : l'API ne le
 * donne pas, et l'appli ne le devine pas).
 */
export function replyPrefill(target: CommentReply, kind: 'root' | 'reply'): string {
  if (kind !== 'reply' || target.isMine) return ''
  const handle = target.author?.handle
  return handle ? `@${handle} ` : ''
}
