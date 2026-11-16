// Les mises à jour d'un projet public vues par un visiteur (« /fr/projects/<id>/updates », tranche
// R12) : écran provisoire, son titre seul, le temps que l'écran visiteur soit écrit (son agent le
// remplace en entier).
import { useTranslation } from 'react-i18next'
import { Screen } from '../ui/Screen'

export function PublicUpdatesScreen(_props: { id: string }) {
  const { t } = useTranslation()
  return <Screen title={t(($) => $.project.updates.title)}>{null}</Screen>
}
