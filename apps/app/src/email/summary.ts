// La phrase « Ce que tu reçois par e-mail » (tranche R8, planche R8-Activite-Desktop) : à partir des
// réglages d'e-mail du membre, elle dit en une ligne ce qui part tout de suite, ce qui va dans le
// récap du dimanche, et ce qui reste seulement dans l'Activité. Une fonction pure, à part des hooks
// (`email/api.ts`) : les tests de l'écran remplacent ces hooks sans perdre la phrase.
//
// Six phrases possibles (`notifications.summary`) :
// - des types « Tout de suite » et le reste dans le récap : `nowAndRest` ;
// - pareil, mais une partie du reste est à « Jamais » : `nowAndSome` ;
// - des types « Tout de suite » et rien d'autre ne part (récap coupé, ou tout le reste à « Jamais ») :
//   `nowOnly` ;
// - rien « Tout de suite », tout dans le récap : `recapAll` ; une partie seulement : `recapSome` ;
// - rien ne part du tout : `nothing`.
import { type EmailPreferences, EmailType } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'

type T = ReturnType<typeof useTranslation>['t']

/**
 * Lie des morceaux à la façon de la langue : « a, b et c » en français, « a, b, and c » en anglais.
 * Repli sur la virgule là où le moteur JavaScript n'a pas `Intl.ListFormat` (certains téléphones,
 * comme pour les outils d'un projet) : c'est rare, et la phrase reste lisible.
 */
const joinList = (items: readonly string[], language: string): string =>
  typeof Intl.ListFormat === 'function'
    ? new Intl.ListFormat(language, { type: 'conjunction', style: 'long' }).format(items)
    : items.join(', ')

/** La première lettre en capitale : la liste ouvre la phrase (« Les réponses et les mentions… »). */
const capitalize = (text: string, language: string): string =>
  text.slice(0, 1).toLocaleUpperCase(language) + text.slice(1)

/** La phrase de la colonne, dans la langue de `t` ; `language` lie la liste des types. */
export const emailSummary = (preferences: EmailPreferences, t: T, language: string): string => {
  // Les types dans l'ordre de l'écran des réglages (celui du contrat), quel que soit l'ordre des
  // réglages reçus.
  const types = EmailType.options
  const now = types.filter((type) => preferences[type] === 'now')
  const rest = types.filter((type) => preferences[type] !== 'now')
  // Le récap ne part que s'il est activé et qu'un type au moins y va.
  const inRecap = preferences.weeklyRecap
    ? rest.filter((type) => preferences[type] === 'digest')
    : []
  const someLeftOut = inRecap.length > 0 && inRecap.length < rest.length

  // Le récap activé part même sans aucun type « dans le récap » : il apporte les nouveaux projets
  // des proches (choix 7 du scénario). La phrase ne dit donc jamais « rien ne part » dans ce cas.
  const friendsOnly = preferences.weeklyRecap && inRecap.length === 0

  if (now.length === 0) {
    if (friendsOnly) return t(($) => $.notifications.summary.nothingFriends)
    if (inRecap.length === 0) return t(($) => $.notifications.summary.nothing)
    return someLeftOut
      ? t(($) => $.notifications.summary.recapSome)
      : t(($) => $.notifications.summary.recapAll)
  }

  const names = now.map((type) => t(($) => $.notifications.summary.types[type]))
  const list = capitalize(joinList(names, language), language)
  if (friendsOnly) return t(($) => $.notifications.summary.nowFriends, { types: list })
  if (inRecap.length === 0) return t(($) => $.notifications.summary.nowOnly, { types: list })
  return someLeftOut
    ? t(($) => $.notifications.summary.nowAndSome, { types: list })
    : t(($) => $.notifications.summary.nowAndRest, { types: list })
}
