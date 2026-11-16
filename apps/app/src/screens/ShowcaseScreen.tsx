// L'accueil public (« /fr/ », « /en/ », tranche R12) : écran provisoire, son titre seul, le temps que
// l'écran de la vitrine soit écrit (son agent le remplace en entier).
import { useTranslation } from 'react-i18next'
import { Screen } from '../ui/Screen'

export function ShowcaseScreen() {
  const { t } = useTranslation()
  return <Screen title={t(($) => $.home.title)}>{null}</Screen>
}
