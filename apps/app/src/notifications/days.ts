// Range les notifications d'Activité en trois sections : « Aujourd'hui », « Cette semaine »,
// « Plus tôt ». Une fonction pure, à part des hooks de api.ts (les tests de l'écran remplacent
// api.ts sans perdre celle-ci). Les jours sont ceux de Paris, comme partout dans l'appli : à 0 h 30
// à Paris, ce qui date de 23 h 50 la veille n'est plus « aujourd'hui », quel que soit le fuseau
// du téléphone.
import { parisDaysBetween } from '../ui/relativeDate'

/** Les sections de la page, de la plus récente à la plus ancienne. */
export type DaySectionKey = 'today' | 'week' | 'earlier'

/** Une section : sa clé (l'écran en tire le titre) et ses éléments, dans l'ordre reçu. */
export type DaySection<T> = { key: DaySectionKey; items: T[] }

/** Au-delà de ce nombre de jours du calendrier, on est dans « Plus tôt » (hier à J-6 : la semaine). */
const WEEK_DAYS = 7

/** La section d'une date : aujourd'hui (même jour de Paris), les six jours d'avant, le reste. */
const sectionOf = (date: Date, now: Date): DaySectionKey => {
  const days = parisDaysBetween(date, now)
  if (days <= 0) return 'today' // une date légèrement dans le futur (horloge en retard) reste aujourd'hui
  if (days < WEEK_DAYS) return 'week'
  return 'earlier'
}

/**
 * Groupe les éléments par jour. L'ordre reçu est gardé (l'API les donne du plus récent au plus
 * ancien), et une section sans élément n'existe pas : l'écran n'a pas de titre vide à cacher.
 */
export const groupByDay = <T extends { date: string }>(
  items: readonly T[],
  now: Date,
): DaySection<T>[] => {
  const sections: DaySection<T>[] = [
    { key: 'today', items: [] },
    { key: 'week', items: [] },
    { key: 'earlier', items: [] },
  ]
  for (const item of items) {
    const key = sectionOf(new Date(item.date), now)
    sections.find((section) => section.key === key)?.items.push(item)
  }
  return sections.filter((section) => section.items.length > 0)
}
