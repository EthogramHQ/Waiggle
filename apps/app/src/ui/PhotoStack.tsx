// Une petite pile de photos (tranche R2), en tête de la feuille « Supprimer ton compte » : la photo
// du membre, puis les couvertures de ses projets (trois au plus), qui se chevauchent un peu, en
// éventail. Un décor : la feuille le cache aux lecteurs d'écran (la liste dit déjà ce qui part).
import { borders, radii } from '@ruche/brand'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le membre : sa photo, ou ses initiales sans photo. */
  name: string
  avatar: ImageSource | null
  /** Les couvertures des projets (sans couverture : une tuile de miel). Trois au plus sont montrées. */
  covers: { key: string; source: ImageSource | null; thumbhash?: string | null }[]
}

/** La taille d'une tuile, son chevauchement et l'angle de l'éventail. */
const TILE = 52
const OVERLAP = 18
const TILT = 6
const MAX_COVERS = 3

export function PhotoStack({ name, avatar, covers }: Props) {
  const { colors } = useTheme()
  const shown = covers.slice(0, MAX_COVERS)
  // Un liseré de la couleur de la feuille autour de chaque tuile : elles se détachent l'une de
  // l'autre là où elles se chevauchent.
  const edge = { borderWidth: 2 * borders.hairline, borderColor: colors.sheet }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ ...edge, borderRadius: radii.pill, zIndex: shown.length + 1 }}>
        <Avatar name={name} source={avatar} label="" size={TILE} />
      </View>
      {shown.map((cover, index) => (
        <View
          key={cover.key}
          style={{
            ...edge,
            width: TILE,
            height: TILE,
            marginLeft: -OVERLAP,
            borderRadius: radii.small,
            overflow: 'hidden',
            backgroundColor: colors.honeySoft,
            zIndex: shown.length - index,
            // L'éventail : une tuile sur deux penche à gauche, l'autre à droite.
            transform: [{ rotate: `${index % 2 === 0 ? TILT : -TILT}deg` }],
          }}
        >
          {cover.source ? (
            <Image
              source={cover.source}
              placeholder={cover.thumbhash ? { thumbhash: cover.thumbhash } : null}
              contentFit="cover"
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}
        </View>
      ))}
    </View>
  )
}
