// La photo de profil d'un membre, en rond. Sans photo : deux initiales sur un rond de miel (Miel 2,
// tranche R1), en graisse très forte (`initialsWeight`).
// La photo vient de l'API et n'est montrée qu'aux membres : l'écran donne une `source` toute prête
// (adresse et session, voir src/api/media.ts).
import { initialsWeight } from '@ruche/brand'
import { Image, View } from 'react-native'
import type { ImageSource } from './image'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = { name: string; source: ImageSource | null; label: string; size?: number }

/**
 * Les deux initiales d'un nom : la première lettre du premier mot et celle du dernier (« Léa
 * Martin » → « LM »), ou les deux premières lettres d'un mot seul (« Papi » → « PA »).
 * Array.from découpe le texte lettre par lettre sans couper une lettre accentuée ni un emoji en
 * deux (un emoji compte pour deux unités dans une chaîne JavaScript).
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]
  if (!first) return '?'
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const letters = last ? [Array.from(first)[0], Array.from(last)[0]] : Array.from(first).slice(0, 2)
  // toLocaleUpperCase : « é » devient « É », selon les règles de la langue.
  return letters.join('').toLocaleUpperCase()
}

export function Avatar({ name, source, label, size = 96 }: Props) {
  const { colors } = useTheme()
  const round = { width: size, height: size, borderRadius: size / 2 }
  if (source) {
    // accessibilityLabel : ce que les lecteurs d'écran annoncent à la place de l'image.
    return (
      <Image
        accessibilityLabel={label}
        source={source}
        style={{ ...round, backgroundColor: colors.honeySoft }}
      />
    )
  }
  // Les initiales : une variante de texte proportionnée à la taille du rond.
  const variant = size >= 72 ? 'title1' : size >= 40 ? 'headline' : 'caption'
  return (
    <View
      accessible
      // Un rôle d'image : sur le web, le navigateur ignore le nom d'un bloc qui n'en a pas.
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        ...round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.honey,
      }}
    >
      {/* maxScale 1 : les initiales restent dans leur rond quand le texte de l'appareil grandit. */}
      <Text variant={variant} weight={initialsWeight} tone="onHoney" maxScale={1}>
        {initialsOf(name)}
      </Text>
    </View>
  )
}
