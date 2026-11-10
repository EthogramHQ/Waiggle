// Le rappel du projet en tête d'une feuille (R7a, planche R7-MAJ-Publier) : sa vignette, son titre
// et une ligne de détail (« Dernière version : v1.2, il y a 3 semaines »). Il dit d'un coup d'œil
// pour quel projet on écrit. Rien n'y est touchable : la feuille a ses propres boutons.
//
// La vignette est un décor (le titre nomme déjà le projet) : cachée aux lecteurs d'écran. Sans
// photo, la lumière miel d'une couverture sans photo (`ProjectCover`). Le détail est donné par
// l'écran : un texte, ou une date relative mise dans sa phrase (`RelativeTime phrase`).
import { layout, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Text } from './Text'

type Props = {
  /** La première photo du projet ; null : la lumière miel d'un projet sans photo. */
  image: CoverImage | null
  title: string
  /** La ligne sous le titre : un texte (« Première mise à jour »), ou un `RelativeTime`. */
  detail?: ReactNode
}

/** La vignette a la hauteur d'un champ : assez pour reconnaître la photo, sans voler la feuille. */
const THUMB = layout.controlHeight.regular

export function ProjectStrip({ image, title, detail }: Props) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'stretch' }}
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ width: THUMB, height: THUMB, flexShrink: 0 }}
      >
        <ProjectCover height={THUMB} radius="small" image={image} />
      </View>
      {/* Le texte prend le reste de la rangée et passe à la ligne (texte agrandi, titre long) :
          `flexShrink` et `minWidth: 0`, sinon il pousserait hors de la feuille. */}
      <View style={{ flexShrink: 1, flexGrow: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }}>
        {/* Le titre entier, jamais coupé par « … » : la feuille dit pour quel projet on écrit. */}
        <Text weight={600}>{title}</Text>
        {typeof detail === 'string' ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : (
          detail
        )}
      </View>
    </View>
  )
}
