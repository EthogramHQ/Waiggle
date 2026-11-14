// Le sélecteur de ruches du Fil (tranche R10, F-Fil13) : « Tout · Famille · Amis du jeudi », une
// pastille par ruche dont le membre fait partie, au-dessus du Fil. « Tout » est le Fil d'aujourd'hui
// (ses abonnements) ; une ruche montre le Fil de tous ses membres.
//
// Ce sont des onglets, bâtis sur ui/Tabs : une capsule de verre, la pastille choisie en goutte
// blanche ; une liste d'onglets nommée (« Ruches du fil »), chaque pastille un onglet qui dit s'il est
// choisi et quel panneau il commande. Le panneau, c'est le Fil, dessiné par l'écran : il passe son
// identifiant (`panelId`) et le pose sur la liste du Fil. Au clavier (web), un seul arrêt de Tab et
// les flèches. La rangée ne passe jamais à la ligne : elle défile de côté et amène la pastille choisie
// entièrement en vue (une ruche lue dans l'adresse, huit ruches sur un téléphone).
//
// Ce n'est pas ui/FilterPills (R6b) : là, des boutons radio qui filtrent une liste en miel ; ici,
// des onglets qui changent tout le contenu du Fil.
import { useTranslation } from 'react-i18next'
import { Tabs } from './Tabs'

/** Une ruche du sélecteur : son identifiant et son nom (`null` : retiré par la modération). */
export type HivePill = { id: string; name: string | null }

/** La valeur de la pastille « Tout ». */
export const ALL_HIVES = 'all'

type Props = {
  /** Les ruches du membre, dans l'ordre où les montrer (après « Tout »). */
  hives: readonly HivePill[]
  /** La pastille choisie : `'all'` pour « Tout », sinon l'identifiant d'une ruche. */
  value: string
  /** La pastille touchée (ou atteinte par les flèches) : `'all'` ou l'identifiant de la ruche. */
  onChange: (value: string) => void
  /** L'identifiant du panneau qu'elles commandent : la liste du Fil, posée par l'écran. */
  panelId: string
}

export function HivePills({ hives, value, onChange, panelId }: Props) {
  const { t } = useTranslation()
  // « Tout » en tête, puis chaque ruche ; une ruche dont le nom a été retiré se lit « Ruche sans
  // nom ». Les clés sont les identifiants (stables : une ruche renommée garde sa pastille).
  const tabs = [
    { key: ALL_HIVES, label: t(($) => $.hives.pills.all) },
    ...hives.map((hive) => ({ key: hive.id, label: hive.name ?? t(($) => $.hives.unnamed) })),
  ]
  return (
    <Tabs
      label={t(($) => $.hives.pills.label)}
      tabs={tabs}
      selected={value}
      onSelect={onChange}
      panelId={panelId}
      scroll
    />
  )
}
