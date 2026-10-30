// Le formulaire d'inscription (« Créer ton compte ») : code d'invitation, nom affiché, e-mail, mot
// de passe. Il vit dans le panneau d'entrée (AuthScreen) : seul sur téléphone, onglet « Créer un
// compte » sur ordinateur. Un lien d'invitation (/sign-up?code=…) remplit tout seul le code.
// R2 : « Créer mon compte » reste actif ; à l'envoi, chaque champ incomplet dit ce qui lui manque
// et le premier reçoit le focus. Après l'envoi, le membre doit ouvrir le lien reçu par e-mail.
import {
  InviteCode,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SignUpRequest,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signUp } from '../accounts/api'
import type { AuthDraft } from '../accounts/authHandoff'
import type { AuthErrorKey } from '../accounts/errors'
import { setPendingEmail } from '../accounts/pendingVerification'
import { type FieldErrors, fieldErrorsFrom } from '../accounts/validation'
import { firstParam } from '../navigation/params'
import { focusWithoutScroll } from '../ui/focus'
import { HeldSpace } from '../ui/HeldSpace'
import { HoneyMeter } from '../ui/HoneyMeter'
import { Notice } from '../ui/Notice'
import { useRetryAt } from '../ui/RetryAt'
import { RetryButton } from '../ui/RetryButton'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { FieldGroup, TextField, type TextFieldInput } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/** Les champs, dans l'ordre de l'écran : le focus va au premier qui manque. */
const FIELDS = ['inviteCode', 'name', 'email', 'password'] as const

type Props = {
  /** Ce qui est déjà tapé, partagé avec l'onglet voisin (code, nom, adresse ; jamais le mot de passe). */
  draft: AuthDraft
  onDraft: (patch: Partial<AuthDraft>) => void
  /** Va à la connexion : un lien sous le formulaire, sur téléphone (sur ordinateur : l'onglet). */
  onSignIn?: (() => void) | undefined
}

export function SignUpForm({ draft, onDraft, onSignIn }: Props) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const retry = useRetryAt(retryAfter)
  // useRef garde une valeur entre deux affichages sans redessiner : ici, les champs, pour y poser
  // le focus du clavier.
  const inputs = {
    inviteCode: useRef<TextFieldInput>(null),
    name: useRef<TextFieldInput>(null),
    email: useRef<TextFieldInput>(null),
    password: useRef<TextFieldInput>(null),
  }

  // Le code d'un lien d'invitation (/sign-up?code=…). L'adresse de la page n'est connue que dans le
  // navigateur, pas pendant la préparation de la page web : on attend donc d'y être (voir
  // ui/theme/hydration.ts) pour remplir le champ. N'importe qui peut fabriquer un lien : on ne
  // reprend que ce qui a la forme d'un code.
  const params = useLocalSearchParams<{ code?: string }>()
  const codeFromLink = firstParam(params.code) ?? ''
  const hydrated = useHydrated()
  useEffect(() => {
    if (!hydrated || !InviteCode.safeParse(codeFromLink).success) return
    onDraft({ inviteCode: codeFromLink })
    // Puis on retire le code de l'adresse affichée : il ne reste ni dans l'historique du
    // navigateur, ni à l'écran pendant un partage d'écran.
    router.setParams({ code: undefined })
  }, [hydrated, codeFromLink, router, onDraft])

  // Un envoi à la fois : Entrée tapée deux fois, ou Entrée puis le bouton, n'envoient qu'une demande
  // (l'état `loading` n'est relu qu'au dessin suivant, trop tard pour la seconde).
  const busy = useRef(false)

  const submit = async () => {
    if (busy.current || retry.blocked) return
    // 1. Vérification locale avec le même schéma que l'API (packages/contracts).
    const parsed = SignUpRequest.safeParse({
      name: draft.name,
      email: draft.email,
      password,
      inviteCode: draft.inviteCode,
      language: i18n.language,
    })
    if (!parsed.success) {
      const errors = fieldErrorsFrom(parsed.error)
      // Un champ vide dit ce qu'il attend, plutôt que « pas valide ».
      if (!draft.email.trim()) errors.email = 'emailRequired'
      if (!password) errors.password = 'passwordRequired'
      setFieldErrors(errors)
      // Le focus va au premier champ à reprendre (web), sans faire sauter la page.
      const first = FIELDS.find((field) => errors[field])
      if (first) focusWithoutScroll(inputs[first].current)
      return
    }
    setFieldErrors({})
    setError(null)
    setRetryAfter(null)
    busy.current = true
    setLoading(true)
    // 2. Envoi à l'API, puis 3. écran suivant ou message d'erreur.
    const result = await signUp(parsed.data)
    busy.current = false
    setLoading(false)
    if (result.ok) {
      // L'adresse passe par l'état partagé, pas par l'adresse de la page (jur-9).
      setPendingEmail(parsed.data.email)
      router.push('/check-email')
      return
    }
    setError(result.error)
    if (result.error === 'tooManyAttempts') setRetryAfter(result.retryAfterSeconds)
  }

  // Traduit une clé d'erreur de champ en message (ou rien s'il n'y a pas d'erreur).
  const fieldMessage = (key: FieldErrors[keyof FieldErrors]) =>
    key ? t(($) => $.auth.errors[key], lengths) : undefined

  const missing = Math.max(0, PASSWORD_MIN_LENGTH - Array.from(password).length)

  return (
    <>
      <Stack gap="sm">
        <Text variant="title2" heading={1}>
          {t(($) => $.auth.signUp.title)}
        </Text>
        <Text tone="secondary">{t(($) => $.auth.signUp.subtitle)}</Text>
      </Stack>
      {error ? (
        // À la fin de l'attente, « Trop d'essais » s'efface en gardant sa place (C6).
        <HeldSpace vacated={Boolean(retry.ended) && error === 'tooManyAttempts'}>
          <Notice message={t(($) => $.auth.errors[error], lengths)} />
        </HeldSpace>
      ) : null}
      <TextField
        inputRef={inputs.inviteCode}
        label={t(($) => $.auth.fields.inviteCode)}
        value={draft.inviteCode}
        onChangeText={(inviteCode) => onDraft({ inviteCode })}
        hint={t(($) => $.auth.fields.inviteCodeHint)}
        autoCapitalize="none"
        autoComplete="off"
        error={fieldMessage(fieldErrors.inviteCode)}
      />
      <FieldGroup>
        <TextField
          inputRef={inputs.name}
          label={t(($) => $.auth.fields.name)}
          hint={t(($) => $.auth.fields.nameHint)}
          value={draft.name}
          onChangeText={(name) => onDraft({ name })}
          autoComplete="name"
          autoCapitalize="words"
          error={fieldMessage(fieldErrors.name)}
        />
        <TextField
          inputRef={inputs.email}
          label={t(($) => $.auth.fields.email)}
          value={draft.email}
          onChangeText={(email) => onDraft({ email })}
          autoComplete="email"
          keyboardType="email-address"
          error={fieldMessage(fieldErrors.email)}
        />
      </FieldGroup>
      <Stack gap="md">
        <TextField
          inputRef={inputs.password}
          label={t(($) => $.auth.fields.password)}
          value={password}
          onChangeText={setPassword}
          secureTextEntry // masque les caractères tapés (un bouton permet de les afficher)
          autoComplete="new-password" // les gestionnaires de mots de passe proposent d'en générer un
          // Entrée dans le dernier champ envoie, comme le bouton (relecture de design C1).
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
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
              ? t(($) => $.auth.fields.passwordHint, lengths)
              : missing > 0
                ? t(($) => $.auth.passwordMeter.remaining, { count: missing })
                : t(($) => $.auth.passwordMeter.done)
          }
        />
      </Stack>
      <Stack gap="sm">
        {/* Inactif, le bouton dit pourquoi (RetryButton, jur-13). */}
        <RetryButton
          label={t(($) => $.auth.signUp.submit)}
          onPress={submit}
          loading={loading}
          retry={retry}
        />
      </Stack>
      {onSignIn ? (
        <Row justify="center">
          <TextLink label={t(($) => $.auth.signUp.haveAccount)} onPress={onSignIn} />
        </Row>
      ) : null}
    </>
  )
}
