// La feuille « Choisis un nouveau pseudo » (R9, 7d ; planche R9-Activite-Moderation, décision L3 de
// Louis). Quand la modération a retiré le pseudo d'un membre (ou son nom), il s'appelle
// « @membre_4f2a » (ou « Membre ») partout. À sa visite suivante, cette feuille lui propose d'en
// choisir un autre ; « Plus tard » la ferme pour la visite, et un bandeau reste sur « Moi »
// (`ProvisionalNameBanner`).
//
// Elle est montée une fois, dans le cadre de l'appli (`ProvisionalNameGate`), et s'ouvre :
// - seulement si le pseudo (ou le nom) est provisoire ; les deux à la fois : le pseudo d'abord,
//   puis le nom, dans la même feuille ;
// - après `useHydrated()` : la page web pré-rendue ne connaît pas le membre ;
// - jamais par-dessus une autre feuille (`otherSheetOpen`) : elle attend que l'autre se ferme ;
// - une fois par visite : fermée, elle ne revient plus tant qu'elle reste montée, même quand le
//   profil est relu.
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, type Me, NAME_MAX_LENGTH } from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { Button } from '../ui/Button'
import { Sheet } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { useHydrated } from '../ui/theme/hydration'
import { updateProfile } from './api'
import { type ProfileFormErrors, toProfileUpdate } from './form'
import { useSetMe } from './hooks'

/** Ce que la feuille demande : un pseudo, ou un nom. */
type Kind = 'handle' | 'name'

/**
 * La vie de la feuille pendant la visite : pas encore ouverte (elle attend son moment), ouverte
 * sur une question, ou fermée pour de bon.
 */
type Phase = { phase: 'waiting' } | { phase: 'open'; kind: Kind } | { phase: 'closed' }

/** La première question à poser : le pseudo d'abord (choix de la session), puis le nom. */
const firstKind = (me: Me): Kind | null =>
  me.provisional.handle ? 'handle' : me.provisional.name ? 'name' : null

type Props = {
  /** Le profil du membre connecté, tel que /v1/me le décrit. */
  me: Me
  /** Une autre feuille (ou fenêtre) est ouverte : celle-ci attend qu'elle se ferme. */
  otherSheetOpen: boolean
}

export function ProvisionalNameSheet({ me, otherSheetOpen }: Props) {
  const { t } = useTranslation()
  const hydrated = useHydrated()
  const setMe = useSetMe()
  const { refetch: refetchSession } = useSession()

  const [state, setState] = useState<Phase>({ phase: 'waiting' })
  // Changer l'état pendant le dessin est permis par React pour suivre une prop : le moment venu
  // (page hydratée, aucune autre feuille, un nom ou un pseudo provisoire), la feuille s'ouvre. Une
  // fois ouverte, elle ne dépend plus d'`otherSheetOpen` : sa propre couche compte parmi les
  // feuilles ouvertes.
  const wanted = firstKind(me)
  if (state.phase === 'waiting' && hydrated && !otherSheetOpen && wanted) {
    setState({ phase: 'open', kind: wanted })
  }
  const kind = state.phase === 'open' ? state.kind : (wanted ?? 'handle')

  // Ce qui est tapé, et ce qui ne va pas (une règle du pseudo, ou le refus de l'API).
  const [typed, setTyped] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // Un envoi à la fois : une double tape, ou Entrée puis le bouton, n'envoie qu'une fois.
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (sending.current) return
    setState({ phase: 'closed' })
  }

  const handleMessages: Record<NonNullable<ProfileFormErrors['handle']>, string> = {
    handleTooShort: t(($) => $.profile.errors.handleTooShort, { min: HANDLE_MIN_LENGTH }),
    handleTooLong: t(($) => $.profile.errors.handleTooLong, { max: HANDLE_MAX_LENGTH }),
    handleInvalid: t(($) => $.profile.errors.handleInvalid),
    handleReserved: t(($) => $.profile.errors.handleReserved),
    handleTaken: t(($) => $.errors.handleTaken),
    handleChangeLimit: t(($) => $.errors.handleChangeLimit),
  }
  const nameMessages: Record<NonNullable<ProfileFormErrors['name']>, string> = {
    nameRequired: t(($) => $.auth.errors.nameRequired),
    nameTooLong: t(($) => $.profile.errors.nameTooLong, { max: NAME_MAX_LENGTH }),
    invalidCharacters: t(($) => $.profile.errors.invalidCharacters),
  }

  const choose = async () => {
    if (sending.current) return
    // Les règles du formulaire « Mon profil », sur ce seul champ : les autres reçoivent des valeurs
    // sûres, et seul ce champ part. Sans pseudo enregistré à comparer, le pseudo tapé part toujours.
    const checked = toProfileUpdate(
      kind === 'handle'
        ? { name: me.name, bio: '', tools: [], handle: typed }
        : { name: typed, bio: '', tools: [] },
    )
    if (!checked.ok) {
      const { handle, name } = checked.errors
      const message =
        kind === 'handle' ? handle && handleMessages[handle] : name && nameMessages[name]
      setFieldError(message ?? null)
      return
    }
    const changes =
      kind === 'handle' ? { handle: checked.changes.handle } : { name: checked.changes.name }
    setFieldError(null)
    setFailure(null)
    sending.current = true
    setBusy(true)
    const result = await updateProfile(changes).finally(() => {
      sending.current = false
      setBusy(false)
    })
    if (!result.ok) {
      // Un pseudo déjà pris, ou changé trop souvent : sous le champ, la feuille reste ouverte pour
      // en essayer un autre. Le reste, dans le pied.
      if (result.error === 'handleTaken' || result.error === 'handleChangeLimit') {
        setFieldError(handleMessages[result.error])
      } else {
        setFailure(t(($) => $.errors[result.error]))
      }
      return
    }
    setMe(result.data)
    void refetchSession() // la session porte aussi le nom (affiché sur l'accueil)
    // Le pseudo choisi, et le nom encore provisoire : la même feuille passe au nom.
    if (kind === 'handle' && result.data.provisional.name) {
      setTyped('')
      setState({ phase: 'open', kind: 'name' })
      return
    }
    setState({ phase: 'closed' })
  }

  const title =
    kind === 'handle'
      ? t(($) => $.profile.provisional.handleTitle)
      : t(($) => $.profile.provisional.nameTitle)

  return (
    <Sheet
      open={state.phase === 'open'}
      onClose={close}
      title={title}
      compact
      busy={busy}
      notice={failure ? { message: failure } : null}
      footer={
        <Stack gap="sm">
          <Button
            label={
              kind === 'handle'
                ? t(($) => $.profile.provisional.chooseHandle)
                : t(($) => $.profile.provisional.chooseName)
            }
            onPress={() => void choose()}
            loading={busy}
          />
          <Button
            label={t(($) => $.profile.provisional.later)}
            variant="secondary"
            onPress={close}
            disabled={busy}
          />
        </Stack>
      }
    >
      {/* Une étape par question : la clé change avec elle, le champ repart vide. */}
      <Stack key={kind} gap="lg">
        <Text>
          {kind === 'handle'
            ? t(($) => $.profile.provisional.handleLead, { handle: me.handle })
            : t(($) => $.profile.provisional.nameLead, { name: me.name })}
        </Text>
        {kind === 'handle' ? (
          <TextField
            label={t(($) => $.profile.fields.handle)}
            value={typed}
            onChangeText={(value) => {
              setTyped(value)
              setFieldError(null)
            }}
            prefix="@"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            limit={HANDLE_MAX_LENGTH}
            showCount
            hint={t(($) => $.profile.provisional.handleRule, {
              min: HANDLE_MIN_LENGTH,
              max: HANDLE_MAX_LENGTH,
            })}
            error={fieldError ?? undefined}
            onSubmitEditing={() => void choose()}
            returnKeyType="done"
          />
        ) : (
          <TextField
            label={t(($) => $.profile.fields.name)}
            value={typed}
            onChangeText={(value) => {
              setTyped(value)
              setFieldError(null)
            }}
            autoCapitalize="words"
            maxLength={NAME_MAX_LENGTH}
            showCount
            error={fieldError ?? undefined}
            onSubmitEditing={() => void choose()}
            returnKeyType="done"
          />
        )}
        {/* Décision L3 : l'ancien pseudo revient après une contestation, s'il n'en a pas choisi
            d'autre. */}
        {kind === 'handle' ? (
          <Text variant="callout" tone="muted">
            {t(($) => $.profile.provisional.restoreNote)}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  )
}
