// Le registre des entrées (tranche 7b) : chaque champ qu'un membre saisit, et ce qui le couvre.
// Demande de Louis (24/10/2026) : toutes les entrées d'un membre doivent être modérées. Le test
// apps/api/src/member-inputs.test.ts lit le schéma de la base et échoue si une colonne n'est
// classée ni ici (une saisie), ni dans NOT_MEMBER_INPUTS (avec sa raison) : un champ ajouté un jour
// ne peut donc pas échapper au signalement, au blocage et à l'export sans que quelqu'un le décide.
import type { MemberInputField } from '@ruche/contracts'

/** L'objet qui porte le champ : ce qu'on signale et ce qu'un blocage cache. */
export type InputObject = 'member' | 'project' | 'note' | 'comment' | 'report'

/** La sorte de champ : un texte, une liste de textes, un lien, ou une image (une clé de stockage). */
export type InputKind = 'text' | 'list' | 'link' | 'image'

export type MemberInput = {
  /** Son nom dans la copie d'un signalement (ReportSnapshot) ; null s'il n'y entre pas. */
  field: MemberInputField | null
  object: InputObject
  /** La table et la colonne SQL. */
  table: string
  column: string
  kind: InputKind
  /** Copié au signalement de son objet (une image : sa clé seulement, jamais le fichier). */
  snapshot: boolean
  /** Présent dans l'export de son auteur (jamais dans celui de qui signale). */
  export: boolean
  // Tranche 7c : `removable`, le retrait de ce seul champ par la modération.
}

export const MEMBER_INPUTS: readonly MemberInput[] = [
  // Le profil.
  {
    field: 'name',
    object: 'member',
    table: 'user',
    column: 'name',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'handle',
    object: 'member',
    table: 'member_handle',
    column: 'handle',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'bio',
    object: 'member',
    table: 'profile',
    column: 'bio',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'favoriteTools',
    object: 'member',
    table: 'profile',
    column: 'favorite_tools',
    kind: 'list',
    snapshot: true,
    export: true,
  },
  {
    field: 'avatar',
    object: 'member',
    table: 'profile',
    column: 'avatar_key',
    kind: 'image',
    snapshot: true,
    export: false,
  },
  // Le projet. La couverture et les photos partagent une colonne ; `slot` dit laquelle.
  {
    field: 'title',
    object: 'project',
    table: 'project',
    column: 'title',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'pitch',
    object: 'project',
    table: 'project',
    column: 'pitch',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'description',
    object: 'project',
    table: 'project',
    column: 'description',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'prompt',
    object: 'project',
    table: 'project',
    column: 'prompts',
    kind: 'list',
    snapshot: true,
    export: true,
  },
  {
    field: 'tools',
    object: 'project',
    table: 'project',
    column: 'tools',
    kind: 'list',
    snapshot: true,
    export: true,
  },
  {
    field: 'demoUrl',
    object: 'project',
    table: 'project',
    column: 'demo_url',
    kind: 'link',
    snapshot: true,
    export: true,
  },
  {
    field: 'cover',
    object: 'project',
    table: 'project_media',
    column: 'storage_key',
    kind: 'image',
    snapshot: true,
    export: false,
  },
  {
    field: 'photo',
    object: 'project',
    table: 'project_media',
    column: 'storage_key',
    kind: 'image',
    snapshot: true,
    export: false,
  },
  // Le journal et les commentaires.
  {
    field: 'body',
    object: 'note',
    table: 'project_note',
    column: 'body',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'body',
    object: 'comment',
    table: 'project_comment',
    column: 'body',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  // La précision d'un signalement : saisie par un membre, montrée à la modération seule.
  {
    field: null,
    object: 'report',
    table: 'content_report',
    column: 'details',
    kind: 'text',
    snapshot: false,
    export: true,
  },
]

/**
 * Les colonnes qui ne sont pas une saisie libre d'un membre, table par table, chacune avec sa
 * raison. Une colonne `text`, `jsonb` ou tableau n'y entre qu'avec une raison écrite (relecture de
 * sécurité du plan 7b, B7). `'*'` : toute la table (une table du système, sans saisie d'un membre).
 * À compléter par backend-dev jusqu'à ce que member-inputs.test.ts passe.
 */
export const NOT_MEMBER_INPUTS: Record<string, Record<string, string> | '*'> = {
  member_block: '*', // deux identifiants et une date
  api_rate_limit: '*', // des compteurs de l'API
}
