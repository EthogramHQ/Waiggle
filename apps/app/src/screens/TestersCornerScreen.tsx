// La page « Le coin des testeurs » d'un projet (R7b, docs/scenarios/refonte.md, « Le coin des
// testeurs », « Les appels à tester », « Les retours », « Retirer et quitter » ; planches
// R7b-Coin-Appels, R7b-Coin-Testeurs, R7b-Coin-Retours, R7b-Fil-Nuit et R7b-Desktop). Son adresse :
// /projects/<id>/testers, l'onglet dans `?tab=calls|feedback`.
//
// De haut en bas :
// - « Retour » et, pour un testeur, le menu « … » du coin (« Quitter les testeurs ») ;
// - le titre « Le coin des testeurs », le projet (un lien qui y ramène), et pour l'auteur le
//   bandeau du coin fermé (projet privé, retiré, compte suspendu : il relit tout, n'écrit plus) ;
// - « 12 testeurs » : pour l'auteur, un bouton qui déplie la liste, chaque testeur avec « Retirer
//   des testeurs » ; pour un testeur, un simple texte (les testeurs ne se voient pas entre eux) ;
// - les onglets « Appels » et « Retours » :
//   - Appels : « Lancer un appel » (l'auteur, la seule action miel de l'onglet), puis les appels du
//     plus récent au plus ancien, 20 par 20 ; l'auteur supprime les siens, un testeur les signale ;
//   - Retours, pour l'auteur : les filtres « À traiter » / « Réglés » avec leur nombre, et un fil
//     par testeur ; pour un testeur : son fil avec l'auteur, et « Envoyer un retour ».
// Un ancien testeur (parti, retiré, bloqué) ne voit que son fil, en lecture seule, avec la phrase
// qui le dit. Tout autre membre, un visiteur, ou un testeur quand le coin est fermé : la page
// introuvable, la même que pour un projet privé (rien ne dit que le coin existe).
//
// Sur ordinateur (relecture du plan, ui-B1 ; planche R7b-Desktop, corrections K6 à K8) : tout le
// coin tient dans une colonne de lecture à gauche, et la page d'un fil (`threads/<testeur>`) rend ce
// coin avec le fil choisi à droite (`AuthorThreadPane`), sa ligne marquée « en cours » ; sans fil
// ouvert, l'auteur y lit une invitation à en choisir un. Le bouton du haut porte le titre du projet.
// Une seule colonne tant que la page n'est pas hydratée : le pré-rendu ne connaît pas la largeur.
//
// Le focus ne se perd jamais (ui-B8, K5, K7) : après « Retirer », il va au testeur suivant (le seul
// retiré : au bouton « 0 testeur ») ; après « Afficher les appels précédents », au premier appel
// arrivé ; après la suppression d'un appel, à l'appel suivant (le seul : à « Lancer un appel ») ;
// après un fil ouvert depuis sa ligne, sur ordinateur, au nom du testeur. La liste reste figée sous
// la fenêtre de confirmation, et ne perd l'élément qu'une fois la fenêtre partie (sinon la fenêtre
// rendrait le focus à un « … » qui n'existe plus).
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import type {
  Project,
  TesterCall,
  TesterCorner,
  TesterListItem,
  TesterThreadState,
  TesterThreadSummary,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { firstParam } from '../navigation/params'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useProject } from '../projects/hooks'
import { removalBanner } from '../reports/removal'
import { useQuitTester } from '../testers/api'
import {
  useCalls,
  useDeleteCall,
  useRemoveTester,
  useTesterCorner,
  useThreads,
} from '../testers/corner-api'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { Button } from '../ui/Button'
import { CallCard } from '../ui/CallCard'
import { Columns } from '../ui/Columns'
import { Dialog } from '../ui/Dialog'
import { FeedEnd, useFirstArrived } from '../ui/FeedEnd'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { ListGroup } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { RemovalNotice } from '../ui/RemovalNotice'
import { Screen } from '../ui/Screen'
import { ScreenFooterSlot } from '../ui/ScreenFooterSlot'
import { Segmented } from '../ui/Segmented'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Surface } from '../ui/Surface'
import { Tabs } from '../ui/Tabs'
import { TestersList, type TestersListHandle } from '../ui/TestersList'
import { TextLink } from '../ui/TextLink'
import { ThreadRow } from '../ui/ThreadRow'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useToast } from '../ui/theme/toast'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'
import { AuthorThreadPane, type ThreadTester, useFormerTester } from './TesterThreadScreen'
import { TesterThreadView } from './TesterThreadView'

/** Les deux onglets du coin, tels qu'ils s'écrivent dans l'adresse (`?tab=`). */
type TabKey = 'calls' | 'feedback'

/**
 * Le repli du focus quand le dernier élément d'une liste part (R7b, K5) : ni suivant ni précédent à
 * qui le rendre, il va à ce qui reste (le bouton « 0 testeur », « Lancer un appel »). Aucun
 * identifiant de l'API ne commence par un deux-points.
 */
const FALLBACK = ':fallback'

export function TestersCornerScreen({ id, member }: { id: string; member?: string }) {
  const { state, session, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen width="page" />
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  // Un visiteur : la page introuvable, comme tout membre qui n'a rien à faire dans ce coin (le
  // coin est privé : on ne dit même pas qu'il existe).
  if (!session) return <CornerNotFound />
  // Les lectures ne partent qu'avec une session : elles vivent dans le composant suivant.
  return (
    <Corner id={id} member={member} memberId={session.user.id} memberName={session.user.name} />
  )
}

/** La page introuvable, la même que pour un projet qu'on n'a pas le droit de voir. */
function CornerNotFound() {
  const { t } = useTranslation()
  return (
    <NotFoundState
      variant="project"
      width="page"
      title={t(($) => $.project.page.notFoundTitle)}
      message={t(($) => $.project.page.notFound)}
    />
  )
}

/**
 * Le coin n'a pas pu se charger (panne, réseau) : on le dit, avec « Réessayer », et « Retour » vers
 * la page du projet (R7b, K9 : sur téléphone, sans la barre du haut, il n'y avait pas d'autre issue).
 */
function CornerLoadError({
  id,
  onRetry,
  retrying,
}: {
  id: string
  onRetry: () => void
  retrying: boolean
}) {
  const { t } = useTranslation()
  const back = useGoBack(`/projects/${id}`)
  return (
    <Screen
      header={<TopNav />}
      width="page"
      onBack={back}
      pageTitle={t(($) => $.states.errorTitle)}
    >
      <StateMessage
        kind="error"
        level={1}
        title={t(($) => $.states.errorTitle)}
        message={t(($) => $.project.testers.cornerLoadError)}
        actions={[{ label: t(($) => $.common.retry), onPress: onRetry, loading: retrying }]}
      />
    </Screen>
  )
}

type CornerProps = {
  id: string
  member: string | undefined
  memberId: string
  memberName: string
}

function Corner({ id, member, memberId, memberName }: CornerProps) {
  const project = useProject(id)
  const corner = useTesterCorner(id)
  if (corner.error) {
    const key = errorKey(corner.error)
    // L'API répond 404 à qui n'a rien à faire ici (un autre membre, un testeur d'un coin fermé).
    if (key === 'notFound') return <CornerNotFound />
    if (key === 'unauthorized') return <SignedOutScreen width="page" expired />
    return (
      <CornerLoadError id={id} onRetry={() => void corner.refetch()} retrying={corner.isFetching} />
    )
  }
  if (project.error) {
    if (errorKey(project.error) === 'notFound') return <CornerNotFound />
    return (
      <LoadErrorScreen error={project.error} onRetry={() => void project.refetch()} width="page" />
    )
  }
  if (!corner.data || !project.data) return <LoadingScreen width="page" />
  return (
    <CornerPage
      project={project.data}
      corner={corner.data}
      member={member}
      memberId={memberId}
      memberName={memberName}
    />
  )
}

type PageProps = {
  project: Project
  corner: TesterCorner
  member: string | undefined
  memberId: string
  memberName: string
}

function CornerPage({ project, corner, member, memberId, memberName }: PageProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const toast = useToast()
  const hydrated = useHydrated()
  const { columns, sizeClass } = useLayout()
  const back = useGoBack(`/projects/${project.id}`)
  const params = useLocalSearchParams<{ tab?: string | string[]; focus?: string | string[] }>()
  const cornerPath = `/projects/${project.id}/testers`
  const isAuthor = corner.role === 'author'
  const former = corner.role === 'former_tester'

  // --- L'onglet ---------------------------------------------------------------------------------

  // L'onglet de l'adresse, lu après l'hydratation (la page pré-rendue ne connaît pas l'adresse) ;
  // un onglet inconnu ouvre « Appels ». La page d'un fil (`member`) est toujours dans « Retours ».
  const tabParam = firstParam(params.tab)
  const fromAddress: TabKey =
    hydrated && (member !== undefined || tabParam === 'feedback') ? 'feedback' : 'calls'
  // L'onglet touché, en attendant que l'adresse le dise ; oublié dès qu'elle change.
  const [chosen, setChosen] = useState<TabKey | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'adresse a changé, on la suit.
  useEffect(() => setChosen(null), [tabParam])
  const tab = chosen ?? fromAddress
  const selectTab = (key: TabKey) => {
    setChosen(key)
    // Sans nouvelle entrée d'historique : le Retour du navigateur quitte le coin, il ne repasse pas
    // par chaque onglet. Depuis la page d'un fil, on revient au coin lui-même.
    if (member !== undefined) router.replace(`${cornerPath}?tab=${key}`)
    else router.setParams({ tab: key })
  }

  // Sur ordinateur, une fois la page hydratée, la mise en page de la planche R7b-Desktop (R7b, K6) :
  // une colonne de lecture à gauche (la tête, les onglets et leur contenu, pour tous), et à droite le
  // fil ouvert, ou l'invitation à en choisir un (l'auteur, onglet « Retours »). Avant, le coin
  // s'étirait sur 1 280 points dès 1 024 (appels à 154 caractères par ligne, boutons miel de toute
  // la largeur). La colonne de gauche ne change pas d'un onglet à l'autre ni à l'ouverture d'un fil :
  // rien ne bouge sous le doigt.
  const desktop = hydrated && columns
  const threadOpen = desktop && isAuthor && member !== undefined
  // Arrivé par une ligne de la liste (`?focus=thread`) : le focus ira au nom du testeur (K7).
  const focusThread = hydrated && firstParam(params.focus) === 'thread'

  // --- Retirer un testeur ---------------------------------------------------------------------

  const listHandle = useRef<TestersListHandle>(null)
  const removal = useRemoveTester(project.id)
  // Le coin figé pendant la confirmation (la liste ne change pas sous la fenêtre) ; null : le cache.
  const [frozen, setFrozen] = useState<TesterCorner | null>(null)
  const [removing, setRemoving] = useState<TesterListItem | null>(null)
  const [removeSent, setRemoveSent] = useState(false)
  const removeSending = useRef(false)
  // Le testeur retiré, en attendant que la fenêtre soit partie ; puis celui qui reçoit le focus.
  const removed = useRef<{ id: string; next: string | null } | null>(null)
  const [focusTester, setFocusTester] = useState<string | null>(null)
  const shownCorner = frozen ?? corner

  const openRemove = (testerId: string) => {
    const tester = corner.testers?.find((one) => one.id === testerId)
    if (!tester) return
    setFrozen(corner)
    setRemoveSent(false)
    setRemoving(tester)
  }
  const confirmRemove = async () => {
    const tester = removing
    if (!tester || removeSending.current) return
    removeSending.current = true
    setRemoveSent(true)
    const list = frozen?.testers ?? []
    const index = list.findIndex((one) => one.id === tester.id)
    const ok = await removal.remove(tester.id)
    removeSending.current = false
    if (!ok) return
    // Le seul testeur retiré : ni suivant ni précédent, le focus ira au bouton « 0 testeur » (K5).
    removed.current = {
      id: tester.id,
      next: list[index + 1]?.id ?? list[index - 1]?.id ?? FALLBACK,
    }
    toast.show(t(($) => $.project.testers.removedToast, { name: tester.name }))
    setRemoving(null)
    // Sur téléphone, Android ne dit pas quand la fenêtre a fini de partir : on n'attend pas.
    if (Platform.OS !== 'web') releaseRemoved()
  }
  /** La fenêtre est partie : la liste reprend le cache, et le focus va au testeur suivant. */
  const releaseRemoved = () => {
    const done = removed.current
    removed.current = null
    setFrozen(null)
    if (done?.next) setFocusTester(done.next)
  }
  useEffect(() => {
    if (focusTester === null || frozen) return
    setFocusTester(null)
    if (focusTester === FALLBACK) listHandle.current?.focusToggle()
    else listHandle.current?.focusTester(focusTester)
  }, [focusTester, frozen])

  // --- Quitter les testeurs ---------------------------------------------------------------------

  const [quitting, setQuitting] = useState(false)

  // --- Les morceaux -----------------------------------------------------------------------------

  const testerItems = shownCorner.testers?.map((one) => ({
    id: one.id,
    name: one.name,
    avatar: toSource(one.avatarUrl),
    since: one.since,
  }))

  // Le projet : sur téléphone, un lien sous « Retour » (planches R7b-Coin) ; dès la tablette, le
  // bouton du haut porte son titre, « ‹ Décollage ! » (planche R7b-Desktop, K6), sans second lien.
  const backNamed = sizeClass !== 'compact'
  const head = (
    <Stack gap="xs">
      {backNamed ? null : (
        <TextLink
          label={project.title}
          tone="muted"
          breakAnywhere
          onPress={() => router.push(`/projects/${project.id}`)}
        />
      )}
      {isAuthor && corner.closed ? (
        <Notice tone="info" message={t(($) => $.project.testers.closedAuthor)} />
      ) : null}
      {former ? null : (
        <TestersList
          count={shownCorner.testerCount ?? 0}
          testers={isAuthor ? (testerItems ?? []) : null}
          {...(isAuthor && !corner.closed ? { onRemove: openRemove } : null)}
          handle={listHandle}
        />
      )}
    </Stack>
  )

  const authorThreads = (
    <AuthorThreads
      project={project}
      current={threadOpen ? member : undefined}
      onOpen={(testerId) => {
        const path = `${cornerPath}/threads/${testerId}`
        // Sur téléphone, une page de plus.
        if (!desktop) return router.push(path)
        // Sur ordinateur, la page du fil remonte tout le coin : `?focus=thread` lui dit de poser le
        // focus sur le nom du testeur, sinon il tombait sur toute la page (K7). D'un fil à l'autre,
        // sans empiler l'historique.
        const arrival = `${path}?focus=thread`
        if (member !== undefined) router.replace(arrival)
        else router.push(arrival)
      }}
    />
  )

  const testerThread = (
    <TesterThreadView
      projectId={project.id}
      testerId={memberId}
      memberId={memberId}
      reader="tester"
      authorName={project.author.name}
      testerName={memberName}
      readOnly={
        former ? t(($) => $.project.testers.formerTester, { name: project.author.name }) : null
      }
      closed={corner.closed}
      layout={({ messages, footer }) => (
        <Stack gap="lg">
          {messages}
          {former ? null : (
            // L'action miel de l'onglet (planche validée 9), tant que le compositeur n'en montre pas
            // une : sur téléphone, sa flèche est miel, et une seule action miel se voit à la fois
            // (K12, correction 14). Sur ordinateur, son « Envoyer » est blanc.
            <Button
              label={t(($) => $.project.testers.feedback.send)}
              icon="plus"
              {...(footer !== null && !columns ? { variant: 'secondary' as const } : null)}
              onPress={() => router.push(`${cornerPath}/new-feedback`)}
            />
          )}
          {/* Sur téléphone, le compositeur collé au pied de l'écran, comme dans le fil de l'auteur
              (K12) ; sur ordinateur, sous le fil. */}
          {footer !== null ? <ScreenFooterSlot>{footer}</ScreenFooterSlot> : null}
        </Stack>
      )}
    />
  )

  const tabs = former ? (
    // Un ancien testeur : son fil seul, sans onglets (ni appels, ni liste).
    testerThread
  ) : (
    <Tabs<TabKey>
      label={t(($) => $.project.testers.tabs.label)}
      selected={tab}
      onSelect={selectTab}
      tabs={[
        {
          key: 'calls',
          label: t(($) => $.project.testers.tabs.calls),
          icon: 'megaphone-simple',
          content: <CallsTab project={project} corner={corner} />,
        },
        {
          key: 'feedback',
          label: t(($) => $.project.testers.tabs.feedback),
          icon: 'chat-circle-dots',
          content: isAuthor ? authorThreads : testerThread,
        },
      ]}
    />
  )

  const testerOfPane = (): ThreadTester | null => {
    if (!member) return null
    const listed = corner.testers?.find((one) => one.id === member)
    return listed ? { ...listed, current: true } : null
  }

  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={back}
      {...(backNamed ? { backLabel: project.title } : null)}
      title={t(($) => $.project.testers.corner)}
      // Avant l'hydratation, l'onglet du navigateur ne dit rien de plus que l'appli.
      pageTitle={
        hydrated ? t(($) => $.project.testers.cornerTitle, { title: project.title }) : null
      }
      thumbhash={project.visuals[0]?.thumbhash ?? null}
      {...(corner.role === 'tester'
        ? {
            topAction: (
              <ActionMenu
                variant="glass"
                align="end"
                label={t(($) => $.project.testers.cornerMenu)}
                items={[
                  {
                    label: t(($) => $.project.testers.quit),
                    icon: 'sign-out',
                    tone: 'danger',
                    onPress: () => setQuitting(true),
                  },
                ]}
              />
            ),
          }
        : null)}
    >
      {desktop ? (
        <Columns
          sideFirst
          sideWidth="wide"
          gap="xl"
          side={
            <>
              {head}
              {tabs}
            </>
          }
          main={
            threadOpen && member !== undefined ? (
              <ThreadPane
                project={project}
                corner={corner}
                tester={testerOfPane()}
                member={member}
                memberId={memberId}
                focusOnArrival={focusThread}
                onFocused={() => router.setParams({ focus: undefined })}
              />
            ) : isAuthor && tab === 'feedback' ? (
              <ThreadPlaceholder projectId={project.id} />
            ) : null
          }
        />
      ) : (
        <>
          {head}
          {tabs}
        </>
      )}
      {/* Retirer un testeur est silencieux et définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={removing !== null}
        guardTaps
        title={t(($) => $.project.testers.removeTitle, { name: removing?.name ?? '' })}
        message={t(($) => $.project.testers.removeBody, { name: removing?.name ?? '' })}
        busy={removal.pending}
        onDismiss={() => {
          if (removal.pending) return
          setRemoving(null)
          if (Platform.OS !== 'web') releaseRemoved()
        }}
        onClosed={releaseRemoved}
      >
        {removeSent && removal.error ? (
          <Notice message={t(($) => $.project.testers.removeError)} />
        ) : null}
        <Button
          label={t(($) => $.project.testers.removeConfirm)}
          variant="confirm"
          onPress={() => void confirmRemove()}
          loading={removal.pending}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          disabled={removal.pending}
          onPress={() => {
            setRemoving(null)
            if (Platform.OS !== 'web') releaseRemoved()
          }}
        />
      </Dialog>
      <QuitDialog
        project={project}
        visible={quitting}
        onClose={() => setQuitting(false)}
        onQuit={() => {
          setQuitting(false)
          // La page du coin lui devient introuvable : on la remplace par celle du projet, où
          // « Rejoindre les testeurs » reçoit le focus (ui-B6, `?focus=join`).
          router.replace(`/projects/${project.id}?focus=join`)
        }}
      />
    </Screen>
  )
}

// --- La colonne du fil, sur ordinateur -------------------------------------------------------------

type PaneProps = {
  project: Project
  corner: TesterCorner
  /** Le testeur du fil, s'il est dans la liste du coin ; sinon, on le cherche dans les fils. */
  tester: ThreadTester | null
  member: string
  memberId: string
  /** Arrivé par une ligne de la liste (`?focus=thread`) : le focus va au nom du testeur. */
  focusOnArrival: boolean
  /** Le focus est posé : l'écran retire `?focus=thread` de l'adresse. */
  onFocused: () => void
}

/**
 * Le fil choisi, dans une carte à droite de la liste. Un ancien testeur n'est plus dans la liste du
 * coin : on le cherche dans les fils de l'auteur, page après page, comme la page du fil sur
 * téléphone (K8 : seule la première page était lue, et le fil d'un ancien testeur plus loin
 * paraissait « n'a pas pu se charger », sans issue).
 */
function ThreadPane({
  project,
  corner,
  tester,
  member,
  memberId,
  focusOnArrival,
  onFocused,
}: PaneProps) {
  const { t } = useTranslation()
  const search = useFormerTester(project.id, member, tester !== null)
  const found = tester ?? search.found
  const headingRef = useRef<Focusable>(null)
  // Arrivé par une ligne touchée à gauche (K7) : le coin entier vient d'être remonté par la
  // navigation, le focus du clavier est tombé sur la page ; il va au nom du testeur, en tête du fil
  // (ui-B1), sans faire défiler, une fois le fil trouvé. Une seule fois, puis le paramètre quitte
  // l'adresse : recharger la page, ou l'ouvrir par un lien, ne déplace pas le focus.
  const arrived = useRef(false)
  useEffect(() => {
    if (!focusOnArrival || !found || arrived.current) return
    arrived.current = true
    onFocused()
    if (!focusWithoutScroll(headingRef.current)) moveReaderTo(headingRef.current)
  }, [focusOnArrival, found, onFocused])
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      {found ? (
        <AuthorThreadPane
          key={found.id}
          project={project}
          corner={corner}
          tester={found}
          memberId={memberId}
          headingRef={headingRef}
        />
      ) : !search.exhausted ? (
        <SkeletonList count={2} />
      ) : (
        <StateMessage
          kind="error"
          message={t(($) => $.project.testers.thread.loadError)}
          {...(search.failed
            ? { actions: [{ label: t(($) => $.common.retry), onPress: search.retry }] }
            : null)}
        />
      )}
    </Surface>
  )
}

/**
 * La colonne de droite tant qu'aucun fil n'est ouvert (ordinateur, l'auteur, onglet « Retours ») :
 * une invitation calme à en choisir un, dans la carte où le fil s'ouvrira. Sans aucun fil, rien :
 * la liste dit déjà qu'il n'y a pas encore de retour. Les nombres viennent de la même lecture que
 * la liste (« À traiter »), sans requête de plus.
 */
function ThreadPlaceholder({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const counts = useThreads(projectId, 'open').data?.pages[0]?.counts
  if (!counts || counts.open + counts.settled === 0) return null
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <StateMessage kind="empty" message={t(($) => $.project.testers.thread.choose)} />
    </Surface>
  )
}

// --- L'onglet « Appels » ---------------------------------------------------------------------------

function CallsTab({ project, corner }: { project: Project; corner: TesterCorner }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const isAuthor = corner.role === 'author'
  const calls = useCalls(project.id)
  const deletion = useDeleteCall(project.id)
  const signInAgain = useSignInAgain()

  const live = calls.data?.pages.flatMap((page) => page.items) ?? []
  // La liste figée pendant la confirmation d'une suppression ; null : le cache.
  const [frozen, setFrozen] = useState<TesterCall[] | null>(null)
  // Les appels supprimés pendant la visite : une relecture partie avant ne les ramène pas.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const shown = (frozen ?? live).filter((call) => !gone.has(call.id))
  const arrived = useFirstArrived(shown.length, calls.isFetchingNextPage)

  // Où poser le focus sur chaque appel (son texte), par identifiant.
  const nodes = useRef(new Map<string, Focusable>())
  const refOf = (callId: string, index: number) => (node: Focusable | null) => {
    if (node) nodes.current.set(callId, node)
    else nodes.current.delete(callId)
    if (index === arrived.index) arrived.ref.current = node
  }

  // --- Supprimer un appel ---

  const [deleting, setDeleting] = useState<TesterCall | null>(null)
  const [deleteSent, setDeleteSent] = useState(false)
  const deleteSending = useRef(false)
  const confirmed = useRef<{ id: string; next: string | null } | null>(null)
  const [focusCall, setFocusCall] = useState<string | null>(null)
  // « Lancer un appel » : il reçoit le focus quand le dernier appel montré est supprimé.
  const launchRef = useRef<Focusable>(null)

  const openDelete = (call: TesterCall) => {
    setFrozen(shown)
    setDeleteSent(false)
    setDeleting(call)
  }
  const release = () => {
    const done = confirmed.current
    confirmed.current = null
    if (done) {
      setGone((before) => new Set(before).add(done.id))
      if (done.next) setFocusCall(done.next)
    }
    setFrozen(null)
  }
  const confirmDelete = async () => {
    const call = deleting
    if (!call || deleteSending.current) return
    deleteSending.current = true
    setDeleteSent(true)
    const index = shown.findIndex((one) => one.id === call.id)
    const ok = await deletion.remove(call.id)
    deleteSending.current = false
    if (!ok) return
    // Le seul appel supprimé : ni suivant ni précédent, le focus ira à « Lancer un appel » (K5).
    confirmed.current = {
      id: call.id,
      next: shown[index + 1]?.id ?? shown[index - 1]?.id ?? FALLBACK,
    }
    setDeleting(null)
    if (Platform.OS !== 'web') release()
  }
  useEffect(() => {
    if (focusCall === null || frozen) return
    setFocusCall(null)
    const node = focusCall === FALLBACK ? launchRef.current : nodes.current.get(focusCall)
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [focusCall, frozen])

  const menuOf = (call: TesterCall): ActionMenuItem[] =>
    isAuthor
      ? [
          {
            label: t(($) => $.project.testers.calls.delete),
            icon: 'trash',
            tone: 'danger',
            onPress: () => openDelete(call),
          },
        ]
      : [
          {
            label: t(($) => $.project.testers.calls.report),
            icon: 'flag',
            onPress: () =>
              router.push({ pathname: '/report', params: { kind: 'call', id: call.id } }),
          },
        ]

  const more = calls.isFetchingNextPage
    ? 'loading'
    : calls.isFetchNextPageError
      ? 'error'
      : calls.hasNextPage
        ? 'more'
        : 'end'

  const list = !calls.data ? (
    calls.isError ? (
      <StateMessage
        kind="error"
        message={t(($) => $.project.testers.calls.loadError)}
        actions={[
          {
            label: t(($) => $.common.retry),
            onPress: () => void calls.refetch(),
            loading: calls.isFetching,
          },
        ]}
      />
    ) : (
      <SkeletonList count={2} />
    )
  ) : shown.length === 0 ? (
    <StateMessage
      kind="empty"
      message={
        isAuthor
          ? t(($) => $.project.testers.calls.emptyAuthor)
          : t(($) => $.project.testers.calls.empty)
      }
    />
  ) : (
    <>
      <Stack accessibilityRole="list" gap="lg">
        {shown.map((call, index) => {
          const photo = call.photo
          const source = photo ? toSource(photo.url) : null
          return (
            <CallCard
              key={call.id}
              text={call.text}
              at={call.createdAt}
              photo={source && photo ? { source, description: photo.description ?? '' } : null}
              removal={
                call.removal ? (
                  <RemovalNotice {...removalBanner(call.removal, t)} compact />
                ) : undefined
              }
              menu={menuOf(call)}
              focusRef={refOf(call.id, index)}
            />
          )
        })}
      </Stack>
      <FeedEnd
        state={more}
        moreLabel={t(($) => $.project.testers.calls.more)}
        errorLabel={t(($) => $.project.testers.calls.moreError)}
        retryLabel={t(($) => $.common.retry)}
        onMore={() => void calls.fetchNextPage()}
        firstArrived={arrived.ref}
      />
    </>
  )

  return (
    <Stack gap="lg">
      {isAuthor && !corner.closed ? (
        // La seule action miel de l'onglet (planche validée 9).
        <Button
          ref={launchRef}
          label={t(($) => $.project.testers.calls.launch)}
          icon="megaphone-simple"
          onPress={() => router.push(`/projects/${project.id}/testers/new-call`)}
        />
      ) : null}
      {list}
      <Dialog
        visible={deleting !== null}
        guardTaps
        title={t(($) => $.project.testers.calls.deleteTitle)}
        message={
          deleting?.removal
            ? t(($) => $.project.testers.calls.deleteBodyRemoved)
            : t(($) => $.project.testers.calls.deleteBody)
        }
        busy={deletion.pending}
        onDismiss={() => {
          if (deletion.pending) return
          setDeleting(null)
          if (Platform.OS !== 'web') release()
        }}
        onClosed={release}
      >
        {deleteSent && deletion.error ? (
          <Notice
            message={
              deletion.reason === 'expired'
                ? t(($) => $.states.expired)
                : t(($) => $.project.testers.calls.deleteError)
            }
            action={
              deletion.reason === 'expired' ? signInAgain(() => setDeleting(null)) : undefined
            }
          />
        ) : null}
        <Button
          label={t(($) => $.project.testers.calls.deleteConfirm)}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={deletion.pending}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          disabled={deletion.pending}
          onPress={() => {
            setDeleting(null)
            if (Platform.OS !== 'web') release()
          }}
        />
      </Dialog>
    </Stack>
  )
}

// --- L'onglet « Retours », pour l'auteur ----------------------------------------------------------

type ThreadsProps = {
  project: Project
  /** Le fil ouvert à droite (ordinateur) : sa ligne est marquée « en cours ». */
  current: string | undefined
  onOpen: (testerId: string) => void
}

function AuthorThreads({ project, current, onOpen }: ThreadsProps) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const [filter, setFilter] = useState<TesterThreadState>('open')
  const threads = useThreads(project.id, filter)
  const fresh = threads.data?.pages.flatMap((page) => page.items)

  // Les nombres des filtres : ceux de la dernière réponse, gardés quand un filtre échoue ou charge
  // (les deux filtres restent toujours là, avec un nombre).
  const counts = useRef({ open: 0, settled: 0 })
  const pageCounts = threads.data?.pages[0]?.counts
  if (pageCounts) counts.current = pageCounts

  // Rien ne bouge sous le doigt : une ligne montrée reste à sa place tant que le filtre ne change
  // pas, même si une relecture l'a fait passer dans l'autre filtre (un fil réglé depuis la colonne
  // de droite reste dans « À traiter » jusqu'au changement de filtre). Les fils nouveaux arrivent
  // au bout de la liste.
  const kept = useRef<{ filter: TesterThreadState; items: TesterThreadSummary[] }>({
    filter,
    items: [],
  })
  let items: TesterThreadSummary[] | undefined
  if (!fresh) items = undefined
  else if (kept.current.filter !== filter) items = fresh
  else {
    const byId = new Map(fresh.map((one) => [one.tester.id, one]))
    const before = kept.current.items
    const known = new Set(before.map((one) => one.tester.id))
    items = [
      ...before.map((one) => byId.get(one.tester.id) ?? one),
      ...fresh.filter((one) => !known.has(one.tester.id)),
    ]
  }
  if (items) kept.current = { filter, items }

  const more = threads.isFetchingNextPage
    ? 'loading'
    : threads.isFetchNextPageError
      ? 'error'
      : threads.hasNextPage
        ? 'more'
        : 'end'

  const filterOption = (value: TesterThreadState) => {
    const label = t(($) => $.project.testers.thread.filters[value])
    const count = counts.current[value]
    return {
      value,
      // « À traiter 5 » à l'œil (planche validée 8) ; « À traiter, 5 fils » au lecteur d'écran.
      label: `${label} ${count}`,
      spokenLabel: t(($) => $.project.testers.thread.filterSpoken, { label, count }),
    }
  }

  const list = !items ? (
    threads.isError ? (
      <StateMessage
        kind="error"
        message={t(($) => $.project.testers.thread.listLoadError)}
        actions={[
          {
            label: t(($) => $.common.retry),
            onPress: () => void threads.refetch(),
            loading: threads.isFetching,
          },
        ]}
      />
    ) : (
      <SkeletonList count={3} />
    )
  ) : items.length === 0 ? (
    <StateMessage
      kind="empty"
      message={
        // Aucun fil du tout : l'invitation à attendre les retours, pas « rien à traiter » (K9).
        counts.current.open + counts.current.settled === 0
          ? t(($) => $.project.testers.thread.emptyAuthor)
          : filter === 'open'
            ? t(($) => $.project.testers.thread.emptyOpen)
            : t(($) => $.project.testers.thread.emptySettled)
      }
    />
  ) : (
    <>
      <ListGroup list>
        {items.map((thread) => (
          <ThreadRow
            key={thread.tester.id}
            name={thread.tester.name}
            avatar={toSource(thread.tester.avatarUrl)}
            lastAt={thread.lastAt}
            lastFrom={thread.lastFrom}
            excerpt={thread.excerpt}
            unread={thread.unread}
            former={!thread.tester.current}
            current={thread.tester.id === current}
            onPress={() => onOpen(thread.tester.id)}
          />
        ))}
      </ListGroup>
      <FeedEnd
        state={more}
        moreLabel={t(($) => $.project.testers.thread.more)}
        errorLabel={t(($) => $.project.testers.thread.moreError)}
        retryLabel={t(($) => $.common.retry)}
        onMore={() => void threads.fetchNextPage()}
      />
    </>
  )

  return (
    <Stack gap="lg">
      <Segmented<TesterThreadState>
        // Un nom à lui : « Retours » est déjà celui de l'onglet qui le contient (K9, ui-A5).
        label={t(($) => $.project.testers.thread.filterLabel)}
        fill={false}
        value={filter}
        onChange={setFilter}
        options={[filterOption('open'), filterOption('settled')]}
      />
      {list}
      <Hint icon="lock-simple" text={t(($) => $.project.testers.thread.privacyList)} />
    </Stack>
  )
}

// --- Quitter les testeurs ------------------------------------------------------------------------

type QuitProps = {
  project: Project
  visible: boolean
  onClose: () => void
  /** L'API a accepté le départ. */
  onQuit: () => void
}

/**
 * « Quitter les testeurs de « Décollage ! » ? » (juridique J5) : ce qui reste chez l'auteur. Les
 * soins de `Dialog` : garde contre la double tape, focus sur « Annuler », pas de fermeture pendant
 * l'envoi, l'erreur après un envoi seulement.
 */
function QuitDialog({ project, visible, onClose, onQuit }: QuitProps) {
  const { t } = useTranslation()
  const quit = useQuitTester(project.id)
  const signInAgain = useSignInAgain()
  const [sent, setSent] = useState(false)
  const sending = useRef(false)
  const cancelRef = useRef<Focusable>(null)
  useEffect(() => {
    if (visible) setSent(false)
  }, [visible])
  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setSent(true)
    const ok = await quit.quit()
    sending.current = false
    if (ok) onQuit()
  }
  return (
    <Dialog
      visible={visible}
      guardTaps
      title={t(($) => $.project.testers.quitTitle, { title: project.title })}
      message={t(($) => $.project.testers.quitBody, { name: project.author.name })}
      initialFocusRef={cancelRef}
      busy={quit.pending}
      onDismiss={() => {
        if (!quit.pending) onClose()
      }}
    >
      {sent && quit.error ? (
        <Notice
          message={
            quit.reason === 'expired'
              ? t(($) => $.states.expired)
              : t(($) => $.project.testers.quitError)
          }
          action={quit.reason === 'expired' ? signInAgain(onClose) : undefined}
        />
      ) : null}
      <Button
        label={t(($) => $.project.testers.quitConfirm)}
        variant="confirm"
        onPress={() => void confirm()}
        loading={quit.pending}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={onClose}
        disabled={quit.pending}
      />
    </Dialog>
  )
}
