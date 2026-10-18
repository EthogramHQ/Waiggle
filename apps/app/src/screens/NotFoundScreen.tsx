// La page affichée pour une adresse qui ne mène nulle part dans l'appli.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Honeycomb } from '../ui/Illustrations'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'

export function NotFoundScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen>
      <Honeycomb />
      <Text variant="title2" align="center" accessibilityRole="header">
        {t('errors.notFound')}
      </Text>
      <Button label={t('project.page.home')} onPress={() => router.replace('/')} />
    </Screen>
  )
}
