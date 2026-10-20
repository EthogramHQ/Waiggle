// Commentaires d'exemple pour les tests de l'appli (tranche 5) : des fils sur le projet de Léa,
// tels que l'API les donne (GET /v1/projects/{id}/comments). Depuis la tranche 6b, chaque
// commentaire a aussi ses mentions (vides par défaut), et Inès peut être mentionnée.
import type { Comment, CommentReply, Mention, Mentionable } from '@ruche/contracts'

export const leaAuthor = { id: 'u1', name: 'Léa', avatarUrl: null }
export const maxAuthor = { id: 'u2', name: 'Max', avatarUrl: null }
export const zoeAuthor = { id: 'u3', name: 'Zoé', avatarUrl: null }

/** Une réponse visible de Zoé ; chaque test change ce qui l'intéresse. */
export const replyOf = (
  fields: Partial<CommentReply> & { id: string; body: string },
): CommentReply => ({
  author: zoeAuthor,
  createdAt: '2026-10-15T10:00:00.000Z',
  editedAt: null,
  state: 'visible',
  isMine: false,
  mentions: [],
  ...fields,
})

// --- Tranche 6b : les mentions ---

/** Inès, telle que les suggestions la proposent après « @in ». */
export const inesMember: Mentionable = {
  id: 'u5',
  name: 'Inès Morel',
  handle: 'ines_morel',
  avatarUrl: null,
}

/** Iniko, un second membre dont le pseudo commence par « in ». */
export const inikoMember: Mentionable = {
  id: 'u6',
  name: 'Iniko Diallo',
  handle: 'iniko',
  avatarUrl: null,
}

/** La mention d'Inès, telle que l'API la rend avec un commentaire : le pseudo écrit, et son membre. */
export const inesMention: Mention = { handle: 'ines_morel', memberId: inesMember.id }

/** Un commentaire racine, avec ses réponses (aucune par défaut). */
export const commentOf = ({
  replies = [],
  ...fields
}: Partial<Comment> & { id: string; body: string }): Comment => ({ ...replyOf(fields), replies })

/** Zoé répond à Max. */
export const zoeReply = replyOf({
  id: '3b4c5d6e-7f80-4a91-8ba2-b3c4d5e6f708',
  body: 'Moi aussi, dis-nous !',
  createdAt: '2026-10-15T10:00:00.000Z',
})

/** Léa, l'autrice du projet, répond aussi. */
export const leaReply = replyOf({
  id: '4c5d6e7f-8091-4ba2-9cb3-c4d5e6f70819',
  author: leaAuthor,
  body: 'Merci à vous deux.',
  createdAt: '2026-10-15T11:00:00.000Z',
})

/** Le fil le plus récent : le commentaire de Max, et ses deux réponses (de la plus ancienne). */
export const maxComment = commentOf({
  id: '2a3b4c5d-6e7f-4a80-9b91-a2b3c4d5e6f7',
  author: maxAuthor,
  body: 'Super idée, je teste ce soir.',
  createdAt: '2026-10-15T09:00:00.000Z',
  replies: [zoeReply, leaReply],
})

/** Un fil plus ancien : une question de Zoé, sans réponse. */
export const zoeComment = commentOf({
  id: '5d6e7f80-91a2-4cb3-8dc4-d5e6f708192a',
  body: 'Ça marche aussi en anglais ?',
  createdAt: '2026-10-14T09:00:00.000Z',
})
