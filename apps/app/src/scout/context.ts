// « Joint à ton retour » (tranche R20, feuille « Ton retour ») : ce que l'appli joint à un retour
// d'Éclaireuse pour aider à le comprendre, l'écran d'où l'on vient, l'appareil et sa largeur, la
// version de l'appli, la langue et le thème. La feuille montre chaque valeur en clair avant l'envoi
// (relecture juridique J5), et la case « Joindre ces informations » retire le tout.
import { SCOUT_WIDTH_MAX, type ScoutContext, ScoutScreen, screenPathOf } from '@ruche/contracts'
import type { Language } from '@ruche/i18n'
import { Platform } from 'react-native'
import { appVersion } from '../config'

/**
 * L'écran d'où l'on vient, tel qu'on peut le joindre : son chemin sans paramètres (tout ce qui suit
 * « ? » ou « # » part, un paramètre pourrait porter un jeton), seulement s'il commence par « / ».
 * Le paramètre `from` vient de l'adresse : une adresse fabriquée (« https://… ») n'est ni montrée ni
 * envoyée (relecture de sécurité du plan, A3). Null si `from` manque ou ne convient pas.
 */
export const screenOf = (from: string | null | undefined): string | null => {
  if (!from) return null
  const parsed = ScoutScreen.safeParse(screenPathOf(from))
  return parsed.success ? parsed.data : null
}

/** La plateforme, dans les mots du contrat (`web`, `ios`, `android`). */
const platformOf = (): ScoutContext['platform'] =>
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web'

/**
 * Le contexte joint au retour, ou null quand l'écran d'où l'on vient n'est pas connu (un lien
 * ouvert directement, une adresse fabriquée) : le contrat le veut entier, la feuille ne propose
 * alors rien à joindre plutôt que d'inventer un écran. `layout` : la fenêtre (sa largeur en
 * points) ; `scheme` : le thème affiché ; `language` : la langue de l'appli. La version est le
 * commit de l'appli web (`EXPO_PUBLIC_APP_VERSION`, `config.ts`), nulle en développement.
 */
export const scoutContext = (
  from: string | null | undefined,
  layout: { width: number },
  scheme: ScoutContext['scheme'],
  language: Language,
): ScoutContext | null => {
  const screen = screenOf(from)
  if (screen === null) return null
  return {
    screen,
    platform: platformOf(),
    // Une largeur entière, dans les bornes du contrat (une fenêtre de 390,5 points arrive parfois).
    width: Math.min(Math.max(Math.round(layout.width), 0), SCOUT_WIDTH_MAX),
    appVersion,
    language,
    scheme,
  }
}
