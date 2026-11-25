// Les règles de Waiggle et les pages légales (tranche R11, « La conformité ») : la version en
// vigueur des règles, l'accord d'un membre (à l'inscription, ou sur l'écran « Accepter » des membres
// déjà inscrits) et la liste des quatre pages publiques. Fichier sans autre import que Zod : le
// compte (accounts.ts) et l'export (export.ts) le lisent.
import { z } from 'zod'

/**
 * La forme d'une version des règles : une date `AAAA-MM-JJ` (z.iso.date vérifie aussi que le jour
 * existe : pas de 31 novembre). Une date plutôt qu'un numéro : l'écran l'affiche telle quelle
 * (« Version du 16 nov. 2026 »), et deux versions se rangent dans l'ordre en comparant les textes.
 */
export const RulesVersion = z.iso.date()

/**
 * La version des règles en vigueur (choix 3 du scénario). La changer fait revenir l'écran
 * « Accepter » chez chaque membre à sa visite suivante ; une correction de forme (une faute, un
 * lien) ne la change pas. Elle vaut le jour du déploiement de la version.
 * R12 (les projets publics) : la deuxième version. La première (R11) valait 2026-11-16, déjà
 * acceptée par les membres : la nouvelle doit en différer pour que l'écran « Accepter » revienne.
 * R19 (la récolte) : la troisième. Les Règles décrivent le classement de la semaine et disent que le
 * pollen et le miel n'ont aucune valeur (relecture juridique de la branche, point 2 ; Louis, 23/11).
 */
export const RULES_VERSION = '2026-11-23'

/**
 * « Ce qui change » dans la version en vigueur : des clés de texte (`rules.changes.<clé>` dans
 * packages/i18n), affichées au-dessus de l'écran « Accepter » à qui ne l'a pas encore acceptée.
 * R12 : les projets publics (`public`), ce que peut faire un visiteur sans compte, signalement
 * compris (`visitors`), et la vitrine de l'accueil (`showcase`). R19 : le classement de la semaine
 * et la valeur du pollen et du miel (`harvest`). `readonly string[]` : le type
 * écrit permet une liste vide à la prochaine version sans changer la forme.
 */
export const RULES_CHANGES: readonly string[] = ['harvest']

/**
 * Un accord donné par un membre, tel que l'export le montre (une ligne par version acceptée,
 * choix 1 du plan R11 : l'historique est la preuve). `ageDeclared` vaut toujours vrai : on ne
 * garde un accord que s'il a déclaré avoir 15 ans ou plus.
 */
export const RulesAcceptance = z
  .object({
    version: RulesVersion,
    acceptedAt: z.iso.datetime(),
    ageDeclared: z.literal(true),
  })
  .meta({ id: 'RulesAcceptance' })
export type RulesAcceptance = z.infer<typeof RulesAcceptance>

/**
 * Le corps de POST /v1/me/rules : accepter la version en vigueur, depuis l'écran « Accepter ».
 * z.literal(true) n'accepte que le booléen `true` : ni `"true"`, ni `1`, ni une case absente. La
 * version doit être exactement celle du serveur : un écran ouvert avant une nouvelle version ne
 * peut pas faire accepter l'ancienne à la place de celle qu'il n'a pas montrée.
 */
export const AcceptRules = z
  .object({
    version: z.literal(RULES_VERSION),
    acceptRules: z.literal(true),
    ageDeclared: z.literal(true),
  })
  .meta({ id: 'AcceptRules' })
export type AcceptRules = z.infer<typeof AcceptRules>

/**
 * Les quatre pages publiques, lisibles sans compte : les Règles, la Confidentialité, les Mentions
 * légales et l'Accessibilité. Leur nom est aussi leur adresse (`/rules`, `/privacy`…). `as const`
 * garde les quatre noms exacts dans le type, au lieu de `string`.
 */
export const LEGAL_PAGES = ['rules', 'privacy', 'legal', 'accessibility'] as const
/** Une des quatre pages, comme schéma (pour lire un paramètre d'adresse) et comme type. */
export const LegalPage = z.enum(LEGAL_PAGES)
export type LegalPage = (typeof LEGAL_PAGES)[number]
