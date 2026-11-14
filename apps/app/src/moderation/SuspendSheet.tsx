// La fenêtre « Suspendre » de la modération (R9, planche R9-Suspendre), qui remplace la page
// `/suspend` de la tranche 7c. Elle s'ouvre depuis le détail d'un signalement (« Suspendre le
// compte ») ou depuis la page d'un membre ; sur téléphone, une feuille du bas, sur ordinateur, un
// panneau centré.
//
// - Un membre qui n'est pas suspendu : la durée (7 jours, 30 jours, sans fin), le fondement (la loi
//   ou les règles), rien de choisi d'avance ; une explication montrée au membre (J9 : les faits et la
//   règle, pas la personne), puis « Suspendre le compte ». Ouverte depuis un signalement
//   (`fromReport`), elle le dit (la suspension le suit, J2) et l'envoie à l'API.
// - Un membre déjà suspendu : la même fenêtre devient « Lever la suspension », avec la fin prévue (à
//   l'heure de Paris, J4), la raison de la levée (plus tôt, ou erreur, J10) et une explication.
// - L'API peut redemander le mot de passe (`password_required`) : le champ apparaît, et
//   « Confirmer » renvoie la même décision avec lui.
// - Une décision prise : la fenêtre se ferme, et « Compte suspendu. » (ou « Suspension levée. »)
//   s'annonce par un message bref (un message dans une fenêtre fermée ne se lirait pas).
//
// La fenêtre lit le membre (`Member.moderation`, null pour tout autre visiteur qu'un
// administrateur : rien à lui offrir). L'API refait toutes les vérifications.
import {
  type LiftCause,
  type Member,
  type ModerationDecisionInput,
  REMOVAL_EXPLANATION_MAX,
  REMOVALS_BEFORE_PASSWORD,
  RemovalExplanation,
  type RemovalGround,
  type ReportTarget,
  SUSPENSIONS_BEFORE_PASSWORD,
  type SuspensionDuration,
} from '@ruche/contracts'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useMember } from '../members/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { isRecentAccount } from '../ui/AuthorRecord'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { Hint } from '../ui/Hint'
import { parisDateTime } from '../ui/parisTime'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { useHydrated } from '../ui/theme/hydration'
import { useToast } from '../ui/theme/toast'
import { useNameOf } from '../useNameOf'
import { useDecide } from './api'
import { decisionFailure } from './failure'

/** Ce que la file sait de l'auteur (sa fiche) : de quoi écrire le sous-titre de la planche. */
export type SuspendSheetAuthor = {
  handle: string
  joinedAt: string
  removals: number
  suspensions: number
}

type Props = {
  /** Le membre visé. */
  memberId: string
  open: boolean
  /** « Annuler », la croix, Échap, le voile, ou une décision prise : la fenêtre se ferme. */
  onClose: () => void
  /** Le signalement d'où l'on part (le détail de la file), envoyé tel quel à l'API (J2). */
  fromReport?: ReportTarget
  /**
   * La fiche de l'auteur, quand la file la connaît : le sous-titre (« @gains_rapides · inscription
   * le 22 oct. · déjà décidé : 1 retrait ») ne paraît qu'avec elle.
   */
  author?: SuspendSheetAuthor
}

type Mode = 'suspend' | 'lift'

export function SuspendSheet({ memberId, open, onClose, fromReport, author }: Props) {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  const signInAgain = useSignInAgain()
  const toSource = useMediaSources()
  // La session d'abord (comme l'ancienne page `/suspend`) : une lecture en échec propose de
  // réessayer, jamais de se connecter ; sans session, rien n'est demandé à l'API.
  const { state, session, retry } = useMemberSession()
  // Le membre ne se lit que dans le navigateur, fenêtre ouverte : rien au pré-rendu.
  const hydrated = useHydrated()
  const member = useMember(memberId, open && hydrated && Boolean(session) && memberId !== '')
  const data = member.data
  const moderation = data?.moderation ?? null
  const mode: Mode = moderation?.suspension ? 'lift' : 'suspend'

  const title = data
    ? mode === 'lift'
      ? t(($) => $.moderation.lift.title, { nameOf: nameOf(data.name) })
      : t(($) => $.moderation.suspend.title, { nameOf: nameOf(data.name) })
    : t(($) => $.moderation.suspendAction)

  // Le sous-titre de la planche : le pseudo, l'inscription, ce qui a déjà été décidé ; sans la
  // fiche de la file (ouverte depuis la page du membre), le pseudo seul.
  const authorLine = useAuthorLine(author)
  const recent = useRecentAccount(author?.joinedAt)

  // Ce que la fenêtre peut offrir : un formulaire, ou la raison pour laquelle il n'y en a pas.
  const failureKey = member.error ? errorKey(member.error) : null
  let body:
    | 'form'
    | 'loading'
    | 'error'
    | 'none'
    | 'blocked'
    | 'self'
    | 'admin'
    | 'sessionError'
    | 'signedOut'
    | 'expired' = 'loading'
  if (state === 'error') body = 'sessionError'
  else if (state === 'signedOut') body = 'signedOut'
  else if (data) {
    if (!moderation) body = 'none'
    else if (moderation.suspension) body = data.isBlocked ? 'blocked' : 'form'
    else if (!moderation.canSuspend) {
      // Sa propre page passe avant (l'administrateur qui la regarde est administrateur), puis le
      // rôle : aucun administrateur ne suspend un autre administrateur, blocage ou non.
      if (data.isMe) body = 'self'
      else if (moderation.isAdmin) body = 'admin'
      else body = data.isBlocked ? 'blocked' : 'admin'
    } else body = 'form'
  } else if (failureKey === 'unauthorized') body = 'expired'
  else if (member.error) body = 'error'

  // Le formulaire, quand il y en a un. Une seule feuille pour tous les états : celle du chargement
  // devient celle du formulaire sans se refermer ni se rouvrir (une feuille montée déjà ouverte
  // ne s'animerait pas, et le focus posé dans la première se perdrait).
  const form = useDecisionForm({
    open,
    onClose,
    mode,
    member: body === 'form' ? (data ?? null) : null,
    ...(fromReport ? { fromReport } : null),
  })

  const reasons = {
    blocked: t(($) => $.moderation.blockedTarget),
    self: t(($) => $.moderation.suspend.notAllowedSelf),
    admin: t(($) => $.moderation.suspend.notAllowedAdmin),
  }

  // Sous le titre (planche R9-Suspendre) : la photo, « Compte récent » sous 14 jours, puis le
  // pseudo, l'inscription et ce qui a déjà été décidé. Seulement quand il y a un formulaire : un
  // refus ou une erreur se lisent sans elle.
  const identity =
    data && body === 'form' ? (
      <Row gap="md">
        <Avatar
          name={data.name}
          source={toSource(data.avatarUrl)}
          label={data.name}
          size={AVATAR_SIZE}
        />
        <Stack gap="xs" grow>
          {recent ? <StatusPill label={t(($) => $.moderation.authorCard.recent)} /> : null}
          <Text tone="secondary">
            {authorLine ?? t(($) => $.member.handle, { handle: data.handle })}
          </Text>
        </Stack>
      </Row>
    ) : null

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      // La fenêtre s'ouvre sous le doigt de « Suspendre » : ses boutons ignorent une double tape.
      guardTaps
      {...(form ? form.sheet : null)}
    >
      {form ? (
        <Stack gap="lg">
          {identity}
          {form.content}
        </Stack>
      ) : null}
      {body === 'sessionError' ? (
        <StateMessage
          kind="error"
          level={2}
          title={t(($) => $.states.errorTitle)}
          message={t(($) => $.account.loadError)}
          actions={[{ label: t(($) => $.common.retry), onPress: retry }]}
        />
      ) : null}
      {body === 'signedOut' || body === 'expired' ? (
        <StateMessage
          kind="signedOut"
          level={2}
          title={t(($) => $.states.signedOutTitle)}
          message={body === 'expired' ? t(($) => $.states.expired) : t(($) => $.home.membersOnly)}
          // « Me connecter » ramène ici après la connexion (?next=) ; la feuille, posée sur sa
          // propre adresse, se ferme d'elle-même quand la page de connexion s'ouvre.
          actions={[signInAgain()]}
        />
      ) : null}
      {body === 'loading' ? <StateMessage kind="loading" level={2} /> : null}
      {body === 'none' ? (
        <StateMessage kind="notFound" level={2} title={t(($) => $.states.notFoundTitle)} />
      ) : null}
      {body === 'blocked' || body === 'self' || body === 'admin' ? (
        <Text>{reasons[body]}</Text>
      ) : null}
      {body === 'error' && failureKey ? (
        <StateMessage
          kind="error"
          level={2}
          title={t(($) => $.moderation.suspend.errorTitle)}
          message={t(($) => $.errors[failureKey])}
          actions={[{ label: t(($) => $.common.retry), onPress: () => void member.refetch() }]}
        />
      ) : null}
    </Sheet>
  )
}

/** La photo du membre sous le titre : la taille d'une ligne de liste (SearchScreen), 48 points. */
const AVATAR_SIZE = 48

/**
 * Hook : vrai si le compte a moins de 14 jours (« Compte récent », la règle et son seuil vivent
 * dans `ui/AuthorRecord.tsx`, un seul endroit pour la fiche, la file et cette fenêtre). La date du
 * jour ne se lit qu'une fois la page hydratée (web) : `Date.now()` au pré-rendu différerait du
 * navigateur (#418).
 */
const useRecentAccount = (joinedAt: string | undefined): boolean => {
  const hydrated = useHydrated()
  if (!joinedAt || !hydrated) return false
  return isRecentAccount(joinedAt, new Date())
}

/** Le sous-titre de la planche, ou rien sans la fiche de l'auteur. */
const useAuthorLine = (author: SuspendSheetAuthor | undefined): string | undefined => {
  const { t, i18n } = useTranslation()
  if (!author) return undefined
  const date = parisDateTime(author.joinedAt, i18n.language).date
  const record = [
    author.removals > 0 ? t(($) => $.moderation.record.removals, { count: author.removals }) : null,
    author.suspensions > 0
      ? t(($) => $.moderation.record.suspensions, { count: author.suspensions })
      : null,
  ].filter((part): part is string => part !== null)
  return record.length > 0
    ? t(($) => $.moderation.suspendSheet.subtitle, {
        handle: author.handle,
        date,
        record: record.join(', '),
      })
    : t(($) => $.moderation.suspendSheet.subtitleNew, { handle: author.handle, date })
}

/**
 * Hook : le formulaire de la suspension, ou de sa levée (son contenu, son pied et son message), pour
 * la feuille de SuspendSheet ; null sans membre à suspendre (`member` null).
 */
function useDecisionForm({
  open,
  onClose,
  mode,
  member,
  fromReport,
}: {
  open: boolean
  onClose: () => void
  mode: Mode
  member: Member | null
  fromReport?: ReportTarget
}): {
  sheet: { busy: boolean; notice: SheetNotice | null; footer: ReactNode }
  content: ReactNode
} | null {
  const { t, i18n } = useTranslation()
  const signInAgain = useSignInAgain()
  const toast = useToast()
  const { decide } = useDecide()
  const [duration, setDuration] = useState<SuspensionDuration | null>(null)
  const [ground, setGround] = useState<RemovalGround | null>(null)
  const [cause, setCause] = useState<LiftCause | null>(null)
  const [explanation, setExplanation] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [passwordAsked, setPasswordAsked] = useState(false)
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<{ key: ApiErrorKey; passwordSent: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  // Un envoi à la fois : deux touchers rapides ne suspendent qu'une fois.
  const busy = useRef(false)

  // À chaque ouverture, et pour un autre membre ou un autre mode (une suspension faite devient une
  // levée), un formulaire neuf : rien de la fois d'avant ne reste (voir RemoveSheet).
  const formKey = `${member?.id ?? ''}:${mode}`
  const wasOpen = useRef(open)
  const lastKey = useRef(formKey)
  useEffect(() => {
    if ((open && !wasOpen.current) || formKey !== lastKey.current) {
      setDuration(null)
      setGround(null)
      setCause(null)
      setExplanation('')
      setFieldError(null)
      setPasswordAsked(false)
      setPassword('')
      setFailure(null)
    }
    wasOpen.current = open
    lastKey.current = formKey
  }, [open, formKey])

  const suspending = mode === 'suspend'
  const suspension = member?.moderation?.suspension ?? null
  const text = explanation.trim()
  const ready =
    text !== '' &&
    (suspending ? duration !== null && ground !== null : cause !== null) &&
    (!passwordAsked || password !== '')

  const submit = async () => {
    if (busy.current || !ready || !member) return
    if (!RemovalExplanation.safeParse(text).success) {
      setFieldError(t(($) => $.profile.errors.invalidCharacters))
      return
    }
    setFieldError(null)
    let input: ModerationDecisionInput
    if (suspending) {
      if (!duration || !ground) return
      input = {
        action: 'suspend',
        memberId: member.id,
        duration,
        ground,
        explanation: text,
        ...(fromReport ? { fromReport } : null),
        ...(passwordAsked ? { password } : null),
      }
    } else {
      if (!cause) return
      input = { action: 'lift', memberId: member.id, cause, explanation: text }
    }
    busy.current = true
    setSending(true)
    const result = await decide(input)
    busy.current = false
    setSending(false)
    if (result.ok) {
      // La fenêtre se ferme d'abord : un message bref sous une fenêtre ouverte resterait caché.
      onClose()
      toast.show(
        suspending ? t(($) => $.moderation.suspend.done) : t(($) => $.moderation.lift.done),
      )
      return
    }
    if (result.error === 'passwordRequired' && !passwordAsked) {
      setFailure(null)
      setPasswordAsked(true)
      return
    }
    setFailure({ key: result.error, passwordSent: passwordAsked })
  }

  const notice: SheetNotice | null = failure
    ? failure.key === 'unauthorized'
      ? { message: t(($) => $.states.expired), action: signInAgain() }
      : { message: decisionFailure(t, failure.key, { passwordSent: failure.passwordSent }) }
    : null

  // Ce que la suspension en cours dit d'elle-même : depuis quand, jusqu'à quand (heure de Paris).
  const current = suspension
    ? suspension.endsAt
      ? t(($) => $.moderation.lift.current, {
          since: parisDateTime(suspension.since, i18n.language).date,
          endsAt: parisDateTime(suspension.endsAt, i18n.language).dateTime,
        })
      : t(($) => $.moderation.lift.currentIndefinite, {
          since: parisDateTime(suspension.since, i18n.language).date,
        })
    : null

  if (!member) return null
  return {
    sheet: {
      busy: sending,
      notice,
      footer: (
        <Row gap="sm" justify="end" wrap>
          <Button
            label={t(($) => $.moderation.cancel)}
            variant="secondary"
            onPress={onClose}
            disabled={sending}
          />
          <Button
            key={passwordAsked ? 'password' : mode}
            label={
              passwordAsked
                ? t(($) => $.moderation.password.confirm)
                : suspending
                  ? t(($) => $.moderation.suspend.confirm)
                  : t(($) => $.moderation.lift.confirm)
            }
            // Une suspension retire des droits : bouton rouge. Une levée les rend.
            variant={suspending ? 'danger' : 'primary'}
            onPress={() => void submit()}
            loading={sending}
            disabled={!ready}
          />
        </Row>
      ),
    },
    content: (
      <Stack gap="xl">
        <Stack gap="sm">
          <Text>
            {suspending ? t(($) => $.moderation.suspend.intro) : t(($) => $.moderation.lift.intro)}
          </Text>
          {current ? (
            <Text variant="callout" weight={600}>
              {current}
            </Text>
          ) : null}
        </Stack>

        {suspending ? (
          <>
            <Choices<SuspensionDuration>
              label={t(($) => $.moderation.suspend.durationLabel)}
              options={[
                { value: '7d', label: t(($) => $.moderation.durations['7d']) },
                { value: '30d', label: t(($) => $.moderation.durations['30d']) },
                { value: 'indefinite', label: t(($) => $.moderation.durations.indefinite) },
              ]}
              value={duration}
              onChange={setDuration}
            />
            <Choices<RemovalGround>
              label={t(($) => $.moderation.groundLabel)}
              options={[
                { value: 'illegal', label: t(($) => $.moderation.grounds.illegal) },
                { value: 'rules', label: t(($) => $.moderation.grounds.rules) },
              ]}
              value={ground}
              onChange={setGround}
            />
          </>
        ) : (
          <Stack gap="sm">
            <Choices<LiftCause>
              label={t(($) => $.moderation.lift.causeLabel)}
              options={[
                { value: 'early', label: t(($) => $.moderation.lift.causes.early) },
                { value: 'error', label: t(($) => $.moderation.lift.causes.error) },
              ]}
              value={cause}
              onChange={setCause}
            />
            <Hint icon="info" text={t(($) => $.moderation.lift.causeHint)} />
          </Stack>
        )}

        <TextField
          label={t(($) => $.moderation.explanation)}
          value={explanation}
          onChangeText={setExplanation}
          hint={
            suspending
              ? t(($) => $.moderation.suspend.explanationHint)
              : t(($) => $.moderation.lift.explanationHint)
          }
          error={fieldError ?? undefined}
          multiline
          maxLength={REMOVAL_EXPLANATION_MAX}
          showCount
        />

        {passwordAsked ? (
          <TextField
            label={t(($) => $.moderation.password.label)}
            value={password}
            onChangeText={setPassword}
            hint={t(($) => $.moderation.password.hint, {
              suspensions: SUSPENSIONS_BEFORE_PASSWORD,
              removals: REMOVALS_BEFORE_PASSWORD,
            })}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        ) : null}

        {/* La suspension suit le signalement d'où l'on part (planche R9-Suspendre, J2). */}
        {suspending && fromReport ? (
          <Hint icon="info" text={t(($) => $.moderation.suspendSheet.afterReport)} />
        ) : null}

        {!ready && !passwordAsked ? (
          <Hint
            icon="info"
            text={
              suspending
                ? t(($) => $.moderation.suspend.missing)
                : t(($) => $.moderation.lift.missing)
            }
          />
        ) : null}
      </Stack>
    ),
  }
}
