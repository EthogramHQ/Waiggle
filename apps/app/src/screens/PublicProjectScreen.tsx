// Un projet public vu par un visiteur (« /fr/projects/<id> », tranche R12) : écran provisoire, son
// titre seul, le temps que l'écran visiteur soit écrit (son agent le remplace en entier).
import { useTranslation } from 'react-i18next'
import { Screen } from '../ui/Screen'

export function PublicProjectScreen(_props: { id: string }) {
  const { t } = useTranslation()
  return <Screen title={t(($) => $.states.seeProject)}>{null}</Screen>
}
