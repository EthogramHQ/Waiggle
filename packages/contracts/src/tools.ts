// Le catalogue des outils (tranche R6b, docs/scenarios/refonte.md, « R6b ») : les outils connus,
// rangés par familles, et les « Autre », ces noms tapés par les membres qui ne sont pas (encore) au
// catalogue. Ce fichier donne leurs formes, le repli qui reconnaît un même outil écrit de deux
// façons (« Chat GPT » et « chatgpt »), et les règles du site d'un outil.
//
// Il n'importe rien de projects.ts (qui l'importe) : sinon les deux fichiers s'attendraient l'un
// l'autre au chargement (un « import circulaire »).
import { z } from 'zod'
import { foldForSearch } from './fold'
import { publicHttpsUrl } from './url'

/** Un nom d'outil fait 40 caractères au plus (règle d'avant R6b, gardée). */
export const TOOL_NAME_MAX = 40
/** La description d'un outil du catalogue : une phrase, 160 caractères au plus, en fr et en en. */
export const TOOL_DESCRIPTION_MAX = 160
/** Une page d'outil montre 50 projets, puis « Afficher la suite ». */
export const TOOL_PAGE_SIZE = 50
/** « Pas encore dans le catalogue » montre 50 noms au plus (sec-B5 : limite après la visibilité). */
export const OTHER_TOOLS_SHOWN = 50
/** Un membre crée au plus 30 « Autre » par jour (relecture de sécurité sec-A5). */
export const OTHER_TOOLS_PER_DAY = 30

/**
 * Les familles du catalogue, dans l'ordre des pastilles de « Tous les outils » : assistants IA,
 * création (image, son, vidéo), sans code, développement, automatisation, maison connectée,
 * matériel et objets. Les noms affichés sont dans les traductions (`tools.family.<code>`).
 */
export const TOOL_FAMILIES = [
  'assistant',
  'creation',
  'no-code',
  'development',
  'automation',
  'smart-home',
  'hardware',
] as const
export const ToolFamily = z.enum(TOOL_FAMILIES)
export type ToolFamily = z.infer<typeof ToolFamily>

/**
 * Le statut d'un outil en base : au catalogue, « Autre » en attente, ou « Autre » laissé hors du
 * catalogue par un administrateur (relecture juridique jur-T8). Seul le premier a une page.
 */
export const ToolStatus = z.enum(['catalogue', 'other', 'dismissed'])
export type ToolStatus = z.infer<typeof ToolStatus>

/**
 * Les caractères ASCII qui ne comptent pas pour reconnaître un outil : espace, ponctuation et
 * symboles du clavier (tout l'ASCII imprimable sauf les lettres et les chiffres ; les caractères
 * de contrôle sont déjà refusés à l'entrée). Une plage d'octets ASCII, pour que le SQL de l'API
 * retire exactement les mêmes, quelle que soit la langue de la base
 * (`regexp_replace(…, '[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]', '', 'g')`).
 */
const IGNORED_ASCII = /[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g

/**
 * Le nom « replié » d'un outil, qui reconnaît un même outil écrit de plusieurs façons : sans
 * majuscules ni accents (le repli de la recherche, `foldForSearch`), puis sans espaces ni
 * ponctuation ASCII. « Chat GPT », « chat-gpt » et « ChatGPT » donnent « chatgpt » ; « Écrivain »
 * donne « ecrivain ». Les lettres d'autres alphabets et les emoji restent.
 *
 * Jamais vide (relecture de sécurité sec-A3) : un nom fait seulement de ponctuation (« --- ») prend
 * les numéros Unicode de ses caractères (« u2du2du2d »), comme `toolSlug` ; deux tels noms
 * différents ne se confondent donc pas.
 */
export const foldTool = (name: string): string => {
  const folded = foldForSearch(name.trim()).replace(IGNORED_ASCII, '')
  if (folded) return folded
  return Array.from(name.trim(), (char) => `u${char.codePointAt(0)?.toString(16)}`).join('')
}

/**
 * Garde un seul exemplaire de chaque outil, au sens de `foldTool` (« Chat GPT » et « ChatGPT »
 * sont le même), dans l'ordre, en gardant la première façon de l'écrire.
 */
export const uniqueTools = (names: readonly string[]): string[] => {
  const seen = new Set<string>()
  return names.filter((name) => {
    const key = foldTool(name)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * L'identifiant d'un outil dans les adresses (/tags/claude-code), tel que l'API le rend (sec-B5) :
 * des lettres et des chiffres de toutes les langues, séparés par des tirets simples ; ni barre, ni
 * point, ni espace. L'appli le recopie dans l'adresse : il ne doit rien pouvoir y glisser d'autre.
 */
export const ToolSlug = z
  .string()
  .max(200)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)

/**
 * Le site d'un outil : la même règle que le lien de démo (`https://`, une adresse publique, jamais
 * ouverte par le serveur), et ni paramètres (`?`) ni fragment (`#`), qui portent souvent un suivi
 * ou une affiliation (relecture juridique jur-T7). L'appli l'ouvre par la page « Tu quittes… ».
 */
export const ToolSiteUrl = z
  .string()
  .trim()
  .max(2_000)
  .refine((value) => publicHttpsUrl(value) !== null, { message: 'must be a public https address' })
  .refine(
    (value) => {
      const url = publicHttpsUrl(value)
      return url !== null && url.search === '' && url.hash === '' && !/[?#]/.test(value)
    },
    { message: 'must have no query string and no fragment' },
  )
  .transform((value) => publicHttpsUrl(value)?.href ?? value)

/**
 * Un outil tel qu'on l'affiche sur un projet ou un profil. `label` est le nom à montrer : pour un
 * outil du catalogue, son nom ; pour un « Autre », le nom tel que CE membre l'a tapé (sec-B8 :
 * jamais l'écriture d'un autre membre). `inCatalogue` faux : pas de page, texte simple sans lien.
 */
export const ProjectTool = z.object({
  label: z.string(),
  slug: z.string(),
  inCatalogue: z.boolean(),
})
export type ProjectTool = z.infer<typeof ProjectTool>

/**
 * Un outil du catalogue dans la liste de GET /v1/tools : son nom, sa famille, ses autres noms (pour
 * que l'appli propose « ChatGPT » quand on tape « chat gpt ») et son nombre de projets que le membre
 * peut voir.
 */
export const CatalogueTool = z
  .object({
    slug: ToolSlug,
    name: z.string(),
    family: ToolFamily,
    aliases: z.array(z.string()),
    projectCount: z.int().nonnegative(),
  })
  .meta({ id: 'CatalogueTool' })
export type CatalogueTool = z.infer<typeof CatalogueTool>

/** Un « Autre » de « Pas encore dans le catalogue » : son nom seul (ni page, ni auteur). */
export const OtherTool = z.object({ name: z.string() }).meta({ id: 'OtherTool' })
export type OtherTool = z.infer<typeof OtherTool>

/**
 * La réponse de GET /v1/tools : tout le catalogue (500 au plus), du plus utilisé au moins utilisé
 * puis par nom, et les « Autre » cités par au moins un projet que le membre peut voir (50 au plus,
 * jamais un écarté ; sec-A1, jur-T2).
 */
export const ToolList = z
  .object({
    tools: z.array(CatalogueTool).max(500),
    others: z.array(OtherTool).max(OTHER_TOOLS_SHOWN),
  })
  .meta({ id: 'ToolList' })
export type ToolList = z.infer<typeof ToolList>

/** Le filtre de statut de la page d'un outil : tous (absent), testables, terminés. */
export const ToolStatusFilter = z.enum(['testable', 'done'])
export type ToolStatusFilter = z.infer<typeof ToolStatusFilter>
