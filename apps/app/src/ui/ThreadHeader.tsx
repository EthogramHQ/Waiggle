// L'en-tête d'un fil de retours (tranche R7b, planches « Fil » et « Desktop », point 10 des planches
// validées) : en haut du fil privé entre un testeur et l'auteur, la photo de l'autre personne, son
// nom en titre, le projet, et, quand l'écran la donne (sur ordinateur), la date d'arrivée dans les
// testeurs (« Dans les testeurs depuis le 2 nov. »), déjà formatée par l'écran.
//
// - Le nom est un titre de niveau 2 (`<h2>` sur le web) : c'est là que le focus arrive quand on ouvre
//   un fil à côté de la liste, sur ordinateur (relecture du plan, ui-B1). `headingRef` tient donc le
//   titre lui-même, pas la rangée qui l'entoure : le lecteur d'écran lit le nom en arrivant.
// - La photo est un décor : le nom écrit à côté dit déjà de qui il s'agit. Elle est cachée aux
//   lecteurs d'écran (sans cela, on entendrait « Inès Morel, image » puis « Inès Morel, titre »).
// - Un nom ne se coupe jamais par « … » : il passe sur deux lignes, et un nom sans espace se coupe
//   n'importe où plutôt que de sortir de l'écran (320 points, 200 % de texte).
import { space } from '@ruche/brand'
import type { Ref } from 'react'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import { Text } from './Text'
import { useLayout } from './theme/layout'

type Props = {
  /** Le nom affiché de l'autre personne du fil (« Inès Morel »). */
  name: string
  /** Sa photo ; null : ses initiales sur un rond de miel. */
  avatar: ImageSource | null
  /** Le titre du projet dont parle le fil. */
  project: string
  /** La date d'arrivée dans les testeurs, déjà formatée ; absente ou null : pas de ligne. */
  since?: string | null
  /** Le titre (le nom), pour que l'écran y pose le focus à l'ouverture du fil. */
  headingRef?: Ref<View>
}

export function ThreadHeader({ name, avatar, project, since, headingRef }: Props) {
  // Comme sur les planches : sur ordinateur, l'en-tête du panneau de droite est plus ample (photo de
  // 44 points, titre de section) ; sur téléphone, il tient dans la barre du haut, près du Retour
  // (photo de 36 points, titre de barre).
  const wide = useLayout().sizeClass === 'wide'
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? space.md : space.sm }}>
      <View
        // Caché aux lecteurs d'écran, partout (web, iOS, Android) : un décor près du nom.
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // La photo garde son rond : elle ne rétrécit pas quand le nom est long.
        style={{ flexShrink: 0 }}
      >
        <Avatar name={name} source={avatar} label="" size={wide ? 44 : 36} />
      </View>
      {/* Le texte prend la place qui reste et peut rétrécir (sur le web, une vue ne rétrécit pas
          sans `flexShrink` et `minWidth: 0`). */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
        <Text
          variant={wide ? 'heading' : 'headline'}
          heading={2}
          focusRef={headingRef}
          breakAnywhere
        >
          {name}
        </Text>
        <Text variant="caption" tone="muted">
          {project}
        </Text>
        {since ? (
          <Text variant="caption" tone="muted">
            {since}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
