// La page « Modération » (tranche 7a, « /moderation »), réservée aux administrateurs. Deux onglets :
// « En attente », les signalements regroupés par contenu, du plus ancien au plus récent ; et
// « Retirés », les contenus retirés, qu'on peut rétablir.
//
// Sur un signalement, deux décisions :
// - « Retirer » ouvre une fenêtre qui demande le fondement (la loi, ou les règles de l'appli) puis
//   une explication, montrée à l'auteur (règle 21 de la relecture du plan) ;
// - « Classer sans suite » se fait en un geste.
// Une carte décidée reste à sa place jusqu'au changement d'onglet, avec le résultat à la place de
// ses boutons (« Signalement classé sans suite. ») : la carte suivante ne remonte pas sous le doigt
// (relecture de la tranche 7a : une seconde tape, 700 ms après, classait un signalement non lu).
// En plus, un appui arrivé moins de 600 ms après une décision est ignoré (charte du design, 6c).
// Un administrateur ne décide jamais de ce qui le concerne (son contenu, son profil) : la carte le
// dit, sans bouton (règle 11). Un profil ne se « retire » pas : seulement « Classer sans suite ».
//
// Pour tout autre membre, la page n'existe pas (« Page introuvable ») : l'appli lit `me.isAdmin`,
// et l'API, qui refait la vérification à chaque requête, répond 404 comme à une adresse inconnue.
import {
  IMAGE_INPUT_FIELDS,
  type ModerationDecisionInput,
  type ModerationQueueItem,
  REMOVAL_EXPLANATION_MAX,
  RemovalExplanation,
  type RemovalGround,
  type RemovedItem,
  type ReportSnapshotEntry,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
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
import { excerpt } from '../ui/CommentAction'
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

/**
 * Les champs d'une copie qui sont des images : la copie n'en garde que la clé, jamais le texte. La
 * file les dit à part (`images`), seulement par leur état ; ils n'ont pas de libellé de champ.
 */
type ImageField = (typeof IMAGE_INPUT_FIELDS)[number]
const imageFields: ReadonlySet<string> = new Set(IMAGE_INPUT_FIELDS)
const isTextEntry = (
  entry: ReportSnapshotEntry,
): entry is ReportSnapshotEntry & { field: Exclude<ReportSnapshotEntry['field'], ImageField> } =>
  !imageFields.has(entry.field)

/** Le premier texte d'une copie (le titre d'un projet, le nom d'un profil) : de quoi la reconnaître. */
const firstText = (snapshot: readonly ReportSnapshotEntry[]): string =>
  snapshot.find(isTextEntry)?.value ?? ''

/** Le résultat d'une décision, posé sur sa carte : une confirmation, ou « déjà décidé ». */
type Outcome = { message: string; ok: boolean }

/**
 * Une carte décidée : la liste de React Query l'a déjà ôtée, l'écran la garde à la place qu'elle
 * avait (`index`, son rang parmi les cartes affichées), avec son résultat.
 */
type Decided<Item> = { key: string; index: number; item: Item; outcome: Outcome }

/** Une carte affichée : un élément de la liste, et son résultat s'il a été décidé. */
type Shown<Item> = { key: string; index: number; item: Item; outcome?: Outcome }

/**
 * Les cartes affichées : celles de la liste reçue, et les cartes décidées remises à leur rang.
 * Une carte décidée encore présente dans la liste (la réponse n'a pas encore été appliquée) n'y
 * figure qu'une fois, avec son résultat.
 */
const keepDecided = <Item extends { target: ModerationQueueItem['target'] }>(
  items: readonly Item[],
  decided: readonly Decided<Item>[],
): Shown<Item>[] => {
  const done = new Set(decided.map((entry) => entry.key))
  const shown: Omit<Shown<Item>, 'index'>[] = items
    .map((item) => ({ key: targetKey(item.target), item }))
    .filter((entry) => !done.has(entry.key))
  // Du plus petit rang au plus grand : chaque carte retrouve sa place parmi celles déjà posées.
  for (const entry of [...decided].sort((a, b) => a.index - b.index)) {
    shown.splice(Math.min(entry.index, shown.length), 0, {
      key: entry.key,
      item: entry.item,
      outcome: entry.outcome,
    })
  }
  return shown.map((entry, index) => ({ ...entry, index }))
}

/** Les refus qui rendent une décision sans objet : la file est relue, la carte le dit. */
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

  // Les cartes décidées de chaque onglet, gardées à leur place jusqu'au changement d'onglet.
  const [decidedQueue, setDecidedQueue] = useState<Decided<ModerationQueueItem>[]>([])
  const [decidedRemoved, setDecidedRemoved] = useState<Decided<RemovedItem>[]>([])
  // Les pannes, carte par carte : le message reste jusqu'à la réponse suivante (charte du design :
  // il ne disparaît pas pendant l'envoi, sinon les boutons sautent sous le doigt).
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({})
  // La dernière carte décidée. Le focus du clavier va à son résultat : le bouton touché a laissé
  // la place à ce résultat, et le bouton suivant n'est pas la suite logique (désinscription, 6c).
  const [lastDecided, setLastDecided] = useState<string | null>(null)
  const outcomeRef = useRef<Focusable>(null)
  const focusOutcome = useRef(false)
  useEffect(() => {
    if (lastDecided && focusOutcome.current) {
      focusOutcome.current = false
      focusWithoutScroll(outcomeRef.current)
    }
  }, [lastDecided])

  /** Changer d'onglet est le geste qui range les cartes décidées : la liste repart de zéro. */
  const changeTab = (next: Tab) => {
    setTab(next)
    setDecidedQueue([])
    setDecidedRemoved([])
    setFailures({})
    setLastDecided(null)
  }

  /** Garde la carte décidée à sa place, avec son résultat, et oublie sa dernière panne. */
  const settle = <Item,>(
    record: Dispatch<SetStateAction<Decided<Item>[]>>,
    entry: Decided<Item>,
  ) => {
    record((previous) => [...previous.filter(({ key }) => key !== entry.key), entry])
    setFailures((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => key !== entry.key)),
    )
    setLastDecided(entry.key)
  }

  // L'heure où la liste a bougé pour la dernière fois (une décision arrivée), et la décision en
  // cours. Des refs (useRef) : lues au moment de l'appui, sans attendre que l'écran se redessine.
  const settledAt = useRef(0)
  const deciding = useRef(false)
  // La cible en cours d'envoi, pour montrer la roue sur son bouton.
  const [pending, setPending] = useState<string | null>(null)

  // La fenêtre « Retirer » : ouverte ou non, la carte visée (gardée pendant le fondu de fermeture,
  // pour que le texte rappelé ne disparaisse pas avant la fenêtre), le fondement choisi,
  // l'explication, et les erreurs.
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removing, setRemoving] = useState<{ item: ModerationQueueItem; index: number } | null>(
    null,
  )
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

  /**
   * Envoie une décision en un geste (classer, rétablir). Réussie, ou rendue sans objet par une
   * décision prise ailleurs, elle se pose sur sa carte (`onSettled`) ; une panne s'affiche au-dessus
   * des boutons, qui restent pour réessayer.
   */
  const run = async (
    input: ModerationDecisionInput,
    done: string,
    onSettled: (outcome: Outcome) => void,
  ) => {
    const key = targetKey(input.target)
    deciding.current = true
    setPending(key)
    const result = await decide(input)
    deciding.current = false
    setPending(null)
    settledAt.current = Date.now()
    if (result.ok || settledElsewhere.has(result.error)) {
      focusOutcome.current = true
      onSettled(
        result.ok
          ? { message: done, ok: true }
          : { message: t(`errors.${result.error}`), ok: false },
      )
    } else {
      setFailures((previous) => ({ ...previous, [key]: t(`errors.${result.error}`) }))
    }
  }

  const openRemove = (item: ModerationQueueItem, index: number) => {
    setGround(null)
    setExplanation('')
    setFieldError(null)
    setDialogError(null)
    setRemoving({ item, index })
    setRemoveOpen(true)
  }

  const closeRemove = () => {
    // Pendant l'envoi, la fenêtre reste ouverte (charte : le focus prévu après se perdrait).
    if (!submitting) setRemoveOpen(false)
  }

  const confirmRemove = async () => {
    const target = removing?.item.target
    const text = explanation.trim()
    // Le bouton est inactif tant qu'il manque le fondement ou l'explication ; on vérifie quand même.
    if (!removing || !target || !ground || text === '' || deciding.current) return
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
      settle(setDecidedQueue, {
        key: targetKey(target),
        index: removing.index,
        item: removing.item,
        outcome: result.ok
          ? { message: t('moderation.removedDone'), ok: true }
          : { message: t(`errors.${result.error}`), ok: false },
      })
      setRemoveOpen(false)
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

  /** Ce qui est commun à toutes les cartes : la description lue, le résultat, la panne. */
  const cardState = (key: string, kind: string, text: string, outcome: Outcome | undefined) => ({
    // « Commentaire : Envoie-moi le code… », lu après « Retirer », « Voir »… : de quelle carte il
    // s'agit, quand toutes ont les mêmes boutons.
    description: t('moderation.describe', { kind, excerpt: excerpt(text) }),
    decided: outcome,
    decidedRef: key === lastDecided ? outcomeRef : undefined,
    error: failures[key],
  })

  const queueCard = ({ key, index, item, outcome }: Shown<ModerationQueueItem>) => {
    const kind = t(`moderation.kinds.${item.target.kind}`)
    const actions: ReportCardAction[] = []
    if (!item.concernsMe) {
      // Un profil ne se retire pas (l'API le refuse) ; un contenu déjà retiré ou disparu non plus.
      if (item.target.kind !== 'member' && item.state === 'present') {
        actions.push({
          label: t('moderation.remove'),
          tone: 'danger',
          onPress: guarded(() => openRemove(item, index)),
        })
      }
      actions.push({
        label: t('moderation.dismiss'),
        loading: pending === key,
        onPress: guarded(
          () =>
            void run(
              { action: 'dismiss', target: item.target },
              t('moderation.dismissed'),
              (done) => settle(setDecidedQueue, { key, index, item, outcome: done }),
            ),
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
        {...cardState(key, kind, firstText(item.snapshot), outcome)}
        kind={kind}
        count={t('moderation.count', { count: item.count })}
        // Tranche 7b : la copie champ par champ, chacun sous son libellé ; une copie d'avant 7b
        // n'a qu'un champ, « Texte ». Les images ne sont dites que par leur état.
        snapshot={item.snapshot.filter(isTextEntry).map(({ field, value }) => ({
          label: t(`moderation.fields.${field}`),
          value,
        }))}
        snapshotLabel={t('moderation.snapshot')}
        snapshotNote={item.snapshotsDiffer ? t('moderation.snapshotsDiffer') : undefined}
        images={item.images.map(({ field, state }) =>
          t(`moderation.images.${state}`, { image: t(`moderation.images.${field}`) }),
        )}
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

  const removedCard = ({ key, index, item, outcome }: Shown<RemovedItem>) => {
    const kind = t(`moderation.kinds.${item.target.kind}`)
    return (
      <ReportCard
        key={key}
        {...cardState(key, kind, item.text, outcome)}
        kind={kind}
        snapshot={item.text}
        reasons={[t(`moderation.grounds.${item.ground}`)]}
        details={[item.explanation]}
        when={t('moderation.removedOn', { date: shortDate(item.removedAt, i18n.language) })}
        {...(item.concernsMe ? { status: t('moderation.concernsMe') } : null)}
        // Un projet retiré n'a plus de page, même pour l'administrateur : pas de lien. Une note ou
        // un commentaire retiré : on va voir le projet qui le portait (le contenu n'y est plus).
        {...(item.target.kind === 'project'
          ? null
          : {
              viewLabel: t('moderation.viewProject'),
              onView: () => router.push(viewHref(item.target, item.projectId)),
            })}
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
                        (done) => settle(setDecidedRemoved, { key, index, item, outcome: done }),
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
  const shownQueue = keepDecided(queueItems, decidedQueue)
  const shownRemoved = keepDecided(removedItems, decidedRemoved)
  const count = tab === 'pending' ? shownQueue.length : shownRemoved.length
  const showsError = (!list.data && list.isError) || (retrying && !list.data)

  return (
    <Screen header={<TopNav />} onBack={back} title={t('moderation.title')}>
      <Segmented<Tab>
        label={t('moderation.list')}
        options={[
          { value: 'pending', label: t('moderation.pending') },
          { value: 'removed', label: t('moderation.removed') },
        ]}
        value={tab}
        onChange={changeTab}
      />

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
            {tab === 'pending' ? shownQueue.map(queueCard) : shownRemoved.map(removedCard)}
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
        visible={removeOpen}
        title={t('moderation.removeTitle')}
        // Le contenu visé, rappelé sous le titre : la fenêtre couvre la carte qu'on a touchée.
        quote={
          removing
            ? {
                label: t(`moderation.kinds.${removing.item.target.kind}`),
                text: firstText(removing.item.snapshot),
              }
            : undefined
        }
        message={t('moderation.removeMessage')}
        onDismiss={closeRemove}
        onClosed={() => {
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          // Le focus va au résultat posé sur la carte, à la place de ses boutons.
          requestAnimationFrame(() => focusWithoutScroll(outcomeRef.current))
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
