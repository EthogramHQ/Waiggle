// Page « Changer d'adresse e-mail » (tranche « adresse », /account/email). Le membre tape sa
// nouvelle adresse et son mot de passe ; rien ne change tout de suite. Un premier lien part vers son
// adresse ACTUELLE (qui doit donner son accord), puis un second vers la nouvelle, pour la vérifier.
// Une fois la demande partie, la page le dit et le formulaire disparaît : on ne renvoie pas une
// seconde demande par mégarde.
import { contactEmail } from '@ruche/brand'
import { ChangeEmailRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { changeEmail, useSession } from '../accounts/api'
import type { AuthErrorKey } from '../accounts/errors'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { Emblem } from '../ui/Illustrations'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { LoadingScreen, SignedOutScreen } from './states'

// Paramètres des messages qui citent les longueurs de mot de passe (le message générique d'une
// erreur inattendue peut en être un).
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/** Les erreurs rangées sous un champ : l'adresse, ou le mot de passe. */
type FieldErrors = { newEmail?: AuthErrorKey; password?: AuthErrorKey }

/**
 * Où ranger une erreur du serveur : sous le champ qu'elle concerne quand il y en a un, sinon dans
 * le message général au-dessus du bouton (trop de tentatives, réseau en panne…).
 */
const fieldOf = (error: AuthErrorKey): keyof FieldErrors | null => {
  if (error === 'wrongPassword' || error === 'passwordTooLong') return 'password'
  if (error === 'sameEmail' || error === 'invalidEmail') return 'newEmail'
  return null
}

export function ChangeEmailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data, isPending } = useSession()
  const back = useGoBack('/account')
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [sending, setSending] = useState(false)
  // L'adresse actuelle vers laquelle le premier lien est parti : la page passe alors à « envoyé ».
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Un envoi à la fois : deux touchers rapides n'envoient qu'une demande (l'état `sending`, lui,
  // n'est à jour qu'au dessin suivant).
  const busy = useRef(false)

  // Après l'envoi, le bouton touché disparaît avec le formulaire. Le focus du clavier va au message
  // qui le remplace (« Un lien vient de partir… ») : c'est le focus qui le fait lire sur le web, et
  // il ne retombe pas tout en haut de la page. Sur téléphone, le message s'annonce lui-même.
  const messageRef = useRef<Focusable>(null)
  const focusMessage = useRef(false)
  useEffect(() => {
    if (!focusMessage.current) return
    focusMessage.current = false
    focusWithoutScroll(messageRef.current)
  })

  if (isPending) return <LoadingScreen />
  // Personne de connecté : on propose de se connecter (et de revenir ici ensuite).
  if (!data) return <SignedOutScreen />
  const current = data.user.email

  const submit = async () => {
    if (busy.current || sentTo) return
    // Les espaces autour d'une adresse collée ne font pas partie de l'adresse.
    const parsed = ChangeEmailRequest.safeParse({ newEmail: newEmail.trim(), password })
    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'newEmail') errors.newEmail = 'invalidEmail'
        // Un mot de passe plus long que la limite ne peut pas être le bon.
        if (issue.path[0] === 'password' && issue.code === 'too_big') {
          errors.password = 'wrongPassword'
        }
      }
      setFieldErrors(errors)
      return
    }
    // Une adresse e-mail ne tient pas compte des majuscules : « LEA@Example.com » est la même
    // (décision de la tranche). Le serveur revérifie de toute façon.
    if (parsed.data.newEmail.toLowerCase() === current.toLowerCase()) {
      setFieldErrors({ newEmail: 'sameEmail' })
      return
    }
    busy.current = true
    setSending(true)
    // Les messages déjà affichés restent jusqu'à la réponse : les retirer maintenant ferait
    // remonter le bouton sous le doigt (charte de design).
    const result = await changeEmail(parsed.data)
    busy.current = false
    setSending(false)
    if (result.ok) {
      focusMessage.current = true
      setSentTo(current)
      return
    }
    const field = fieldOf(result.error)
    setFieldErrors(field ? { [field]: result.error } : {})
    setError(field ? null : result.error)
  }

  // Entrée dans un champ envoie, comme le bouton : seulement une fois le mot de passe tapé (le
  // bouton est inactif avant).
  const submitIfReady = () => {
    if (password.length > 0) void submit()
  }

  // « Retour à Mon compte » remplace « Envoyer le lien » : l'illustration et le titre posés avant
  // lui l'éloignent de la place du bouton touché, où tomberait la seconde tape d'une double tape
  // (charte de design, « une action qui remplace un bouton »). Retourner à son compte n'a rien de
  // grave : pas de garde dans le temps.
  const onBackToAccount = () => {
    // dismissTo : revient à « Mon compte » s'il est dans l'historique (on en vient presque
    // toujours), sinon le met à la place de cette page.
    router.dismissTo('/account')
  }

  const message = (key: AuthErrorKey | undefined) =>
    key ? t(`auth.errors.${key}`, lengths) : undefined

  // Plus accès à son adresse actuelle : le changement se fait alors à la main (scénario). L'aide
  // reste dans les deux états.
  const noAccess = (
    <Hint icon="envelope-simple" text={t('account.changeEmail.noAccess', { contactEmail })} />
  )

  // Chaque état a sa clé (`key`) : React dessine des éléments neufs au changement, au lieu de
  // réutiliser ceux qui sont à la même place (le bouton « Envoyer » ne devient pas « Retour »).
  const content = sentTo ? (
    <Fragment key="sent">
      <Stack align="center">
        <Emblem icon="envelope-simple" />
      </Stack>
      <Text variant="title3" align="center" heading={2}>
        {t('account.changeEmail.sentTitle')}
      </Text>
      {/* Une confirmation, lue sans couper le lecteur d'écran (role « status »), et qui reçoit le
          focus du clavier sur le web. L'adresse citée est l'actuelle, pas la nouvelle. */}
      <Notice
        ref={messageRef}
        tone="success"
        polite
        message={t('account.changeEmail.sentBody', { email: sentTo })}
      />
      <Text tone="secondary">{t('account.changeEmail.sentNext')}</Text>
      <Text variant="callout" tone="muted">
        {t('account.changeEmail.sentNone')}
      </Text>
      {/* L'aide passe avant « Retour » : elle l'éloigne encore de la place du bouton touché (27 pt
          d'écart seulement sur ordinateur sans elle, mesuré dans le navigateur). */}
      {noAccess}
      <Button label={t('account.changeEmail.back')} variant="secondary" onPress={onBackToAccount} />
    </Fragment>
  ) : (
    <Fragment key="form">
      <Stack gap="sm">
        <Text weight={600}>{t('account.changeEmail.current', { email: current })}</Text>
        <Text tone="secondary">{t('account.changeEmail.intro')}</Text>
        <Text tone="secondary">{t('account.changeEmail.steps')}</Text>
      </Stack>
      <FieldGroup>
        <TextField
          label={t('account.changeEmail.newEmail')}
          value={newEmail}
          onChangeText={setNewEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          onSubmitEditing={submitIfReady}
          error={message(fieldErrors.newEmail)}
        />
        <TextField
          label={t('account.changeEmail.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="send"
          onSubmitEditing={submitIfReady}
          error={message(fieldErrors.password)}
        />
      </FieldGroup>
      {error ? <Notice message={t(`auth.errors.${error}`, lengths)} /> : null}
      <Button
        label={sending ? t('account.changeEmail.sending') : t('account.changeEmail.submit')}
        icon="paper-plane-tilt"
        onPress={() => void submit()}
        loading={sending}
        // Impossible d'envoyer sans avoir tapé son mot de passe (comme pour supprimer le compte).
        disabled={password.length === 0}
      />
      {noAccess}
    </Fragment>
  )

  return (
    <Screen onBack={back} title={t('account.changeEmail.title')}>
      {content}
    </Screen>
  )
}
