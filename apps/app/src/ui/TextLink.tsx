// Un lien en texte souligné, pour une action secondaire dans une phrase ou sous un formulaire
// (« Créer un compte », « Changer d'adresse »). Pour l'action principale : un Button.
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
      // hitSlop agrandit la zone qu'on peut toucher autour du texte, sans changer son allure.
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text variant="callout" weight={700} tone={tone} underline>
        {label}
      </Text>
    </Pressable>
  )
}
