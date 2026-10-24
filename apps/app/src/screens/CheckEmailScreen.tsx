// Écran affiché juste après l'inscription : « va cliquer sur le lien reçu par e-mail ».
// L'adresse arrive dans l'URL de la page (/check-email?email=…), lue avec useLocalSearchParams.
import { SignInRequest, UNVERIFIED_ACCOUNT_DAYS } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { firstParam } from '../navigation/params'
import { Button } from '../ui/Button'
import { Emblem } from '../ui/Illustrations'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'

export function CheckEmailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  // L'adresse vient de l'URL : n'importe qui peut fabriquer un lien avec un autre texte. On ne
  // l'affiche que si c'est vraiment une adresse e-mail (même règle que l'inscription).
  const candidate = firstParam(params.email) ?? ''
  const email = SignInRequest.shape.email.safeParse(candidate).success ? candidate : null
  // L'adresse est dans l'URL du visiteur, inconnue du serveur qui prépare la page web : on ne
  // l'affiche qu'une fois dans le navigateur (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()

  return (
    <Screen pageTitle={t('auth.checkEmail.title')}>
      <Stack align="center">
        <Emblem icon="envelope-simple" />
      </Stack>
      <Text variant="title2" align="center" heading={1}>
        {t('auth.checkEmail.title')}
      </Text>
      {hydrated ? (
        <>
          <Text tone="secondary" align="center">
            {email ? t('auth.checkEmail.body', { email }) : t('auth.checkEmail.bodyNoEmail')}
          </Text>
          <Notice tone="info" message={t('auth.checkEmail.locked')} />
          {/* La purge de nuit efface une inscription jamais vérifiée (tranche 6c) : on le dit. */}
          <Text variant="callout" tone="muted" align="center">
            {t('auth.checkEmail.expires', { days: UNVERIFIED_ACCOUNT_DAYS })}
          </Text>
          <Button
            label={t('auth.checkEmail.back')}
            variant="secondary"
            onPress={() => router.replace('/sign-in')}
          />
        </>
      ) : null}
    </Screen>
  )
}
