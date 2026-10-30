// Écran affiché juste après l'inscription : « va ouvrir le lien reçu par e-mail ». Tranche R2 :
// - l'adresse n'est plus dans l'URL de la page (jur-9) : l'inscription la confie à l'état de
//   navigation (accounts/pendingVerification.ts), que la page lit ; un lien fabriqué
//   (`/check-email?email=…`) n'affiche donc rien de ce qu'il contient ;
// - « Renvoyer l'e-mail » renvoie le lien, puis attend une minute ; au-delà du quota, la page dit à
//   quelle heure réessayer (heure fixe, décision D3) ;
// - « Changer d'adresse » corrige une faute de frappe, avec le mot de passe, dans une feuille (D4) ;
// - « Ouvrir ma messagerie » : toujours sur téléphone, sur ordinateur pour un service connu.
import {
  ChangeUnverifiedEmailRequest,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  UNVERIFIED_ACCOUNT_DAYS,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type ChangeUnverifiedEmailError,
  changeUnverifiedEmail,
  resendVerification,
} from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { canOpenMailbox, openMailbox } from '../accounts/mailbox'
import { setPendingEmail, usePendingEmail } from '../accounts/pendingVerification'
import { Button } from '../ui/Button'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Mascot } from '../ui/Mascot'
import { Notice } from '../ui/Notice'
import { useRetryAt } from '../ui/RetryAt'
import { RetryButton } from '../ui/RetryButton'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/** Après un renvoi, une minute avant le suivant (le serveur en accepte un par minute). */
const RESEND_WAIT_SECONDS = 60

export function CheckEmailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const email = usePendingEmail()
  // La page web est préparée sans connaître le visiteur : on n'affiche le texte qu'une fois dans
  // le navigateur (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()

  // « Renvoyer l'e-mail » : la confirmation, le refus, et l'heure du prochain essai.
  const [confirmation, setConfirmation] = useState<'resent' | 'changed' | null>(null)
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [resending, setResending] = useState(false)
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const retry = useRetryAt(waitSeconds)
  const busy = useRef(false)
  // Le bouton touché devient inactif : le focus du clavier va au message qui dit pourquoi.
  const messageRef = useRef<Focusable>(null)
  const focusMessage = useRef(false)
  useEffect(() => {
    if (!focusMessage.current) return
    focusMessage.current = false
    focusWithoutScroll(messageRef.current)
  })

  const [sheetOpen, setSheetOpen] = useState(false)
  // Vrai après une correction d'adresse : la page ne sait plus si un lien est parti.
  const [addressChanged, setAddressChanged] = useState(false)

  const resend = async () => {
    if (busy.current || retry.blocked || !email) return
    busy.current = true
    setResending(true)
    // Le délai d'avant repart de zéro : un nouveau refus de même durée bloque à nouveau.
    setWaitSeconds(null)
    const result = await resendVerification({ email })
    busy.current = false
    setResending(false)
    focusMessage.current = true
    if (result.ok) {
      setError(null)
      // La même phrase que l'adresse ait un compte ou non : le serveur ne le dit pas.
      setConfirmation('resent')
      setWaitSeconds(RESEND_WAIT_SECONDS)
      return
    }
    setError(result.error)
    if (result.error === 'tooManyAttempts') setWaitSeconds(result.retryAfterSeconds)
  }

  // « Trop d'essais » ne reste qu'en attendant l'heure dite (ou jusqu'au prochain envoi, sans heure).
  const shownError =
    error === 'tooManyAttempts' && waitSeconds !== null && !retry.blocked ? null : error

  // L'image de la page : l'abeille en vol, qui part porter le message. Seule sur son décor, elle
  // garde son nom pour les lecteurs d'écran (J10).
  const picture = (
    <Stack align="center">
      <Mascot pose="fly" />
    </Stack>
  )

  return (
    // Le « miel vif » des moments de marque, comme l'inscription d'où l'on arrive : l'image est le
    // décor (`scene`), que l'ambiance place selon la largeur (sur le miel, ou en tête de la carte) ;
    // le texte est sur la feuille claire.
    <Screen
      ambiance="brand"
      scene={picture}
      pageTitle={t(($) => $.auth.checkEmail.title)}
      footer={
        hydrated ? (
          <>
            {/* L'action attendue : aller lire l'e-mail. En miel, la seule de la page. */}
            {canOpenMailbox(email) ? (
              <Button
                label={t(($) => $.auth.checkEmail.openMailbox)}
                icon="envelope-simple"
                onPress={() => openMailbox(email)}
              />
            ) : null}
            {email ? (
              <>
                {/* Bloqué, le bouton dit pourquoi (RetryButton, jur-13). */}
                <RetryButton
                  label={t(($) => $.auth.checkEmail.resend)}
                  variant="secondary"
                  icon="paper-plane-tilt"
                  onPress={() => void resend()}
                  loading={resending}
                  retry={retry}
                />
                <Text variant="callout" tone="muted">
                  {t(($) => $.auth.checkEmail.noneReceived)}
                </Text>
                <Row justify="center">
                  <TextLink
                    label={t(($) => $.auth.checkEmail.change.title)}
                    role="button"
                    onPress={() => setSheetOpen(true)}
                  />
                </Row>
              </>
            ) : null}
            <Row justify="center">
              <TextLink
                label={t(($) => $.auth.checkEmail.back)}
                onPress={() => router.replace('/sign-in')}
              />
            </Row>
          </>
        ) : undefined
      }
    >
      <Text variant="title2" heading={1}>
        {t(($) => $.auth.checkEmail.title)}
      </Text>
      {hydrated ? (
        <>
          <Text tone="secondary">
            {/* Après une correction, la nouvelle adresse peut être déjà prise, et rien ne part
                alors (le serveur ne le dit pas) : le corps devient conditionnel, comme tout ce
                que la page dit d'un envoi (D4, relecture juridique R2, B1). */}
            {email
              ? addressChanged
                ? t(($) => $.auth.checkEmail.bodyChanged, { email })
                : t(($) => $.auth.checkEmail.body, { email })
              : t(($) => $.auth.checkEmail.bodyNoEmail)}
          </Text>
          {shownError ? (
            <Notice ref={messageRef} message={t(($) => $.auth.errors[shownError], lengths)} />
          ) : null}
          {confirmation && !shownError ? (
            <Notice
              ref={messageRef}
              tone="success"
              polite
              message={
                confirmation === 'resent'
                  ? t(($) => $.auth.checkEmail.resent)
                  : t(($) => $.auth.checkEmail.change.sent)
              }
            />
          ) : null}
          <Notice tone="info" message={t(($) => $.auth.checkEmail.locked)} />
          {/* La purge de nuit efface une inscription jamais vérifiée (tranche 6c) : on le dit. */}
          <Text variant="callout" tone="muted">
            {t(($) => $.auth.checkEmail.expires, { days: UNVERIFIED_ACCOUNT_DAYS })}
          </Text>
        </>
      ) : null}
      {email ? (
        <ChangeAddressSheet
          open={sheetOpen}
          email={email}
          onClose={() => setSheetOpen(false)}
          onForgot={() => {
            setSheetOpen(false)
            router.push('/forgot-password')
          }}
          onChanged={(sentTo) => {
            setSheetOpen(false)
            // La page parle désormais de la nouvelle adresse ; renvoyer le lien vise celle-ci.
            setPendingEmail(sentTo)
            setAddressChanged(true)
            setError(null)
            setConfirmation('changed')
          }}
        />
      ) : null}
    </Screen>
  )
}

type SheetProps = {
  open: boolean
  /** L'adresse actuelle, celle que la feuille corrige. */
  email: string
  onClose: () => void
  onForgot: () => void
  /** La correction est partie : `sentTo` est l'adresse que le serveur a retenue. */
  onChanged: (sentTo: string) => void
}

/** La feuille « Changer d'adresse » : la bonne adresse et le mot de passe, puis un nouveau lien. */
function ChangeAddressSheet({ open, email, onClose, onForgot, onChanged }: SheetProps) {
  const { t } = useTranslation()
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invalidEmail, setInvalidEmail] = useState(false)
  const [error, setError] = useState<ChangeUnverifiedEmailError | 'tooManyAttempts' | null>(null)
  const [sending, setSending] = useState(false)
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null)
  const retry = useRetryAt(waitSeconds)
  const busy = useRef(false)

  // Une erreur d'un envoi précédent ne se montre pas à la réouverture (charte de design) ; ce qui
  // a été tapé reste, pour corriger sans tout refaire.
  useEffect(() => {
    if (open) {
      setError(null)
      setInvalidEmail(false)
    }
  }, [open])

  const submit = async () => {
    if (busy.current || retry.blocked) return
    // Les espaces autour d'une adresse collée ne font pas partie de l'adresse.
    const parsed = ChangeUnverifiedEmailRequest.safeParse({
      email,
      password,
      newEmail: newEmail.trim(),
    })
    if (!parsed.success) {
      const badEmail = parsed.error.issues.some((issue) => issue.path[0] === 'newEmail')
      setInvalidEmail(badEmail)
      // Un mot de passe vide ou trop long ne peut pas être le bon : on le dit comme le serveur.
      if (!badEmail) setError('invalidCredentials')
      return
    }
    setInvalidEmail(false)
    busy.current = true
    setSending(true)
    setWaitSeconds(null)
    const result = await changeUnverifiedEmail(parsed.data)
    busy.current = false
    setSending(false)
    if (result.ok) {
      setError(null)
      setNewEmail('')
      setPassword('')
      onChanged(result.sentTo)
      return
    }
    setError(result.error)
    if (result.error === 'tooManyAttempts') setWaitSeconds(result.retryAfterSeconds)
  }

  const shownError =
    error === 'tooManyAttempts' && waitSeconds !== null && !retry.blocked ? null : error

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(($) => $.auth.checkEmail.change.title)}
      subtitle={t(($) => $.auth.checkEmail.change.intro)}
      footer={
        // Bloqué, le bouton dit pourquoi (RetryButton, jur-13).
        <RetryButton
          label={t(($) => $.auth.checkEmail.change.submit)}
          icon="paper-plane-tilt"
          onPress={() => void submit()}
          loading={sending}
          retry={retry}
          disabled={password.length === 0}
        />
      }
    >
      <FieldGroup>
        <TextField
          label={t(($) => $.auth.checkEmail.change.newEmail)}
          value={newEmail}
          onChangeText={setNewEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          error={invalidEmail ? t(($) => $.auth.errors.invalidEmail) : undefined}
        />
        <Stack gap="sm">
          <TextField
            label={t(($) => $.auth.checkEmail.change.password)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="send"
            onSubmitEditing={() => {
              if (password.length > 0) void submit()
            }}
          />
          <Row justify="end">
            <TextLink
              label={t(($) => $.auth.signIn.forgotPassword)}
              role="button"
              onPress={onForgot}
            />
          </Row>
        </Stack>
      </FieldGroup>
      {shownError ? (
        <Notice
          message={
            shownError === 'alreadyVerified'
              ? t(($) => $.auth.checkEmail.change.alreadyVerified)
              : t(($) => $.auth.errors[shownError], lengths)
          }
        />
      ) : null}
    </Sheet>
  )
}
