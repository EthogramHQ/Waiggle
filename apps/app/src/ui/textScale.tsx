// Savoir si le texte est agrandi (R5b ; `useTextScale` vient de SearchField, où il a servi d'abord).
// Sur téléphone, le système le dit (`fontScale`). Sur le web, `fontScale` vaut toujours 1 : un texte
// agrandi (réglage du navigateur, essais à 200 %) ne se voit qu'à la taille des lettres, et seule la
// hauteur d'une ligne de texte cachée permet de le lire.
import { textStyles } from '@ruche/brand'
import { useState } from 'react'
import { type LayoutChangeEvent, Platform, useWindowDimensions, View } from 'react-native'
import { Text } from './Text'

/**
 * Hook : la taille du texte par rapport à la normale (1 au texte normal, 2 à 200 %), lue sur la
 * hauteur d'une ligne de texte invisible. Rend la mesure et la ligne à poser (hors du flux, cachée à
 * l'œil et aux lecteurs d'écran).
 */
export const useTextScale = (sample: string) => {
  const [scale, setScale] = useState(1)
  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height / textStyles.body.lineHeight
    // Une mesure à 0 (vue pas encore dessinée) ne dit rien.
    if (next > 0 && Math.abs(next - scale) > 0.05) setScale(next)
  }
  const probe = (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={measure}
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }}
    >
      <Text numberOfLines={1} selectable={false}>
        {sample}
      </Text>
    </View>
  )
  return { scale, probe }
}

/** À partir de cette taille de texte (150 %), une mise en page en colonnes étroites ne tient plus. */
const LARGE_TEXT = 1.5

/**
 * Hook : le texte est-il très agrandi ? Rend la réponse et, sur le web seulement, la ligne cachée à
 * poser dans le composant (sur téléphone, le système répond sans elle).
 */
export const useLargeText = () => {
  const { fontScale } = useWindowDimensions()
  const { scale, probe } = useTextScale('M')
  return {
    large: fontScale >= LARGE_TEXT || scale >= LARGE_TEXT,
    probe: Platform.OS === 'web' ? probe : null,
  }
}
