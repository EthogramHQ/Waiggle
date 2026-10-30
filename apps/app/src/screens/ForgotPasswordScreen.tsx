// Page « Mot de passe oublié ? » (tranche R2, /forgot-password), sur le miel vif des moments de
// marque. Le visiteur donne son adresse ; la page dit toujours la même chose, qu'un compte existe
// ou non : c'est le serveur qui décide d'envoyer l'e-mail, sans le dire (sinon la page servirait à
// savoir qui est inscrit). Au-delà du quota, elle donne l'heure du prochain essai (D3).
import { ForgotPasswordRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { requestPasswordReset } from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { canOpenMailbox, openMailbox } from '../accounts/mailbox'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HeldSpace } from '../ui/HeldSpace'
import { Notice } from '../ui/Notice'
import { useRetryAt } from '../ui/RetryAt'
import { RetryButton } from '../ui/RetryButton'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'

// Paramètres des messages qui citent les longueurs de mot de passe (le message générique peut en
// être un).
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/** Après un envoi réussi, une minute avant le suivant : un double appui n'envoie pas deux e-mails. */
const RESEND_WAIT_SECONDS = 60

export function ForgotPasswordScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/sign-in')
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<'invalidEmail' | 'emailRequired' | null>(null)
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [sending, setSending] = useState(false)
  // L'adresse à laquelle la demande est partie : la page passe alors à « C'est envoyé ».
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Le délai avant le prochain essai (secondes) : celui du serveur après un refus, ou la minute
  // d'attente après un envoi. useRetryAt en tire l'heure, et libère le bouton à l'heure dite.
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const retry = useRetryAt(waitSeconds)
  // Un envoi à la fois : deux touchers rapides n'envoient qu'une demande (l'état `sending`, lui,
  // n'est à jour qu'au dessin suivant).
  const busy = useRef(false)

  // Après la réponse, le focus du clavier va au message (« C'est envoyé », « Trop d'essais ») : le
  // bouton touché devient inactif, et le focus ne doit pas retomber en haut de la page.
  // `focusTo` dit lequel des deux messages reçoit la ref (et donc le focus) ; `focusMessage`,
  // qu'il faut l'y poser au prochain dessin.
  const messageRef = useRef<Focusable>(null)
  const focusTo = useRef<'sent' | 'error'>('sent')
  const focusMessage = useRef(false)
  useEffect(() => {
    if (!focusMessage.current) return
    focusMessage.current = false
    focusWithoutScroll(messageRef.current)
  })

  const submit = async () => {
    if (busy.current || retry.blocked) return
    // Les espaces autour d'une adresse collée ne font pas partie de l'adresse.
    const typed = email.trim()
    if (typed.length === 0) {
      setFieldError('emailRequired')
      return
    }
    const parsed = ForgotPasswordRequest.safeParse({ email: typed })
    if (!parsed.success) {
      setFieldError('invalidEmail')
      return
    }
    setFieldError(null)
    busy.current = true
    setSending(true)
    // Le délai d'avant repart de zéro : un nouveau refus de même durée bloque à nouveau.
    setWaitSeconds(null)
    const result = await requestPasswordReset(parsed.data)
    busy.current = false
    setSending(false)
    focusMessage.current = true
    focusTo.current = result.ok ? 'sent' : 'error'
    if (result.ok) {
      setError(null)
      setSentTo(parsed.data.email)
      setWaitSeconds(RESEND_WAIT_SECONDS)
      return
    }
    setError(result.error)
    if (result.error === 'tooManyAttempts') setWaitSeconds(result.retryAfterSeconds)
  }

  // « Trop d'essais » ne reste affiché que tant qu'on attend : à l'heure dite, il s'efface (sa place
  // reste vide jusqu'au prochain envoi, rien ne remonte sous le doigt : C6) et le bouton se libère.
  // Sans heure donnée par le serveur, il reste jusqu'au prochain envoi.
  const vacated = Boolean(retry.ended) && error === 'tooManyAttempts'

  // Après les boutons, comme sur la maquette : la sortie discrète, vers la connexion.
  const exit = (
    <Row justify="center">
      <TextLink
        label={t(($) => $.auth.forgotPassword.back)}
        role="button"
        onPress={() => router.replace('/sign-in')}
      />
    </Row>
  )

  return (
    <Screen
      ambiance="brand"
      title={t(($) => $.auth.forgotPassword.title)}
      subtitle={t(($) => $.auth.forgotPassword.intro)}
      onBack={back}
      footer={
        // Chaque état a sa clé : React dessine des boutons neufs au lieu de renommer ceux qui sont
        // à la même place (charte de design, « une action qui remplace un bouton »).
        sentTo ? (
          <Fragment key="sent">
            {/* L'action attendue après l'envoi : aller lire l'e-mail. En miel, la seule de la page ;
                sur ordinateur, seulement pour un service connu. */}
            {canOpenMailbox(sentTo) ? (
              <Button
                label={t(($) => $.auth.checkEmail.openMailbox)}
                icon="envelope-simple"
                onPress={() => openMailbox(sentTo)}
              />
            ) : null}
            {/* Bloqué, le bouton dit pourquoi (RetryButton, jur-13). */}
            <RetryButton
              label={t(($) => $.auth.forgotPassword.resend)}
              variant="secondary"
              onPress={() => void submit()}
              loading={sending}
              retry={retry}
            />
            {exit}
          </Fragment>
        ) : (
          <Fragment key="form">
            <RetryButton
              label={t(($) => $.auth.forgotPassword.submit)}
              icon="paper-plane-tilt"
              onPress={() => void submit()}
              loading={sending}
              retry={retry}
            />
            {exit}
          </Fragment>
        )
      }
    >
      <TextField
        label={t(($) => $.auth.fields.email)}
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        error={fieldError ? t(($) => $.auth.errors[fieldError]) : undefined}
      />
      {/* Un refus d'abord (trop d'essais, serveur injoignable) : il prend le focus à la place de la
          confirmation, qui reste dessous telle quelle (rien ne saute sous le doigt). */}
      {error ? (
        <HeldSpace vacated={vacated}>
          <Notice
            ref={focusTo.current === 'error' ? messageRef : undefined}
            message={t(($) => $.auth.errors[error], lengths)}
          />
        </HeldSpace>
      ) : null}
      {sentTo ? (
        // La même confirmation dans tous les cas, lue sans couper le lecteur d'écran (status).
        <Stack gap="sm">
          <Text variant="headline" heading={2}>
            {t(($) => $.auth.forgotPassword.sentTitle)}
          </Text>
          <Notice
            ref={focusTo.current === 'sent' ? messageRef : undefined}
            tone="success"
            polite
            message={t(($) => $.auth.forgotPassword.sent)}
          />
          <Text tone="secondary">{t(($) => $.auth.forgotPassword.sentExpires)}</Text>
          {/* Le quota, dit d'avance (relecture juridique R2, C2) : au-delà, « Renvoyer le lien »
              n'envoie plus rien. Vrai pour toute adresse : il ne dit pas si un compte existe. */}
          <Text tone="secondary">{t(($) => $.auth.forgotPassword.sentLimit)}</Text>
          <Text variant="callout" tone="muted">
            {t(($) => $.auth.forgotPassword.noneReceived)}
          </Text>
        </Stack>
      ) : null}
    </Screen>
  )
}
