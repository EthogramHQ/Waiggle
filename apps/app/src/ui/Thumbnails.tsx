// Une bande de vignettes, sous la couverture d'un projet : toucher une vignette affiche cette photo
// en grand. Chaque vignette est un bouton nommé (« Photo 2 sur 4 »), et la photo affichée est
// annoncée comme sélectionnée aux lecteurs d'écran.
import { borders, layout, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import { Pressable, ScrollView } from 'react-native'
import type { CoverImage } from './ProjectCover'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  items: { key: string; image: CoverImage }[]
  selected: number
  onSelect: (index: number) => void
}

// Au moins la taille d'une cible à toucher (44 points), un peu plus pour bien voir la photo.
const SIZE = layout.touchTarget + space.xl

export function Thumbnails({ items, selected, onSelect }: Props) {
  const { colors } = useTheme()
  return (
    // ScrollView horizontal : la bande défile si les vignettes dépassent la largeur de l'écran.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
    >
      {items.map(({ key, image }, index) => {
        const isSelected = index === selected
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={image.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(index)}
            style={{
              width: SIZE,
              height: SIZE,
              borderRadius: radii.small,
              overflow: 'hidden',
              // La photo affichée est entourée de miel ; les autres, d'un trait discret.
              borderWidth: isSelected ? borders.focus : borders.hairline,
              borderColor: isSelected ? colors.honey : colors.outline,
            }}
          >
            <Image
              source={image.source}
              placeholder={image.thumbhash ? { thumbhash: image.thumbhash } : null}
              contentFit="cover"
              accessible={false}
              style={{ width: '100%', height: '100%', backgroundColor: colors.honeySoft }}
            />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
