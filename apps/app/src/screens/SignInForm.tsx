// Le formulaire de connexion (« Te revoilà ») : e-mail et mot de passe. Il vit dans le panneau
// d'entrée (AuthScreen) : seul sur téléphone, onglet « Se connecter » sur ordinateur.
// « Trop d'essais » (R2, décision D3) : le serveur dit combien de temps attendre (Retry-After) ;
// le bouton reste inactif jusqu'à l'heure dite, écrite en clair, puis se libère tout seul.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SignInRequest } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn } from '../accounts/api'
import type { AuthDraft } from '../accounts/authHandoff'
import type { AuthErrorKey } from '../accounts/errors'
import { type FieldErrors, fieldErrorsFrom } from '../accounts/validation'
import { safeNext } from '../navigation/next'
import { firstParam } from '../navigation/params'
import { HeldSpace } from '../ui/HeldSpace'
import { Notice } from '../ui/Notice'
import { useRetryAt } from '../ui/RetryAt'
import { RetryButton } from '../ui/RetryButton'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

type Props = {
  /** Ce qui est déjà tapé, partagé avec l'onglet voisin (l'adresse). */
  draft: AuthDraft
  onDraft: (patch: Partial<AuthDraft>) => void
  /** Va à l'inscription : un lien sous le formulaire, sur téléphone (sur ordinateur : l'onglet). */
  onSignUp?: (() => void) | undefined
}

export function SignInForm({ draft, onDraft, onSignUp }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  // useLocalSearchParams : les paramètres de l'adresse (?next=/members/abc). La page où revenir
  // après la connexion, seulement si c'est bien une page de l'appli (voir navigation/next.ts).
  const params = useLocalSearchParams<{ next?: string | string[]; announce?: string | string[] }>()
  const next = safeNext(firstParam(params.next))
  // « Mot de passe changé » (R2) : la page du nouveau mot de passe envoie ici avec
  // ?announce=passwordChanged. L'adresse n'est connue que dans le navigateur : on attend d'y être
  // (ui/theme/hydration.ts). Seule cette valeur exacte affiche le message : une adresse fabriquée
  // ne fait rien dire d'autre à la page. Puis le paramètre quitte l'adresse (un rechargement ne
  // redit rien), et le message reste, gardé ici.
  const announce = firstParam(params.announce)
  const hydrated = useHydrated()
  const [passwordChanged, setPasswordChanged] = useState(false)
  // Une seule fois : le faux routeur des tests est neuf à chaque dessin, et relancerait l'effet.
  const announced = useRef(false)
  useEffect(() => {
    if (!hydrated || announced.current || announce !== 'passwordChanged') return
    announced.current = true
    setPasswordChanged(true)
    router.setParams({ announce: undefined })
  }, [hydrated, announce, router])
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [loading, setLoading] = useState(false)
  // Le délai donné par le serveur après « trop d'essais » ; le hook en tire l'heure et le blocage.
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const retry = useRetryAt(retryAfter)
  // Un envoi à la fois : Entrée tapée deux fois dans le mot de passe, ou Entrée puis le bouton,
  // n'envoient qu'une demande (l'état `loading` n'est relu qu'au dessin suivant, trop tard).
  const busy = useRef(false)

  const submit = async () => {
    if (busy.current || retry.blocked) return
    const parsed = SignInRequest.safeParse({ email: draft.email, password })
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error))
      return
    }
    setFieldErrors({})
    setError(null)
    // Un nouveau refus avec le même délai doit relancer l'attente : on repart de rien.
    setRetryAfter(null)
    busy.current = true
    setLoading(true)
    const result = await signIn(parsed.data)
    busy.current = false
    setLoading(false)
    // replace (et non push) : le bouton « retour » ne ramènera pas sur l'écran de connexion.
    if (result.ok) {
      router.replace(next ?? '/')
      return
    }
    setError(result.error)
    if (result.error === 'tooManyAttempts') setRetryAfter(result.retryAfterSeconds)
  }

  return (
    <>
      <Stack gap="sm">
        <Text variant="title2" heading={1}>
          {t(($) => $.auth.signIn.title)}
        </Text>
        <Text tone="secondary">{t(($) => $.auth.signIn.subtitle)}</Text>
      </Stack>
      {passwordChanged && !error ? (
        // Une confirmation, lue sans couper le lecteur d'écran (role « status »).
        <Notice tone="success" polite message={t(($) => $.auth.signIn.passwordChanged)} />
      ) : null}
      {error ? (
        // À la fin de l'attente, « Trop d'essais » n'est plus vrai : le message s'efface, mais sa
        // place reste vide jusqu'au prochain envoi (rien ne remonte sous le doigt, C6).
        <HeldSpace vacated={Boolean(retry.ended) && error === 'tooManyAttempts'}>
          <Notice
            message={t(($) => $.auth.errors[error], lengths)}
            // Trop d'essais : plutôt que d'attendre, on peut choisir un nouveau mot de passe.
            action={
              error === 'tooManyAttempts'
                ? {
                    label: t(($) => $.auth.chooseNewPassword),
                    onPress: () => router.push('/forgot-password'),
                  }
                : undefined
            }
          />
        </HeldSpace>
      ) : null}
      <Stack gap="xs">
        <FieldGroup>
          <TextField
            label={t(($) => $.auth.fields.email)}
            value={draft.email}
            onChangeText={(email) => onDraft({ email })}
            autoComplete="email"
            keyboardType="email-address"
            error={fieldErrors.email ? t(($) => $.auth.errors.invalidEmail) : undefined}
          />
          <TextField
            label={t(($) => $.auth.fields.password)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            // Entrée dans le dernier champ envoie, comme le bouton (relecture de design C1).
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        </FieldGroup>
        <Row justify="end">
          <TextLink
            label={t(($) => $.auth.signIn.forgotPassword)}
            onPress={() => router.push('/forgot-password')}
          />
        </Row>
      </Stack>
      <Stack gap="sm">
        {/* Inactif, le bouton dit pourquoi : la phrase de l'heure (web), un indice (téléphone). */}
        <RetryButton
          label={t(($) => $.auth.signIn.submit)}
          onPress={submit}
          loading={loading}
          retry={retry}
        />
      </Stack>
      {onSignUp ? (
        <Row gap="sm" justify="center" wrap>
          <Text variant="callout" tone="secondary">
            {t(($) => $.auth.signIn.noAccount)}
          </Text>
          <TextLink label={t(($) => $.auth.signIn.createOne)} onPress={onSignUp} />
        </Row>
      ) : null}
    </>
  )
}
