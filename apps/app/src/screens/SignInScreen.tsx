// Écran de connexion : e-mail et mot de passe. Sur ordinateur, il prend place dans la carte à
// droite de la scène d'accueil (voir ui/Screen.tsx, `hero`).

import { sourceUrl } from '@ruche/brand'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SignInRequest } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn } from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { type FieldErrors, fieldErrorsFrom } from '../accounts/validation'
import { useOpenOutside } from '../navigation/links'
import { safeNext } from '../navigation/next'
import { firstParam } from '../navigation/params'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { Hint } from '../ui/Hint'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Row } from '../ui/Stack'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { WelcomeHero } from '../ui/WelcomeHero'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

export function SignInScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const openOutside = useOpenOutside()
  const back = useGoBack('/')
  // useLocalSearchParams : les paramètres de l'adresse (?next=/members/abc). La page où revenir
  // après la connexion, seulement si c'est bien une page de l'appli (voir navigation/next.ts).
  const next = safeNext(firstParam(useLocalSearchParams<{ next?: string | string[] }>().next))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const parsed = SignInRequest.safeParse({ email, password })
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error))
      return
    }
    setFieldErrors({})
    setError(null)
    setLoading(true)
    const result = await signIn(parsed.data)
    setLoading(false)
    // replace (et non push) : le bouton « retour » ne ramènera pas sur l'écran de connexion.
    if (result.ok) router.replace(next ?? '/')
    else setError(result.error)
  }

  return (
    <Screen
      title={t('auth.signIn.title')}
      subtitle={t('auth.signIn.subtitle')}
      onBack={back}
      hero={
        <WelcomeHero
          tagline={t('home.tagline')}
          source={{
            note: t('home.openSource'),
            link: t('home.seeCode'),
            onPress: () => openOutside(sourceUrl),
          }}
        />
      }
    >
      {error ? <Notice message={t(`auth.errors.${error}`, lengths)} /> : null}
      <FieldGroup>
        <TextField
          label={t('auth.fields.email')}
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          keyboardType="email-address"
          error={fieldErrors.email ? t('auth.errors.invalidEmail') : undefined}
        />
        <TextField
          label={t('auth.fields.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
      </FieldGroup>
      <Button label={t('auth.signIn.submit')} onPress={submit} loading={loading} />
      <Row gap="sm" justify="center" wrap>
        <Text variant="callout" tone="secondary">
          {t('auth.signIn.noAccount')}
        </Text>
        <TextLink label={t('auth.signIn.createOne')} onPress={() => router.replace('/sign-up')} />
      </Row>
      <Hint icon="lock-simple" text={t('home.membersOnly')} />
      {/* Tranche 7a (règle 23 de la relecture du plan) : l'adresse de contact, lisible sans compte.
          Une personne photographiée, ou une autorité, doit pouvoir nous écrire sans s'inscrire. */}
      <Hint icon="envelope-simple" text={t('auth.contact')} />
    </Screen>
  )
}
