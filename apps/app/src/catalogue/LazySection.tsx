// Une section du catalogue montée seulement près de la vue (tranche R18, « Les finitions »).
//
// Pourquoi : le catalogue montait tous ses exemples d'un coup, environ 56 000 éléments sur une page
// de 370 000 pixels de haut. Mesuré le 22/11/2026 à 1 440 × 900 : une première tâche de 77 s, dont
// 37 s de mises en page forcées (react-native-web mesure les vues pour `onLayout`, et chaque mesure
// recalcule toute la page), puis des tâches de 1 à 6 s sans fin : les boucles d'animation des
// exemples (lumière vivante, logo, squelettes) relisent la taille d'un élément à chaque image, ce
// qui force une nouvelle mise en page de toute la page. Moins d'éléments montés, c'est donc à la
// fois un premier affichage plus court et des images moins chères.
//
// Comment : une place réservée (le titre et une hauteur) tient la section tant qu'elle est loin.
// `IntersectionObserver`, une interface du navigateur, prévient quand la place approche de la vue
// (à `NEAR` pixels près) : les exemples sont alors montés ; quand elle s'en éloigne de nouveau, ils
// sont démontés et la place reprend leur hauteur mesurée, pour que rien ne saute sous les yeux.
// Le montage passe par `startTransition` : React le prépare par petits morceaux, en rendant la main
// au navigateur entre deux, au lieu d'une longue tâche qui fige la page.
//
// Les captures (scripts/shots.mjs) veulent tout le catalogue d'un coup : l'adresse le demande
// (`?tout=1`). La page est pré-rendue sans connaître son adresse complète : avant l'hydratation,
// chaque section rend donc la même place réservée, quelle que soit l'adresse, et `?tout=1` n'est lu
// qu'après `useHydrated()` (sinon React verrait deux pages différentes, voir ui/theme/hydration.ts).
// Sur téléphone, où rien n'est pré-rendu et où `IntersectionObserver` n'existe pas, tout est monté
// d'emblée, comme avant.
import { useLocalSearchParams } from 'expo-router'
import { type ReactNode, startTransition, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'

/** La marge, en pixels, au-dessus et au-dessous de la fenêtre, où une section est déjà montée. */
const NEAR = 1200
/** La hauteur d'une place réservée jamais mesurée : à peu près celle d'une section. */
const DEFAULT_HEIGHT = 1600

/** L'adresse demande-t-elle tout le catalogue d'un coup (`?tout=1`) ? */
const useEverything = (): boolean => {
  const { tout } = useLocalSearchParams<{ tout?: string }>()
  return tout === '1'
}

/** Ce navigateur sait-il prévenir de l'approche d'un élément ? (Non sur téléphone ni sous Jest.) */
const canObserve = () => typeof IntersectionObserver !== 'undefined'

/**
 * Le cadre qui fait défiler la section. L'écran défile dans une `ScrollView` (une `div` qui défile),
 * pas la page : observée depuis la fenêtre, une section hors de ce cadre est coupée par lui, et la
 * marge `NEAR` n'y changerait rien (elle ne s'applique qu'à la racine de l'observateur). La racine
 * est donc ce cadre, le premier parent qui défile ; sans lui, la fenêtre (`null`).
 */
const scrollingFrame = (element: Element): Element | null => {
  if (typeof getComputedStyle !== 'function') return null
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
  }
  return null
}

export function LazySection({ title, children }: { title: string; children: ReactNode }) {
  const hydrated = useHydrated()
  const everything = useEverything()
  // `near` : la section est près de la vue, d'après le navigateur. Faux au départ, partout : le
  // premier affichage est celui de la page pré-rendue.
  const [near, setNear] = useState(false)
  // La hauteur de la section la dernière fois qu'elle était montée, reprise par la place réservée.
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  // Une « ref » : sur le web, celle d'une View de react-native-web est l'élément du DOM lui-même.
  const frame = useRef<View | null>(null)

  // Monter tout de suite : après l'hydratation, si l'adresse le demande ou si le navigateur ne
  // sait pas observer (téléphone).
  const always = hydrated && (everything || !canObserve())

  useEffect(() => {
    if (!hydrated || always) return
    const element = frame.current as unknown as Element | null
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1]
        if (!last) return
        // En sortant, la hauteur vient de l'observateur lui-même : la lire sur l'élément forcerait
        // une mise en page de toute la page, ce qu'on cherche justement à éviter.
        if (!last.isIntersecting && last.boundingClientRect.height > 0) {
          setHeight(last.boundingClientRect.height)
        }
        startTransition(() => setNear(last.isIntersecting))
      },
      { root: scrollingFrame(element), rootMargin: `${NEAR}px 0px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hydrated, always])

  const mounted = always || (hydrated && near)
  return (
    <View ref={frame}>
      {mounted ? (
        children
      ) : (
        // La place réservée : le titre de la section, lu et vu, et la hauteur qu'elle occupera.
        // Une taille écrite ici, dans un outil de développement, comme `OnLight` du catalogue.
        <View style={{ minHeight: height }}>
          <Stack gap="md">
            <Text variant="heading" heading={2}>
              {title}
            </Text>
          </Stack>
        </View>
      )}
    </View>
  )
}
