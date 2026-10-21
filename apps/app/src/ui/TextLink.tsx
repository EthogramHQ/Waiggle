// Un lien en texte souligné, pour une action secondaire dans une phrase ou sous un formulaire
// (« Créer un compte », « Changer d'adresse »). Pour l'action principale : un Button.
import { layout } from '@ruche/brand'
import type { Ref } from 'react'
import { Pressable, type View } from 'react-native'
import { enterActivates } from './keyboard'
import { Text, type Tone } from './Text'

type Props = {
  label: string
  onPress: () => void
  tone?: Tone
  /** link : mène ailleurs (une autre page) ; button : agit sur place. */
  role?: 'link' | 'button'
  /**
   * Indisponible pour l'instant (« Annuler » pendant un envoi) : il pâlit, ne réagit plus, et les
   * lecteurs d'écran l'annoncent comme désactivé (aria-disabled).
   */
  disabled?: boolean
  /** Pour y poser le focus du clavier quand l'élément qui l'avait disparaît (voir focus.ts). */
  ref?: Ref<View>
}

export function TextLink({
  label,
  onPress,
  tone = 'default',
  role = 'link',
  disabled = false,
  ref,
}: Props) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole={role}
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      // Un lien s'ouvre avec Entrée sur le web (react-native-web ne le fait que pour un bouton).
      {...(role === 'link' ? enterActivates(onPress, disabled) : null)}
      onPress={onPress}
      // La zone à toucher fait au moins 44 points de côté, même autour d'un mot court. (hitSlop, qui
      // agrandit la zone sans changer l'allure, est ignoré sur le web : on donne donc une vraie taille.)
      style={({ pressed }) => ({
        minHeight: layout.touchTarget,
        minWidth: layout.touchTarget,
        justifyContent: 'center',
        opacity: disabled ? 0.55 : pressed ? 0.6 : 1,
      })}
    >
      <Text variant="callout" weight={700} tone={tone} underline>
        {label}
      </Text>
    </Pressable>
  )
}
