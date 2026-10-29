// Page où arrive le membre après avoir cliqué sur le lien de l'e-mail : l'API a vérifié
// l'adresse, puis l'a redirigé ici (callbackURL).
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Emblem } from '../ui/Illustrations'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

export function VerifiedScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <Screen
      // Un moment de marque (l'adresse est confirmée) : le « miel vif », le contenu sur la feuille.
      ambiance="brand"
      pageTitle={t(($) => $.auth.verified.title)}
    >
      <Stack align="center">
        <Emblem icon="check" />
      </Stack>
      <Text variant="title2" align="center" heading={1}>
        {t(($) => $.auth.verified.title)}
      </Text>
      <Text tone="secondary" align="center">
        {t(($) => $.auth.verified.body)}
      </Text>
      <Button label={t(($) => $.auth.verified.continue)} onPress={() => router.replace('/')} />
    </Screen>
  )
}
