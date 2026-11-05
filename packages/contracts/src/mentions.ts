// Les mentions « @pseudo » dans les commentaires (tranche 6b). Partagé par l'API, qui retrouve les
// membres mentionnés quand un commentaire est écrit, et par l'appli, qui découpe le texte pour faire
// de chaque mention un lien. Une mention est gardée par l'identifiant du membre, jamais par le seul
// texte : un pseudo se change et se libère, et pourrait un jour désigner quelqu'un d'autre.
import { z } from 'zod'
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from './handles'
import { foldForSearch } from './search'

/** Au plus 5 membres mentionnés (et donc prévenus) par commentaire ; au-delà, du texte simple. */
export const MENTIONS_MAX = 5
/** L'appli propose au plus 5 membres après « @ ». */
export const MENTIONABLE_MAX = 5
/** L'appli ne cherche qu'à partir de 2 caractères après « @ ». */
export const MENTION_QUERY_MIN = 2
/**
 * Depuis R5b, on cherche aussi par le nom, plus long qu'un pseudo : 30 caractères au plus après
 * « @ », comptés une fois la recherche repliée (« Œ » compte pour deux : « oe »).
 */
export const MENTION_QUERY_MAX = 30

/**
 * Le motif d'une recherche après « @ » (R5b) : une lettre de tout alphabet, accentuée ou non
 * (\p{L}), puis des lettres, des chiffres (\p{N}) ou « _ ». C'est le texte d'une expression
 * régulière, sans « ^ » ni « $ » : chacun l'entoure comme il lui faut et ajoute le drapeau u, sans
 * lequel \p{…} n'est pas compris. Le contrat s'en sert pour `MentionableQuery.q` (`^…$`), l'appli
 * pour reconnaître « @Lé » juste avant le curseur (`mentionAt`, `…$`).
 */
export const MENTION_QUERY_PATTERN = '\\p{L}[\\p{L}\\p{N}_]*'

// Un « @ » suivi d'une lettre puis de lettres, chiffres ou « _ » (insensible à la casse). Le « @ »
// ne doit pas suivre une lettre (accentuée ou non, de tout alphabet : \p{L}), un chiffre (\p{N}),
// « _ », « . » ou un autre « @ » : « andré@exemple.fr » est une adresse, pas une mention. Le
// drapeau u (« unicode ») permet ces classes \p{…}. La parenthèse du début capture ce qui précède
// (début du texte ou autre caractère) : on évite ainsi les « lookbehind » (?<!…), mal connus de
// certains moteurs JavaScript. Le drapeau g (« global ») trouve toutes les occurrences.
const MENTION_REGEX = /(^|[^\p{L}\p{N}_@.])@([A-Za-z][A-Za-z0-9_]*)/gu
// La forme d'un pseudo (la même que `Handle`, dans handles.ts) : un candidat qui ne la respecte pas
// (« @ines_ », « @a ») reste du texte.
const HANDLE_SHAPE = /^[a-z](?:_?[a-z0-9])*$/

/** Un morceau de texte : du texte simple, ou une mention (`handle` en minuscules, sans « @ »). */
export type MentionSegment = { text: string; handle?: string }

/**
 * Découpe un texte en morceaux, dans l'ordre : le texte simple et les mentions possibles. Recoller
 * tous les `text` redonne exactement le texte de départ. Une mention possible n'est qu'un pseudo
 * bien formé : savoir s'il désigne un membre, c'est le travail de l'API.
 */
export const splitMentions = (text: string): MentionSegment[] => {
  const segments: MentionSegment[] = []
  let last = 0
  for (const match of text.matchAll(MENTION_REGEX)) {
    const before = match[1] ?? ''
    const raw = match[2] ?? ''
    const handle = raw.toLowerCase()
    if (
      handle.length < HANDLE_MIN_LENGTH ||
      handle.length > HANDLE_MAX_LENGTH ||
      !HANDLE_SHAPE.test(handle)
    )
      continue
    const start = (match.index ?? 0) + before.length
    if (start > last) segments.push({ text: text.slice(last, start) })
    segments.push({ text: `@${raw}`, handle })
    last = start + 1 + raw.length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

/** Les pseudos mentionnés dans un texte, sans doublon, dans l'ordre de leur première apparition. */
export const findMentions = (text: string): string[] => [
  ...new Set(splitMentions(text).flatMap((segment) => (segment.handle ? [segment.handle] : []))),
]

/**
 * Une mention telle que l'API la renvoie avec un commentaire : le pseudo tel qu'il était écrit
 * (en minuscules, sans « @ »), le membre qu'il désignait au moment de l'écriture, et le **nom
 * actuel** de ce membre (R5b : la pastille l'affiche, et il suit la personne si elle en change).
 * L'appli ne fait un lien que des pseudos de cette liste, vers `/members/<memberId>`.
 */
export const Mention = z
  .object({ handle: z.string(), memberId: z.string(), name: z.string() })
  .meta({ id: 'Mention' })
export type Mention = z.infer<typeof Mention>

/**
 * Ce que l'appli demande pendant qu'on tape « @Lé… » (GET /v1/members/mentionable) : le début du
 * pseudo **ou d'un mot du nom** (R5b), et le projet commenté, qui sert à proposer d'abord ses
 * proches (l'auteur du projet, ceux qui l'ont commenté, ceux qu'on suit).
 *
 * La recherche est d'abord remise en forme (`transform`), puis vérifiée (`pipe`) :
 * - `normalize('NFC')` réunit une lettre et son accent tapé à part (« e » + « ◌́ » devient « é ») ;
 * - les espaces autour et un « @ » au début sont retirés ;
 * - `foldForSearch` met en minuscules et retire les accents : « @Lé » devient « le », comme le nom
 *   « Léa » replié côté base (`foldSql`).
 */
export const MentionableQuery = z.object({
  q: z
    .string()
    .transform((text) => foldForSearch(text.normalize('NFC').trim().replace(/^@/, '')))
    .pipe(
      z
        .string()
        .min(MENTION_QUERY_MIN)
        .max(MENTION_QUERY_MAX)
        .regex(new RegExp(`^${MENTION_QUERY_PATTERN}$`, 'u')),
    ),
  projectId: z.uuid(),
})
export type MentionableQuery = z.infer<typeof MentionableQuery>

/** Un membre proposé après « @ » : de quoi le reconnaître (nom, pseudo, photo). */
export const Mentionable = z
  .object({
    id: z.string(),
    name: z.string(),
    handle: z.string(),
    avatarUrl: z.url().nullable(),
  })
  .meta({ id: 'Mentionable' })
export type Mentionable = z.infer<typeof Mentionable>

/** La réponse : les proches d'abord, puis les autres, par ordre alphabétique du pseudo. */
export const MentionableList = z
  .object({ members: z.array(Mentionable).max(MENTIONABLE_MAX) })
  .meta({ id: 'MentionableList' })
export type MentionableList = z.infer<typeof MentionableList>
