// Une date dite par rapport à maintenant (R4, F-Fil3) : « il y a 5 min », « hier », « mardi »,
// « 12 oct. ». Le texte court se lit d'un coup d'œil ; la date complète (« 12 octobre à 08:00 »,
// heure de Paris) reste à portée : c'est elle que lit le lecteur d'écran, et sur ordinateur elle
// s'affiche au survol de la souris (l'attribut `title` du web).
//
// Trois soucis, réglés ici une fois pour tous les écrans :
// - le temps passe : « à l'instant » devient « il y a 1 min ». Une seule horloge, partagée par
//   toutes les dates affichées, les fait se redessiner une fois par minute (et non un minuteur par
//   date : un fil de 50 cartes en poserait 50) ;
// - le web pré-rend ses pages sans savoir quelle heure il sera chez le visiteur : avant
//   l'hydratation (`useHydrated`), on écrit la date courte, qui ne dépend pas de l'heure ; la date
//   relative arrive juste après. Sinon React verrait un texte différent du HTML préparé ;
// - les tests et le catalogue figent l'heure par la prop `now`.
import type { TextVariant } from '@ruche/brand'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View, type ViewStyle } from 'react-native'
import { parisDateTime } from './parisTime'
import { type RelativeDate, relativeDate, shortDate } from './relativeDate'
import { Text, type TextTone } from './Text'
import { useHydrated } from './theme/hydration'

// --- L'horloge partagée -----------------------------------------------------------------------

const MINUTE = 60_000
/** Les dates affichées qui attendent la minute suivante. */
const clockListeners = new Set<() => void>()
/** Le seul minuteur, posé avec la première date affichée et retiré avec la dernière. */
let clockTimer: ReturnType<typeof setInterval> | null = null

const subscribeClock = (listener: () => void) => {
  clockListeners.add(listener)
  if (clockTimer === null) {
    clockTimer = setInterval(() => {
      for (const notify of clockListeners) notify()
    }, MINUTE)
  }
  return () => {
    clockListeners.delete(listener)
    if (clockListeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

/**
 * La minute en cours, comptée depuis 1970 : un nombre qui ne change qu'une fois par minute.
 * React compare cette valeur à chaque battement de l'horloge, et ne redessine que si elle a changé.
 */
const currentMinute = () => Math.floor(Date.now() / MINUTE)
// Une heure figée (`now`) n'a pas besoin de l'horloge : elle ne s'abonne à rien.
const noClock = () => () => {}
const frozenMinute = () => 0

/**
 * Hook : redessine le composant qui l'appelle à chaque minute, tant qu'il est affiché.
 * useSyncExternalStore branche React sur une valeur tenue hors de React (ici, la minute) ; son
 * troisième argument sert au pré-rendu du web, où l'heure n'est pas lue.
 */
const useMinuteClock = (frozen: boolean): number =>
  useSyncExternalStore(
    frozen ? noClock : subscribeClock,
    frozen ? frozenMinute : currentMinute,
    frozenMinute,
  )

// --- La date à écrire ---------------------------------------------------------------------------

/**
 * La date relative de `iso` dans la langue de l'appli, remise à jour chaque minute. Avant
 * l'hydratation du web, la date courte et la date complète sans l'heure qu'il est : on prend la date
 * elle-même pour « maintenant » (l'année n'est alors jamais écrite), pour que le pré-rendu et le
 * premier affichage du navigateur écrivent exactement le même texte.
 */
const useRelative = (iso: string, now?: Date): RelativeDate => {
  const { i18n } = useTranslation()
  const hydrated = useHydrated()
  useMinuteClock(now !== undefined || !hydrated)
  if (!hydrated) {
    const stable = now ?? new Date(iso)
    const label = shortDate(iso, i18n.language, stable)
    return { label, afterVerb: label, full: parisDateTime(iso, i18n.language, stable).dateTime }
  }
  return relativeDate(iso, i18n.language, now ?? new Date())
}

/**
 * Hook : la date relative en simple texte (« il y a 5 min »), pour une place qui n'attend que du
 * texte, comme le `detail` d'une ligne de liste (`ListRow`). Une date posée dans une phrase prend
 * `afterVerb` (« publié le 12 oct. ») ; le texte se remet à jour chaque minute, comme
 * `RelativeTime`.
 */
export const useRelativeDate = (
  iso: string,
  options: { now?: Date; afterVerb?: boolean } = {},
): string => {
  const date = useRelative(iso, options.now)
  return options.afterVerb ? date.afterVerb : date.label
}

// --- Le composant -------------------------------------------------------------------------------

/**
 * Le cadre qui cache la date complète à l'œil sans la cacher au lecteur d'écran (la recette
 * « sr-only » du web, comme `HiddenHeading`) : une case d'un point, hors du flux, qui rogne tout.
 */
const hiddenFrame = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
  ...(Platform.OS === 'web' ? { clipPath: 'inset(50%)', whiteSpace: 'nowrap' } : null),
} as unknown as ViewStyle

type Props = {
  /** La date, au format ISO du contrat (« 2026-10-12T08:00:00.000Z »). */
  iso: string
  /** L'heure qu'il est, pour figer le texte (tests, catalogue) ; l'horloge de l'appareil sinon. */
  now?: Date
  /** Le rôle du texte (une légende par défaut, comme les dates des cartes). */
  variant?: TextVariant
  tone?: TextTone
  numberOfLines?: number
}

export function RelativeTime({
  iso,
  now,
  variant = 'caption',
  tone = 'muted',
  numberOfLines,
}: Props) {
  const { label, full } = useRelative(iso, now)
  // Sur le web, la date complète se montre au survol : l'attribut `title`, que react-native-web ne
  // transmet pas (il ne garde que les propriétés qu'il connaît), est donc posé sur la balise.
  const hover = useRef<View>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = hover.current as unknown as HTMLElement | null
    node?.setAttribute?.('title', full)
  }, [full])

  if (Platform.OS !== 'web') {
    // Sur téléphone, VoiceOver et TalkBack lisent le nom donné (`accessibilityLabel`) à la place du
    // texte affiché : la date complète.
    return (
      <Text variant={variant} tone={tone} numberOfLines={numberOfLines} accessibilityLabel={full}>
        {label}
      </Text>
    )
  }
  // Sur le web, le nom d'un texte sans rôle n'est pas lu (le navigateur ignore le nom d'une balise
  // générique) : le texte court est caché au lecteur d'écran (`aria-hidden`), et la date complète
  // est écrite à côté, cachée à l'œil seulement (relecture ui-B3).
  return (
    <View>
      <View ref={hover} aria-hidden>
        <Text variant={variant} tone={tone} numberOfLines={numberOfLines}>
          {label}
        </Text>
      </View>
      <View style={hiddenFrame} pointerEvents="none">
        <Text variant={variant}>{full}</Text>
      </View>
    </View>
  )
}
