// La mise en page des réglages sur ordinateur (tranche R2) : la colonne des rubriques (SettingsNav)
// à gauche, étroite et fixe, et la rubrique ouverte à droite, qui prend le reste. Le titre de la
// rubrique est un titre de section (h2) : celui de la page (« Réglages », h1) est au-dessus.
// Sur téléphone et tablette, l'écran n'en a pas besoin : la liste et la rubrique y sont deux pages.
import { layout, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** La colonne des rubriques. */
  nav: ReactNode
  /** Le titre de la rubrique ouverte (« Langue »). */
  title: string
  /** Le contenu de la rubrique. */
  children: ReactNode
}

export function SettingsColumns({ nav, title, children }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xxl }}>
      {/* La colonne : une carte blanche, de la largeur d'une colonne latérale. */}
      <View style={{ width: layout.settingsNavWidth, flexShrink: 0 }}>
        <Surface variant="grouped" padding="sm">
          {nav}
        </Surface>
      </View>
      {/* minWidth 0 : sur le web, sans lui, un long texte élargirait la colonne hors de la page. */}
      <View style={{ flex: 1, minWidth: 0, gap: space.lg }}>
        <Text variant="heading" heading={2}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  )
}
