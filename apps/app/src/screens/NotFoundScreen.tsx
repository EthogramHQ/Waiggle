// La page affichée pour une adresse qui ne mène nulle part dans l'appli.
//
// Miel 2 (R1) : un moment de marque, sur le « miel vif » (ui/BrandAmbiance.tsx) ; l'état lui-même
// (l'image, le titre, l'issue) est celui de toutes les pages introuvables (StateMessage), posé sur
// la feuille claire. Un contenu introuvable à l'intérieur d'une page (un projet, un membre) garde la
// mise en page ordinaire (NotFoundState, screens/states.tsx) : il n'est pas un moment de marque.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Screen } from '../ui/Screen'
import { StateMessage } from '../ui/StateMessage'

export function NotFoundScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const title = t(($) => $.states.notFoundTitle)
  return (
    <Screen ambiance="brand" pageTitle={title}>
      {/* L'état remplace toute la page : son titre est de niveau 1. Toujours une issue : l'accueil. */}
      <StateMessage
        kind="notFound"
        level={1}
        title={title}
        message={t(($) => $.errors.notFound)}
        actions={[{ label: t(($) => $.states.home), onPress: () => router.replace('/') }]}
      />
    </Screen>
  )
}
