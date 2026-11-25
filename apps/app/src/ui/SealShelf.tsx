// Les sceaux d'un membre sur sa page (R19, planches R19-Profil et R19-Membre) : sous le titre
// « Mes sceaux · 2 » (ou « Ses sceaux · 2 »), ses tuiles de sceau (`SealTile`), sans date.
// Deux formes, choisies par l'écran :
// - `row` (téléphone) : une rangée qui défile sous le doigt, pour que la page ne s'allonge pas
//   d'un sceau à l'autre ; elle ne bouge jamais seule ;
// - `grid` (la colonne du profil sur ordinateur) : une grille de 4 sceaux par rangée.
// C'est une liste pour les lecteurs d'écran (« liste, 2 éléments »), chaque tuile lue par son nom.
import { layout, space } from '@ruche/brand'
import { ScrollView, View } from 'react-native'
import { CardGrid } from './CardGrid'
import { SealTile } from './SealTile'
import type { WaxSealProps } from './WaxSeal'

/** Un sceau gagné : sa clé (son code), son dessin et son nom déjà traduit. */
export type ShelfSeal = {
  key: string
  icon: WaxSealProps['icon']
  matter: WaxSealProps['matter']
  name: string
}

type Props = {
  seals: ShelfSeal[]
  layout: 'row' | 'grid'
}

/**
 * La largeur d'une tuile : le sceau (60) et la place d'un nom de deux mots sur deux lignes
 * (« Premier retour réglé »). Dans la rangée, chaque tuile a cette largeur ; dans la grille, c'est
 * sa largeur minimale (4 par rangée dans la colonne de 360 points).
 */
const TILE_WIDTH = layout.seal.regular + space.xl

export function SealShelf({ seals, layout: shape }: Props) {
  const tile = (seal: ShelfSeal) => (
    <SealTile
      seal={{ icon: seal.icon, matter: seal.matter, size: 'regular', label: '' }}
      name={seal.name}
    />
  )

  if (shape === 'grid') {
    return (
      <CardGrid minWidth={TILE_WIDTH} gap="sm" columns={4}>
        {seals.map((seal) => (
          <View key={seal.key}>{tile(seal)}</View>
        ))}
      </CardGrid>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="list"
      contentContainerStyle={{ gap: space.sm }}
    >
      {seals.map((seal) => (
        <View key={seal.key} role="listitem" style={{ width: TILE_WIDTH }}>
          {tile(seal)}
        </View>
      ))}
    </ScrollView>
  )
}
