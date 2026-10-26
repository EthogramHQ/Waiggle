// Page « Suspendre » (tranche 7c, « /suspend?member=<id> »), réservée aux administrateurs. On y
// arrive depuis la page d'un membre, ou depuis une carte de la file (`fromKind`, `fromId` : le
// signalement d'où l'on part, envoyé à l'API pour que la suspension soit dite « après un
// signalement », relecture juridique J2).
//
// - Un membre qui n'est pas suspendu : la durée (7 jours, 30 jours, sans fin ; aucune choisie
//   d'avance, la personne choisit), le fondement (la loi ou les règles), une explication montrée
//   au membre (J9 : les faits et la règle, pas la personne), puis « Suspendre le compte ».
// - Un membre déjà suspendu : la page devient « Lever la suspension », avec la fin prévue (à l'heure
//   de Paris, J4), la raison de la levée (plus tôt, ou erreur, J10) et une explication.
// - L'API peut redemander le mot de passe (`password_required` : une suspension sans fin, ou trop de
//   décisions d'affilée) : le champ apparaît, et « Confirmer » renvoie la même décision avec lui.
//
// La page lit le membre (`Member.moderation`, null pour tout autre visiteur qu'un administrateur :
// la page n'existe alors pas pour lui). L'API refait toutes les vérifications.
import {
  type LiftCause,
  type Member,
  type ModerationDecisionInput,
  REMOVAL_EXPLANATION_MAX,
  REMOVALS_BEFORE_PASSWORD,
  RemovalExplanation,
  type RemovalGround,
  ReportTarget,
  SUSPENSIONS_BEFORE_PASSWORD,
  type SuspensionDuration,
} from '@ruche/contracts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useMember } from '../members/api'
import { useDecide } from '../moderation/api'
import { decisionFailure } from '../moderation/failure'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { Notice } from '../ui/Notice'
import { parisDateTime } from '../ui/parisTime'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { useHydrated } from '../ui/theme/hydration'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SignedOutScreen } from './states'

type Mode = 'suspend' | 'lift'

type Props = {
  /** Le membre visé (l'identifiant de l'adresse). */
  memberId: string
  /** La cible du signalement d'où l'on part (une carte de la file), s'il y en a un. */
  fromKind?: string
  fromId?: string
}

export function SuspendScreen({ memberId, fromKind, fromId }: Props) {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()
  // L'adresse n'est connue que dans le navigateur : la page pré-rendue en reste au chargement.
  const hydrated = useHydrated()
  const member = useMember(memberId, Boolean(session) && hydrated && memberId !== '')
  // La décision prise : la page la dit, et ne change plus de forme quand la page du membre est
  // relue (une suspension faite la ferait devenir « Lever la suspension » sous les yeux).
  const [done, setDone] = useState<{ mode: Mode; name: string } | null>(null)

  if (isPending || !hydrated) return <LoadingScreen />
  if (!session) return <SignedOutScreen />
  const notFound = <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  if (memberId === '') return notFound
  if (done) return <DoneState mode={done.mode} name={done.name} memberId={memberId} />
  if (member.data) {
    const { moderation } = member.data
    // Tout autre visiteur qu'un administrateur : la page n'existe pas pour lui.
    if (!moderation) return notFound
    if (moderation.suspension) {
      return (
        <DecisionForm
          mode="lift"
          member={member.data}
          onDone={() => setDone({ mode: 'lift', name: member.data.name })}
        />
      )
    }
    // Son propre compte, ou celui d'un administrateur : rien à proposer, on dit pourquoi.
    if (!moderation.canSuspend) {
      return (
        <NotFoundState
          title={t(($) => $.moderation.suspend.title, { name: member.data.name })}
          message={t(($) => $.moderation.suspend.notAllowed)}
        />
      )
    }
    const parsed = ReportTarget.safeParse({ kind: fromKind, id: fromId })
    return (
      <DecisionForm
        mode="suspend"
        member={member.data}
        {...(parsed.success ? { fromReport: parsed.data } : null)}
        onDone={() => setDone({ mode: 'suspend', name: member.data.name })}
      />
    )
  }
  if (member.error) {
    const key = errorKey(member.error)
    if (key === 'notFound') return notFound
    if (key === 'unauthorized') return <SignedOutScreen expired />
    return <LoadErrorScreen error={member.error} onRetry={() => void member.refetch()} />
  }
  return <LoadingScreen />
}

/** Le formulaire de la suspension, ou de sa levée. */
function DecisionForm({
  mode,
  member,
  fromReport,
  onDone,
}: {
  mode: Mode
  member: Member
  fromReport?: ReportTarget
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const back = useGoBack({ pathname: '/members/[id]', params: { id: member.id } })
  const signInAgain = useSignInAgain()
  const { decide } = useDecide()
  // Rien n'est choisi d'avance : la durée, le fondement et la raison d'une levée se choisissent.
  const [duration, setDuration] = useState<SuspensionDuration | null>(null)
  const [ground, setGround] = useState<RemovalGround | null>(null)
  const [cause, setCause] = useState<LiftCause | null>(null)
  const [explanation, setExplanation] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  // Le mot de passe, seulement si l'API le redemande ; et s'il a été envoyé avec la décision.
  const [passwordAsked, setPasswordAsked] = useState(false)
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<{ key: ApiErrorKey; passwordSent: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  // Un envoi à la fois : deux touchers rapides ne suspendent qu'une fois (l'état `sending`, lui,
  // n'est à jour qu'au dessin suivant).
  const busy = useRef(false)

  const suspending = mode === 'suspend'
  const suspension = member.moderation?.suspension ?? null
  const text = explanation.trim()
  const ready =
    text !== '' &&
    (suspending ? duration !== null && ground !== null : cause !== null) &&
    (!passwordAsked || password !== '')

  const submit = async () => {
    if (busy.current || !ready) return
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
      onDone()
      return
    }
    if (result.error === 'passwordRequired' && !passwordAsked) {
      // Le champ apparaît, ce qui a été choisi et écrit reste ; l'ancien message s'efface.
      setFailure(null)
      setPasswordAsked(true)
      return
    }
    // Refusé : le message reste au-dessus du bouton jusqu'à la réponse suivante.
    setFailure({ key: result.error, passwordSent: passwordAsked })
  }

  const failureMessage =
    failure === null
      ? null
      : failure.key === 'unauthorized'
        ? t(($) => $.states.expired)
        : decisionFailure(t, failure.key, { passwordSent: failure.passwordSent })

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

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={
        suspending
          ? t(($) => $.moderation.suspend.title, { name: member.name })
          : t(($) => $.moderation.lift.title, { name: member.name })
      }
      subtitle={t(($) => $.member.handle, { handle: member.handle })}
    >
      <Text>
        {suspending ? t(($) => $.moderation.suspend.intro) : t(($) => $.moderation.lift.intro)}
      </Text>
      {current ? (
        <Text variant="callout" weight={600}>
          {current}
        </Text>
      ) : null}

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
        <>
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
        </>
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

      {/* Le mot de passe redemandé par l'API : il arrive au-dessus du bouton, qui devient
          « Confirmer », inactif tant que rien n'est tapé (une double tape ne confirme rien). */}
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

      {/* Tant que le bouton est inactif, la page dit ce qui manque encore (le mot de passe, lui,
          a son champ juste au-dessus). */}
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

      {/* Un refus, au-dessus du bouton : il reste pendant l'envoi suivant, rien ne saute. */}
      {failureMessage ? (
        <Notice
          message={failureMessage}
          action={failure?.key === 'unauthorized' ? signInAgain() : undefined}
        />
      ) : null}

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
    </Screen>
  )
}

/** La décision prise : le message reçoit le focus (le bouton touché a disparu), et une issue. */
function DoneState({ mode, name, memberId }: { mode: Mode; name: string; memberId: string }) {
  const { t } = useTranslation()
  const back = useGoBack({ pathname: '/members/[id]', params: { id: memberId } })
  const doneRef = useRef<Focusable>(null)
  useEffect(() => {
    focusWithoutScroll(doneRef.current)
  }, [])
  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={
        mode === 'suspend'
          ? t(($) => $.moderation.suspend.title, { name })
          : t(($) => $.moderation.lift.title, { name })
      }
    >
      <Notice
        ref={doneRef}
        tone="success"
        polite
        message={
          mode === 'suspend'
            ? t(($) => $.moderation.suspend.done)
            : t(($) => $.moderation.lift.done)
        }
      />
      <Button label={t(($) => $.common.back)} variant="secondary" onPress={back} />
    </Screen>
  )
}
