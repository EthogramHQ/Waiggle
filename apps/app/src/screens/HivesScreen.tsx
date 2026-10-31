// L'onglet Ruches, avant les ruches (refonte, tranche R3 ; les ruches viennent en R10, choix de
// Louis du 30/10/2026) : l'abeille qui fait coucou, « Les ruches arrivent bientôt » et deux phrases
// sur ce qu'elles seront (des groupes de proches, comme « Ma ruche Famille »).
//
// La page ne demande rien et n'envoie rien : ni date, ni promesse, ni « Préviens-moi » (relecture
// juridique, jur-J9). Elle ne lit que la session, comme toute page réservée aux membres.
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { TopNav } from '../navigation/TopNav'
import { Mascot } from '../ui/Mascot'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
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
      <Stack gap="lg" align="center">
        {/* L'abeille est décorative : le titre dit déjà tout. */}
        <Mascot pose="wave" size="lg" decorative />
        <Stack gap="sm" align="stretch">
          <Text variant="title2" heading={2} align="center">
            {t(($) => $.hives.soonTitle)}
          </Text>
          <Text tone="secondary" align="center">
            {t(($) => $.hives.soonBody1)}
          </Text>
          <Text tone="secondary" align="center">
            {t(($) => $.hives.soonBody2)}
          </Text>
        </Stack>
      </Stack>
    </Screen>
  )
}
