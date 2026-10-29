// Le fournisseur des toasts (refonte, tranche R1) : posé une fois autour de l'appli
// (app/_layout.tsx), il garde le toast affiché et donne à tout écran la fonction
// `useToast().show(texte)`. Le toast lui-même est dessiné par ui/Toast.tsx.
//
// Un « contexte » React (createContext) permet à un composant de lire une valeur fournie plus haut
// dans l'arbre sans la recevoir de chaque parent : ici, la fonction `show`.
//
// Les règles, toutes gardées ici :
// - `show` ne prend que du texte, venu de t() (règle de sécurité S7) : un élément React est refusé
//   au typage, et le texte est rendu par Text, donc jamais interprété comme du HTML ;
// - jamais d'action (règle J8, WCAG 2.2.1) : ce que dit un toast se retrouve aussi à l'écran ;
// - un seul à la fois : le nouveau remplace l'ancien, avec tout son temps de lecture ;
// - il reste 2,4 s (durations.toast), plus 60 ms par caractère au-delà de 20 ; la souris posée
//   dessus le retient, et son temps repart en entier quand elle s'en va ;
// - les lecteurs d'écran l'annoncent sans qu'il prenne le focus : une région « polie » (lue après
//   la phrase en cours) sur le web (role="status") et Android (accessibilityLiveRegion), et une
//   annonce directe sur iOS (AccessibilityInfo.announceForAccessibility), qui n'a pas de région
//   vivante. La région est toujours là, vide entre deux toasts : un lecteur d'écran n'annonce que
//   ce qui change dans une région qu'il connaît déjà.
import { durations, layout } from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AccessibilityInfo, Platform, View, type ViewStyle } from 'react-native'
import type { IconName } from '../Icon'
import { readingTime, Toast } from '../Toast'
import { useLayout } from './layout'
import { useCalmMotion } from './motion'
import { layerPosition, ToastLayer } from './toastLayer'

/**
 * Les poses de la mascotte qu'un toast peut montrer devant son texte. La mascotte arrive avec son
 * composant (ui/Mascot.tsx, même tranche) ; d'ici là, l'option est acceptée et rien ne s'affiche.
 */
export type ToastMascot = 'search' | 'wave' | 'fly' | 'sleep'

/** Ce qui peut accompagner le texte : une icône ou la mascotte, décoratives. Rien d'autre. */
export type ToastOptions = { icon?: IconName; mascot?: ToastMascot }

type ToastApi = {
  /** Affiche `text` (une phrase passée par t()) dans un toast, à la place de celui d'avant. */
  show: (text: string, options?: ToastOptions) => void
}

type Shown = { id: number; text: string } & ToastOptions

// Sans fournisseur (un test d'écran, le pré-rendu), `show` ne fait rien plutôt que de planter.
const ToastContext = createContext<ToastApi>({ show: () => {} })

/** Hook : la fonction qui affiche un toast. */
export const useToast = (): ToastApi => useContext(ToastContext)

// Au-dessus de la barre d'onglets à venir sur téléphone ; près du bas sur tablette et ordinateur.
const BOTTOM = { compact: 104, wide: 32 } as const

// Sur le web, la couche reste collée en bas de la fenêtre même si la page défile (position fixe,
// que react-native-web comprend mais que les types de React Native ignorent ; elle est rendue dans
// <body>, voir toastLayer.web.tsx). Sur téléphone, elle est posée en bas de l'écran racine, qui ne
// défile pas.
const pinned = { position: layerPosition } as ViewStyle

export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null)
  const [leaving, setLeaving] = useState(false)
  const calm = useCalmMotion()
  const { sizeClass } = useLayout()
  // Les minuteurs en cours (le départ, puis l'effacement) : une « ref » garde une valeur d'un
  // rendu à l'autre sans redessiner, ce qu'il faut pour pouvoir les annuler.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const nextId = useRef(0)

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }, [])

  // Lance le temps de lecture de `text` : à sa fin, le fondu de départ, puis l'effacement.
  const schedule = useCallback(
    (text: string) => {
      clearTimers()
      timers.current.push(
        setTimeout(() => {
          setLeaving(true)
          timers.current.push(setTimeout(() => setShown(null), durations.base))
        }, readingTime(text)),
      )
    },
    [clearTimers],
  )

  const show = useCallback(
    (text: string, options: ToastOptions = {}) => {
      nextId.current += 1
      setShown({ id: nextId.current, text, ...options })
      setLeaving(false)
      schedule(text)
      // iOS n'a pas de région vivante : on lui demande de lire la phrase, sans y poser le focus.
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text)
    },
    [schedule],
  )

  // La souris retient le toast ; quand elle s'en va, il a de nouveau tout son temps de lecture.
  const hoverChange = useCallback(
    (hovered: boolean) => {
      if (!shown) return
      if (hovered) {
        clearTimers()
        setLeaving(false)
      } else {
        schedule(shown.text)
      }
    },
    [shown, clearTimers, schedule],
  )

  // Les minuteurs s'arrêtent avec le fournisseur (l'appli qui se ferme, un test qui se termine).
  useEffect(() => clearTimers, [clearTimers])

  // useMemo : le même objet d'un rendu à l'autre (show ne change pas), pour que les écrans qui
  // lisent le contexte ne soient pas redessinés à chaque toast.
  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastLayer>
        <View
          // La région vivante, toujours présente. box-none : elle laisse passer les touchers vers la
          // page ; seule la pilule les reçoit (pour le survol).
          pointerEvents="box-none"
          {...(Platform.OS === 'web'
            ? { role: 'status' as const, 'aria-live': 'polite' as const }
            : { accessibilityLiveRegion: 'polite' as const })}
          style={{
            ...pinned,
            left: 0,
            right: 0,
            bottom: sizeClass === 'compact' ? BOTTOM.compact : BOTTOM.wide,
            alignItems: 'center',
            paddingHorizontal: layout.screenPadding.compact,
          }}
        >
          {shown ? (
            <Toast
              // Une clé par toast : le nouveau entre avec sa propre animation au lieu de reprendre
              // celle de l'ancien.
              key={shown.id}
              text={shown.text}
              icon={shown.icon}
              leaving={leaving}
              calm={calm}
              onHoverChange={hoverChange}
            />
          ) : null}
        </View>
      </ToastLayer>
    </ToastContext.Provider>
  )
}
