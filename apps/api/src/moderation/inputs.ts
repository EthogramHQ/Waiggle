// Le registre des entrées (tranche 7b) : chaque champ qu'un membre saisit, et ce qui le couvre.
// Demande de Louis (24/10/2026) : toutes les entrées d'un membre doivent être modérées. Le test
// apps/api/src/member-inputs.test.ts lit le schéma de la base et échoue si une colonne n'est
// classée ni ici (une saisie), ni dans NOT_MEMBER_INPUTS (avec sa raison) : un champ ajouté un jour
// ne peut donc pas échapper au signalement, au blocage et à l'export sans que quelqu'un le décide.
import type { MemberInputField } from '@ruche/contracts'

/** L'objet qui porte le champ : ce qu'on signale et ce qu'un blocage cache. */
export type InputObject =
  | 'member'
  | 'project'
  | 'update'
  | 'comment'
  | 'report'
  // R7b : un appel à tester et un message d'un fil de testeur (le coin des testeurs).
  | 'call'
  | 'message'

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
  // Le nom tapé pour chaque outil favori (`profile_tool.label`, R6b).
  {
    field: 'favoriteTools',
    object: 'member',
    table: 'profile_tool',
    column: 'label',
    kind: 'text',
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
  // Les outils lus par le catalogue (R6b). Le nom d'un « Autre » est partagé (le premier tapé), le nom
  // tapé par l'auteur de CE projet est dans `project_tool.label` : l'un et l'autre sont des textes de
  // membres, copiés au signalement et exportés sous le champ « tools ».
  {
    field: 'tools',
    object: 'project',
    table: 'tool',
    column: 'name',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'tools',
    object: 'project',
    table: 'project_tool',
    column: 'label',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  // Le nom d'un « Autre » rattaché à un outil du catalogue, gardé au journal des administrateurs
  // seulement : ni copié, ni exporté (l'« Autre » n'a plus d'auteur, décision 5), effacé après un an.
  {
    field: null,
    object: 'project',
    table: 'catalogue_change',
    column: 'merged_name',
    kind: 'text',
    snapshot: false,
    export: false,
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
  // La description d'une photo (R6a) : du texte libre, dans la même table que l'image.
  {
    field: 'photoDescription',
    object: 'project',
    table: 'project_media',
    column: 'description',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  // Les mises à jour d'un projet (R7a) : le titre, la version et les lignes (texte tiré du jsonb
  // `lines`), copiés au signalement et exportés. Leurs photos sont des lignes de `project_media`
  // (emplacement « update ») : même colonne que celles du projet, rangée ici sous l'objet `update`,
  // pour qu'un signalement de la mise à jour en copie la clé et la description.
  {
    field: 'title',
    object: 'update',
    table: 'project_update',
    column: 'title',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'version',
    object: 'update',
    table: 'project_update',
    column: 'version',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'line',
    object: 'update',
    table: 'project_update',
    column: 'lines',
    kind: 'list',
    snapshot: true,
    export: true,
  },
  {
    field: 'photo',
    object: 'update',
    table: 'project_media',
    column: 'storage_key',
    kind: 'image',
    snapshot: true,
    export: false,
  },
  {
    field: 'photoDescription',
    object: 'update',
    table: 'project_media',
    column: 'description',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  // Les commentaires.
  {
    field: 'body',
    object: 'comment',
    table: 'project_comment',
    column: 'body',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  // Le coin des testeurs (R7b). Un appel : son texte (copié sous `body`, comme un commentaire), sa
  // photo (la clé seulement) et la description de cette photo, écrite par l'auteur au lancement.
  // La photo et la description sont dans `tester_media`, une table commune aux appels et aux
  // messages ; l'objet dit à laquelle des deux sortes de cible la ligne se rattache.
  {
    field: 'body',
    object: 'call',
    table: 'tester_call',
    column: 'text',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'photo',
    object: 'call',
    table: 'tester_media',
    column: 'storage_key',
    kind: 'image',
    snapshot: true,
    export: false,
  },
  {
    field: 'photoDescription',
    object: 'call',
    table: 'tester_media',
    column: 'description',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  // Un message d'un fil : un retour (texte facultatif) ou une réponse. Sa capture n'a pas de
  // description (son nom lu est fixe, relecture A15).
  {
    field: 'body',
    object: 'message',
    table: 'tester_message',
    column: 'text',
    kind: 'text',
    snapshot: true,
    export: true,
  },
  {
    field: 'photo',
    object: 'message',
    table: 'tester_media',
    column: 'storage_key',
    kind: 'image',
    snapshot: true,
    export: false,
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
 *
 * Les raisons reviennent à trois familles : un identifiant, une date, un nombre ou un booléen (rien
 * à lire) ; une valeur choisie dans une liste fermée par Zod (statut, motif, sorte) ; une valeur
 * tirée d'une saisie déjà au registre (étiquettes des outils, pseudo d'une mention, copie d'un
 * signalement), qui disparaît ou se modère avec elle.
 */
export const NOT_MEMBER_INPUTS: Record<string, Record<string, string> | '*'> = {
  member_block: '*', // deux identifiants et une date
  api_rate_limit: '*', // des compteurs de l'API
  // Les tables de Better Auth (sessions, connexions, liens d'e-mail, quotas de connexion) : des
  // jetons, des dates et des empreintes, jamais montrés à un autre membre. Aucune n'a de JSON ni
  // de tableau.
  session: '*',
  account: '*',
  verification: '*',
  rate_limit: '*',
  user: {
    id: 'identifiant',
    email: "l'adresse de connexion, privée : jamais montrée à un autre membre ni copiée",
    email_verified: 'booléen',
    image:
      "colonne de Better Auth, toujours vide : l'inscription l'efface (auth.ts), la photo vit dans profile.avatar_key",
    created_at: 'date',
    updated_at: 'date',
    language: "la langue de l'interface, choisie dans une liste fermée (fr, en), jamais montrée",
  },
  profile: { user_id: 'identifiant', updated_at: 'date' },
  member_handle: {
    user_id: 'identifiant',
    claimed_at: 'date',
    released_at: 'date',
  },
  project: {
    id: 'identifiant',
    author_id: 'identifiant',
    status: 'une étape choisie dans une liste fermée par Zod (idée, en cours, testable…)',
    visibility: 'public ou privé, une liste fermée par Zod',
    primary_category:
      'un code de la table category, vérifié par la base et par l’API (clé étrangère)',
    secondary_category:
      'un code de la table category, vérifié par la base et par l’API (clé étrangère)',
    difficulty: 'un niveau choisi dans une liste fermée par Zod (ProjectDifficulty)',
    started_on: 'un mois « AAAA-MM » vérifié par Zod (StartedMonth), jamais un texte libre',
    created_at: 'date',
    updated_at: 'date',
    published_at: 'date',
    removed_at: 'date',
    removal_id: 'identifiant',
  },
  project_media: {
    id: 'identifiant',
    project_id: 'identifiant',
    kind: "la sorte de média, écrite par l'API ('image')",
    slot: "l'emplacement (galerie, couverture verticale, ou photo d'une mise à jour), écrit par l'API",
    position: 'nombre',
    width: 'nombre',
    height: 'nombre',
    thumbhash:
      "l'aperçu flou calculé par l'API à partir de l'image, déjà au registre par sa clé (storage_key)",
    created_at: 'date',
    update_id:
      "la mise à jour qui porte la photo (null : photo du projet ou en attente), écrite par l'API",
  },
  // R7a : le titre, la version et les lignes sont au registre (MEMBER_INPUTS) ; le reste est écrit
  // par l'API.
  project_update: {
    id: 'identifiant',
    project_id: 'identifiant',
    before_after: 'booléen',
    created_at: 'date',
    removed_at: 'date',
    removal_id: 'identifiant',
  },
  // L'inscription d'un membre aux testeurs d'un projet : deux identifiants et une date.
  project_tester: '*',
  // R7b : le coin des testeurs. Les textes saisis (appel, message, description de photo) et la clé
  // des images sont au registre (MEMBER_INPUTS) ; le reste est écrit par l'API ou choisi dans une
  // liste fermée par Zod.
  project_tester_removal: '*', // deux identifiants et une date
  tester_thread: '*', // deux identifiants et trois dates (création, lectures)
  tester_call: {
    id: 'identifiant',
    project_id: 'identifiant',
    created_at: 'date',
    removed_at: 'date',
    removal_id: 'identifiant',
  },
  tester_message: {
    id: 'identifiant',
    project_id: 'identifiant',
    tester_id: 'identifiant',
    sender_id: 'identifiant',
    kind: 'retour ou réponse, une liste fermée par Zod (TesterMessageKind)',
    outcome: "l'issue du test (oui, en partie, non), une liste fermée par Zod (FeedbackOutcome)",
    device: "l'appareil du test (téléphone, ordinateur, tablette), une liste fermée par Zod",
    created_at: 'date',
    settled_at: 'date',
    settled_update_id: 'identifiant',
    removed_at: 'date',
    removal_id: 'identifiant',
  },
  tester_media: {
    id: 'identifiant',
    project_id: 'identifiant',
    owner_id: 'identifiant',
    kind: "la sorte d'image (photo d'appel ou capture), écrite par l'API",
    call_id: 'identifiant',
    message_id: 'identifiant',
    width: 'nombre',
    height: 'nombre',
    thumbhash:
      "l'aperçu flou calculé par l'API à partir de l'image, déjà au registre par sa clé (storage_key)",
    created_at: 'date',
  },
  project_comment: {
    id: 'identifiant',
    project_id: 'identifiant',
    author_id: 'identifiant',
    root_id: 'identifiant',
    created_at: 'date',
    edited_at: 'date',
    hidden_at: 'date',
    deleted_at: 'date',
    removed_at: 'date',
    removal_id: 'identifiant',
  },
  comment_mention: {
    comment_id: 'identifiant',
    member_id: 'identifiant',
    handle:
      'le pseudo tel qu’écrit dans le commentaire, tiré de project_comment.body (au registre) : il part avec lui',
    created_at: 'date',
    withdrawn_at: 'date',
  },
  project_reaction: {
    project_id: 'identifiant',
    member_id: 'identifiant',
    kind: 'une réaction choisie dans une liste fermée par Zod',
    created_at: 'date',
  },
  member_follow: { follower_id: 'identifiant', member_id: 'identifiant', created_at: 'date' },
  project_follow: { follower_id: 'identifiant', project_id: 'identifiant', created_at: 'date' },
  // R4 : la dernière lecture du fil, et les proches qu'un membre a écartés (« × »).
  feed_state: { member_id: 'identifiant', read_at: 'date' },
  member_suggestion_dismissal: {
    member_id: 'identifiant',
    dismissed_id: 'identifiant',
    at: 'date',
  },
  email_preference: {
    user_id: 'identifiant',
    weekly_recap: 'booléen',
    mention_emails: 'booléen',
    recap_sent_at: 'date',
    recap_unvisited: 'nombre',
    mention_sent_at: 'date',
    updated_at: 'date',
  },
  notification_state: {
    user_id: 'identifiant',
    seen_at: 'date',
    created_at: 'date',
    handle_chosen_at: 'date',
  },
  admin_member: {
    user_id: 'identifiant',
    granted_at: 'date',
    revoked_at: 'date',
    alerted_at: 'date',
    other_recap_at: 'date',
  },
  // R6b : le catalogue. Les noms que tapent les membres (tool.name, project_tool.label,
  // profile_tool.label, catalogue_change.merged_name) sont au registre MEMBER_INPUTS ; tout le reste
  // est écrit par l'API ou par un administrateur.
  tool: {
    id: 'identifiant',
    slug: 'adresse tirée du nom par toolSlug (lettres, chiffres, tirets), jamais envoyée par le client',
    folded: 'le nom replié (foldTool), calculé par l’API à partir de tool.name, déjà au registre',
    status: 'catalogue, other ou dismissed : écrit par l’API sur décision d’un administrateur',
    family: 'une famille choisie dans une liste fermée par Zod (ToolFamily)',
    description_fr:
      'une phrase écrite par un administrateur (limitée à 160 caractères par Zod), jamais par un membre',
    description_en:
      'une phrase écrite par un administrateur (limitée à 160 caractères par Zod), jamais par un membre',
    site_url: 'un lien https public écrit par un administrateur, vérifié par Zod (ToolSiteUrl)',
    created_at: 'date',
    created_by: 'identifiant',
    admitted_at: 'date',
  },
  tool_alias: {
    folded: 'un nom replié écrit par un administrateur (autre nom d’un outil)',
    tool_id: 'identifiant',
  },
  tool_slug_redirect: {
    slug: 'une ancienne adresse d’outil, écrite par l’API',
    tool_id: 'identifiant',
  },
  project_tool: { project_id: 'identifiant', tool_id: 'identifiant', position: 'nombre' },
  profile_tool: { user_id: 'identifiant', tool_id: 'identifiant', position: 'nombre' },
  category: {
    code: 'un code tiré du nom par l’API (minuscules, chiffres, tirets), jamais envoyé tel quel',
    name_fr: 'un nom écrit par un administrateur (30 caractères au plus, vérifié par Zod)',
    name_en: 'un nom écrit par un administrateur (30 caractères au plus, vérifié par Zod)',
    icon: 'une icône choisie dans une liste fermée par Zod (CategoryIcon)',
    position: 'nombre',
    created_at: 'date',
    created_by: 'identifiant',
  },
  catalogue_change: {
    id: 'identifiant',
    action: 'une action d’une liste fermée, écrite par l’API',
    admin_id: 'identifiant',
    tool_id: 'identifiant',
    category_code: 'un code de la table category',
    project_id: 'identifiant',
    from_category: 'un code de la table category',
    created_at: 'date',
  },
  content_report: {
    id: 'identifiant',
    reporter_id: 'identifiant',
    target_kind: 'la sorte de cible, une liste fermée par Zod (StoredReportTargetKind)',
    target_id: "l'identifiant de la cible (uuid, ou id d'un membre), vérifié par Zod",
    project_id: 'identifiant',
    target_author_id: 'identifiant',
    reason: 'un motif choisi dans une liste fermée par Zod (ReportReason)',
    snapshot:
      "la copie, lue en base par l'API, de champs déjà au registre (jamais envoyée par l'appli)",
    status: "l'état du signalement, écrit par l'API (ouvert, retiré, classé, sans objet)",
    created_at: 'date',
    decided_at: 'date',
    decision_id: 'identifiant',
  },
  moderation_decision: {
    id: 'identifiant',
    target_kind: 'la sorte de cible, une liste fermée par Zod (StoredReportTargetKind)',
    target_id: "l'identifiant de la cible (uuid, ou id d'un membre), vérifié par Zod",
    action: 'retirer, classer ou rétablir : une liste fermée par Zod',
    ground: 'le fondement du retrait, une liste fermée par Zod (RemovalGround)',
    explanation:
      "la motivation écrite par un administrateur dans son rôle de modération, montrée à l'auteur : pas une publication de membre, donc ni signalée ni cachée par un blocage (précision 7)",
    admin_id: 'identifiant',
    created_at: 'date',
    // Tranche 7c.
    target_member_id: 'identifiant',
    duration: "la durée d'une suspension, une liste fermée par Zod (SuspensionDuration)",
    after_report: 'booléen',
    lift_cause: "la raison d'une levée, une liste fermée par Zod (LiftCause)",
  },
  // La suspension d'un compte (tranche 7c) : écrite par l'API sur la décision d'un administrateur ;
  // son explication est sur la décision (moderation_decision.explanation), pas ici.
  account_suspension: {
    id: 'identifiant',
    user_id: 'identifiant',
    decision_id: 'identifiant',
    starts_at: 'date',
    ends_at: 'date',
    lifted_at: 'date',
    lift_decision_id: 'identifiant',
    after_report: 'booléen',
  },
}
