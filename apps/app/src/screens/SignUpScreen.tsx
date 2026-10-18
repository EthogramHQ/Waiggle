// Écran d'inscription : code d'invitation, prénom, e-mail, mot de passe. Après envoi, le membre doit
// cliquer sur le lien reçu par e-mail avant de pouvoir se connecter.
// Un lien d'invitation (/sign-up?code=…) remplit tout seul le code.

import { sourceUrl } from '@ruche/brand'
import {
  InviteCode,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SignUpRequest,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signUp } from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { type FieldErrors, fieldErrorsFrom } from '../accounts/validation'
import { useOpenOutside } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { HoneyMeter } from '../ui/HoneyMeter'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { WelcomeHero } from '../ui/WelcomeHero'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

export function SignUpScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/')
  const openOutside = useOpenOutside()

  // useState garde une valeur qui change (ce que tape le membre) et redessine l'écran à chaque
  // changement. Il renvoie la valeur et la fonction pour la modifier.
  const [inviteCode, setInviteCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [loading, setLoading] = useState(false)

  // Le code d'un lien d'invitation (/sign-up?code=…). L'adresse de la page n'est connue que dans le
  // navigateur, pas pendant la préparation de la page web : on attend donc d'y être (voir
  // ui/theme/hydration.ts) pour remplir le champ. N'importe qui peut fabriquer un lien : on ne
  // reprend que ce qui a la forme d'un code.
  const params = useLocalSearchParams<{ code?: string }>()
  const codeFromLink = firstParam(params.code) ?? ''
  const hydrated = useHydrated()
  useEffect(() => {
    if (!hydrated || !InviteCode.safeParse(codeFromLink).success) return
    setInviteCode(codeFromLink)
    // Puis on retire le code de l'adresse affichée : il ne reste ni dans l'historique du
    // navigateur, ni à l'écran pendant un partage d'écran.
    router.setParams({ code: undefined })
  }, [hydrated, codeFromLink, router])

  const submit = async () => {
    // 1. Vérification locale avec le même schéma que l'API (packages/contracts).
    const parsed = SignUpRequest.safeParse({
      name,
      email,
      password,
      inviteCode,
      language: i18n.language,
    })
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error))
      return
    }
    setFieldErrors({})
    setError(null)
    setLoading(true)
    // 2. Envoi à l'API, puis 3. écran suivant ou message d'erreur.
    const result = await signUp(parsed.data)
    setLoading(false)
    if (result.ok) {
      router.push({ pathname: '/check-email', params: { email: parsed.data.email } })
    } else {
      setError(result.error)
    }
  }

  // Traduit une clé d'erreur de champ en message (ou rien s'il n'y a pas d'erreur).
  const fieldMessage = (key: FieldErrors[keyof FieldErrors]) =>
    key ? t(`auth.errors.${key}`, lengths) : undefined

  const missing = Math.max(0, PASSWORD_MIN_LENGTH - Array.from(password).length)

  return (
    <Screen
      title={t('auth.signUp.title')}
      subtitle={t('auth.signUp.subtitle')}
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
      <TextField
        label={t('auth.fields.inviteCode')}
        value={inviteCode}
        onChangeText={setInviteCode}
        hint={t('auth.fields.inviteCodeHint')}
        autoCapitalize="none"
        autoComplete="off"
        error={fieldMessage(fieldErrors.inviteCode)}
      />
      <FieldGroup>
        <TextField
          label={t('auth.fields.name')}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          autoCapitalize="words"
          error={fieldMessage(fieldErrors.name)}
        />
        <TextField
          label={t('auth.fields.email')}
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          keyboardType="email-address"
          error={fieldMessage(fieldErrors.email)}
        />
      </FieldGroup>
      <Stack gap="md">
        <TextField
          label={t('auth.fields.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry // masque les caractères tapés (un bouton permet de les afficher)
          autoComplete="new-password" // les gestionnaires de mots de passe proposent d'en générer un
          aside={t('auth.fields.passwordMin', lengths)}
          error={fieldMessage(fieldErrors.password)}
        />
        {/* Une alvéole par caractère exigé : on voit d'un coup d'œil ce qu'il reste à taper. */}
        <HoneyMeter
          value={Array.from(password).length}
          max={PASSWORD_MIN_LENGTH}
          // Avant la première lettre, une simple consigne : « Encore 12 caractères » en couleur aurait
          // l'air d'un reproche alors que rien n'est encore tapé.
          label={
            password.length === 0
              ? t('auth.fields.passwordHint', lengths)
              : missing > 0
                ? t('auth.passwordMeter.remaining', { count: missing })
                : t('auth.passwordMeter.done')
          }
        />
      </Stack>
      <Button label={t('auth.signUp.submit')} onPress={submit} loading={loading} />
      <Row justify="center">
        <TextLink label={t('auth.signUp.haveAccount')} onPress={() => router.replace('/sign-in')} />
      </Row>
    </Screen>
  )
}
