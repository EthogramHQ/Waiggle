// Formes des données d'un projet : ce qu'un membre peut publier ou modifier, et ce que l'API renvoie.
// Les règles de texte (longueurs, caractères interdits) viennent de text.ts, comme pour le profil.
import { z } from 'zod'
import { CategoryCode } from './categories'
import { FollowState } from './follows'
import { TOOL_MAX_LENGTH } from './profile'
import { ReactionState } from './reactions'
import { Removal } from './removal'
import { FreeText, removeForbiddenCharacters, ShortLabel } from './text'
import {
  ProjectTool,
  TOOL_PAGE_SIZE,
  ToolFamily,
  ToolSlug,
  ToolStatusFilter,
  uniqueTools,
} from './tools'
import { ProjectUpdate, UpdateSummary } from './updates'
import { publicHttpsUrl } from './url'
import { ProjectVisual, VisualDescription } from './visuals'

export const PROJECT_TITLE_MAX = 80
export const PROJECT_PITCH_MAX = 140
export const PROJECT_DESCRIPTION_MAX = 10_000
export const PROJECT_TOOLS_MAX = 15
export const PROJECT_PROMPTS_MAX = 5
export const PROJECT_PROMPT_MAX_LENGTH = 4_000
export const DEMO_URL_MAX_LENGTH = 2_000

// Les visuels (tranche 3b-1) : 6 photos au plus dans la galerie, plus une couverture verticale
// facultative. Mêmes formats et même taille d'envoi que les avatars.
export const VISUALS_MAX = 6
export const VISUAL_MAX_BYTES = 5 * 1024 * 1024
export const VISUAL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** L'identifiant d'un projet : un uuid tiré au hasard par le serveur. */
export const ProjectId = z.uuid()

/**
 * Où va une photo envoyée : dans la galerie (la première sert de couverture), comme couverture
 * verticale, affichée sur téléphone, ou (R7a) pour une mise à jour pas encore publiée. Une photo
 * `update` n'entre jamais dans la galerie, ni dans `VISUALS_MAX`.
 */
export const VisualSlot = z.enum(['gallery', 'portrait', 'update'])
export type VisualSlot = z.infer<typeof VisualSlot>

/** Ce que PATCH /v1/projects/{id}/visuals/{visualId} accepte (R6a) : la description, seule. */
export const VisualUpdate = z
  .strictObject({ description: VisualDescription })
  .meta({ id: 'VisualUpdate' })
export type VisualUpdate = z.infer<typeof VisualUpdate>

// z.enum : une liste fermée de valeurs. Les textes affichés (« En construction »…) sont dans les
// traductions ; ici, seulement des codes stables, en anglais.
export const ProjectStatus = z.enum(['idea', 'building', 'testable', 'done', 'paused'])
export type ProjectStatus = z.infer<typeof ProjectStatus>

// « public » reste le code stable ; l'appli l'affiche « Membres de Waiggle » (R6a) : seuls les
// membres connectés voient un projet, jamais le web ouvert.
export const ProjectVisibility = z.enum(['public', 'private'])
export type ProjectVisibility = z.infer<typeof ProjectVisibility>

/**
 * Les seize catégories de départ (R6a), dans l'ordre de la feuille de publication. Depuis R6b, les
 * catégories vivent en base (un administrateur peut en créer) : cette liste ne sert plus qu'à
 * semer la table et aux données de test. Une principale, obligatoire à la création, et une seconde
 * facultative ; leurs noms et icônes viennent de GET /v1/categories.
 */
export const PROJECT_CATEGORIES = [
  'home-garden',
  'cooking',
  'family',
  'learning',
  'games',
  'art',
  'music',
  'photo-video',
  'health-sport',
  'travel',
  'money',
  'work',
  'code',
  'animals',
  'science',
  'other',
] as const
/**
 * Le code d'une catégorie (« cooking », « jardinage ») : depuis R6b, toute chaîne bien formée ;
 * l'API refuse un code qui n'est pas en base (400 `unknown_category`). Même nom qu'en R6a, pour ne
 * pas changer tous ceux qui l'utilisent.
 */
export const ProjectCategory = CategoryCode
export type ProjectCategory = z.infer<typeof ProjectCategory>

/** « Facile à refaire ? » (R6a) : facile, il faut s'accrocher, difficile. */
export const ProjectDifficulty = z.enum(['easy', 'medium', 'hard'])
export type ProjectDifficulty = z.infer<typeof ProjectDifficulty>

/** Le plus ancien mois accepté pour « Commencé en ». */
export const STARTED_MONTH_FLOOR = '2000-01'

// Kiritimati (îles de la Ligne) vit à UTC+14 : c'est là que chaque mois commence en premier.
const EARLIEST_TIME_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000

/**
 * Le dernier mois accepté pour « Commencé en » : le mois en cours à Kiritimati. Ainsi, quel que soit
 * le fuseau du membre, le mois qu'il voit sur son calendrier n'est jamais refusé. L'appli lit la
 * même borne pour griser les mois à venir.
 */
export const startedMonthMax = (now: Date): string => {
  const ahead = new Date(now.getTime() + EARLIEST_TIME_ZONE_OFFSET_MS)
  const month = String(ahead.getUTCMonth() + 1).padStart(2, '0')
  return `${ahead.getUTCFullYear()}-${month}`
}

/**
 * Un mois « AAAA-MM » (R6a) : chiffres ASCII seulement, mois de 01 à 12, de janvier 2000 au mois en
 * cours (lu à l'heure de la vérification). Deux chaînes de cette forme se comparent comme des dates.
 */
export const StartedMonth = z
  .string()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, { message: 'must be a month written YYYY-MM' })
  .refine((month) => month >= STARTED_MONTH_FLOOR && month <= startedMonthMax(new Date()), {
    message: 'must be a month between 2000-01 and now',
  })

/** Le lien de démo : https, vers un site public. Il est enregistré sous sa forme standard. */
export const DemoUrl = z
  .string()
  .trim()
  .max(DEMO_URL_MAX_LENGTH)
  .refine((value) => publicHttpsUrl(value) !== null, { message: 'must be a public https address' })
  // href : l'adresse réécrite par URL (minuscules, nom « xn-- », « / » final…), la même partout.
  .transform((value) => publicHttpsUrl(value)?.href ?? value)

/**
 * Nettoie un prompt collé (décision F-Mod4, tranche R5a) : un prompt copié depuis une page ou une
 * conversation d'IA traîne souvent des caractères invisibles (espaces sans largeur, caractère qui
 * retourne le texte…). Au lieu de refuser tout le prompt, on les retire. Les séparateurs de ligne
 * et de paragraphe Unicode (U+2028, U+2029) deviennent un vrai retour à la ligne. Les liants des
 * emoji (U+200C, U+200D) et les sélecteurs de variante restent permis. L'appli se sert de la même
 * fonction pour afficher, repérer et copier : ce qu'on copie est exactement ce qu'on lit (sec-B1).
 */
export const cleanPrompt = (text: string) =>
  removeForbiddenCharacters(text.replace(/[\u2028\u2029]/g, '\n'))

/**
 * Un prompt : nettoyé d'abord, puis vérifié comme un texte libre. pipe enchaîne deux schémas : la
 * longueur se compte donc après le retrait des invisibles (sec-B9). Le texte d'origine n'est gardé
 * nulle part.
 */
const PromptText = z.string().transform(cleanPrompt).pipe(FreeText(PROJECT_PROMPT_MAX_LENGTH))

// Les champs modifiables d'un projet, avec leurs règles.
const fields = {
  title: ShortLabel(PROJECT_TITLE_MAX),
  pitch: ShortLabel(PROJECT_PITCH_MAX), // une seule ligne, comme une étiquette
  description: FreeText(PROJECT_DESCRIPTION_MAX), // Markdown, affiché assaini par l'appli
  status: ProjectStatus,
  visibility: ProjectVisibility,
  demoUrl: DemoUrl.nullable(), // null : pas (ou plus) de démo
  // Des noms : l'API rattache chacun à l'outil du catalogue qui porte ce nom ou cet alias, sinon à
  // un « Autre » (R6b). Un même outil écrit deux fois (« Chat GPT », « ChatGPT ») n'en fait qu'un.
  tools: z.array(ShortLabel(TOOL_MAX_LENGTH)).max(PROJECT_TOOLS_MAX).transform(uniqueTools),
  prompts: z
    .array(PromptText)
    .max(PROJECT_PROMPTS_MAX)
    .transform((prompts) => prompts.filter((prompt) => prompt.length > 0)), // ignore les cases vides
  // R6a : les catégories, la difficulté et le mois de début. (Le temps passé a disparu.)
  primaryCategory: ProjectCategory,
  secondaryCategory: ProjectCategory.nullable(),
  difficulty: ProjectDifficulty.nullable(),
  startedOn: StartedMonth.nullable(),
}

// Le message d'une seconde catégorie égale à la principale ; l'API le traduit pour le membre.
const SAME_CATEGORY = { message: 'the second category must differ from the primary one' }
const secondDiffers = (value: {
  primaryCategory?: ProjectCategory | undefined
  secondaryCategory?: ProjectCategory | null | undefined
}) => value.secondaryCategory == null || value.secondaryCategory !== value.primaryCategory

/**
 * Ce que POST /v1/projects accepte : un titre, un pitch et une catégorie principale ; le reste est
 * facultatif (le serveur applique les valeurs par défaut : idée, public, sans démo…). strictObject
 * refuse tout champ inconnu, par exemple un « authorId » qui ferait publier au nom de quelqu'un
 * d'autre (ou un « timeSpent » envoyé par une appli d'avant R6a).
 * refine ajoute une règle qui lit plusieurs champs à la fois : la seconde catégorie diffère de la
 * principale.
 */
export const ProjectInput = z
  .strictObject({
    ...fields, // « ... » recopie tous les champs ci-dessus…
    // … puis on rend facultatifs ceux qui ont une valeur par défaut.
    description: fields.description.optional(),
    status: fields.status.optional(),
    visibility: fields.visibility.optional(),
    demoUrl: fields.demoUrl.optional(),
    tools: fields.tools.optional(),
    prompts: fields.prompts.optional(),
    secondaryCategory: fields.secondaryCategory.optional(),
    difficulty: fields.difficulty.optional(),
    startedOn: fields.startedOn.optional(),
  })
  .refine(secondDiffers, { ...SAME_CATEGORY, path: ['secondaryCategory'] })
  .meta({ id: 'ProjectInput' })
export type ProjectInput = z.infer<typeof ProjectInput>

/**
 * Le nouvel ordre de la galerie : les identifiants des photos, chacune une seule fois. Le serveur
 * vérifie en plus que ce sont exactement les photos du projet.
 */
const VisualOrder = z
  .array(z.uuid())
  .max(VISUALS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'each photo once' })

/**
 * Ce que PATCH /v1/projects/:id accepte : n'importe quelle partie des champs, et le nouvel ordre
 * des photos. (Ajouter ou retirer une photo passe par ses propres routes ; la décrire aussi.)
 * La catégorie principale peut changer mais jamais redevenir nulle. La règle « seconde différente
 * de la principale » se vérifie ici quand le corps porte les deux ; l'API la vérifie en plus contre
 * les valeurs déjà enregistrées quand il n'en porte qu'une.
 * Il s'appelait `ProjectUpdate` jusqu'en R7a ; ce nom désigne depuis une mise à jour (updates.ts).
 */
export const ProjectChanges = z
  .strictObject({ ...fields, visualOrder: VisualOrder })
  .partial()
  .refine(secondDiffers, { ...SAME_CATEGORY, path: ['secondaryCategory'] })
  .meta({ id: 'ProjectChanges' })
export type ProjectChanges = z.infer<typeof ProjectChanges>

// --- Ce que l'API renvoie ---

export const ProjectAuthor = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
})

export const Project = z
  .object({
    id: ProjectId,
    author: ProjectAuthor,
    title: z.string(),
    pitch: z.string(),
    description: z.string(),
    status: ProjectStatus,
    visibility: ProjectVisibility,
    demoUrl: z.string().nullable(),
    tools: z.array(ProjectTool),
    prompts: z.array(z.string()),
    /** La catégorie principale ; null pour un projet publié avant R6a et jamais modifié depuis. */
    primaryCategory: ProjectCategory.nullable(),
    secondaryCategory: ProjectCategory.nullable(),
    difficulty: ProjectDifficulty.nullable(),
    /**
     * Le mois de début, « AAAA-MM ». En sortie, une chaîne simple (sec-M1) : la borne du mois en
     * cours ne vaut qu'à l'écriture, et une heure de serveur en avance ne doit pas casser la lecture.
     */
    startedOn: z.string().nullable(),
    /** La galerie, dans l'ordre choisi par l'auteur : la première photo sert de couverture. */
    visuals: z.array(ProjectVisual).max(VISUALS_MAX),
    /** La couverture verticale, affichée sur téléphone ; null : on recadre la première photo. */
    portraitCover: ProjectVisual.nullable(),
    /** Vrai si le membre qui regarde est l'auteur : l'appli affiche alors « Modifier ». */
    isMine: z.boolean(),
    /** Si le visiteur suit ce projet, et combien de membres le suivent (jamais leurs noms). */
    ...FollowState.shape,
    /**
     * R7a : la dernière mise à jour que ce membre peut voir (la section « Les mises à jour »), ou
     * null. Une mise à jour retirée n'y est que pour l'auteur, avec `removal` ; la frise entière se
     * lit à part (GET /v1/projects/{id}/updates).
     */
    latestUpdate: ProjectUpdate.nullable(),
    /** Le nombre de mises à jour que ce membre peut voir (« Voir les 3 mises à jour »). */
    updateCount: z.int().nonnegative(),
    /**
     * La version de la dernière mise à jour non retirée qui en a une (« v1.2 », sous le titre) ;
     * null s'il n'y en a pas. Jamais celle d'une mise à jour retirée, pas même pour l'auteur.
     */
    version: z.string().nullable(),
    /** Vrai si le visiteur s'est inscrit comme testeur de ce projet (R7a). */
    isTester: z.boolean(),
    /** Le nombre de testeurs, pour l'auteur seul ; null pour tous les autres (R7a). */
    testerCount: z.int().nonnegative().nullable(),
    /**
     * R7b : faux pour l'auteur et pour un membre que l'auteur a retiré de ses testeurs (l'appli ne
     * lui propose plus « Rejoindre les testeurs ») ; vrai sinon, même pour un projet plein ou qui
     * n'est pas « Testable » : l'appli regarde aussi le statut, et un projet plein garde son refus
     * « plein » (sécurité S1 : le retrait reste devinable, risque accepté).
     */
    testerJoinable: z.boolean(),
    /** Les réactions (tranche 5) : les nombres par type, et celles du membre qui regarde. */
    reactions: ReactionState,
    /**
     * Le nombre de commentaires que tout le monde voit (racines et réponses, sans les masqués ni
     * les supprimés). La liste elle-même se lit à part : GET /v1/projects/{id}/comments.
     */
    commentCount: z.int().nonnegative(),
    /**
     * Le retrait par la modération (tranche 7a). Un projet retiré n'est plus visible que de son
     * auteur : c'est donc à lui seul que ce champ est rempli ; null pour un projet visible.
     */
    removal: Removal.nullable(),
    createdAt: z.iso.datetime(),
    /**
     * La dernière modification du projet lui-même. Depuis R7a, « Mis à jour » sous le titre ne la
     * lit plus : il suit `latestUpdate`.
     */
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Project' })
export type Project = z.infer<typeof Project>

/**
 * Un projet en version courte, pour les listes : sa couverture (la première photo) et sa
 * couverture verticale, sans toute la galerie. R3 : avec l'adresse de sa démo, pour que
 * « Tester ↗ » du carrousel d'Explorer l'ouvre sans relire le projet (le même membre la voit
 * déjà sur la page du projet). R4 : avec le total de ses réactions, que la carte du fil affiche
 * (« ✦ 49 »).
 */
export const ProjectSummary = Project.pick({
  id: true,
  author: true,
  title: true,
  pitch: true,
  status: true,
  visibility: true,
  tools: true,
  demoUrl: true,
  portraitCover: true,
  primaryCategory: true,
  secondaryCategory: true,
  createdAt: true,
  updatedAt: true,
})
  .extend({
    cover: ProjectVisual.nullable(),
    /**
     * La somme des cinq compteurs de réactions (R4), mêmes règles que la page du projet : les
     * réactions des membres bloqués comptent, comme sur la page. Un nombre, jamais des noms ; 0
     * pour un projet privé ou retiré, même pour son auteur (relecture de sécurité sec-A4).
     */
    reactionTotal: z.number().int().min(0),
    /**
     * R7a : la dernière mise à jour non retirée (pour tous, auteur compris), en version courte ;
     * la carte en tire « Mis à jour · v1.2 ». null : aucune.
     */
    latestUpdate: UpdateSummary.nullable(),
    /** La version sous le titre, mêmes règles que `Project.version`. */
    version: z.string().nullable(),
  })
  .meta({ id: 'ProjectSummary' })
export type ProjectSummary = z.infer<typeof ProjectSummary>

/** Les listes (page d'un membre, d'une étiquette) : les 50 projets les plus récents, sans pagination. */
export const PROJECT_LIST_MAX = 50

/**
 * Une étiquette telle qu'écrite dans une adresse (/tags/Claude%20Code), avant d'être remise en
 * forme par toolSlug. 200 caractères suffisent largement : un outil en fait 40 au plus, et même
 * écrit en numéros Unicode (« u1f916 ») il reste sous cette taille.
 */
export const TagParam = z.string().min(1).max(200)

/**
 * Le curseur d'une page de projets : la même forme que celui du fil (`FeedCursor`), recopiée ici
 * parce que feed.ts importe ce fichier (sinon les deux s'attendraient au chargement).
 */
const PageCursor = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)

/**
 * Les filtres de la page d'un outil (GET /v1/tags/{slug}?status=&category=&cursor=, R6b) :
 * testables ou terminés (absent : tous), une catégorie en principale ou en seconde, et la page
 * suivante. Les noms des paramètres sont en anglais, comme partout dans les adresses.
 */
export const ToolPageQuery = z.object({
  status: ToolStatusFilter.optional(),
  category: CategoryCode.optional(),
  cursor: PageCursor.optional(),
})
export type ToolPageQuery = z.infer<typeof ToolPageQuery>

/**
 * La page d'un outil du catalogue (GET /v1/tags/{slug}, R6b). `tool.slug` est l'identifiant
 * officiel : l'appli remplace l'adresse quand on est arrivé par un ancien nom (« chat-gpt »).
 * `description` est dans la langue du visiteur (`Accept-Language`, le français par défaut).
 * `projectCount` et `projects` suivent la même règle : ce que ce membre peut voir (jur-T18).
 * `categories` : celles des projets de l'outil, avec leur nombre, filtre de statut compris mais
 * sans le filtre de catégorie (pour pouvoir en changer). Un « Autre » ou un nom inconnu : 404.
 */
export const ToolPage = z
  .object({
    tool: z.object({
      slug: ToolSlug,
      name: z.string(),
      family: ToolFamily,
      description: z.string().nullable(),
      siteUrl: z.string().nullable(),
      projectCount: z.int().nonnegative(),
    }),
    categories: z.array(z.object({ code: CategoryCode, projectCount: z.int().positive() })),
    projects: z.array(ProjectSummary).max(TOOL_PAGE_SIZE),
    nextCursor: PageCursor.nullable(),
  })
  .meta({ id: 'ToolPage' })
export type ToolPage = z.infer<typeof ToolPage>
