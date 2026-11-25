// La gamification (R19, docs/scenarios/refonte.md, « R19 — La gamification ») : le pollen que
// rapporte chaque geste, le niveau qu'il fait monter, les titres, les sceaux, les défis, le miel et
// les classements. Ce fichier tient toutes les règles chiffrées (montants, plafonds, seuils,
// listes) et les formes que l'API renvoie et accepte : l'API compte avec elles, l'appli les lit pour
// écrire « 120 pollen avant le niveau 5 ». Une règle qui change ne change qu'ici.
//
// Les routes (membres connectés seulement) :
// - GET /v1/me/harvest : « Ma récolte » (`Harvest`) ;
// - PATCH /v1/me/game : ses réglages et son défi (`GameSettingsUpdate`, 204) ;
// - PUT /v1/me/game/decoration : décorer son rayon (`DecorationChoice`, 204, ou 409 `HoneyShortError`) ;
// - POST /v1/projects/{id}/honey : offrir du miel à un projet (204, ou 409) ;
// - GET /v1/rankings?scope=close|hive&hive=<id> : le classement de la semaine (`Ranking`).
//
// Ce fichier n'importe ni les membres, ni les ruches, ni les notifications : ce sont eux qui
// l'importent (`Member.game`, `HivePage.challenge`, les avis de l'Activité). Une importation dans
// l'autre sens ferait une boucle, et un schéma lu avant d'être défini vaudrait `undefined`.
import { z } from 'zod'
import { CategoryCode, type CategoryIcon, OTHER_CATEGORY } from './categories'
import { PROJECT_CATEGORIES } from './projects'

// --- Les familles et les gestes ---

/**
 * Les quatre familles de gestes, qui donnent les titres : Butineuse (`forager` : réagir, commenter,
 * suivre), Bâtisseuse (`builder` : publier, mettre à jour, compléter son profil, et tout ce qui est
 * reçu sur ses projets), Gardienne (`keeper` : tester, faire des retours), Danseuse (`dancer` : faire
 * venir du monde). L'Éclaireuse (R20) n'est pas une famille de gestes : jamais attribuée en R19.
 */
export const FAMILIES = ['forager', 'builder', 'keeper', 'dancer'] as const
export const Family = z.enum(FAMILIES)
export type Family = z.infer<typeof Family>

/**
 * Les gestes qui rapportent du pollen, un par ligne du tableau du scénario. Les `receive_*` sont ce
 * que l'auteur d'un projet reçoit quand un autre membre y fait un retour, devient testeur, commente
 * ou réagit. L'invitation acceptée paie les deux : l'invitant (`invitation_accepted`) et l'invité
 * (`invitation_joined`).
 */
export const GESTURES = [
  'feedback',
  'feedback_settled',
  'tester',
  'comment',
  'publish',
  'update',
  'reaction',
  'follow',
  'receive_feedback',
  'receive_tester',
  'receive_comment',
  'receive_reaction',
  'hive_created',
  'invitation_accepted',
  'invitation_joined',
  'profile_photo',
  'profile_bio',
  'profile_tool',
] as const
export const Gesture = z.enum(GESTURES)
export type Gesture = z.infer<typeof Gesture>

/**
 * Ce que le grand livre du pollen peut porter : un geste, ou `challenge`, le pollen d'un défi perso
 * réussi (hors plafonds, compté dans la famille du geste du défi).
 */
export const LedgerGesture = z.enum([...GESTURES, 'challenge'])
export type LedgerGesture = z.infer<typeof LedgerGesture>

/**
 * Ce qu'un geste rapporte : son montant, son plafond par jour (`dailyCap`, null : sans plafond
 * propre) et sa famille. `receive` : un geste reçu, compté en plus dans le plafond commun de 50
 * pollen reçus par jour (`RECEIVE_DAILY_CAP`), toutes réceptions confondues. Le jour est celui de
 * Paris : minuit de Paris remet les compteurs à zéro.
 */
export interface GestureRule {
  amount: number
  dailyCap: number | null
  family: Family
  receive: boolean
}

/** Le tableau du scénario, geste par geste (montants et plafonds validés par Louis le 23/11). */
export const POLLEN_GESTURES: Readonly<Record<Gesture, GestureRule>> = {
  feedback: { amount: 25, dailyCap: 4, family: 'keeper', receive: false },
  feedback_settled: { amount: 25, dailyCap: null, family: 'keeper', receive: false },
  tester: { amount: 10, dailyCap: 5, family: 'keeper', receive: false },
  comment: { amount: 10, dailyCap: 10, family: 'forager', receive: false },
  publish: { amount: 50, dailyCap: 2, family: 'builder', receive: false },
  update: { amount: 20, dailyCap: 3, family: 'builder', receive: false },
  reaction: { amount: 2, dailyCap: 25, family: 'forager', receive: false },
  follow: { amount: 3, dailyCap: 10, family: 'forager', receive: false },
  receive_feedback: { amount: 5, dailyCap: null, family: 'builder', receive: true },
  receive_tester: { amount: 5, dailyCap: null, family: 'builder', receive: true },
  receive_comment: { amount: 3, dailyCap: null, family: 'builder', receive: true },
  receive_reaction: { amount: 1, dailyCap: null, family: 'builder', receive: true },
  hive_created: { amount: 15, dailyCap: 1, family: 'dancer', receive: false },
  invitation_accepted: { amount: 20, dailyCap: 5, family: 'dancer', receive: false },
  // Le scénario ne donne le plafond de 5 que pour l'invitant ; l'invité a le même (on ne rejoint
  // de toute façon que 20 ruches).
  invitation_joined: { amount: 15, dailyCap: 5, family: 'dancer', receive: false },
  // Le profil : chacun une fois (la clé de la chose, pas un plafond du jour).
  profile_photo: { amount: 10, dailyCap: null, family: 'builder', receive: false },
  profile_bio: { amount: 10, dailyCap: null, family: 'builder', receive: false },
  profile_tool: { amount: 10, dailyCap: null, family: 'builder', receive: false },
}

/** Le plafond commun de tout ce qu'un membre reçoit sur ses projets en un jour de Paris. */
export const RECEIVE_DAILY_CAP = 50

/** La famille d'un geste : celle qui compte pour le titre et les barres de « Cette semaine ». */
export const familyOf = (gesture: Gesture): Family => POLLEN_GESTURES[gesture].family

/**
 * Les gestes « qui aident ou qui créent » : un seul dans la semaine la rend butinée. Réagir ou
 * suivre seuls ne suffisent pas, recevoir non plus.
 */
export const FORAGING_GESTURES = [
  'publish',
  'update',
  'comment',
  'feedback',
  'tester',
] as const satisfies readonly Gesture[]

/**
 * Ce qui a rapporté une entrée du grand livre : une réaction, un commentaire, une inscription de
 * testeur, un message d'un fil de retour (un retour, ou un retour réglé), un projet (publié, ou
 * suivi), une mise à jour, un membre suivi, une ruche créée, une invitation acceptée, son profil,
 * ou un défi perso réussi. La modération révoque les entrées dont la source est le contenu retiré.
 */
export const PollenSourceKind = z.enum([
  'reaction',
  'comment',
  'tester',
  'tester_message',
  'project',
  'update',
  'member',
  'hive',
  'invitation',
  'profile',
  'personal_challenge',
])
export type PollenSourceKind = z.infer<typeof PollenSourceKind>

/**
 * L'en-tête que posent les routes de geste quand le geste a rapporté (« Waiggle-Pollen: 2 ») : leur
 * réponse reste un 204 sans corps. Absent quand le geste n'a rien rapporté (plafond, compte
 * suspendu, déjà payé) : rien ne l'affiche alors comme une faute.
 */
export const POLLEN_HEADER = 'Waiggle-Pollen'

// --- Le niveau et le rayon ---

/** Le nombre d'alvéoles du rayon entre deux niveaux. */
export const LEVEL_CELLS = 10

/**
 * Le pollen où commence le niveau `n` : 50 × n × (n − 1). Niveau 1 à 0, 2 à 100, 3 à 300, 5 à
 * 1 000, 10 à 4 500 ; pas de plafond.
 */
export const levelStart = (level: number): number => 50 * level * (level - 1)

/**
 * Le niveau d'un total de pollen : le plus grand `n` dont le début est atteint. La racine carrée
 * donne une première valeur (on résout 50 × n × (n − 1) = total) ; les deux boucles la corrigent si
 * l'arrondi des nombres à virgule l'a décalée d'un cran. Un total négatif ou absurde reste au niveau 1.
 */
export const levelFor = (total: number): number => {
  const pollen = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + pollen / 12.5)) / 2))
  while (levelStart(level + 1) <= pollen) level += 1
  while (level > 1 && levelStart(level) > pollen) level -= 1
  return level
}

/** Où en est un membre : son niveau, les alvéoles pleines (0 à 10), le pollen avant le suivant. */
export interface LevelProgress {
  level: number
  cells: number
  toNext: number
}

/**
 * Le rayon d'un total : `levelProgress(880)` donne le niveau 4 (600), 7 alvéoles sur 10 (280 des 400
 * pollen du niveau), et 120 pollen avant le niveau 5 (1 000). L'alvéole se remplit à la dizaine
 * entière : elle n'est jamais pleine avant que le pollen y soit.
 */
export const levelProgress = (total: number): LevelProgress => {
  const pollen = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  const level = levelFor(pollen)
  const start = levelStart(level)
  const span = levelStart(level + 1) - start
  return {
    level,
    cells: Math.floor(((pollen - start) * LEVEL_CELLS) / span),
    toNext: start + span - pollen,
  }
}

// --- Les titres ---

/**
 * Une famille est « obtenue » à 100 pollen gagnés depuis toujours : on peut alors l'épingler comme
 * titre. Le titre affiché, sans épingle, est la famille de plus de pollen sur les 28 derniers jours.
 */
export const TITLE_THRESHOLD = 100
export const TITLE_WINDOW_DAYS = 28

/** La forme du titre : au féminin par défaut (`f`, Butineuse), au masculin au choix (`m`, Butineur). */
export const TitleForm = z.enum(['f', 'm'])
export type TitleForm = z.infer<typeof TitleForm>

/** Le titre d'un membre : sa famille, sa forme, et s'il l'a épinglé (sinon : selon ses gestes). */
export const GameTitle = z
  .object({ family: Family, form: TitleForm, pinned: z.boolean() })
  .meta({ id: 'GameTitle' })
export type GameTitle = z.infer<typeof GameTitle>

// --- Les semaines ---

/**
 * Le calendrier de Paris, lu par `Intl` (l'heure d'été y est comprise). `en-CA` écrit les dates
 * « 2026-11-23 » ; on le crée une fois, car le fabriquer coûte plus que de s'en servir.
 */
const parisCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Le jour de Paris d'un instant, en `YYYY-MM-DD` : les plafonds du jour se comptent par lui. */
export const dayOf = (date: Date): string => {
  const parts = parisCalendar.formatToParts(date)
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * Le lundi de la semaine de Paris d'un instant, en `YYYY-MM-DD` : la semaine des défis, des
 * classements et des semaines butinées va du lundi 0 h au dimanche 24 h, heure de Paris. Le jour de
 * la semaine se calcule sur la date du calendrier (en temps universel, où il ne bouge plus).
 */
export const weekOf = (date: Date): string => {
  const [year, month, day] = dayOf(date).split('-').map(Number)
  const calendarDay = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  // getUTCDay vaut 0 le dimanche : (jour + 6) % 7 donne 0 le lundi, 6 le dimanche.
  const sinceMonday = (calendarDay.getUTCDay() + 6) % 7
  calendarDay.setUTCDate(calendarDay.getUTCDate() - sinceMonday)
  return calendarDay.toISOString().slice(0, 10)
}

/** Une semaine : la date de son lundi, `YYYY-MM-DD`. */
export const GameWeek = z.iso.date()

// --- Le miel ---

/**
 * Le miel gagné : 5 par semaine butinée, 10 par défi perso, 10 par défi de ruche réussi (à chaque
 * participant). `gift` : ce qu'on dépense pour offrir du miel à un projet (une fois par projet).
 * Le miel ne s'achète pas ; l'auteur qui en reçoit n'en gagne pas (pas de circulation).
 */
export const HONEY = { week: 5, challenge: 10, hiveChallenge: 10, gift: 5 } as const

/** Le pollen d'un défi perso réussi, hors plafonds, dans la famille du geste du défi. */
export const CHALLENGE_POLLEN = 20

/**
 * Pourquoi le solde bouge : une semaine butinée, un défi perso, un défi de ruche (crédits), une
 * offre de miel, une décoration achetée (débits).
 */
export const HoneyReason = z.enum(['week', 'challenge', 'hive_challenge', 'gift', 'decoration'])
export type HoneyReason = z.infer<typeof HoneyReason>

/**
 * Le corps d'un 409 `honey_short` (offrir ou décorer) : la forme de toutes les erreurs, avec le prix
 * (`needed`) et le solde (`balance`), pour que la feuille dise ce qui manque sans relire la récolte.
 * Rien n'est débité.
 */
export const HoneyShortError = z
  .object({
    error: z.object({
      code: z.literal('honey_short'),
      message: z.string(),
      needed: z.int().positive(),
      balance: z.int().nonnegative(),
    }),
  })
  .meta({ id: 'HoneyShortError' })
export type HoneyShortError = z.infer<typeof HoneyShortError>

// --- La décoration du rayon ---

/**
 * Les teintes et les motifs de cire, avec leur prix en miel (Louis, 23/11 : teinte 10, motif 15).
 * Miel et Lisse sont offerts. Une décoration s'achète une fois, puis se choisit librement.
 */
export const DECORATIONS = {
  tint: { honey: 0, amber: 10, pollen: 10 },
  pattern: { smooth: 0, waffle: 15, striped: 15, dotted: 15 },
} as const

export const DecorationTint = z.enum(['honey', 'amber', 'pollen'])
export type DecorationTint = z.infer<typeof DecorationTint>
export const DecorationPattern = z.enum(['smooth', 'waffle', 'striped', 'dotted'])
export type DecorationPattern = z.infer<typeof DecorationPattern>

/** Le rayon d'un membre qui n'a rien choisi : Miel, Lisse. */
export const DEFAULT_DECORATION = { tint: 'honey', pattern: 'smooth' } as const

/** La décoration d'un rayon : une teinte et un motif. */
export const Decoration = z
  .object({ tint: DecorationTint, pattern: DecorationPattern })
  .meta({ id: 'Decoration' })
export type Decoration = z.infer<typeof Decoration>

/** PUT /v1/me/game/decoration : la teinte et le motif choisis ; strictObject refuse le reste. */
export const DecorationChoice = z
  .strictObject({ tint: DecorationTint, pattern: DecorationPattern })
  .meta({ id: 'DecorationChoice' })
export type DecorationChoice = z.infer<typeof DecorationChoice>

/** Ce qu'un membre a déjà acheté (les offerts y sont toujours). */
export const OwnedDecorations = z
  .object({ tints: z.array(DecorationTint), patterns: z.array(DecorationPattern) })
  .meta({ id: 'OwnedDecorations' })
export type OwnedDecorations = z.infer<typeof OwnedDecorations>

/**
 * Le prix d'un choix : ce qui n'est pas encore acheté (« Décorer pour 25 miel » pour une teinte et
 * un motif neufs, 0 pour ce qu'on a déjà). Le bouton de l'appli et le débit de l'API le calculent
 * pareil.
 */
export const decorationPrice = (choice: Decoration, owned: OwnedDecorations): number =>
  (owned.tints.includes(choice.tint) ? 0 : DECORATIONS.tint[choice.tint]) +
  (owned.patterns.includes(choice.pattern) ? 0 : DECORATIONS.pattern[choice.pattern])

// --- Les défis ---

/**
 * Un défi : son code (la clé de son texte), le geste qu'il compte et sa cible. `distinctProjects` :
 * chaque geste compte sur un projet différent (« Commente 3 projets ») ; `followedAuthors` :
 * seulement sur les projets de membres qu'on suit (« de tes proches »).
 */
export interface ChallengeDefinition {
  code: string
  gesture: Gesture
  target: number
  distinctProjects: boolean
  followedAuthors: boolean
}

/**
 * La liste fixe des défis perso, trois proposés chaque lundi. Réussi : 10 miel et 20 pollen (dans la
 * famille de son geste) ; manqué, il disparaît le lundi suivant sans trace.
 */
export const PERSONAL_CHALLENGES = [
  // « Fais un retour sur un projet »
  {
    code: 'feedback',
    gesture: 'feedback',
    target: 1,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « Publie une mise à jour »
  {
    code: 'update',
    gesture: 'update',
    target: 1,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « Teste le projet d'un proche »
  {
    code: 'test',
    gesture: 'tester',
    target: 1,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « Commente 3 projets de tes proches »
  {
    code: 'comment_3',
    gesture: 'comment',
    target: 3,
    distinctProjects: true,
    followedAuthors: true,
  },
  // « Réagis à 5 projets »
  {
    code: 'react_5',
    gesture: 'reaction',
    target: 5,
    distinctProjects: true,
    followedAuthors: false,
  },
] as const satisfies readonly ChallengeDefinition[]

/**
 * La liste fixe des défis de ruche, un tiré chaque lundi pour chaque ruche de 3 membres au moins. Un
 * geste compte quand son auteur et celui du projet sont tous deux membres de la ruche. Réussi :
 * 10 miel à chaque participant.
 */
export const HIVE_CHALLENGES = [
  // « 5 retours entre vous »
  {
    code: 'feedback_5',
    gesture: 'feedback',
    target: 5,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « 3 mises à jour entre vous »
  {
    code: 'updates_3',
    gesture: 'update',
    target: 3,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « 3 projets testés entre vous »
  {
    code: 'tested_3',
    gesture: 'tester',
    target: 3,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « 10 réactions entre vous »
  {
    code: 'reactions_10',
    gesture: 'reaction',
    target: 10,
    distinctProjects: false,
    followedAuthors: false,
  },
  // « 5 commentaires entre vous »
  {
    code: 'comments_5',
    gesture: 'comment',
    target: 5,
    distinctProjects: false,
    followedAuthors: false,
  },
] as const satisfies readonly ChallengeDefinition[]

/** Le nombre de défis perso proposés chaque lundi ; une ruche en reçoit un. */
export const OFFERED_CHALLENGES = 3
/** Une ruche reçoit un défi à partir de 3 membres. */
export const HIVE_CHALLENGE_MIN_MEMBERS = 3

/**
 * Les codes d'une liste, comme un tuple que `z.enum` accepte (il en veut au moins un). TypeScript ne
 * sait pas qu'un `map` garde la longueur d'une liste non vide : on le lui dit une fois, ici.
 */
const codesOf = <const T extends readonly [{ code: string }, ...{ code: string }[]]>(list: T) =>
  list.map((item) => item.code) as [T[number]['code'], ...T[number]['code'][]]

export const PersonalChallengeCode = z.enum(codesOf(PERSONAL_CHALLENGES))
export type PersonalChallengeCode = z.infer<typeof PersonalChallengeCode>
export const HiveChallengeCode = z.enum(codesOf(HIVE_CHALLENGES))
export type HiveChallengeCode = z.infer<typeof HiveChallengeCode>

/**
 * Un nombre tiré d'un texte (FNV-1a, 32 bits) : le même texte donne toujours le même nombre, sur le
 * serveur comme dans l'appli. `Math.imul` multiplie comme un entier de 32 bits.
 */
const hash32 = (text: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * La liste dans l'ordre de cette semaine, pour ce membre ou cette ruche (`seed`, son identifiant) :
 * un mélange de Fisher-Yates guidé par un générateur pseudo-aléatoire (mulberry32) que le hash de
 * `seed` et de la semaine fait partir. Même membre, même semaine : même ordre, sans rien stocker
 * avant la première lecture ; on prend ensuite les trois premiers (défi perso) ou le premier (ruche).
 * Les défis tirés sont gardés en base à la première lecture : changer ce calcul ne change pas une
 * semaine commencée.
 */
export const challengeFor = <T>(seed: string, week: string, list: readonly T[]): T[] => {
  let state = hash32(`${seed}:${week}`)
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const shuffled = [...list]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const picked = shuffled[j] as T
    shuffled[j] = shuffled[i] as T
    shuffled[i] = picked
  }
  return shuffled
}

/**
 * Le défi perso de la semaine, dans « Ma récolte » : trois à choisir (`choose`) ; « Pas cette
 * semaine » (`none`, avec les trois mêmes, pour revenir sur ce choix) ; en cours (`active`, son
 * avancée) ; réussi (`done`). Un défi choisi ne change plus de la semaine.
 */
export const PersonalChallengeState = z
  .discriminatedUnion('state', [
    z.object({
      state: z.literal('choose'),
      offered: z.array(PersonalChallengeCode).length(OFFERED_CHALLENGES),
    }),
    z.object({
      state: z.literal('none'),
      offered: z.array(PersonalChallengeCode).length(OFFERED_CHALLENGES),
    }),
    z.object({
      state: z.literal('active'),
      code: PersonalChallengeCode,
      progress: z.int().nonnegative(),
      target: z.int().positive(),
    }),
    z.object({ state: z.literal('done'), code: PersonalChallengeCode }),
  ])
  .meta({ id: 'PersonalChallengeState' })
export type PersonalChallengeState = z.infer<typeof PersonalChallengeState>

/**
 * Le défi de la semaine d'une ruche de 3 membres au moins, pour ses membres seulement : son avancée
 * (« 3 sur 5 »), jamais qui a fait quoi. `isNew` : aucun geste encore (l'appli écrit « Nouveau »,
 * jamais « 0 sur 5 »). `done` : réussi.
 */
export const HiveChallenge = z
  .object({
    hiveId: z.uuid(),
    code: HiveChallengeCode,
    progress: z.int().nonnegative(),
    target: z.int().positive(),
    done: z.boolean(),
    isNew: z.boolean(),
  })
  .meta({ id: 'HiveChallenge' })
export type HiveChallenge = z.infer<typeof HiveChallenge>

/**
 * Au plus une ligne par ruche rejointe : c'est `HIVE_LIMITS.joined` (hives.ts), recopié ici parce
 * que hives.ts importe ce fichier (un test garde les deux égaux).
 */
export const GAME_HIVES_MAX = 20

/** Un défi de ruche dans « Ma récolte » : le même, avec le nom de la ruche (null : retiré). */
export const HarvestHiveChallenge = HiveChallenge.extend({ hiveName: z.string().nullable() }).meta({
  id: 'HarvestHiveChallenge',
})
export type HarvestHiveChallenge = z.infer<typeof HarvestHiveChallenge>

// --- Les sceaux ---

/**
 * La matière d'un sceau de cire : miel pour une première fois, crème pour un palier ou une
 * catégorie (le dessin de a, validé le 23/11).
 */
export const SealMatter = z.enum(['honey', 'cream'])
export type SealMatter = z.infer<typeof SealMatter>

/**
 * Ce qui fait gagner un sceau : un nombre d'entrées non révoquées d'un geste (`count`), un nombre de
 * semaines butinées (`weeks`, une série ou plusieurs), une ruche créée par le membre qui atteint un
 * nombre de membres (`hiveSize`, lui compris), ou des projets différents d'une catégorie (sa
 * principale) testés ou commentés (`category`).
 */
export type SealRule =
  | { kind: 'count'; gesture: Gesture; target: number }
  | { kind: 'weeks'; target: number }
  | { kind: 'hiveSize'; target: number }
  | { kind: 'category'; category: string; target: number }

/**
 * Un sceau : son code (la clé de son texte), sa matière, son icône (Phosphor, générée par
 * `scripts/icons.mts` de l'appli) et sa règle.
 */
export interface SealDefinition {
  code: string
  matter: SealMatter
  icon: string
  rule: SealRule
}

/** Les onze sceaux des premières fois et des paliers (planche R19-Sceaux, noms neutres). */
export const MILESTONE_SEALS = [
  {
    code: 'first_project',
    matter: 'honey',
    icon: 'rocket-launch',
    rule: { kind: 'count', gesture: 'publish', target: 1 },
  },
  {
    code: 'first_update',
    matter: 'honey',
    icon: 'arrows-clockwise',
    rule: { kind: 'count', gesture: 'update', target: 1 },
  },
  {
    code: 'first_feedback',
    matter: 'honey',
    icon: 'chat-centered-text',
    rule: { kind: 'count', gesture: 'feedback', target: 1 },
  },
  {
    code: 'first_settled',
    matter: 'honey',
    icon: 'check-circle',
    rule: { kind: 'count', gesture: 'feedback_settled', target: 1 },
  },
  {
    code: 'tested_10',
    matter: 'cream',
    icon: 'users-three',
    rule: { kind: 'count', gesture: 'tester', target: 10 },
  },
  {
    code: 'feedback_10',
    matter: 'cream',
    icon: 'chats-circle',
    rule: { kind: 'count', gesture: 'feedback', target: 10 },
  },
  {
    code: 'first_hive',
    matter: 'honey',
    icon: 'hexagon',
    rule: { kind: 'count', gesture: 'hive_created', target: 1 },
  },
  { code: 'hive_5', matter: 'cream', icon: 'house-line', rule: { kind: 'hiveSize', target: 5 } },
  {
    code: 'invitations_5',
    matter: 'cream',
    icon: 'handshake',
    rule: { kind: 'count', gesture: 'invitation_accepted', target: 5 },
  },
  { code: 'weeks_10', matter: 'cream', icon: 'flower', rule: { kind: 'weeks', target: 10 } },
  { code: 'weeks_25', matter: 'cream', icon: 'flower-lotus', rule: { kind: 'weeks', target: 25 } },
] as const satisfies readonly SealDefinition[]

/** Une catégorie de départ qui a son sceau : toutes, sauf « Autre ». */
type SealCategory = Exclude<(typeof PROJECT_CATEGORIES)[number], typeof OTHER_CATEGORY>

/**
 * L'icône du sceau de chaque catégorie : celle de la catégorie elle-même (semée par la migration
 * 0016), pour que le sceau se reconnaisse à côté du filtre. `Record` oblige à n'en oublier aucune.
 */
const CATEGORY_SEAL_ICONS: Readonly<Record<SealCategory, CategoryIcon>> = {
  'home-garden': 'plant',
  cooking: 'cooking-pot',
  family: 'users-three',
  learning: 'graduation-cap',
  games: 'game-controller',
  art: 'paint-brush',
  music: 'music-notes',
  'photo-video': 'film-strip',
  'health-sport': 'heartbeat',
  travel: 'airplane-tilt',
  money: 'piggy-bank',
  work: 'briefcase',
  code: 'code',
  animals: 'paw-print',
  science: 'planet',
}

/** Le nombre de projets d'une catégorie, testés ou commentés, qui font gagner son sceau. */
export const CATEGORY_SEAL_TARGET = 3

/**
 * Un sceau par catégorie de départ (« Cuisine explorée »), « Autre » exclue. Son code est celui de
 * la catégorie, tel qu'en base (`home-garden`) : il ne peut pas se confondre avec un sceau de palier,
 * dont le code a toujours un « _ » qu'un code de catégorie n'a jamais (`CategoryCode`).
 */
const CATEGORY_SEALS = PROJECT_CATEGORIES.filter(
  (category): category is SealCategory => category !== OTHER_CATEGORY,
).map((category) => ({
  code: category,
  matter: 'cream' as const,
  icon: CATEGORY_SEAL_ICONS[category],
  rule: { kind: 'category' as const, category, target: CATEGORY_SEAL_TARGET },
}))

type MilestoneSealCode = (typeof MILESTONE_SEALS)[number]['code']

/**
 * Tous les sceaux connus d'avance : les onze, puis les quinze catégories de départ. Une catégorie
 * créée plus tard par un administrateur a aussi son sceau, à la même règle (`sealCategory`) : son
 * icône est celle de la catégorie (GET /v1/categories), son nom le texte `categoryOther`.
 */
export const SEALS: readonly (SealDefinition & { code: MilestoneSealCode | SealCategory })[] = [
  ...MILESTONE_SEALS,
  ...CATEGORY_SEALS,
]

/** Le code d'un sceau de palier ; `as` dit à TypeScript que la liste n'est pas vide (elle en a 11). */
export const MilestoneSealCode = z.enum(
  MILESTONE_SEALS.map((seal) => seal.code) as [MilestoneSealCode, ...MilestoneSealCode[]],
)

/**
 * Le code d'un sceau : un palier, ou le code d'une catégorie (de départ ou créée ensuite), jamais
 * « Autre ». `z.union` essaie chaque forme dans l'ordre et garde la première qui convient.
 */
export const SealCode = z.union([
  MilestoneSealCode,
  CategoryCode.refine((code) => code !== OTHER_CATEGORY, { message: 'no seal for « other »' }),
])
export type SealCode = z.infer<typeof SealCode>

/** La catégorie d'un sceau de catégorie, ou null pour un sceau de palier. */
export const sealCategory = (code: SealCode): string | null =>
  MilestoneSealCode.safeParse(code).success ? null : code

/** Un sceau gagné et sa date : il reste, même si le contenu qui l'a fait gagner est retiré. */
export const EarnedSeal = z
  .object({ code: SealCode, earnedAt: z.iso.datetime() })
  .meta({ id: 'EarnedSeal' })
export type EarnedSeal = z.infer<typeof EarnedSeal>

// --- Ce que l'API renvoie ---

/**
 * Ce que la page d'un membre montre de son jeu (`Member.game`) : niveau, alvéoles, titre (null : un
 * nouveau membre, sans pollen depuis 28 jours ni titre épinglé), sceaux gagnés (les plus récents
 * d'abord) et décoration. Jamais le miel, ni les réglages, ni les semaines butinées.
 */
export const MemberGame = z
  .object({
    level: z.int().positive(),
    cells: z.int().min(0).max(LEVEL_CELLS),
    title: GameTitle.nullable(),
    // Sans maximum : une catégorie créée par un administrateur ajoute un sceau possible.
    seals: z.array(EarnedSeal),
    decoration: Decoration,
  })
  .meta({ id: 'MemberGame' })
export type MemberGame = z.infer<typeof MemberGame>

/**
 * Les réglages du jeu : la forme du titre, la famille épinglée (null : selon ses gestes),
 * « Apparaître dans les classements » et « Ma récolte » (les avis de l'Activité et les lignes du
 * récap), allumés par défaut.
 */
export const GameSettings = z
  .object({
    titleForm: TitleForm,
    pinnedFamily: Family.nullable(),
    inRankings: z.boolean(),
    harvestNotices: z.boolean(),
  })
  .meta({ id: 'GameSettings' })
export type GameSettings = z.infer<typeof GameSettings>

/**
 * « Ma récolte » (GET /v1/me/harvest), pour soi seulement : le rayon (`level`, `total`, `cells`,
 * `toNext`), le titre, les familles obtenues (épinglables), le pollen de la semaine par famille, les
 * semaines butinées (`count`, `hibernating` : ni cette semaine ni la précédente, `currentForaged` :
 * celle-ci l'est déjà), le solde de miel, les défis, les sceaux, la décoration et ce qui est acheté,
 * les réglages, et le dernier niveau vu (`levelSeen` : sous `level`, la cire coule une fois).
 */
export const Harvest = z
  .object({
    level: z.int().positive(),
    total: z.int().nonnegative(),
    cells: z.int().min(0).max(LEVEL_CELLS),
    toNext: z.int().positive(),
    title: GameTitle.nullable(),
    obtainedFamilies: z.array(Family).max(FAMILIES.length),
    week: z.object({
      total: z.int().nonnegative(),
      byFamily: z.record(Family, z.int().nonnegative()),
    }),
    weeks: z.object({
      count: z.int().nonnegative(),
      hibernating: z.boolean(),
      currentForaged: z.boolean(),
    }),
    honey: z.int().nonnegative(),
    personalChallenge: PersonalChallengeState,
    hiveChallenges: z.array(HarvestHiveChallenge).max(GAME_HIVES_MAX),
    // Sans maximum : une catégorie créée par un administrateur ajoute un sceau possible.
    seals: z.array(EarnedSeal),
    decoration: Decoration,
    ownedDecorations: OwnedDecorations,
    settings: GameSettings,
    levelSeen: z.int().positive(),
  })
  .meta({ id: 'Harvest' })
export type Harvest = z.infer<typeof Harvest>

// --- Ce que l'API accepte ---

/**
 * PATCH /v1/me/game : un ou plusieurs réglages, et le choix du défi perso de la semaine (un des trois
 * proposés, ou `none` : « Pas cette semaine »). `levelSeen` : le niveau dont la cire a coulé (pas
 * au-delà du niveau atteint : 422 `invalid_level_seen`). Épingler une famille non obtenue : 422
 * `family_not_obtained` ; un défi hors des trois, ou un second choix : 422 `invalid_challenge`. Ces
 * trois règles sont celles de l'API, pas de la forme. strictObject refuse tout autre champ ; un corps
 * vide ne changerait rien et répond 400.
 */
export const GameSettingsUpdate = z
  .strictObject({
    titleForm: TitleForm,
    pinnedFamily: Family.nullable(),
    inRankings: z.boolean(),
    harvestNotices: z.boolean(),
    levelSeen: z.int().positive(),
    personalChallenge: z.union([PersonalChallengeCode, z.literal('none')]),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'change at least one setting' })
  .meta({ id: 'GameSettingsUpdate' })
export type GameSettingsUpdate = z.infer<typeof GameSettingsUpdate>

// --- Les classements ---

/** Les proches (ceux que l'on suit, et soi) ou une ruche dont on est membre. */
export const RankingScope = z.enum(['close', 'hive'])
export type RankingScope = z.infer<typeof RankingScope>

/** Un classement montre 50 lignes au plus. */
export const RANKING_MAX = 50

/**
 * GET /v1/rankings : `scope`, et `hive` (l'identifiant de la ruche) pour `scope=hive` seulement ;
 * une ruche dont on n'est pas membre répond 404, comme sa page.
 */
export const RankingQuery = z
  .object({ scope: RankingScope, hive: z.uuid().optional() })
  .refine((query) => (query.scope === 'hive') === (query.hive !== undefined), {
    message: 'a hive goes with the scope « hive », and only with it',
    path: ['hive'],
  })
export type RankingQuery = z.infer<typeof RankingQuery>

/** Un membre classé : de quoi écrire son nom, montrer sa photo et mener à sa page. */
export const RankedMember = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
})
export type RankedMember = z.infer<typeof RankedMember>

/**
 * Le classement de la semaine en cours (`week`, son lundi) : seuls ceux qui ont gagné du pollen
 * cette semaine, du plus au moins ; les ex aequo ont le même rang. `self` : la ligne du lecteur.
 * Jamais un compte d'exemple, un membre retiré des classements, ni un membre bloqué dans un sens ou
 * dans l'autre. `hiveId` : présent pour une ruche seulement.
 */
export const Ranking = z
  .object({
    scope: RankingScope,
    hiveId: z.uuid().optional(),
    week: GameWeek,
    rows: z
      .array(
        z.object({
          rank: z.int().positive(),
          member: RankedMember,
          pollen: z.int().positive(),
          self: z.boolean(),
        }),
      )
      .max(RANKING_MAX),
  })
  .meta({ id: 'Ranking' })
export type Ranking = z.infer<typeof Ranking>

// --- L'export du compte ---

/**
 * `AccountExport.game` : ce que le jeu garde du membre. Les entrées du grand livre sans l'autre
 * membre ni l'identifiant de la chose (une réaction reçue appartient à qui l'a posée) ; ses sceaux ;
 * les mouvements de son miel ; ses défis perso ; ses réglages et sa décoration.
 */
export const GameExport = z.object({
  pollen: z.array(
    z.object({
      gesture: LedgerGesture,
      family: Family,
      amount: z.int().positive(),
      sourceKind: PollenSourceKind,
      day: z.iso.date(),
      week: GameWeek,
      createdAt: z.iso.datetime(),
      /** Quand la modération l'a retirée avec son contenu ; null pour une entrée qui compte. */
      revokedAt: z.iso.datetime().nullable(),
    }),
  ),
  seals: z.array(EarnedSeal),
  honey: z.array(z.object({ amount: z.int(), reason: HoneyReason, createdAt: z.iso.datetime() })),
  challenges: z.array(
    z.object({
      week: GameWeek,
      offered: z.array(PersonalChallengeCode),
      /** Le défi choisi ; null : aucun (ou pas encore). */
      chosen: PersonalChallengeCode.nullable(),
      completedAt: z.iso.datetime().nullable(),
    }),
  ),
  settings: GameSettings.extend({
    /** La décoration choisie ; null : jamais décoré (Miel, Lisse). */
    decoration: Decoration.nullable(),
    levelSeen: z.int().positive(),
  }),
})
export type GameExport = z.infer<typeof GameExport>
