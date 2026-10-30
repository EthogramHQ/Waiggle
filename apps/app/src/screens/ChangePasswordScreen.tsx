// Page « Changer ton mot de passe » (tranche R2, rubrique Sécurité des réglages ; la route est posée
// par les réglages). Le membre tape son mot de passe actuel, puis le nouveau. L'actuel faux : son
// champ le dit, rien ne change. Réussi : retour à la rubrique, qui dit « Mot de passe changé ».
// Le serveur déconnecte les autres appareils et garde celui-ci : la page le dit avant le geste
// (relecture juridique, jur-3).
import { ChangePasswordRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { changePassword } from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { useMemberSession } from '../accounts/session'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { Callout } from '../ui/Callout'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HeldSpace } from '../ui/HeldSpace'
import { HoneyMeter } from '../ui/HoneyMeter'
import { Notice } from '../ui/Notice'
import { useRetryAt } from '../ui/RetryAt'
import { RetryButton } from '../ui/RetryButton'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/** Les erreurs rangées sous un champ : l'actuel (faux), ou le nouveau (trop court, trop long). */
type FieldErrors = {
  current?: 'wrongCurrent'
  next?: 'passwordTooShort' | 'passwordTooLong'
}

export function ChangePasswordScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, session: data, retry: retrySession } = useMemberSession()
  const back = useGoBack('/settings')
  const [current, setCurrent] = useState('')
  const [fresh, setFresh] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [sending, setSending] = useState(false)
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const retry = useRetryAt(waitSeconds)
  // Un envoi à la fois : deux touchers rapides n'envoient qu'une demande.
  const busy = useRef(false)

  // « Trop d'essais » rend le bouton inactif : le focus du clavier va au message.
  const messageRef = useRef<Focusable>(null)
  const focusMessage = useRef(false)
  useEffect(() => {
    if (!focusMessage.current) return
    focusMessage.current = false
    focusWithoutScroll(messageRef.current)
  })

  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas (trop de demandes, serveur en panne) : on ne sait pas qui est là, on propose de réessayer.
  if (state === 'error') return <SessionErrorScreen onRetry={retrySession} />
  // Personne de connecté : on propose de se connecter (et de revenir ici ensuite).
  if (!data) return <SignedOutScreen />

  const submit = async () => {
    if (busy.current || retry.blocked) return
    const parsed = ChangePasswordRequest.safeParse({
      currentPassword: current,
      newPassword: fresh,
    })
    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        // Un mot de passe actuel plus long que la limite ne peut pas être le bon.
        if (issue.path[0] === 'currentPassword') errors.current = 'wrongCurrent'
        if (issue.path[0] === 'newPassword') {
          errors.next = issue.code === 'too_big' ? 'passwordTooLong' : 'passwordTooShort'
        }
      }
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    busy.current = true
    setSending(true)
    setWaitSeconds(null)
    // Les messages déjà affichés restent jusqu'à la réponse : les retirer maintenant ferait
    // remonter le bouton sous le doigt (charte de design).
    const result = await changePassword(parsed.data)
    busy.current = false
    setSending(false)
    if (result.ok) {
      setError(null)
      // Pas de toast : la rubrique où l'on revient le dit elle-même, dans un message qui reçoit le
      // focus (?announce=passwordChanged, relecture de l'interface R2, B2). Un toast en plus le
      // faisait annoncer deux fois (relecture de design R2, C3), et un toast ne porte rien qui
      // manque à l'écran (décision R1). dismissTo revient à la rubrique déjà ouverte dans
      // l'historique au lieu d'en empiler une seconde ; arrivé ici par un lien direct, elle prend
      // la place de cette page.
      router.dismissTo('/settings/security?announce=passwordChanged')
      return
    }
    if (result.error === 'wrongPassword') {
      // Le champ de l'actuel le dit ; le nouveau mot de passe tapé reste là.
      setFieldErrors({ current: 'wrongCurrent' })
      setError(null)
      return
    }
    focusMessage.current = true
    setError(result.error)
    if (result.error === 'tooManyAttempts') setWaitSeconds(result.retryAfterSeconds)
  }

  const missing = Math.max(0, PASSWORD_MIN_LENGTH - Array.from(fresh).length)
  // Recopiée dans une constante : le sélecteur de t() perd le rétrécissement de `fieldErrors.next`.
  const nextError = fieldErrors.next
  // « Trop d'essais » ne reste qu'en attendant l'heure dite (ou jusqu'au prochain envoi, sans heure) :
  // à l'heure dite, il s'efface en gardant sa place jusqu'au prochain envoi (C6).
  const vacated = Boolean(retry.ended) && error === 'tooManyAttempts'

  return (
    <Screen
      // Sur ordinateur, la barre du haut, comme les autres pages des réglages (relecture de design C4).
      header={<TopNav inSettings />}
      onBack={back}
      title={t(($) => $.settings.changePassword.screenTitle)}
      subtitle={t(($) => $.settings.changePassword.intro)}
      footer={
        <>
          {error ? (
            <HeldSpace vacated={vacated}>
              <Notice ref={messageRef} message={t(($) => $.auth.errors[error], lengths)} />
            </HeldSpace>
          ) : null}
          {/* Bloqué par « trop d'essais », le bouton dit pourquoi (RetryButton, jur-13). */}
          <RetryButton
            label={t(($) => $.settings.changePassword.submit)}
            onPress={() => void submit()}
            loading={sending}
            retry={retry}
            // Impossible d'envoyer sans avoir tapé son mot de passe actuel (comme pour changer
            // d'adresse), ni pendant l'attente d'un « trop d'essais ».
            disabled={current.length === 0}
          />
        </>
      }
    >
      {/* Deux champs séparés (pas un FieldGroup) : chacun porte quelque chose sous lui, le lien
          « Mot de passe oublié ? » ou la jauge. */}
      <Stack gap="xl">
        <Stack gap="sm">
          <TextField
            label={t(($) => $.settings.changePassword.current)}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            error={
              fieldErrors.current ? t(($) => $.settings.changePassword.wrongCurrent) : undefined
            }
          />
          <Row justify="end">
            <TextLink
              label={t(($) => $.auth.signIn.forgotPassword)}
              role="button"
              onPress={() => router.push('/forgot-password')}
            />
          </Row>
        </Stack>
        <Stack gap="md">
          <TextField
            label={t(($) => $.settings.changePassword.new)}
            value={fresh}
            onChangeText={setFresh}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (current.length > 0) void submit()
            }}
            error={nextError ? t(($) => $.auth.errors[nextError], lengths) : undefined}
          />
          {/* La jauge de l'inscription : une alvéole par caractère exigé. */}
          <HoneyMeter
            value={Array.from(fresh).length}
            max={PASSWORD_MIN_LENGTH}
            label={
              fresh.length === 0
                ? t(($) => $.auth.fields.passwordHint, lengths)
                : missing > 0
                  ? t(($) => $.auth.passwordMeter.remaining, { count: missing })
                  : t(($) => $.auth.passwordMeter.done)
            }
          />
        </Stack>
      </Stack>
      {/* Les conséquences, dites avant le geste (jur-3). */}
      <Callout
        icon="device-mobile"
        title={t(($) => $.settings.changePassword.consequencesTitle)}
        body={t(($) => $.settings.changePassword.consequences)}
      />
    </Screen>
  )
}
