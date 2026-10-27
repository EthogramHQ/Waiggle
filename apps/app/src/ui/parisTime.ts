// L'heure de Paris d'une date de la modération (tranche 7c, relecture juridique J4). La fin d'une
// suspension s'écrit « le 3 novembre à 00:30 (heure de Paris) », quelle que soit la langue et quel
// que soit le fuseau de l'appareil : la même valeur que dans l'e-mail, à la seconde près. Une date
// écrite dans le fuseau de l'appareil (ou en UTC) pourrait tomber un jour plus tôt : 23 h 30 UTC
// le 2 novembre, c'est déjà le 3 novembre à Paris.
//
// Une fonction pure, sans React ni i18next : le fuseau est donné à `Intl` (`timeZone`), jamais lu
// sur l'appareil. C'est ce qui permet de la tester sur un PC réglé sur Paris (où une mise en forme
// « heure de l'appareil » passerait aussi) : le test donne une heure UTC et lit le résultat. Les
// écrans de la suspension (bannière, page d'un membre, notifications) s'en servent tous.

/** Le fuseau de toutes les dates de la modération : celui de l'équipe, et des CGU. */
export const PARIS_TIME_ZONE = 'Europe/Paris'

/** Une date écrite à l'heure de Paris : le jour, l'heure, et les deux ensemble. */
export type ParisDateTime = {
  /** Le jour (« 3 novembre », « November 3 ») ; l'année seulement si ce n'est pas l'année en cours. */
  date: string
  /** L'heure (« 00:30 », « 12:30 AM »). */
  time: string
  /** Le jour et l'heure en une expression, comme la langue les lie (« 3 novembre à 00:30 »). */
  dateTime: string
}

/** L'année d'une date, à Paris (le 31 décembre à 23 h 30 UTC est déjà l'année suivante). */
const parisYear = (date: Date): string =>
  new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: PARIS_TIME_ZONE }).format(date)

/**
 * La date `iso` écrite à l'heure de Paris, dans la langue `language` (« fr », « en »). L'année ne
 * s'écrit que si elle diffère de celle de `now` (une décision gardée un an, une fin en janvier).
 */
export const parisDateTime = (iso: string, language: string, now = new Date()): ParisDateTime => {
  const when = new Date(iso)
  // Intl.DateTimeFormat : la mise en forme des dates propre à chaque langue (ordre, mois, « à »).
  const day: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    ...(parisYear(when) === parisYear(now) ? null : { year: 'numeric' as const }),
  }
  // L'heure sur deux chiffres (« 00:30 », pas « 0:30 »), comme l'e-mail de la suspension
  // (apps/api/src/email/templates.ts) : le membre lit la même heure aux deux endroits. L'anglais,
  // qui compte sur douze heures, garde « 12:30 AM ».
  const hour: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { ...options, timeZone: PARIS_TIME_ZONE }).format(when)
  return { date: format(day), time: format(hour), dateTime: format({ ...day, ...hour }) }
}
