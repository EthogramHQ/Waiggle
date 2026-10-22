// La page « Modération » (tranche 6d, « /moderation »), réservée aux administrateurs. Deux onglets :
// « En attente », les signalements regroupés par contenu, du plus ancien au plus récent ; et
// « Retirés », les contenus retirés, qu'on peut rétablir.
//
// Sur un signalement, deux décisions :
// - « Retirer » ouvre une fenêtre qui demande le fondement (la loi, ou les règles de l'appli) puis
//   une explication, montrée à l'auteur (règle 21 de la relecture du plan) ;
// - « Classer sans suite » se fait en un geste. La carte suivante remonte alors à la place de celle
//   qu'on vient de classer, sous le doigt : un second appui arrivé moins de 600 ms après (la
//   seconde tape d'une double tape) est ignoré (charte du design, décision de la tranche 6c).
// Un administrateur ne décide jamais de ce qui le concerne (son contenu, son profil) : la carte le
// dit, sans bouton (règle 11). Un profil ne se « retire » pas : seulement « Classer sans suite ».
//
// Pour tout autre membre, la page n'existe pas (« Page introuvable ») : l'appli lit `me.isAdmin`,
// et l'API, qui refait la vérification à chaque requête, répond 404 comme à une adresse inconnue.
import {
  type ModerationDecisionInput,
  type ModerationQueueItem,
  REMOVAL_EXPLANATION_MAX,
  RemovalExplanation,
  type RemovalGround,
  type RemovedItem,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { useDecide, useModerationQueue, useRemovedItems } from '../moderation/api'
import { reasonTextKey, targetKey, viewHref } from '../moderation/present'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { shortDate } from '../projects/format'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { Dialog } from '../ui/Dialog'
import { FeedEnd } from '../ui/FeedEnd'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { ReportCard, type ReportCardAction } from '../ui/ReportCard'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { TextField } from '../ui/TextField'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SignedOutScreen } from './states'

/**
 * Le temps de lire ce qui vient de changer : pendant ces 600 ms après une décision, la liste vient
 * de bouger sous le doigt, et un appui sur une carte est ignoré (charte du design, 6c).
 */
const SETTLE_MS = 600

type Tab = 'pending' | 'removed'

/** Le message posé au-dessus de la liste après une décision : une confirmation ou un refus. */
type Message = { text: string; ok: boolean }

/** Les refus qui rendent la fenêtre « Retirer » sans objet : la file est relue, on la referme. */
const settledElsewhere: ReadonlySet<string> = new Set(['alreadyDecided', 'notFound'])

export function ModerationScreen() {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()
  // Le profil dit si le membre est administrateur ; personne de connecté : on ne demande rien.
  const me = useMe(Boolean(session))
  if (isPending) return <LoadingScreen />
  if (!session) return <SignedOutScreen />
  if (!me.data) {
    if (me.isError) return <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} />
    return <LoadingScreen />
  }
  // Un membre qui n'est pas administrateur : la page n'existe pas pour lui, rien n'est demandé.
  if (!me.data.isAdmin) return <NotFoundState title={t('states.notFoundTitle')} />
  return <AdminModeration />
}

function AdminModeration() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/account')
  const [tab, setTab] = useState<Tab>('pending')
  const queue = useModerationQueue()
  // Les retirés ne sont demandés qu'une fois l'onglet ouvert.
  const removed = useRemovedItems(tab === 'removed')
  const { decide } = useDecide()

  const [message, setMessage] = useState<Message | null>(null)
  const messageRef = useRef<Focusable>(null)
  // Après une décision, le focus du clavier va au message : la carte touchée a disparu, et le
  // bouton qui remonte à sa place n'est pas la suite logique (piège de la désinscription, 6c).
  const focusMessage = useRef(false)
  useEffect(() => {
    if (message && focusMessage.current) {
      focusMessage.current = false
      focusWithoutScroll(messageRef.current)
    }
  }, [message])

  // L'heure où la liste a bougé pour la dernière fois (une décision arrivée), et la décision en
  // cours. Des refs (useRef) : lues au moment de l'appui, sans attendre que l'écran se redessine.
  const settledAt = useRef(0)
  const deciding = useRef(false)
  // La cible en cours d'envoi, pour montrer la roue sur son bouton.
  const [pending, setPending] = useState<string | null>(null)

  // La fenêtre « Retirer » : la cible, le fondement choisi, l'explication, et les erreurs.
  const [removing, setRemoving] = useState<ModerationQueueItem | null>(null)
  const [ground, setGround] = useState<RemovalGround | null>(null)
  const [explanation, setExplanation] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const focusAfterClose = useRef(false)

  // « Réessayer » sur une file en erreur : React Query efface l'erreur pendant la relecture ; on
  // garde l'écran d'erreur (et le focus sur son bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)

  /** Un appui sur une carte, ignoré pendant une décision, et juste après que la liste a bougé. */
  const guarded = (action: () => void) => () => {
    if (deciding.current || Date.now() - settledAt.current < SETTLE_MS) return
    action()
  }

  /** Envoie une décision en un geste (classer, rétablir), puis l'annonce. */
  const run = async (input: ModerationDecisionInput, done: string) => {
    deciding.current = true
    setPending(targetKey(input.target))
    const result = await decide(input)
    deciding.current = false
    setPending(null)
    settledAt.current = Date.now()
    focusMessage.current = true
    setMessage(
      result.ok ? { text: done, ok: true } : { text: t(`errors.${result.error}`), ok: false },
    )
  }

  const openRemove = (item: ModerationQueueItem) => {
    setGround(null)
    setExplanation('')
    setFieldError(null)
    setDialogError(null)
    setRemoving(item)
  }

  const closeRemove = () => {
    // Pendant l'envoi, la fenêtre reste ouverte (charte : le focus prévu après se perdrait).
    if (!submitting) setRemoving(null)
  }

  const confirmRemove = async () => {
    const target = removing?.target
    const text = explanation.trim()
    // Le bouton est inactif tant qu'il manque le fondement ou l'explication ; on vérifie quand même.
    if (!target || !ground || text === '' || deciding.current) return
    if (!RemovalExplanation.safeParse(text).success) {
      setFieldError(t('profile.errors.invalidCharacters'))
      return
    }
    setFieldError(null)
    deciding.current = true
    setSubmitting(true)
    const result = await decide({ action: 'remove', target, ground, explanation: text })
    deciding.current = false
    setSubmitting(false)
    if (result.ok || settledElsewhere.has(result.error)) {
      settledAt.current = Date.now()
      focusAfterClose.current = true
      setMessage(
        result.ok
          ? { text: t('moderation.removedDone'), ok: true }
          : { text: t(`errors.${result.error}`), ok: false },
      )
      setRemoving(null)
    } else {
      // Une panne (réseau, serveur) : la fenêtre reste, avec ce qui a été tapé, pour réessayer.
      setDialogError(t(`errors.${result.error}`))
    }
  }

  // La lecture de la liste affichée, et ses refus qui changent toute la page.
  const list = tab === 'pending' ? queue : removed
  const fatal = !list.data && list.isError ? errorKey(list.error) : null
  // Un administrateur révoqué : l'API ne connaît plus la page.
  if (fatal === 'notFound') return <NotFoundState title={t('states.notFoundTitle')} />
  if (fatal === 'unauthorized') return <SignedOutScreen expired />

  const onRetry = async () => {
    setRetrying(true)
    await list.refetch()
    setRetrying(false)
  }

  const queueCard = (item: ModerationQueueItem) => {
    const key = targetKey(item.target)
    const actions: ReportCardAction[] = []
    if (!item.concernsMe) {
      // Un profil ne se retire pas (l'API le refuse) ; un contenu déjà retiré ou disparu non plus.
      if (item.target.kind !== 'member' && item.state === 'present') {
        actions.push({
          label: t('moderation.remove'),
          tone: 'danger',
          onPress: guarded(() => openRemove(item)),
        })
      }
      actions.push({
        label: t('moderation.dismiss'),
        loading: pending === key,
        onPress: guarded(
          () => void run({ action: 'dismiss', target: item.target }, t('moderation.dismissed')),
        ),
      })
    }
    const status = item.concernsMe
      ? t('moderation.concernsMe')
      : item.state === 'present'
        ? undefined
        : t(`moderation.state.${item.state}`)
    return (
      <ReportCard
        key={key}
        kind={t(`moderation.kinds.${item.target.kind}`)}
        count={t('moderation.count', { count: item.count })}
        snapshot={item.snapshot}
        snapshotLabel={t('moderation.snapshot')}
        reasons={item.reasons.map(({ reason, count }) =>
          t('moderation.reasonCount', {
            reason: t(`report.reasons.${reasonTextKey[reason]}`),
            count,
          }),
        )}
        details={item.details}
        when={t('moderation.since', { date: shortDate(item.firstReportedAt, i18n.language) })}
        {...(status ? { status } : null)}
        viewLabel={t('moderation.view')}
        onView={() => router.push(viewHref(item.target, item.projectId))}
        actions={actions}
      />
    )
  }

  const removedCard = (item: RemovedItem) => {
    const key = targetKey(item.target)
    return (
      <ReportCard
        key={key}
        kind={t(`moderation.kinds.${item.target.kind}`)}
        snapshot={item.text}
        reasons={[t(`moderation.grounds.${item.ground}`)]}
        details={[item.explanation]}
        when={t('moderation.removedOn', { date: shortDate(item.removedAt, i18n.language) })}
        {...(item.concernsMe ? { status: t('moderation.concernsMe') } : null)}
        viewLabel={t('moderation.view')}
        onView={() => router.push(viewHref(item.target, item.projectId))}
        actions={
          item.concernsMe
            ? []
            : [
                {
                  label: t('moderation.restore'),
                  loading: pending === key,
                  onPress: guarded(
                    () =>
                      void run(
                        { action: 'restore', target: item.target },
                        t('moderation.restoredDone'),
                      ),
                  ),
                },
              ]
        }
      />
    )
  }

  const queueItems = queue.data?.pages.flatMap((page) => page.items) ?? []
  const removedItems = removed.data?.pages.flatMap((page) => page.items) ?? []
  const count = tab === 'pending' ? queueItems.length : removedItems.length
  const showsError = (!list.data && list.isError) || (retrying && !list.data)

  return (
    <Screen header={<TopNav />} onBack={back} title={t('moderation.title')}>
      <Segmented<Tab>
        label={t('moderation.title')}
        options={[
          { value: 'pending', label: t('moderation.pending') },
          { value: 'removed', label: t('moderation.removed') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {/* Le dernier message reste jusqu'à la décision suivante : il ne disparaît pas pendant
          l'envoi, pour que les cartes en dessous ne remontent pas sous le doigt. */}
      {message ? (
        <Notice
          ref={messageRef}
          message={message.text}
          tone={message.ok ? 'success' : 'error'}
          polite={message.ok}
        />
      ) : null}

      {showsError ? (
        <StateMessage
          kind="error"
          title={t('moderation.errorTitle')}
          message={t(`errors.${errorKey(list.error)}`)}
          actions={[{ label: t('common.retry'), onPress: () => void onRetry(), loading: retrying }]}
        />
      ) : !list.data ? (
        <StateMessage kind="loading" message={t('common.loading')} />
      ) : count === 0 ? (
        <StateMessage
          kind="empty"
          message={tab === 'pending' ? t('moderation.empty') : t('moderation.emptyRemoved')}
        />
      ) : (
        <Stack gap="lg">
          {/* Une liste annoncée : « liste, 4 éléments », et on saute d'une carte à l'autre. */}
          <Stack gap="md" accessibilityRole="list">
            {tab === 'pending' ? queueItems.map(queueCard) : removedItems.map(removedCard)}
          </Stack>
          <FeedEnd
            state={
              list.isFetchingNextPage
                ? 'loading'
                : list.isFetchNextPageError
                  ? 'error'
                  : list.hasNextPage
                    ? 'more'
                    : 'end'
            }
            moreLabel={t('moderation.more')}
            endLabel={t('moderation.end')}
            errorLabel={t('moderation.moreError')}
            retryLabel={t('common.retry')}
            // Une seule demande à la fois, même après un double clic.
            onMore={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage()
            }}
          />
        </Stack>
      )}

      <Dialog
        visible={removing !== null}
        title={t('moderation.removeTitle')}
        message={t('moderation.removeMessage')}
        onDismiss={closeRemove}
        onClosed={() => {
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          requestAnimationFrame(() => focusWithoutScroll(messageRef.current))
        }}
      >
        <Choices<RemovalGround>
          label={t('moderation.groundLabel')}
          options={[
            { value: 'illegal', label: t('moderation.grounds.illegal') },
            { value: 'rules', label: t('moderation.grounds.rules') },
          ]}
          value={ground}
          onChange={setGround}
        />
        <TextField
          label={t('moderation.explanation')}
          value={explanation}
          onChangeText={setExplanation}
          hint={t('moderation.explanationHint')}
          error={fieldError ?? undefined}
          multiline
          maxLength={REMOVAL_EXPLANATION_MAX}
          showCount
        />
        {dialogError ? <Notice message={dialogError} /> : null}
        <Button
          label={t('moderation.confirmRemove')}
          variant="confirm"
          onPress={() => void confirmRemove()}
          loading={submitting}
          // Impossible de retirer sans fondement ni explication (l'auteur doit savoir pourquoi).
          disabled={ground === null || explanation.trim() === ''}
        />
        <Button
          label={t('moderation.cancel')}
          variant="secondary"
          onPress={closeRemove}
          disabled={submitting}
        />
      </Dialog>
    </Screen>
  )
}
