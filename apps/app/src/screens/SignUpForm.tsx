// Le formulaire d'inscription (« Créer ton compte ») : code d'invitation, nom affiché, e-mail, mot
// de passe. Il vit dans le panneau d'entrée (AuthScreen) : seul sur téléphone, onglet « Créer un
// compte » sur ordinateur. Un lien d'invitation (/sign-up?code=…) remplit tout seul le code.
// R2 : « Créer mon compte » reste actif ; à l'envoi, chaque champ incomplet dit ce qui lui manque
// et le premier reçoit le focus. Après l'envoi, le membre doit ouvrir le lien reçu par e-mail.
// R11 : deux cases à cocher, « J'accepte les règles » et « J'ai 15 ans ou plus », avec le lien
// « Lire les règles » à part ; sans elles, l'envoi dit ce qui manque au-dessus du bouton.
import {
  InviteCode,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SignUpRequest,
} from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signUp } from '../accounts/api'
import type { AuthDraft } from '../accounts/authHandoff'
import { isAccordError, type SignUpErrorKey } from '../accounts/errors'
import { setPendingEmail } from '../accounts/pendingVerification'
import { type FieldErrors, fieldErrorsFrom } from '../accounts/validation'
import { firstParam } from '../navigation/params'
import { Checkbox } from '../ui/Checkbox'
import { FieldError } from '../ui/FieldError'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
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

/**
 * Les champs, puis les deux cases (R11), dans l'ordre de l'écran : le focus va au premier qui
 * manque. Un champ vide passe donc avant une case non cochée.
 */
const FIELDS = ['inviteCode', 'name', 'email', 'password', 'acceptRules', 'ageDeclared'] as const

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
  // R11 : les deux accords, non cochés au départ. Comme le mot de passe, ils restent dans ce
  // formulaire : la page des règles s'ouvre par-dessus (push) et le retour les retrouve.
  const [acceptRules, setAcceptRules] = useState(false)
  const [ageDeclared, setAgeDeclared] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<SignUpErrorKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const retry = useRetryAt(retryAfter)
  // L'identifiant de la ligne « Il manque… » (le même au pré-rendu web et dans le navigateur).
  const missingId = useId()
  // useRef garde une valeur entre deux affichages sans redessiner : ici, les champs, pour y poser
  // le focus du clavier.
  const inputs = {
    inviteCode: useRef<TextFieldInput>(null),
    name: useRef<TextFieldInput>(null),
    email: useRef<TextFieldInput>(null),
    password: useRef<TextFieldInput>(null),
    acceptRules: useRef<Focusable>(null),
    ageDeclared: useRef<Focusable>(null),
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
      // Le contrat n'accepte que `true` : une case non cochée est refusée comme un champ vide.
      acceptRules,
      ageDeclared,
    })
    if (!parsed.success) {
      const errors = fieldErrorsFrom(parsed.error)
      // Un champ vide dit ce qu'il attend, plutôt que « pas valide ».
      if (!draft.email.trim()) errors.email = 'emailRequired'
      if (!password) errors.password = 'passwordRequired'
      setFieldErrors(errors)
      // Le focus va au premier champ ou à la première case à reprendre (web), sans faire sauter
      // la page ; sur téléphone, le lecteur d'écran y va aussi.
      const first = FIELDS.find((field) => errors[field])
      if (first) {
        focusWithoutScroll(inputs[first].current)
        moveReaderTo(inputs[first].current)
      }
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

  // Le message d'un refus de l'API : les deux accords (R11) sont avec les erreurs de l'API
  // (`errors`), les autres avec celles du compte (`auth.errors`).
  const errorMessage = (key: SignUpErrorKey) => {
    if (isAccordError(key)) {
      const accord = key
      return t(($) => $.errors[accord])
    }
    const account = key
    return t(($) => $.auth.errors[account], lengths)
  }

  // Une case refusée au dernier envoi, avec son message (une propriété facultative ne reçoit pas
  // `undefined` : d'où l'objet vide quand tout va bien).
  const boxError = (key: FieldErrors['acceptRules']) => {
    const message = fieldMessage(key)
    return message ? { error: message } : {}
  }

  // R11 : ce qui manque, dit au-dessus du bouton (planche R11-Inscription) : les règles, l'âge, ou
  // les deux. Calculé au dernier envoi, comme les erreurs des cases : il ne change pas sous le doigt
  // quand on coche, et part au prochain envoi.
  const missingAccords: keyof Translation['rules']['missing'] | null = fieldErrors.acceptRules
    ? fieldErrors.ageDeclared
      ? 'both'
      : 'rules'
    : fieldErrors.ageDeclared
      ? 'age'
      : null

  const missing = Math.max(0, PASSWORD_MIN_LENGTH - Array.from(password).length)

  return (
    <>
      {/* R11 (« Moins de mots ») : le titre seul, sans sous-titre. */}
      <Text variant="title2" heading={1}>
        {t(($) => $.auth.signUp.title)}
      </Text>
      {error ? (
        // À la fin de l'attente, « Trop d'essais » s'efface en gardant sa place (C6).
        <HeldSpace vacated={Boolean(retry.ended) && error === 'tooManyAttempts'}>
          <Notice message={errorMessage(error)} />
        </HeldSpace>
      ) : null}
      {/* Le code est dans un groupe à lui, comme le nom : son aide commence alors au même bord
          que celle du nom (hors du groupe, elle était à 50 pt, l'autre à 34 : relecture R4, M2). */}
      <FieldGroup>
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
      </FieldGroup>
      <FieldGroup>
        <TextField
          inputRef={inputs.name}
          label={t(($) => $.auth.fields.name)}
          hint={t(($) => $.auth.fields.nameHint)}
          value={draft.name}
          onChangeText={(name) => onDraft({ name })}
          // La limite du contrat, comme dans Mon profil : le compteur « 3 / 30 » la montre avant l'envoi.
          maxLength={NAME_MAX_LENGTH}
          showCount
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
      {/* R11 : les deux accords. Le libellé de chaque case est son nom lu ; le lien des règles est à
          part, hors de la case (relecture du plan, D3) : dans le libellé, le lecteur d'écran ne
          l'atteindrait pas, et le toucher cocherait la case. Il ouvre la page par-dessus. */}
      <Stack gap="xs">
        <Checkbox
          ref={inputs.acceptRules}
          label={t(($) => $.rules.accept)}
          value={acceptRules}
          onValueChange={setAcceptRules}
          {...boxError(fieldErrors.acceptRules)}
        />
        <Row>
          <TextLink label={t(($) => $.rules.read)} onPress={() => router.push('/rules')} />
        </Row>
        <Checkbox
          ref={inputs.ageDeclared}
          label={t(($) => $.rules.age)}
          value={ageDeclared}
          onValueChange={setAgeDeclared}
          {...boxError(fieldErrors.ageDeclared)}
        />
      </Stack>
      <Stack gap="sm">
        {/* Ce qui manque : une région toujours là, vide tant que rien ne manque, lue poliment après
            l'erreur de la case qui reçoit le focus. */}
        <FieldError
          id={missingId}
          message={missingAccords ? t(($) => $.rules.missing[missingAccords]) : undefined}
        />
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
