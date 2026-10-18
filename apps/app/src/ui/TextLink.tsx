// Un lien en texte souligné, pour une action secondaire dans une phrase ou sous un formulaire
// (« Créer un compte », « Changer d'adresse »). Pour l'action principale : un Button.
import { layout } from '@ruche/brand'
import { Pressable } from 'react-native'
import { Text, type Tone } from './Text'

type Props = {
  label: string
  onPress: () => void
  tone?: Tone
  /** link : mène ailleurs (une autre page) ; button : agit sur place. */
  role?: 'link' | 'button'
}

export function TextLink({ label, onPress, tone = 'default', role = 'link' }: Props) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      onPress={onPress}
      // La zone à toucher fait au moins 44 points de côté, même autour d'un mot court. (hitSlop, qui
      // agrandit la zone sans changer l'allure, est ignoré sur le web : on donne donc une vraie taille.)
      style={({ pressed }) => ({
        minHeight: layout.touchTarget,
        minWidth: layout.touchTarget,
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="callout" weight={700} tone={tone} underline>
        {label}
      </Text>
    </Pressable>
  )
}
