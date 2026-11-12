// Les dates relatives (R4, F-Fil3) : « à l'instant », « il y a 5 min », « il y a 2 h », « hier »,
// « mardi », puis la date courte (« 12 oct. »). Des fonctions pures, sans React : on leur donne la
// date, la langue et l'heure qu'il est (`now`), et elles rendent le texte. C'est ce qui permet de
// les tester à la minute près sans attendre, et de les partager entre le composant `RelativeTime`,
// le hook `useRelativeDate` et les écrans qui écrivent une date dans une phrase.
//
// Toutes les frontières de jour sont celles de Paris, quel que soit le fuseau de l'appareil (comme
// `parisTime.ts`) : à 0 h 30 à Paris, un projet publié à 23 h 50 la veille est « hier », même sur
// un téléphone réglé sur New York, où il est encore la veille au soir.
import { type Language, resolveLanguage } from '@ruche/i18n'
import type { i18n } from 'i18next'
import { createI18n } from '../i18n'
import { PARIS_TIME_ZONE, parisDateTime } from './parisTime'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** À partir de ce nombre de jours (calendaires, à Paris), on écrit la date plutôt que le jour. */
const WEEK_DAYS = 7

/**
 * Une date courte dans la langue de l'écran : « 12 oct. » cette année, « 12 oct. 2025 » sinon.
 * Intl.DateTimeFormat est l'outil des navigateurs et téléphones pour écrire les dates à la façon
 * de chaque langue ; le fuseau de Paris lui est donné (`timeZone`), jamais lu sur l'appareil.
 * (Déplacée ici depuis `projects/format.ts`, qui la réexporte : un composant de `src/ui` ne lit
 * rien d'un domaine.)
 */
export const shortDate = (iso: string, language: string, now = new Date()): string => {
  const date = new Date(iso)
  const sameYear = parisDay(date).year === parisDay(now).year
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    timeZone: PARIS_TIME_ZONE,
    ...(sameYear ? null : { year: 'numeric' }),
  }).format(date)
}

/** Le jour d'une date à Paris (année, mois, jour), lu par `Intl` dans le fuseau de Paris. */
const parisDay = (date: Date): { year: number; month: number; day: number } => {
  // formatToParts rend la date en morceaux (« year », « month », « day »…) : on les lit un à un
  // plutôt que de compter sur l'ordre d'écriture d'une langue.
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: PARIS_TIME_ZONE,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((piece) => piece.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

/**
 * Le nombre de jours du calendrier de Paris entre deux dates : 0 le même jour, 1 la veille. On
 * compte des jours du calendrier, pas des tranches de 24 h : 23 h 50 la veille, c'est « hier »,
 * même dix minutes plus tard. Date.UTC compte en jours entiers, sans heure d'été qui fausserait
 * la soustraction. Exportée en R8 : les sections d'Activité (`notifications/days.ts`) comptent les
 * jours de la même façon.
 */
export const parisDaysBetween = (earlier: Date, later: Date): number => {
  const dayNumber = (date: Date) => {
    const { year, month, day } = parisDay(date)
    return Date.UTC(year, month - 1, day) / (24 * HOUR)
  }
  return dayNumber(later) - dayNumber(earlier)
}

// Les textes viennent d'i18next, comme partout : une instance par langue, créée à la première
// demande puis gardée (créer une instance à chaque date du fil serait du travail perdu).
const translators = new Map<Language, i18n['t']>()
const translatorFor = (language: Language): i18n['t'] => {
  const known = translators.get(language)
  if (known) return known
  const t = createI18n(language).t
  translators.set(language, t)
  return t
}

/** Une date relative : le texte court affiché, et la date complète lue et montrée au survol. */
export type RelativeDate = {
  /** Le texte affiché : « il y a 5 min », « hier », « mardi », « 12 oct. ». */
  label: string
  /**
   * La même date, posée après un verbe (relecture ui-B2) : « publié hier », « publié mardi »,
   * « publié le 12 oct. » ; en anglais « on Tuesday », « on Oct 12 ». Les formes du jour même
   * (« il y a 5 min ») ne changent pas.
   */
  afterVerb: string
  /** La date et l'heure complètes, à l'heure de Paris (« 12 octobre à 08:00 »). */
  full: string
}

/**
 * La date `iso` dite par rapport à `now`, dans la langue `language` (« fr », « en ») :
 * - moins d'une minute, ou une date future (une horloge d'appareil en retard) : « à l'instant » ;
 * - moins d'une heure : « il y a N min » ;
 * - le même jour à Paris : « il y a N h » ;
 * - la veille à Paris : « hier » ;
 * - jusqu'à 6 jours : le jour de la semaine (« mardi ») ;
 * - 7 jours et plus : la date courte (« 12 oct. », « 12 oct. 2025 ») : le même jour de la semaine
 *   dirait sinon deux dates à la fois.
 */
export const relativeDate = (
  iso: string,
  language: string,
  now: Date = new Date(),
): RelativeDate => {
  const date = new Date(iso)
  const t = translatorFor(resolveLanguage([language]))
  const full = parisDateTime(iso, language, now).dateTime
  const elapsed = now.getTime() - date.getTime()
  // Le jour même : la forme courte va aussi après un verbe (« publié il y a 5 min »).
  const same = (label: string): RelativeDate => ({ label, afterVerb: label, full })

  if (elapsed < MINUTE) return same(t(($) => $.dates.now))
  if (elapsed < HOUR)
    return same(t(($) => $.dates.minutes, { count: Math.floor(elapsed / MINUTE) }))
  const days = parisDaysBetween(date, now)
  if (days <= 0) return same(t(($) => $.dates.hours, { count: Math.floor(elapsed / HOUR) }))
  if (days === 1) return same(t(($) => $.dates.yesterday))
  if (days < WEEK_DAYS) {
    const day = new Intl.DateTimeFormat(language, {
      weekday: 'long',
      timeZone: PARIS_TIME_ZONE,
    }).format(date)
    return { label: day, afterVerb: t(($) => $.dates.onDay, { day }), full }
  }
  const short = shortDate(iso, language, now)
  return { label: short, afterVerb: t(($) => $.dates.onDate, { date: short }), full }
}
