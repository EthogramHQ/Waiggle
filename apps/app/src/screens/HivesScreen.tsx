// L'onglet Ruches, avant les ruches (refonte, tranche R3 ; les ruches viennent en R10, choix de
// Louis du 30/10/2026) : l'abeille qui fait coucou, « Les ruches arrivent bientôt » et deux phrases
// sur ce qu'elles seront (des groupes de proches, comme « Ma ruche Famille »).
//
// La page ne demande rien et n'envoie rien : ni date, ni promesse, ni « Préviens-moi » (relecture
// juridique, jur-J9). Elle ne lit que la session, comme toute page réservée aux membres.
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { TopNav } from '../navigation/TopNav'
import { Screen } from '../ui/Screen'
import { StateMessage } from '../ui/StateMessage'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

export function HivesScreen() {
  const { t } = useTranslation()
  const { state, session, retry } = useMemberSession()

  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />

  return (
    <Screen title={t(($) => $.hives.title)} header={<TopNav />}>
      {/* L'état « bientôt » de StateMessage : l'abeille qui fait coucou (décorative, le titre dit
          déjà tout), le titre et les deux phrases, rangés à gauche comme tous les états de l'appli
          (choix de Louis du 30/10/2026 ; relecture R3 : la page était centrée, à la main). */}
      <StateMessage
        kind="soon"
        title={t(($) => $.hives.soonTitle)}
        message={[t(($) => $.hives.soonBody1), t(($) => $.hives.soonBody2)]}
      />
    </Screen>
  )
}
