// Monte la feuille du pseudo provisoire (`ProvisionalNameSheet`, R9) dans le cadre de l'appli, une
// fois pour toute la visite, comme `LanguageSync`. Il lit le profil du membre connecté, et dit à la
// feuille quand une autre feuille est ouverte, pour qu'elle ne s'ouvre jamais par-dessus :
// - une page qui n'est pas celle d'un onglet (`placeOf` de la barre d'onglets : les feuilles à
//   adresse, « Signaler », « Publier », les réglages, une page poussée) : elle attend qu'on revienne
//   sur un onglet ;
// - sur le web, une feuille ou une fenêtre ouverte dans la page (« Partager ») : la pile des couches.
//   Sur téléphone, la pile ne s'inscrit pas ; la feuille s'ouvre dès l'arrivée du profil, avant
//   qu'un geste ait pu ouvrir une autre feuille.
import { usePathname } from 'expo-router'
import { useSession } from '../accounts/api'
import { placeOf } from '../navigation/AppTabBar'
import { useOpenModalLayers } from '../ui/modalLayers'
import { useMe } from './hooks'
import { ProvisionalNameSheet } from './ProvisionalNameSheet'

export function ProvisionalNameGate() {
  const { data: session } = useSession()
  // Pour un visiteur (pas de session), useMe ne fait aucune requête.
  const { data: me } = useMe(Boolean(session))
  const pathname = usePathname()
  const layers = useOpenModalLayers()
  if (!session || !me) return null
  const onTabPage = placeOf(pathname, me.id).kind !== 'hidden'
  return <ProvisionalNameSheet me={me} otherSheetOpen={!onTabPage || layers > 0} />
}
