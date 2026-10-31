// Page « Choisis un nouveau mot de passe » (tranche R2, /reset-password?token=…), ouverte par le
// lien de l'e-mail « Mot de passe oublié ». Le jeton vient de l'adresse de la page ; les règles et
// la jauge sont celles de l'inscription. Réussi : retour à « Se connecter », qui dit « Mot de passe
// changé » (`?announce=passwordChanged`). Un lien expiré, déjà servi ou abîmé reçoit un seul et
// même texte, vrai pour toutes les causes (jur-16), et « Demander un nouveau lien ».
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, ResetPasswordRequest } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resetPassword } from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { firstParam } from '../navigation/params'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HeldSpace } from '../ui/HeldSpace'
import { HoneyMeter } from '../ui/HoneyMeter'
import { Emblem } from '../ui/Illustrations'
import { Notice } from '../ui/Notice'
import { useRetryAt } from '../ui/RetryAt'
import { RetryButton } from '../ui/RetryButton'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

export function ResetPasswordScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  // Le « Retour » du cadre de page, en tête de la feuille comme sur les autres pages du compte
  // (R3). Ouverte depuis l'e-mail, la page n'a souvent pas de page d'avant : il mène alors à la
  // connexion, comme « Annuler ».
  const back = useGoBack('/sign-in')
  // Le jeton n'est connu que dans le navigateur, pas pendant la préparation de la page web : on
  // attend d'y être (voir ui/theme/hydration.ts) avant de dire si le lien est bon ou abîmé.
  const hydrated = useHydrated()
  const fromLink = firstParam(useLocalSearchParams<{ token?: string | string[] }>().token)
  // Le jeton gardé en mémoire : il quitte l'adresse aussitôt lu (plus bas), mais sert à l'envoi.
  const [kept, setKept] = useState<string | null>(null)
  const token = kept ?? (fromLink && fromLink.length > 0 ? fromLink : null)
  useEffect(() => {
    if (!hydrated || !fromLink) return
    setKept(fromLink)
    // Comme le code d'invitation à l'inscription : le jeton ne reste ni dans l'historique du
    // navigateur, ni à l'écran pendant un partage d'écran.
    router.setParams({ token: undefined })
  }, [hydrated, fromLink, router])

  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<'passwordTooShort' | 'passwordTooLong' | null>(null)
  const [error, setError] = useState<AuthErrorKey | null>(null)
  // Le serveur a refusé le jeton : la page passe à « Ce lien ne marche plus ».
  const [refused, setRefused] = useState(false)
  const [sending, setSending] = useState(false)
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const retry = useRetryAt(waitSeconds)
  const busy = useRef(false)

  // Le bouton touché disparaît avec le formulaire (lien refusé) ou devient inactif (trop
  // d'essais) : le focus du clavier va au message, sans faire défiler la page.
  const messageRef = useRef<Focusable>(null)
  const focusMessage = useRef(false)
  useEffect(() => {
    if (!focusMessage.current) return
    focusMessage.current = false
    focusWithoutScroll(messageRef.current)
  })

  const submit = async () => {
    if (busy.current || retry.blocked || !token) return
    const parsed = ResetPasswordRequest.safeParse({ token, newPassword: password })
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big')
      setFieldError(tooLong ? 'passwordTooLong' : 'passwordTooShort')
      return
    }
    setFieldError(null)
    busy.current = true
    setSending(true)
    setWaitSeconds(null)
    const result = await resetPassword(parsed.data)
    busy.current = false
    setSending(false)
    if (result.ok) {
      // replace, pas push : « retour » ne ramène pas sur une page dont le lien a déjà servi.
      router.replace({ pathname: '/sign-in', params: { announce: 'passwordChanged' } })
      return
    }
    focusMessage.current = true
    if (result.error === 'invalidToken') {
      setRefused(true)
      return
    }
    setError(result.error)
    if (result.error === 'tooManyAttempts') setWaitSeconds(result.retryAfterSeconds)
  }

  // Avant l'hydratation, ni contenu ni titre d'onglet : la page ne sait pas encore si le lien a
  // un jeton (le titre de la réussite s'afficherait un instant avant « Ce lien ne marche plus »).
  if (!hydrated)
    return (
      // Le « Retour » est déjà là : il ne dépend pas du jeton, et ne bouge pas à l'hydratation.
      <Screen ambiance="brand" pageTitle={null} onBack={back}>
        {null}
      </Screen>
    )

  if (refused || !token) {
    return (
      <Screen
        ambiance="brand"
        pageTitle={t(($) => $.auth.resetPassword.invalidTitle)}
        onBack={back}
      >
        <Fragment key="refused">
          <Stack align="center">
            <Emblem icon="warning-circle" />
          </Stack>
          <Text variant="title2" align="center" heading={1}>
            {t(($) => $.auth.resetPassword.invalidTitle)}
          </Text>
          {/* Une seule phrase pour toutes les causes. Elle prend le focus du clavier quand le
              bouton touché disparaît (lien refusé par le serveur). */}
          <Notice ref={messageRef} message={t(($) => $.auth.resetPassword.invalidBody)} />
          <Button
            label={t(($) => $.auth.resetPassword.requestNew)}
            onPress={() => router.replace('/forgot-password')}
          />
        </Fragment>
      </Screen>
    )
  }

  const missing = Math.max(0, PASSWORD_MIN_LENGTH - Array.from(password).length)
  // « Trop d'essais » ne reste qu'en attendant l'heure dite (ou jusqu'au prochain envoi, sans heure) :
  // à l'heure dite, il s'efface en gardant sa place jusqu'au prochain envoi (C6).
  const vacated = Boolean(retry.ended) && error === 'tooManyAttempts'

  return (
    <Screen
      ambiance="brand"
      title={t(($) => $.auth.resetPassword.title)}
      onBack={back}
      footer={
        <>
          {/* Bloqué, le bouton dit pourquoi (RetryButton, jur-13). */}
          <RetryButton
            label={t(($) => $.auth.resetPassword.submit)}
            onPress={() => void submit()}
            loading={sending}
            retry={retry}
          />
          <Row justify="center">
            <TextLink
              label={t(($) => $.common.cancel)}
              role="button"
              onPress={() => router.replace('/sign-in')}
            />
          </Row>
        </>
      }
    >
      <Stack gap="md">
        <TextField
          label={t(($) => $.auth.resetPassword.newPassword)}
          value={password}
          onChangeText={setPassword}
          secureTextEntry // masque les caractères tapés (un bouton permet de les afficher)
          autoComplete="new-password" // les gestionnaires de mots de passe proposent d'en générer un
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          error={fieldError ? t(($) => $.auth.errors[fieldError], lengths) : undefined}
        />
        {/* La jauge de l'inscription : une alvéole par caractère exigé. */}
        <HoneyMeter
          value={Array.from(password).length}
          max={PASSWORD_MIN_LENGTH}
          label={
            password.length === 0
              ? t(($) => $.auth.fields.passwordHint, lengths)
              : missing > 0
                ? t(($) => $.auth.passwordMeter.remaining, { count: missing })
                : t(($) => $.auth.passwordMeter.done)
          }
        />
      </Stack>
      {/* La conséquence, dite avant le geste (jur-3). */}
      <Notice tone="info" polite message={t(($) => $.auth.resetPassword.consequences)} />
      {error ? (
        <HeldSpace vacated={vacated}>
          <Notice ref={messageRef} message={t(($) => $.auth.errors[error], lengths)} />
        </HeldSpace>
      ) : null}
    </Screen>
  )
}
