// La page « Modération » (« /moderation »), réservée aux administrateurs. Refaite en R9 (planches
// `R9-Moderation-Desktop`, `R9-Moderation-Telephone` et `R9-Moderation-Detail-Telephone`).
//
// Sur un grand écran, trois colonnes : la file (« À traiter (N) » / « Retirés », avec « Outils » et
// « Catégories » en tête), le détail de l'élément choisi (`moderation/ModerationDetail`), et
// l'historique récent, une ligne colorée par décision. Sur téléphone, la file seule, avec un bouton
// « Historique » ; toucher un élément ouvre son détail en page.
//
// L'élément choisi vit dans l'adresse (`?item=`, une clé par cible **et** par partie, voir
// `moderation/present.ts`) : le projet entier et sa 2e photo sont deux éléments, jamais confondus.
// Sur ordinateur, sans `?item=`, le premier élément est montré. Une clé inconnue (un signalement
// déjà traité ailleurs, une adresse gardée) dit « Ce signalement n'est plus dans la file. », avec
// « Retour à la file ».
//
// Les décisions :
// - « Retirer » ouvre la feuille `RemoveSheet` (la partie seule ou tout le contenu, le fondement,
//   l'explication montrée à l'auteur, le mot de passe si l'API le redemande) ;
// - « Classer sans suite » et « Rétablir » se font en un geste ;
// - « Suspendre », sur la fiche de l'auteur, ouvre la feuille `SuspendSheet` à son adresse
//   (`/suspend`), posée sur cette page, en disant de quel signalement on part (J2).
// Un élément décidé garde son résultat dans le détail, à la place des boutons, jusqu'au choix
// suivant ; il garde aussi sa place dans la file : rien ne remonte sous le doigt (relecture 7a). Un
// appui arrivé moins de 600 ms après une décision est ignoré (charte du design, 6c).
// Un administrateur ne décide jamais de ce qui le concerne (son contenu, son profil) : le détail le
// dit, sans bouton (règle 11). Un profil entier ne se « retire » pas : il se suspend.
//
// L'historique complet (7c) reste une vue de la page (`?tab=history`, filtrable sur un membre :
// `&member=<id>`, depuis sa page ou « Voir ses décisions ») : « Voir tout l'historique » y mène.
//
// Pour tout autre membre, la page n'existe pas (« Page introuvable ») : l'appli lit `me.isAdmin`,
// et l'API, qui refait la vérification à chaque requête, répond 404 comme à une adresse inconnue.
import type {
  ModerationDecisionInput,
  ModerationQueueItem,
  PartOut,
  RemovedItem,
  ReportPart,
  StoredReportTarget,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { decisionFailure } from '../moderation/failure'
import {
  detailTitle,
  firstText,
  ModerationDetail,
  type Outcome,
} from '../moderation/ModerationDetail'
import { itemKey, partText, reasonTextKey, viewHref } from '../moderation/present'
import { RemoveSheet } from '../moderation/RemoveSheet'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { shortDate } from '../projects/format'
import { isRecentAccount } from '../ui/AuthorRecord'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { excerpt } from '../ui/CommentAction'
import { DecisionCard } from '../ui/DecisionCard'
import { FeedEnd, useFirstArrived } from '../ui/FeedEnd'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import type { IconName } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { ReportCard, type ReportCardAction } from '../ui/ReportCard'
import { relativeDate } from '../ui/relativeDate'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'

/**
 * Le temps de lire ce qui vient de changer : pendant ces 600 ms après une décision, un appui sur
 * une décision (ou, sur ordinateur, sur la file) est ignoré (charte du design, 6c).
 */
const SETTLE_MS = 600

/** Le nombre de décisions de l'historique récent, à côté du détail. */
const RECENT_DECISIONS = 6

/**
 * Le début de la copie montré dans la file, en caractères : la ligne se coupe de toute façon à la
 * largeur de la colonne ; le détail, à côté, donne la copie entière (une seule fois sur la page).
 */
const QUEUE_EXCERPT = 64

type Tab = 'pending' | 'removed' | 'history'

/** L'icône de chaque sorte de contenu, dans la tuile d'un élément de la file. */
const kindIcon: Record<StoredReportTarget['kind'], IconName> = {
  project: 'squares-four',
  update: 'squares-four',
  note: 'chat-circle',
  comment: 'chat-circle',
  member: 'user',
  call: 'squares-four',
  message: 'chat-circle',
}

/** La partie telle que l'API l'attend : sans `mediaId` pour une partie sans photo (schéma strict). */
const sentPart = (part: PartOut | null): { part: ReportPart } | null =>
  part
    ? { part: { field: part.field, ...(part.mediaId ? { mediaId: part.mediaId } : null) } }
    : null

/**
 * Un élément décidé : la liste de React Query l'a peut-être déjà ôté, l'écran le garde à la place
 * qu'il avait (`index`, son rang parmi les éléments affichés), avec son résultat.
 */
type Decided<Item> = { key: string; index: number; item: Item; outcome: Outcome }

/** Un élément affiché : un élément de la liste, et son résultat s'il a été décidé. */
type Shown<Item> = { key: string; index: number; item: Item; outcome?: Outcome }

/**
 * Les éléments affichés : ceux de la liste reçue, et les éléments décidés remis à leur rang. Un
 * élément décidé encore présent dans la liste n'y figure qu'une fois, avec son résultat.
 */
const keepDecided = <Item extends { target: StoredReportTarget; part: PartOut | null }>(
  items: readonly Item[],
  decided: readonly Decided<Item>[],
): Shown<Item>[] => {
  const done = new Set(decided.map((entry) => entry.key))
  const shown: Omit<Shown<Item>, 'index'>[] = items
    .map((item) => ({ key: itemKey(item.target, item.part), item }))
    .filter((entry) => !done.has(entry.key))
  // Du plus petit rang au plus grand : chaque élément retrouve sa place parmi ceux déjà posés.
  for (const entry of [...decided].sort((a, b) => a.index - b.index)) {
    shown.splice(Math.min(entry.index, shown.length), 0, {
      key: entry.key,
      item: entry.item,
      outcome: entry.outcome,
    })
  }
  return shown.map((entry, index) => ({ ...entry, index }))
}

/** Les refus qui rendent une décision sans objet : la file est relue, le détail le dit. */
const settledElsewhere: ReadonlySet<string> = new Set(['alreadyDecided', 'notFound'])

export function ModerationScreen() {
  const { t } = useTranslation()
  const { state, session, retry } = useMemberSession()
  // Le profil dit si le membre est administrateur ; personne de connecté : on ne demande rien.
  const me = useMe(Boolean(session))
  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />
  if (!me.data) {
    if (me.isError) return <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} />
    return <LoadingScreen />
  }
  // Un membre qui n'est pas administrateur : la page n'existe pas pour lui, rien n'est demandé.
  if (!me.data.isAdmin) return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  return <AdminModeration />
}

function AdminModeration() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/settings')
  // Sur téléphone, le détail est une page : on revient à la file (ou on y va, sans page d'avant).
  const backToQueue = useGoBack('/moderation')
  // La file et le détail côte à côte (ordinateur, grande tablette) ; sinon, l'un puis l'autre.
  const { columns } = useLayout()
  // L'adresse (l'élément choisi, l'historique et son filtre) n'est connue que dans le navigateur :
  // la page pré-rendue l'ignore, et la lit une fois hydratée (ui/theme/hydration.ts).
  const hydrated = useHydrated()
  const params = useLocalSearchParams<{
    tab?: string | string[]
    member?: string | string[]
    item?: string | string[]
  }>()
  const tabParam = hydrated ? firstParam(params.tab) : undefined
  const memberFilter = (hydrated ? firstParam(params.member) : undefined) || undefined
  const itemParam = (hydrated ? firstParam(params.item) : undefined) || undefined
  const [tab, setTab] = useState<Tab>(() =>
    tabParam === 'history' || tabParam === 'removed' ? tabParam : 'pending',
  )
  useEffect(() => {
    if (tabParam === 'history' || tabParam === 'removed') setTab(tabParam)
  }, [tabParam])
  const queue = useModerationQueue()
  // Les retirés ne sont demandés qu'une fois leur onglet ouvert ; l'historique, quand il se voit
  // (sa vue, ou la colonne de droite sur ordinateur).
  const removed = useRemovedItems(tab === 'removed')
  const history = useDecisionHistory(
    tab === 'history' ? memberFilter : undefined,
    tab === 'history' || columns,
  )
  const { decide } = useDecide()
  // Le titre de l'historique : le focus y va quand on l'ouvre depuis la fiche d'un auteur.
  const historyTitleRef = useRef<Focusable>(null)

  // Les éléments décidés de chaque onglet, gardés à leur place jusqu'au choix suivant.
  const [decidedQueue, setDecidedQueue] = useState<Decided<ModerationQueueItem>[]>([])
  const [decidedRemoved, setDecidedRemoved] = useState<Decided<RemovedItem>[]>([])
  // Les pannes, élément par élément : le message reste jusqu'à la réponse suivante (charte du
  // design : il ne disparaît pas pendant l'envoi, sinon les boutons sautent sous le doigt).
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({})
  // Le dernier élément décidé. Le focus du clavier va à son résultat : le bouton touché a laissé
  // la place à ce résultat (désinscription, 6c).
  const [lastDecided, setLastDecided] = useState<string | null>(null)
  const outcomeRef = useRef<Focusable>(null)
  const focusOutcome = useRef(false)
  useEffect(() => {
    if (lastDecided && focusOutcome.current) {
      focusOutcome.current = false
      // Le temps que la feuille « Retirer » quitte la page : avant, elle garderait le focus.
      requestAnimationFrame(() => focusWithoutScroll(outcomeRef.current))
    }
  }, [lastDecided])

  /** Oublie les éléments décidés et leurs pannes : la liste repart de ce que dit l'API. */
  const forgetDecided = () => {
    setDecidedQueue([])
    setDecidedRemoved([])
    setFailures({})
    setLastDecided(null)
  }

  /** Changer d'onglet est un geste qui range les éléments décidés. */
  const changeTab = (next: Tab) => {
    setTab(next)
    forgetDecided()
  }

  /** Garde l'élément décidé à sa place, avec son résultat, et oublie sa dernière panne. */
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

  // L'heure où une décision est arrivée pour la dernière fois, et la décision en cours. Des refs :
  // lues au moment de l'appui, sans attendre que l'écran se redessine.
  const settledAt = useRef(0)
  const deciding = useRef(false)
  // L'élément en cours d'envoi, pour montrer la roue sur son bouton.
  const [pending, setPending] = useState<string | null>(null)

  // La feuille « Retirer » : ouverte ou non, et l'élément visé (gardé pendant le fondu de
  // fermeture, pour que le texte rappelé ne disparaisse pas avant la feuille).
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removing, setRemoving] = useState<{
    key: string
    index: number
    item: ModerationQueueItem
  } | null>(null)

  // « Réessayer » sur une file en erreur : React Query efface l'erreur pendant la relecture ; on
  // garde l'écran d'erreur (et le focus sur son bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)

  /** Un appui sur une décision, ignoré pendant une décision, et juste après qu'une est arrivée. */
  const guarded = (action: () => void) => () => {
    if (deciding.current || Date.now() - settledAt.current < SETTLE_MS) return
    action()
  }

  /**
   * Envoie une décision en un geste (classer, rétablir). Réussie, ou rendue sans objet par une
   * décision prise ailleurs, elle se pose dans le détail (`onSettled`) ; une panne s'affiche
   * au-dessus des boutons, qui restent pour réessayer.
   */
  const run = async (
    key: string,
    input: Extract<ModerationDecisionInput, { target: unknown }>,
    done: string,
    onSettled: (outcome: Outcome) => void,
  ) => {
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
          : { message: t(($) => $.errors[result.error]), ok: false },
      )
    } else {
      setFailures((previous) => ({ ...previous, [key]: decisionFailure(t, result.error) }))
    }
  }

  // La lecture de la liste affichée, et ses refus qui changent toute la page.
  const list = tab === 'pending' ? queue : tab === 'removed' ? removed : history
  const fatal = !list.data && list.isError ? errorKey(list.error) : null
  // Les éléments affichés de chaque onglet (lus avant les refus ci-dessous : le hook qui suit doit
  // être appelé à chaque affichage, dans le même ordre).
  const queueItems = queue.data?.pages.flatMap((page) => page.items) ?? []
  const removedItems = removed.data?.pages.flatMap((page) => page.items) ?? []
  const shownQueue = keepDecided(queueItems, decidedQueue)
  const shownRemoved = keepDecided(removedItems, decidedRemoved)
  const decisions = history.data?.pages.flatMap((page) => page.items) ?? []
  const count =
    tab === 'pending'
      ? shownQueue.length
      : tab === 'removed'
        ? shownRemoved.length
        : decisions.length
  // Le premier élément arrivé avec la dernière page : le focus du clavier y va quand « Afficher la
  // suite » disparaît, la liste finissant sans phrase (jur-RF2).
  const arrived = useFirstArrived(count, list.isFetchingNextPage)
  // Un administrateur révoqué : l'API ne connaît plus la page.
  if (fatal === 'notFound') return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  if (fatal === 'unauthorized') return <SignedOutScreen expired />

  const onRetry = async () => {
    setRetrying(true)
    await list.refetch()
    setRetrying(false)
  }

  // L'élément montré dans le détail : celui de l'adresse ; sur ordinateur, sans adresse, le premier.
  const shownList: readonly Shown<ModerationQueueItem | RemovedItem>[] =
    tab === 'removed' ? shownRemoved : shownQueue
  const chosenKey = itemParam ?? (columns ? shownList[0]?.key : undefined)
  const chosen = chosenKey ? shownList.find(({ key }) => key === chosenKey) : undefined
  // Une clé qui ne désigne rien de la liste reçue : traité ailleurs, ou une adresse fabriquée.
  const unknown = itemParam !== undefined && !chosen && Boolean(list.data)

  /**
   * Choisir un élément de la file : sur ordinateur, l'adresse change sur place (le détail suit) ;
   * sur téléphone, le détail s'ouvre en page. C'est le geste qui range les éléments décidés.
   */
  const choose = (key: string) => {
    // Sur ordinateur, la file vient peut-être de perdre un élément décidé : la seconde tape d'une
    // double tape ne choisit pas l'élément remonté sous le doigt.
    if (columns && (deciding.current || Date.now() - settledAt.current < SETTLE_MS)) return
    const target = tab === 'removed' ? { tab: 'removed', item: key } : { item: key }
    if (columns) {
      forgetDecided()
      router.setParams(target)
    } else {
      router.push({ pathname: '/moderation', params: target })
    }
  }

  /** « Retour à la file » : sur ordinateur, le détail revient au premier élément. */
  const leaveItem = () => {
    if (columns) router.setParams({ item: undefined })
    else backToQueue()
  }

  /** Ouvre l'historique complet, filtré ou non sur un membre ; le focus va à son titre. */
  const openHistory = (member?: string) => {
    router.setParams({ tab: 'history', member, item: undefined })
    changeTab('history')
    requestAnimationFrame(() => focusWithoutScroll(historyTitleRef.current))
  }

  /** Quitte l'historique pour la file. */
  const closeHistory = () => {
    router.setParams({ tab: undefined, member: undefined })
    changeTab('pending')
  }

  /**
   * La feuille « Suspendre » pour le membre visé, posée sur cette page à son adresse, en disant de
   * quel signalement on part (J2) : l'API vérifie qu'il est ouvert et vise ce membre.
   */
  const openSuspend = (item: ModerationQueueItem, memberId: string) =>
    router.push({
      pathname: '/suspend',
      params: { member: memberId, fromKind: item.target.kind, fromId: item.target.id },
    })

  // --- La file ---

  /** La ligne « de qui, où » d'un élément : « Gains Rapides (@gains_rapides), sur Décollage ! ». */
  const contextOf = (item: ModerationQueueItem) => {
    const record = item.authorRecord
    const author = record ? `${record.name} (@${record.handle})` : null
    const where = item.context?.title ?? null
    if (author && where) return t(($) => $.moderation.authorOn, { name: author, title: where })
    return author ?? where ?? undefined
  }

  // L'heure qu'il est, lue une fois la page hydratée (sinon le pré-rendu et le navigateur
  // écriraient deux textes différents, #418).
  const now = hydrated ? new Date() : null

  const queueEntry = ({ key, item }: Shown<ModerationQueueItem>) => {
    const kind = t(($) => $.moderation.kinds[item.target.kind])
    const when = now ? relativeDate(item.firstReportedAt, i18n.language, now) : null
    const record = item.authorRecord
    const status = item.concernsMe ? t(($) => $.moderation.concernsMe) : undefined
    return (
      <ReportCard
        key={key}
        kind={kind}
        part={item.part ? partText(item.part, t, item.target.kind) : null}
        icon={kindIcon[item.target.kind]}
        count={item.count}
        reportedAt={when ? { relative: when.label, exact: when.full } : undefined}
        snapshot={excerpt(firstText(item.snapshot), QUEUE_EXCERPT)}
        reasons={item.reasons.map(({ reason }) =>
          t(($) => $.report.reasons[reasonTextKey[reason]]),
        )}
        context={contextOf(item)}
        recentAccount={Boolean(now && record && isRecentAccount(record.joinedAt, now))}
        {...(status ? { status } : null)}
        description={t(($) => $.moderation.describe, {
          kind,
          excerpt: detailTitle(item, t),
        })}
        when=""
        href={`/moderation?item=${encodeURIComponent(key)}`}
        current={key === chosen?.key}
        onSelect={() => choose(key)}
      />
    )
  }

  const removedEntry = ({ key, item }: Shown<RemovedItem>) => {
    const kind = t(($) => $.moderation.kinds[item.target.kind])
    return (
      <ReportCard
        key={key}
        kind={kind}
        part={item.part ? partText(item.part, t, item.target.kind) : null}
        icon={kindIcon[item.target.kind]}
        snapshot={excerpt(item.text, QUEUE_EXCERPT)}
        reasons={[t(($) => $.moderation.grounds[item.ground])]}
        context={t(($) => $.moderation.removedOn, {
          date: shortDate(item.removedAt, i18n.language),
        })}
        {...(item.concernsMe ? { status: t(($) => $.moderation.concernsMe) } : null)}
        description={t(($) => $.moderation.describe, { kind, excerpt: detailTitle(item, t) })}
        when=""
        href={`/moderation?tab=removed&item=${encodeURIComponent(key)}`}
        current={key === chosen?.key}
        onSelect={() => choose(key)}
      />
    )
  }

  const showsError = (!list.data && list.isError) || (retrying && !list.data)

  /** L'état de la liste : erreur, chargement, vide, ou la liste et sa suite. */
  const listBody = (entries: () => ReactNode) =>
    showsError ? (
      <StateMessage
        kind="error"
        title={t(($) => $.moderation.errorTitle)}
        message={t(($) => $.errors[errorKey(list.error)])}
        actions={[
          { label: t(($) => $.common.retry), onPress: () => void onRetry(), loading: retrying },
        ]}
      />
    ) : !list.data ? (
      <StateMessage kind="loading" message={t(($) => $.common.loading)} />
    ) : count === 0 ? (
      <StateMessage
        kind="empty"
        message={
          tab === 'pending'
            ? t(($) => $.moderation.empty)
            : tab === 'removed'
              ? t(($) => $.moderation.emptyRemoved)
              : t(($) => $.moderation.emptyHistory)
        }
      />
    ) : (
      <Stack gap="lg">
        {/* Une liste annoncée : « liste, 4 éléments », et on saute d'un élément à l'autre. */}
        <Stack gap="sm" accessibilityRole="list" firstArrived={arrived}>
          {entries()}
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
          moreLabel={t(($) => $.moderation.more)}
          errorLabel={t(($) => $.moderation.moreError)}
          retryLabel={t(($) => $.common.retry)}
          firstArrived={arrived.ref}
          // Une seule demande à la fois, même après un double clic.
          onMore={() => {
            if (!list.isFetchingNextPage) void list.fetchNextPage()
          }}
        />
      </Stack>
    )

  const queueColumn = (
    <Stack gap="lg">
      {/* R6b : les pages du catalogue, en tête de la file. Chaque ligne est un vrai lien (`href`,
          un `<a>` sur le web), et dit ce qu'on trouve derrière (`hint`). */}
      <ListGroup>
        <ListRow
          label={t(($) => $.moderation.toolsLink)}
          icon="wrench"
          detail={t(($) => $.moderation.toolsLinkHint)}
          hint={t(($) => $.moderation.toolsLinkHint)}
          trailing="chevron"
          href="/moderation/tools"
          onPress={(event) => {
            event?.preventDefault?.()
            router.push('/moderation/tools')
          }}
        />
        <ListRow
          label={t(($) => $.moderation.categoriesLink)}
          icon="shapes"
          detail={t(($) => $.moderation.categoriesLinkHint)}
          hint={t(($) => $.moderation.categoriesLinkHint)}
          trailing="chevron"
          href="/moderation/categories"
          onPress={(event) => {
            event?.preventDefault?.()
            router.push('/moderation/categories')
          }}
        />
      </ListGroup>
      <Segmented<Tab>
        label={t(($) => $.moderation.list)}
        options={[
          {
            value: 'pending',
            label: t(($) => $.moderation.pendingCount, { count: queueItems.length }),
          },
          { value: 'removed', label: t(($) => $.moderation.removed) },
        ]}
        value={tab}
        onChange={(next) => {
          // L'élément choisi appartient à l'autre onglet : l'adresse l'oublie.
          if (itemParam || tabParam) router.setParams({ tab: undefined, item: undefined })
          changeTab(next)
        }}
      />
      {listBody(() =>
        tab === 'removed' ? shownRemoved.map(removedEntry) : shownQueue.map(queueEntry),
      )}
    </Stack>
  )

  // --- Le détail ---

  /** Les décisions possibles sur un élément de la file. */
  const queueActions = ({ key, index, item }: Shown<ModerationQueueItem>): ReportCardAction[] => {
    if (item.concernsMe) return []
    const actions: ReportCardAction[] = []
    // Un profil entier ne se retire pas (l'API le refuse) ; un contenu déjà retiré ou disparu non
    // plus. La partie d'un profil (sa bio, sa photo), si.
    if ((item.target.kind !== 'member' || item.part) && item.state === 'present') {
      actions.push({
        label: t(($) => $.moderation.remove),
        tone: 'danger',
        onPress: guarded(() => {
          setRemoving({ key, index, item })
          setRemoveOpen(true)
        }),
      })
    }
    actions.push({
      label: t(($) => $.moderation.dismiss),
      loading: pending === key,
      onPress: guarded(
        () =>
          void run(
            key,
            { action: 'dismiss', target: item.target, ...sentPart(item.part) },
            t(($) => $.moderation.dismissed),
            (done) => settle(setDecidedQueue, { key, index, item, outcome: done }),
          ),
      ),
    })
    return actions
  }

  /** « Rétablir » un contenu retiré. */
  const removedActions = ({ key, index, item }: Shown<RemovedItem>): ReportCardAction[] =>
    item.concernsMe
      ? []
      : [
          {
            label: t(($) => $.moderation.restore),
            loading: pending === key,
            onPress: guarded(
              () =>
                void run(
                  key,
                  { action: 'restore', target: item.target, ...sentPart(item.part) },
                  t(($) => $.moderation.restoredDone),
                  (done) => settle(setDecidedRemoved, { key, index, item, outcome: done }),
                ),
            ),
          },
        ]

  const detailOf = (entry: Shown<ModerationQueueItem | RemovedItem>) => {
    const shared = {
      outcome: entry.outcome,
      outcomeRef: entry.key === lastDecided ? outcomeRef : undefined,
      error: failures[entry.key],
    }
    const item = entry.item
    if (!('authorRecord' in item)) {
      const removedEntryShown = { ...entry, item }
      return (
        <ModerationDetail
          key={entry.key}
          tab="removed"
          item={item}
          actions={removedActions(removedEntryShown)}
          // Un projet retiré n'a plus de page, même pour l'administrateur : pas de lien. Une note ou
          // un commentaire retiré : on va voir le projet qui le portait (le contenu n'y est plus).
          onView={
            item.target.kind === 'project'
              ? null
              : () => router.push(viewHref(item.target, item.projectId))
          }
          {...shared}
        />
      )
    }
    const record = item.authorRecord
    const memberId = record?.memberId
    return (
      <ModerationDetail
        key={entry.key}
        tab="pending"
        item={item}
        actions={queueActions({ ...entry, item })}
        onView={() => router.push(viewHref(item.target, item.projectId))}
        // Suspendre l'auteur (ou le membre lui-même, pour un profil), quand l'API le permet : pas
        // l'administrateur qui regarde, ni un autre administrateur, ni un membre déjà suspendu.
        onSuspend={
          record?.canSuspend && !item.concernsMe && memberId
            ? guarded(() => openSuspend(item, memberId))
            : null
        }
        onSeeDecisions={memberId ? () => openHistory(memberId) : null}
        {...shared}
      />
    )
  }

  const detailColumn = unknown ? (
    <StateMessage
      kind="empty"
      level={2}
      message={t(($) => $.moderation.detail.unknown)}
      actions={[{ label: t(($) => $.moderation.detail.backToQueue), onPress: leaveItem }]}
    />
  ) : chosen ? (
    detailOf(chosen)
  ) : !list.data && !columns ? (
    listBody(() => null)
  ) : null

  // --- L'historique ---

  /** « Voir » d'une décision : la page du membre, ou celle du projet qui porte le contenu. */
  const viewDecision = (decision: (typeof decisions)[number]) =>
    decision.target.kind === 'member'
      ? decision.member && router.push(viewHref(decision.target, null))
      : decision.projectId && router.push(viewHref(decision.target, decision.projectId))

  // Les dernières décisions, une ligne colorée chacune, à droite du détail (ordinateur).
  const recentColumn = (
    <Stack gap="md">
      <Stack gap="xxs">
        <Text variant="headline" heading={2}>
          {t(($) => $.moderation.recent.title)}
        </Text>
        <Text variant="caption" tone="muted">
          {t(($) => $.moderation.recent.order)}
        </Text>
      </Stack>
      {history.data ? (
        decisions.length > 0 ? (
          <Stack gap="sm" accessibilityRole="list">
            {decisions.slice(0, RECENT_DECISIONS).map((decision) => (
              <DecisionCard key={decision.id} decision={decision} compact />
            ))}
          </Stack>
        ) : (
          <Text variant="callout" tone="secondary">
            {t(($) => $.moderation.emptyHistory)}
          </Text>
        )
      ) : history.isError ? (
        <Text variant="callout" tone="secondary">
          {t(($) => $.errors[errorKey(history.error)])}
        </Text>
      ) : null}
      <TextLink label={t(($) => $.moderation.recent.all)} onPress={() => openHistory()} />
    </Stack>
  )

  // Le membre filtré, nommé par son pseudo tel que les décisions le donnent ; un compte parti
  // n'a plus de pseudo : « ce membre ».
  const filteredHandle = decisions.find(({ member }) => member?.id === memberFilter)?.member?.handle

  const historyView = (
    <Stack gap="lg">
      <Text variant="title2" heading={2} focusRef={historyTitleRef}>
        {t(($) => $.moderation.recent.title)}
      </Text>
      {/* Le filtre de l'historique : qui il vise, et comment l'enlever. */}
      {memberFilter && history.data ? (
        <Stack direction="row" wrap align="center" justify="between" gap="md">
          <Text variant="callout" weight={600}>
            {filteredHandle
              ? t(($) => $.moderation.historyFor, { handle: filteredHandle })
              : t(($) => $.moderation.historyForGone)}
          </Text>
          <TextLink
            role="button"
            label={t(($) => $.moderation.historyAll)}
            onPress={() => {
              router.setParams({ member: undefined })
              requestAnimationFrame(() => focusWithoutScroll(historyTitleRef.current))
            }}
          />
        </Stack>
      ) : null}
      {listBody(() =>
        decisions.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            onView={() => viewDecision(decision)}
          />
        )),
      )}
      <TextLink
        role="button"
        label={t(($) => $.moderation.detail.backToQueue)}
        onPress={closeHistory}
      />
    </Stack>
  )

  // --- La page ---

  // Sur téléphone, le détail ouvert (ou l'historique) occupe la page ; son « Retour » revient à
  // la file.
  const phoneDetail = !columns && tab !== 'history' && itemParam !== undefined
  const body =
    tab === 'history' ? (
      historyView
    ) : columns ? (
      <Columns sideFirst side={queueColumn} main={detailColumn} aside={recentColumn} />
    ) : phoneDetail ? (
      detailColumn
    ) : (
      queueColumn
    )

  return (
    <Screen
      header={<TopNav />}
      onBack={tab === 'history' ? closeHistory : phoneDetail ? backToQueue : back}
      title={t(($) => $.moderation.title)}
      // Toute la largeur, pour les trois colonnes sur ordinateur (une colonne sur téléphone).
      width="page"
      {...(phoneDetail ? null : { subtitle: t(($) => $.moderation.subtitle) })}
      titleAside={<StatusPill label={t(($) => $.moderation.adminOnly)} />}
      // Sur téléphone, l'historique a son bouton en haut de la file (planche R9-Moderation-Telephone).
      {...(!columns && tab !== 'history' && !phoneDetail
        ? {
            topAction: (
              <Button
                label={t(($) => $.moderation.recent.title)}
                variant="secondary"
                size="compact"
                onPress={() => openHistory()}
              />
            ),
          }
        : null)}
    >
      {body}
      {removing ? (
        <RemoveSheet
          item={removing.item}
          open={removeOpen}
          onClose={() => setRemoveOpen(false)}
          // Après un retrait, le focus va au résultat (« Contenu retiré. ») : le bouton « Retirer »
          // qui a ouvert la feuille a disparu, et la feuille, qui rend le focus à son ouvreur à la
          // fermeture puis encore à la fin de son fondu, le laissait sur la page (R9, C8). Sans
          // décision, aucun résultat n'est monté (null) : le focus revient à « Retirer ».
          returnFocusTo={() => outcomeRef.current}
          onDone={() => {
            settledAt.current = Date.now()
            focusOutcome.current = true
            settle(setDecidedQueue, {
              key: removing.key,
              index: removing.index,
              item: removing.item,
              outcome: { message: t(($) => $.moderation.removedDone), ok: true },
            })
            setRemoveOpen(false)
          }}
        />
      ) : null}
    </Screen>
  )
}
