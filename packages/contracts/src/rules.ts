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
 */
export const RULES_VERSION = '2026-11-16'

/**
 * « Ce qui change » dans la version en vigueur : des clés de texte (packages/i18n), affichées
 * au-dessus de l'écran « Accepter ». Vide pour la première version : il n'y a rien d'avant.
 * `readonly string[]` : sans ce type écrit, un tableau vide serait typé `never[]`, et on ne
 * pourrait rien y ajouter à la prochaine version.
 */
export const RULES_CHANGES: readonly string[] = []

/**
 * Un accord donné par un membre, tel que l'export le montre (une ligne par version acceptée,
 * choix 1 de la session : l'historique est la preuve). `ageDeclared` vaut toujours vrai : on ne
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
