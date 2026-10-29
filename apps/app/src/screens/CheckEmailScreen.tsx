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
import { useLayout } from '../ui/theme/layout'

export function CheckEmailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const wide = useLayout().sizeClass === 'wide'
  const params = useLocalSearchParams<{ email?: string }>()
  // L'adresse vient de l'URL : n'importe qui peut fabriquer un lien avec un autre texte. On ne
  // l'affiche que si c'est vraiment une adresse e-mail (même règle que l'inscription).
  const candidate = firstParam(params.email) ?? ''
  const email = SignInRequest.shape.email.safeParse(candidate).success ? candidate : null
  // L'adresse est dans l'URL du visiteur, inconnue du serveur qui prépare la page web : on ne
  // l'affiche qu'une fois dans le navigateur (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()
  // L'image de la page : l'enveloppe sur sa tuile de miel, du décor (cachée aux lecteurs d'écran).
  const picture = (
    <Stack align="center">
      {/* R1 F2 : Mascot fly ici (l'abeille en vol remplace l'enveloppe, à cette même place). */}
      <Emblem icon="envelope-simple" />
    </Stack>
  )

  return (
    // Le « miel vif » des moments de marque, comme l'inscription d'où l'on arrive : sur téléphone,
    // l'image flotte sur le miel (`scene`) et le texte est sur la feuille claire ; sur ordinateur, le
    // miel couvre la page et l'image passe en tête de la carte.
    <Screen
      ambiance="brand"
      scene={wide ? undefined : picture}
      pageTitle={t(($) => $.auth.checkEmail.title)}
    >
      {wide ? picture : null}
      <Text variant="title2" align="center" heading={1}>
        {t(($) => $.auth.checkEmail.title)}
      </Text>
      {hydrated ? (
        <>
          <Text tone="secondary" align="center">
            {email
              ? t(($) => $.auth.checkEmail.body, { email })
              : t(($) => $.auth.checkEmail.bodyNoEmail)}
          </Text>
          <Notice tone="info" message={t(($) => $.auth.checkEmail.locked)} />
          {/* La purge de nuit efface une inscription jamais vérifiée (tranche 6c) : on le dit. */}
          <Text variant="callout" tone="muted" align="center">
            {t(($) => $.auth.checkEmail.expires, { days: UNVERIFIED_ACCOUNT_DAYS })}
          </Text>
          <Button
            label={t(($) => $.auth.checkEmail.back)}
            variant="secondary"
            onPress={() => router.replace('/sign-in')}
          />
        </>
      ) : null}
    </Screen>
  )
}
