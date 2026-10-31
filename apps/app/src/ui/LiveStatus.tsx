// Une ligne d'état annoncée poliment aux lecteurs d'écran (relecture de l'interface de R3, C3) :
// « 3 projets, 1 membre, 0 outil » quand les résultats d'une recherche arrivent, « Recherche en
// cours… » pendant l'attente. Elle ne prend jamais le focus : le lecteur d'écran la lit après la
// phrase en cours.
//
// Trois règles, les mêmes que pour le toast (theme/toast.tsx) :
// - la région est toujours montée, vide plutôt qu'absente : un lecteur d'écran n'annonce que ce qui
//   change dans une région qu'il connaît déjà ; une région qui apparaît déjà pleine est muette ;
// - sur le web (role="status") et sur Android (accessibilityLiveRegion), c'est la région qui
//   annonce ; iOS n'en a pas : on demande à VoiceOver de lire chaque nouveau texte
//   (AccessibilityInfo.announceForAccessibility) ;
// - `visible={false}` la garde lue mais cachée à l'œil, quand l'écran dit déjà la même chose
//   autrement (« Aucun résultat », sous l'abeille à la loupe). Vide, elle est cachée aussi.
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Platform, View, type ViewStyle } from 'react-native'
import { Text } from './Text'

type Props = {
  /** Ce qui est annoncé, venu de t() ; une chaîne vide quand il n'y a rien à dire. */
  message: string
  /** Faux : la ligne reste lue par les lecteurs d'écran, mais ne se dessine pas. Vrai par défaut. */
  visible?: boolean
}

/**
 * Le texte « lu mais pas montré » : une boîte d'un point, qui ne prend aucune place dans la page
 * (`position: absolute`) et rogne son texte. `opacity: 0` le cache aussi sur téléphone ; sur le web,
 * `clipPath` le rogne entièrement (l'opacité ne retire rien de l'arbre d'accessibilité : le texte
 * reste lu). `clipPath` manque aux types de React Native, d'où la conversion.
 */
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  opacity: 0,
  ...(Platform.OS === 'web' ? { clipPath: 'inset(50%)', whiteSpace: 'nowrap' } : null),
} as ViewStyle

export function LiveStatus({ message, visible = true }: Props) {
  // Le texte déjà connu de VoiceOver : au premier rendu, la page entière est lue de toute façon ;
  // seuls les changements suivants sont annoncés (comme la région du web).
  const announced = useRef(message)
  useEffect(() => {
    if (message === announced.current) return
    announced.current = message
    if (message !== '' && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message)
  }, [message])

  return (
    <View
      // accessible : la ligne est lue d'un seul tenant, comme le message poli de Notice.
      accessible
      role="status"
      // Android lit la région quand son texte change ; « polite » : après la phrase en cours.
      accessibilityLiveRegion="polite"
      // Vide, elle ne prend aucune place : pas de ligne blanche entre deux blocs de la page.
      style={visible && message !== '' ? undefined : visuallyHidden}
    >
      <Text variant="callout" tone="muted">
        {message}
      </Text>
    </View>
  )
}
