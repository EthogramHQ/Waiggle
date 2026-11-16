// Les adresses par langue des pages publiques (tranche R12, scénario « Les adresses par langue ») :
// l'accueil (`/fr/`, `/en/`), un projet public (`/fr/projects/<id>`), ses mises à jour, une page
// publique (`/fr/members/<id>`) et les quatre pages de R11 (`/fr/rules`…). Ce sont les chemins
// d'aujourd'hui, précédés de la langue. Les pages des membres (Fil, réglages…) n'en ont pas.
//
// Un seul endroit fabrique et lit ces adresses : les liens d'un écran visiteur, le pied de page, le
// partage et l'aperçu passent par ces fonctions, pour qu'aucun écran n'écrive `/fr/` à la main.
import { LEGAL_PAGES, type LegalPage } from '@ruche/contracts'
import { type Language, supportedLanguages } from '@ruche/i18n'

/** Les sortes de pages publiques : l'accueil, un projet, ses mises à jour, un membre, une page légale. */
export type PublicPageKind = 'home' | 'project' | 'updates' | 'member' | LegalPage

/** Les pages qui désignent une chose précise, donc un identifiant dans l'adresse. */
type WithId = 'project' | 'updates' | 'member'

// Une page légale ? `LEGAL_PAGES` est un tableau `as const` : on le lit comme une liste de textes
// pour pouvoir lui demander si une valeur quelconque en fait partie.
const isLegalPage = (kind: PublicPageKind): kind is LegalPage =>
  (LEGAL_PAGES as readonly string[]).includes(kind)

/**
 * L'adresse d'une page publique dans une langue. L'identifiant est encodé
 * (`encodeURIComponent`) : un identifiant venu d'ailleurs (`../out`, `a?b#c`) reste un seul
 * morceau du chemin, il ne peut jamais mener à une autre page, ni y ajouter des paramètres.
 */
export function publicPath(kind: 'home' | LegalPage, lang: Language): string
export function publicPath(kind: WithId, lang: Language, id: string): string
export function publicPath(kind: PublicPageKind, lang: Language, id?: string): string
export function publicPath(kind: PublicPageKind, lang: Language, id = ''): string {
  const prefix = `/${lang}`
  if (kind === 'home') return `${prefix}/`
  if (isLegalPage(kind)) return `${prefix}/${kind}`
  const safeId = encodeURIComponent(id)
  if (kind === 'member') return `${prefix}/members/${safeId}`
  if (kind === 'updates') return `${prefix}/projects/${safeId}/updates`
  return `${prefix}/projects/${safeId}`
}

// La langue en tête du chemin : `/fr` ou `/en`, suivie d'une barre oblique ou de rien. Écrite en
// minuscules exactement : `/FR/`, `/fra/` ou `/french` ne sont pas des adresses à langue.
const LANGUAGE_PREFIX = new RegExp(`^/(${supportedLanguages.join('|')})(?=/|$)`)

/** La langue d'une adresse publique (`/en/members/u-ines` → `en`), ou null hors d'une telle adresse. */
export const languageOfPath = (pathname: string): Language | null => {
  const found = LANGUAGE_PREFIX.exec(pathname)?.[1]
  return supportedLanguages.find((language) => language === found) ?? null
}

/**
 * La même page dans l'autre langue (`/fr/projects/x` → `/en/projects/x`), ou null pour une page
 * sans langue dans l'adresse (`/`, `/feed`) : il n'y a alors pas d'autre adresse à proposer
 * (relecture du plan, C5).
 */
export const otherLanguagePath = (pathname: string): string | null => {
  const language = languageOfPath(pathname)
  if (language === null) return null
  const other = supportedLanguages.find((candidate) => candidate !== language) ?? language
  return pathname.replace(LANGUAGE_PREFIX, `/${other}`)
}
