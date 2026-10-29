// La page affichée pour une adresse qui ne mène nulle part dans l'appli.
//
// Miel 2 (R1) : un moment de marque, sur le « miel vif » (ui/BrandAmbiance.tsx). L'état lui-même
// (l'image, le titre, l'issue, la barre de navigation) est celui de toutes les pages introuvables
// (NotFoundState, screens/states.tsx), avec son réglage d'ambiance : un seul endroit à changer. Un
// contenu introuvable à l'intérieur d'une page (un projet, un membre) garde la mise en page
// ordinaire : il n'est pas un moment de marque.
import { useTranslation } from 'react-i18next'
import { NotFoundState } from './states'

export function NotFoundScreen() {
  const { t } = useTranslation()
  return (
    <NotFoundState
      ambiance="brand"
      title={t(($) => $.states.notFoundTitle)}
      message={t(($) => $.errors.notFound)}
    />
  )
}
