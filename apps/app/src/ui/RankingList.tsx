// La liste d'un classement de la semaine (R19, planche R19-Classement) : une ligne par membre, du
// plus de pollen au moins, qui mène à sa page. Chaque ligne : son rang (les trois premiers
// seulement), sa photo, son nom, son pollen de la semaine.
//
// Ce qui se lit :
// - seuls les trois premiers ont un rang, une alvéole numérotée, à l'œil comme au lecteur d'écran
//   (option b4) : après, ni numéro ni style, le bas ne se distingue pas ;
// - chaque ligne est un lien lu d'un trait, « 1er, Malik, 340 pollen » (relecture d'interface du
//   plan, UI-2). Pas de liste ordonnée : elle numéroterait tout le monde (« 4 sur 5 »), ce que la
//   planche refuse ;
// - des membres à égalité de pollen ont le même rang (c'est l'API qui le calcule) ;
// - sa propre ligne est surlignée, et le lecteur d'écran ajoute « toi » après son nom ; « toi »
//   n'est jamais écrit à l'écran.
import { space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import { ListGroup, ListRow } from './ListGroup'
import { useLinkPress } from './linkPress'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type RankingRow = {
  /** Le rang calculé par l'API (des ex aequo ont le même). */
  rank: number
  name: string
  /** L'adresse de sa photo, ou null (ses initiales). */
  avatar: string | null
  /** Son pollen de la semaine. */
  pollen: number
  /** La ligne du membre qui lit le classement. */
  self: boolean
  /** L'adresse de sa page (`/members/<id>`). */
  href: string
}

type Props = {
  rows: readonly RankingRow[]
  /**
   * Donne la source d'une photo à partir de son adresse (l'écran y ajoute ce qu'il faut pour la
   * lire, comme `HiveMemberList`). Absent : l'adresse telle quelle.
   */
  toSource?: (url: string | null) => ImageSource | null
}

/** La photo d'une ligne, en points ; l'alvéole du rang, un peu plus petite. */
// Resserrées (32 et 24, un petit écart entre les deux) pour laisser au nom sa place à côté du
// pollen sur 320 points : à 28 et 36, le pollen passait sous le nom d'une ligne sur deux (capture
// du catalogue à 390 px, colonne de 322).
const AVATAR = 32
const RANK_CELL = 24

export function RankingList({ rows, toSource }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const linkPress = useLinkPress()

  const rankLabel = (rank: number) =>
    rank === 1
      ? t(($) => $.game.rankings.rank.first)
      : rank === 2
        ? t(($) => $.game.rankings.rank.second)
        : t(($) => $.game.rankings.rank.third)

  return (
    <ListGroup list>
      {rows.map((row) => {
        const ranked = row.rank >= 1 && row.rank <= 3
        // Le nom lu : « Léa, toi » pour sa propre ligne, son nom pour les autres.
        const spokenName = row.self ? t(($) => $.game.rankings.you, { name: row.name }) : row.name
        const spoken = ranked
          ? t(($) => $.game.rankings.rowRanked, {
              rank: rankLabel(row.rank),
              name: spokenName,
              amount: row.pollen,
            })
          : t(($) => $.game.rankings.row, { name: spokenName, amount: row.pollen })
        const source = toSource ? toSource(row.avatar) : row.avatar ? { uri: row.avatar } : null
        return (
          // La clé : l'adresse de la page du membre, unique dans un classement.
          <View
            key={row.href}
            // Sa propre ligne, surlignée du miel doux (la couleur « non lu » de la planche).
            style={row.self ? { backgroundColor: colors.honeySoft } : null}
          >
            <ListRow
              label={row.name}
              spokenLabel={spoken}
              href={row.href}
              onPress={linkPress(row.href)}
              leading={
                // Le rang et la photo : du décor, le nom lu de la ligne dit déjà les deux. La
                // place du rang est gardée vide après le troisième : les photos restent alignées.
                <View
                  aria-hidden
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    flexShrink: 0,
                  }}
                >
                  <View style={{ width: RANK_CELL, flexShrink: 0 }}>
                    {ranked ? <RankCell rank={row.rank} /> : null}
                  </View>
                  <Avatar name={row.name} source={source} label="" size={AVATAR} />
                </View>
              }
              detailRight
              detail={
                <Text weight={700} tabular>
                  {t(($) => $.game.rankings.pollen, { amount: row.pollen })}
                </Text>
              }
            />
          </View>
        )
      })}
    </ListGroup>
  )
}

/** L'alvéole numérotée d'un des trois premiers : un hexagone miel, pointe en haut, son rang dedans. */
function RankCell({ rank }: { rank: number }) {
  const { colors } = useTheme()
  // Un hexagone pointe en haut, dans un carré de RANK_CELL : ses six coins sur le cercle de rayon
  // la moitié du carré.
  const r = RANK_CELL / 2
  const corners = [-90, -30, 30, 90, 150, 210]
    .map((degrees) => {
      const angle = (degrees * Math.PI) / 180
      return `${(r + r * Math.cos(angle)).toFixed(2)} ${(r + r * Math.sin(angle)).toFixed(2)}`
    })
    .join(' L')
  return (
    <View
      style={{
        width: RANK_CELL,
        height: RANK_CELL,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={RANK_CELL}
        height={RANK_CELL}
        viewBox={`0 0 ${RANK_CELL} ${RANK_CELL}`}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Path d={`M${corners}Z`} fill={colors.honey} />
      </Svg>
      <Text variant="caption" weight={700} tone="onHoney" tabular>
        {String(rank)}
      </Text>
    </View>
  )
}
