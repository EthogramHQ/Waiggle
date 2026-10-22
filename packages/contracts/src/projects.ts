// Formes des données d'un projet : ce qu'un membre peut publier ou modifier, et ce que l'API renvoie.
// Les règles de texte (longueurs, caractères interdits) viennent de text.ts, comme pour le profil.
import { z } from 'zod'
import { FollowState } from './follows'
import { PROJECT_NOTES_SHOWN, ProjectNote } from './notes'
import { TOOL_MAX_LENGTH } from './profile'
import { ReactionState } from './reactions'
import { Removal } from './removal'
import { FreeText, isCleanText, ShortLabel, uniqueIgnoringCase } from './text'

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
 * Le ThumbHash d'une image : un résumé flou de quelques dizaines d'octets, calculé par le serveur,
 * qui colore la lumière d'ambiance et s'affiche le temps que la vraie image arrive.
 * Il vient de l'API ; l'appli le vérifie quand même (ADR 0002) : du base64, court. Un vrai ThumbHash
 * fait au plus 25 octets (36 caractères) ; 64 laisse de la marge sans rien laisser passer de long.
 */
export const Thumbhash = z.base64().min(1).max(64)

/**
 * Où va une photo envoyée : dans la galerie (la première sert de couverture), ou comme couverture
 * verticale, affichée sur téléphone.
 */
export const VisualSlot = z.enum(['gallery', 'portrait'])
export type VisualSlot = z.infer<typeof VisualSlot>

/**
 * Un visuel d'un projet, tel que l'API le renvoie. `kind` n'a qu'une valeur pour l'instant : la
 * vidéo viendra dans sa propre tranche, et s'ajoutera ici.
 * L'adresse ne s'ouvre que pour un membre connecté qui voit le projet.
 */
export const ProjectVisual = z
  .object({
    id: z.uuid(),
    kind: z.enum(['image']),
    url: z.url(),
    width: z.int().positive(),
    height: z.int().positive(),
    thumbhash: Thumbhash,
  })
  .meta({ id: 'ProjectVisual' })
export type ProjectVisual = z.infer<typeof ProjectVisual>

// z.enum : une liste fermée de valeurs. Les textes affichés (« En construction »…) sont dans les
// traductions ; ici, seulement des codes stables, en anglais.
export const ProjectStatus = z.enum(['idea', 'building', 'testable', 'done', 'paused'])
export type ProjectStatus = z.infer<typeof ProjectStatus>

export const ProjectVisibility = z.enum(['public', 'private'])
export type ProjectVisibility = z.infer<typeof ProjectVisibility>

/** Temps passé, par tranches : moins d'une heure, une soirée, un week-end, des semaines, des mois. */
export const TimeSpent = z.enum(['hour', 'evening', 'weekend', 'weeks', 'months'])
export type TimeSpent = z.infer<typeof TimeSpent>

// Suffixes de noms qui ne désignent pas un site public : réseaux locaux (box, imprimante, NAS…),
// noms réservés aux tests ou aux documentations, réseau Tor. Un lien vers eux ne marcherait que
// chez l'auteur, ou pourrait viser la machine de celui qui clique.
const RESERVED_SUFFIXES = [
  'localhost',
  'localdomain',
  'local',
  'lan',
  'home',
  'internal',
  'intranet',
  'corp',
  'private',
  'arpa',
  'test',
  'invalid',
  'example',
  'onion',
]

/**
 * L'adresse découpée si c'est un lien https vers un site public, désigné par son nom ; sinon null.
 * On laisse la classe URL découper l'adresse : elle connaît toutes les façons tordues d'écrire une
 * adresse IP (« 0x7f.1 », « 2130706433 »…) et les ramène à la forme habituelle.
 * Sert à l'API (lien de démo), à l'appli (liens Markdown) et à la page d'avertissement.
 */
export const publicHttpsUrl = (value: string): URL | null => {
  // Aucun caractère invisible ou de contrôle, nulle part dans l'adresse.
  if (!isCleanText(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null // ce n'est pas une adresse
  }
  if (url.protocol !== 'https:') return null
  // « https://waiggle.io@pirate.example.com » mène à pirate.example.com : ce qui précède @ est un identifiant.
  if (url.username || url.password) return null

  // Un seul point final est permis (« example.com. » est une écriture valide) ; plusieurs, non.
  if (/\.\.$/.test(url.hostname)) return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  // Une adresse IPv4 (4 nombres) plutôt qu'un nom.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  // Un nom ordinaire : des lettres latines, des chiffres et des tirets, en au moins deux parties
  // non vides séparées par des points. Cela écarte les adresses IPv6 ([::1]), les noms sans point
  // (« intranet ») et les noms dans un autre alphabet que le téléphone n'a pas convertis en
  // « xn--… » (impossible de vérifier qu'ils n'imitent pas un nom connu).
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null
  if (RESERVED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))
    return null
  return url
}

/** Le lien de démo : https, vers un site public. Il est enregistré sous sa forme standard. */
export const DemoUrl = z
  .string()
  .trim()
  .max(DEMO_URL_MAX_LENGTH)
  .refine((value) => publicHttpsUrl(value) !== null, { message: 'must be a public https address' })
  // href : l'adresse réécrite par URL (minuscules, nom « xn-- », « / » final…), la même partout.
  .transform((value) => publicHttpsUrl(value)?.href ?? value)

// Les champs modifiables d'un projet, avec leurs règles.
const fields = {
  title: ShortLabel(PROJECT_TITLE_MAX),
  pitch: ShortLabel(PROJECT_PITCH_MAX), // une seule ligne, comme une étiquette
  description: FreeText(PROJECT_DESCRIPTION_MAX), // Markdown, affiché assaini par l'appli
  status: ProjectStatus,
  visibility: ProjectVisibility,
  demoUrl: DemoUrl.nullable(), // null : pas (ou plus) de démo
  tools: z.array(ShortLabel(TOOL_MAX_LENGTH)).max(PROJECT_TOOLS_MAX).transform(uniqueIgnoringCase),
  timeSpent: TimeSpent.nullable(),
  prompts: z
    .array(FreeText(PROJECT_PROMPT_MAX_LENGTH))
    .max(PROJECT_PROMPTS_MAX)
    .transform((prompts) => prompts.filter((prompt) => prompt.length > 0)), // ignore les cases vides
}

/**
 * Ce que POST /v1/projects accepte : un titre et un pitch, le reste est facultatif (le serveur
 * applique les valeurs par défaut : idée, public, sans démo…). strictObject refuse tout champ
 * inconnu, par exemple un « authorId » qui ferait publier au nom de quelqu'un d'autre.
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
    timeSpent: fields.timeSpent.optional(),
    prompts: fields.prompts.optional(),
  })
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
 * des photos. (Ajouter ou retirer une photo passe par ses propres routes.)
 */
export const ProjectUpdate = z
  .strictObject({ ...fields, visualOrder: VisualOrder })
  .partial()
  .meta({ id: 'ProjectUpdate' })
export type ProjectUpdate = z.infer<typeof ProjectUpdate>

// --- Ce que l'API renvoie ---

export const ProjectAuthor = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
})

/** Un outil affiché comme étiquette : son nom, et l'identifiant de sa page (« claude-code »). */
export const ProjectTool = z.object({ label: z.string(), slug: z.string() })

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
    timeSpent: TimeSpent.nullable(),
    prompts: z.array(z.string()),
    /** La galerie, dans l'ordre choisi par l'auteur : la première photo sert de couverture. */
    visuals: z.array(ProjectVisual).max(VISUALS_MAX),
    /** La couverture verticale, affichée sur téléphone ; null : on recadre la première photo. */
    portraitCover: ProjectVisual.nullable(),
    /** Vrai si le membre qui regarde est l'auteur : l'appli affiche alors « Modifier ». */
    isMine: z.boolean(),
    /** Si le visiteur suit ce projet, et combien de membres le suivent (jamais leurs noms). */
    ...FollowState.shape,
    /** Le journal : les notes de l'auteur, de la plus récente à la plus ancienne (20 au plus). */
    notes: z.array(ProjectNote).max(PROJECT_NOTES_SHOWN),
    /** Les réactions (tranche 5) : les nombres par type, et celles du membre qui regarde. */
    reactions: ReactionState,
    /**
     * Le nombre de commentaires que tout le monde voit (racines et réponses, sans les masqués ni
     * les supprimés). La liste elle-même se lit à part : GET /v1/projects/{id}/comments.
     */
    commentCount: z.int().nonnegative(),
    /**
     * Le retrait par la modération (tranche 6d). Un projet retiré n'est plus visible que de son
     * auteur : c'est donc à lui seul que ce champ est rempli ; null pour un projet visible.
     */
    removal: Removal.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Project' })
export type Project = z.infer<typeof Project>

/**
 * Un projet en version courte, pour les listes : sa couverture (la première photo) et sa
 * couverture verticale, sans toute la galerie.
 */
export const ProjectSummary = Project.pick({
  id: true,
  author: true,
  title: true,
  pitch: true,
  status: true,
  visibility: true,
  tools: true,
  portraitCover: true,
  createdAt: true,
  updatedAt: true,
})
  .extend({ cover: ProjectVisual.nullable() })
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
 * La page d'une étiquette (GET /v1/tags/{slug}) : les projets publics faits avec cet outil.
 * `label` est le nom tapé sur le plus récent d'entre eux (« Claude Code ») ; null s'il n'y en a
 * aucun, et l'appli affiche alors l'étiquette elle-même.
 */
export const TagPage = z
  .object({
    slug: z.string(),
    label: z.string().nullable(),
    projects: z.array(ProjectSummary).max(PROJECT_LIST_MAX),
  })
  .meta({ id: 'TagPage' })
export type TagPage = z.infer<typeof TagPage>
