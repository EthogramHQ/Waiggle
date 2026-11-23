// La tuile d'un sceau (R19, rubrique « Mes sceaux » de « Ma récolte » et du profil) : le sceau de
// cire (ui/WaxSeal), son nom dessous en légende grasse, et, sur « Ma récolte » seulement, le jour où
// il a été gagné en légende discrète. Le nom suit le sceau : le sceau reste donc décoratif, et la
// tuile se lit par ses textes, une seule fois chacun.
//
// La date arrive déjà mise en forme par l'écran (« 12 nov. 2026 ») : la tuile ne formate rien,
// elle ne connaît ni la langue ni le fuseau. Le nom ne se coupe jamais par « … » : il passe sur
// deux lignes si la colonne est étroite (« Premier retour réglé »).
import { Stack } from './Stack'
import { Text } from './Text'
import { WaxSeal, type WaxSealProps } from './WaxSeal'

type Props = {
  /** Le sceau : son icône, sa matière, sa taille. Son `label` est ignoré : le nom le dit déjà. */
  seal: WaxSealProps
  /** Le nom du sceau (« Premier retour réglé »), déjà traduit. */
  name: string
  /** Le jour où il a été gagné, déjà mis en forme ; sans date, aucune ligne. */
  date?: string
}

export function SealTile({ seal, name, date }: Props) {
  return (
    <Stack gap="xs" align="center">
      {/* Toujours décoratif ici, quel que soit le `label` reçu : la légende juste dessous dit le
          nom, un lecteur d'écran ne doit pas l'entendre deux fois. */}
      <WaxSeal {...seal} label="" />
      <Text variant="caption" weight={700} align="center">
        {name}
      </Text>
      {date !== undefined && (
        <Text variant="caption" tone="muted" align="center">
          {date}
        </Text>
      )}
    </Stack>
  )
}
