// La page d'une ruche (R10, docs/scenarios/refonte.md, « La page d'une ruche », « Quitter une
// ruche » ; planches R10-Ruche, R10-Ruche-Nuit, R10-Ruche-Desktop, R10-Membres et R10-Etats ;
// adresse `/hives/<id>`, l'onglet dans `?tab=activity|projects|members`). On y trouve :
// - le haut : l'alvéole, « Ma ruche », le nom, les visages et « 4 membres » ; à droite du Retour,
//   « Inviter » (grisé quand la ruche est pleine, absent quand seul l'animateur invite) et le menu
//   « … » (« Réglages de la ruche » pour l'animateur, « Signaler la ruche », « Quitter la ruche ») ;
// - trois onglets, Actualité · Projets · 5 · Membres. L'Actualité commence par le projet épinglé
//   (une grande carte « Épinglé par Papi Jean »), puis « Papi Jean cherche des testeurs », puis ce
//   que font les membres ; les Projets, les projets réservés à la ruche en mosaïque de tuiles ; les
//   Membres, la liste, « Inviter un proche », la phrase sur l'animateur, « Ne pas me proposer aux
//   autres » et « Quitter la ruche » ;
// - sur ordinateur, trois colonnes : les membres à gauche, l'Actualité et les Projets au centre, les
//   testeurs et la phrase du récap à droite ;
// - une ruche toute neuve (son seul membre, aucune invitation) : « Ta ruche est prête » et
//   « Inviter des proches ».
//
// Qui peut l'ouvrir : ses seuls membres. Pour tout autre, l'API répond 404, comme pour une ruche qui
// n'existe pas : la page dit « Page introuvable », sans rien dire de la ruche.
//
// L'onglet vient de l'adresse, lue après l'hydratation (la page web est pré-rendue sans connaître
// l'adresse, comme le coin des testeurs) ; changer d'onglet remplace le paramètre, sans entrée
// d'historique : le Retour du navigateur quitte la ruche au lieu de repasser par chaque onglet.
import type { HiveMember, HivePage, ProjectSummary } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import {
  useHive,
  useHiveActivity,
  useHiveMembers,
  useHiveProjects,
  usePatchHive,
  useSetHideFromSuggestions,
} from '../hives/api'
import { QuitHiveDialog, RemoveMemberDialog } from '../hives/HiveDialogs'
import { useSuspension } from '../moderation/suspension'
import { useOpenDemo } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { SummaryCard } from '../projects/SummaryCard'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { AvatarStack } from '../ui/AvatarStack'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { Hint } from '../ui/Hint'
import { HiveActivityRow } from '../ui/HiveActivityRow'
import { HiveBadge } from '../ui/HiveBadge'
import { HiveMemberList } from '../ui/HiveMemberList'
import { ListGroup } from '../ui/ListGroup'
import { Mascot } from '../ui/Mascot'
import { MetaLine } from '../ui/MetaLine'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Switch } from '../ui/Switch'
import { Tabs } from '../ui/Tabs'
import { TesterRow } from '../ui/TesterRow'
import { Text } from '../ui/Text'
import { ProjectTile } from '../ui/Tile'
import { TileMosaic } from '../ui/TileMosaic'
import { useTapGuard } from '../ui/tapGuard'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { LoadingScreen, NotFoundState, SessionErrorScreen, SignedOutScreen } from './states'

/** Les trois onglets, tels qu'ils s'écrivent dans l'adresse (`?tab=`). */
type TabKey = 'activity' | 'projects' | 'members'
const TAB_KEYS: readonly string[] = ['activity', 'projects', 'members']
const isTabKey = (value: string | undefined): value is TabKey =>
  value !== undefined && TAB_KEYS.includes(value)

export function HiveScreen({ id }: { id: string }) {
  const { state, session, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen />
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />
  // Les lectures ne partent qu'avec une session : elles vivent dans le composant suivant.
  return <Hive id={id} />
}

function Hive({ id }: { id: string }) {
  const { t } = useTranslation()
  const hive = useHive(id)
  const page = hive.data
  // La page d'abord : une relecture qui échoue (la ruche quittée, qui se relit en 404 pendant le
  // départ) ne remplace pas ce qui est affiché.
  if (page) return <HivePageView page={page} />
  if (hive.error) {
    const key = errorKey(hive.error)
    // Pas membre, ou ruche inconnue : la même page, qui ne dit pas si la ruche existe.
    if (key === 'notFound') return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
    if (key === 'unauthorized') return <SignedOutScreen expired />
    return <HiveLoadError errorText={t(($) => $.errors[key])} onRetry={() => void hive.refetch()} />
  }
  return <LoadingScreen />
}

/** La ruche ne se charge pas (panne, réseau) : on le dit, avec « Réessayer » et « Revenir ». */
function HiveLoadError({ errorText, onRetry }: { errorText: string; onRetry: () => void }) {
  const { t } = useTranslation()
  const back = useGoBack('/hives')
  return (
    <Screen header={<TopNav />} pageTitle={t(($) => $.hives.page.loadError)}>
      <StateMessage
        kind="error"
        level={1}
        title={t(($) => $.hives.page.loadError)}
        message={errorText}
        actions={[
          { label: t(($) => $.common.retry), onPress: onRetry },
          { label: t(($) => $.states.back), onPress: back },
        ]}
      />
    </Screen>
  )
}

function HivePageView({ page }: { page: HivePage }) {
  const { t } = useTranslation()
  const router = useRouter()
  const hydrated = useHydrated()
  const { columns, sizeClass } = useLayout()
  const back = useGoBack('/hives')
  const params = useLocalSearchParams<{ tab?: string | string[] }>()
  const { summary } = page
  const id = summary.id
  const isAnimator = summary.role === 'animator'
  // R10 : un compte suspendu ne peut ni inviter, ni retirer un membre, ni épingler (l'API répond
  // 403 `suspended`) ; ces gestes ne sont donc pas proposés, comme ailleurs dans l'appli. Quitter la
  // ruche et « Ne pas me proposer aux autres » restent. Tant que le profil n'est pas lu, rien n'est
  // retiré (`useSuspension`), et l'API refuserait de toute façon.
  const { suspended } = useSuspension()
  // Les gestes d'animateur que la suspension retire (retirer, épingler).
  const animates = isAnimator && !suspended
  // Le nom affiché (« Ruche sans nom » quand la modération l'a retiré) et le nom dans une phrase
  // (« Plus d'options pour la ruche sans nom »).
  const shownName = summary.name ?? t(($) => $.hives.unnamed)
  const inlineName = summary.name ?? t(($) => $.hives.unnamedInline)
  // Sur ordinateur, trois colonnes (les membres à gauche, la planche R10-Ruche-Desktop) ; `useLayout`
  // attend déjà l'hydratation : la page pré-rendue est celle du téléphone.
  const desktop = columns
  // La garde de double tape des boutons « Inviter » (en haut, « Inviter un proche », « Inviter des
  // proches ») : une double tape n'ouvre pas deux fois la feuille.
  const guard = useTapGuard()

  // --- L'onglet ---------------------------------------------------------------------------------

  // L'onglet de l'adresse, une fois la page hydratée ; un onglet inconnu ouvre l'Actualité.
  const tabParam = firstParam(params.tab)
  const fromAddress: TabKey = hydrated && isTabKey(tabParam) ? tabParam : 'activity'
  // L'onglet touché, en attendant que l'adresse le dise ; oublié dès qu'elle change.
  const [chosen, setChosen] = useState<TabKey | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'adresse a changé, on la suit.
  useEffect(() => setChosen(null), [tabParam])
  const tab = chosen ?? fromAddress
  // Sur ordinateur, les membres ont leur colonne : pas d'onglet « Membres », l'Actualité à sa place.
  const shownTab: TabKey = desktop && tab === 'members' ? 'activity' : tab
  const selectTab = (key: TabKey) => {
    setChosen(key)
    router.setParams({ tab: key })
  }

  // --- Les gestes qui mènent ailleurs ------------------------------------------------------------

  const openInvite = guard(() => router.push(`/hives/${id}/invite`))
  // Sans garde de page ici : chaque ligne (membre, testeur, actualité) et chaque tuile a la sienne.
  // Une garde commune à toute la page bloquait le lien suivant pendant 600 ms après un retour sur
  // la page (mesuré au clavier à 1440 px : Entrée sur le membre suivant ne faisait rien).
  const openProject = (projectId: string) =>
    router.push({ pathname: '/projects/[id]', params: { id: projectId } })
  const openMember = (member: HiveMember) =>
    router.push({ pathname: '/members/[id]', params: { id: member.face.id } })

  // --- Quitter la ruche, retirer un membre -----------------------------------------------------

  const [quitting, setQuitting] = useState(false)
  const members = useHiveMembers(id)
  const liveMembers = members.data?.members
  // La liste figée pendant la fenêtre « Retirer » : le focus revient d'abord sur le bouton touché,
  // puis, la fenêtre partie (`onClosed`), la liste perd le membre et le focus va au voisin
  // (`HiveMemberList`). Sans cela, la liste raccourcissait sous la fenêtre et le focus se perdait.
  const [frozen, setFrozen] = useState<HiveMember[] | null>(null)
  const [removing, setRemoving] = useState(false)
  // Le membre visé reste gardé pendant le fondu de sortie : son nom est dans le titre.
  const [removeTarget, setRemoveTarget] = useState<HiveMember | undefined>(undefined)
  const shownMembers = frozen ?? liveMembers
  const openRemove = (member: HiveMember) => {
    setFrozen(liveMembers ?? null)
    setRemoveTarget(member)
    setRemoving(true)
  }
  const releaseMembers = () => setFrozen(null)
  const closeRemove = () => {
    setRemoving(false)
    // Android ne dit pas quand la fenêtre a fini de partir : on n'attend pas.
    if (Platform.OS === 'android') releaseMembers()
  }

  // --- Les morceaux -----------------------------------------------------------------------------

  const canInvite = page.invite === 'allowed' && !suspended
  const ready = summary.memberCount === 1 && page.pendingInvitations === 0

  const head = <HiveHead page={page} desktop={desktop} />

  const invite =
    page.invite === 'animatorOnly' || suspended ? null : (
      <Button
        label={t(($) => $.hives.page.invite)}
        icon="user-plus"
        variant="glass"
        size="compact"
        onPress={openInvite}
        disabled={!canInvite}
        // Grisé, il reste un arrêt de Tab qui dit pourquoi (la phrase est aussi sous le nom).
        focusableWhenDisabled
        {...(page.invite === 'full' ? { hint: t(($) => $.hives.page.full) } : null)}
      />
    )

  const menuItems: ActionMenuItem[] = [
    ...(isAnimator
      ? [
          {
            label: t(($) => $.hives.page.settings),
            icon: 'gear-six' as const,
            onPress: () => router.push(`/hives/${id}/settings`),
          },
        ]
      : []),
    {
      label: t(($) => $.hives.page.report),
      icon: 'flag',
      onPress: () => router.push({ pathname: '/report', params: { kind: 'hive', id } }),
    },
    {
      label: t(($) => $.hives.page.leave),
      icon: 'sign-out',
      tone: 'danger',
      onPress: () => setQuitting(true),
    },
  ]

  const topAction = (
    <Row gap="sm" align="center">
      {invite}
      <ActionMenu
        variant="glass"
        align="end"
        label={t(($) => $.hives.page.menu, { hive: inlineName })}
        items={menuItems}
      />
    </Row>
  )

  const testers = <SeekingTesters projects={page.seekingTesters} onOpen={openProject} />
  // Même règle que `SeekingTesters` : seuls les projets avec une démo se testent.
  const hasTesters = page.seekingTesters.some((project) => project.demoUrl !== null)

  const activity = (
    <Stack gap="lg">
      {ready ? (
        <StateMessage
          kind="empty"
          picture={<Mascot pose="wave" size="sm" decorative />}
          title={t(($) => $.hives.ready.title)}
          message={t(($) => $.hives.ready.body)}
          actions={
            canInvite
              ? [{ label: t(($) => $.hives.ready.action), onPress: openInvite, variant: 'primary' }]
              : []
          }
        />
      ) : null}
      <PinnedProject page={page} canUnpin={animates} />
      {/* Sur ordinateur, les testeurs sont dans la colonne de droite. */}
      {desktop ? null : testers}
      {ready ? null : (
        <ActivityList
          id={id}
          hiveName={summary.name}
          onOpen={(projectId) => openProject(projectId)}
        />
      )}
    </Stack>
  )

  const projects = (
    <HiveProjects
      id={id}
      animator={animates}
      pinnedId={page.pinned?.id ?? null}
      columns={sizeClass === 'compact' || desktop ? 2 : 4}
      onOpen={(projectId) => openProject(projectId)}
    />
  )

  const membersPanel = (
    <MembersPanel
      members={shownMembers}
      loadFailed={members.isError && shownMembers === undefined}
      onRetry={() => void members.refetch()}
      canRemove={animates}
      canInvite={canInvite}
      onInvite={openInvite}
      onOpen={openMember}
      onRemove={openRemove}
      onLeave={() => setQuitting(true)}
    />
  )

  const tabs = (
    <Tabs<TabKey>
      label={t(($) => $.hives.page.tabsLabel)}
      selected={shownTab}
      onSelect={selectTab}
      tabs={[
        { key: 'activity', label: t(($) => $.hives.page.activity), content: activity },
        {
          key: 'projects',
          label: t(($) => $.hives.page.projectsCount, { count: page.projectCount }),
          spokenLabel: t(($) => $.hives.page.projectsSpoken, { count: page.projectCount }),
          content: projects,
        },
        // Sur ordinateur, les membres sont dans la colonne de gauche.
        ...(desktop
          ? []
          : [
              {
                key: 'members' as const,
                label: t(($) => $.hives.page.members),
                content: membersPanel,
              },
            ]),
      ]}
    />
  )

  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={back}
      pageTitle={shownName}
      topAction={topAction}
    >
      <Stack gap="xl">
        {head}
        {desktop ? (
          <Columns
            sideFirst
            gap="xl"
            side={
              <Stack gap="md">
                <Text variant="headline" heading={2}>
                  {t(($) => $.hives.page.members)}
                </Text>
                {membersPanel}
              </Stack>
            }
            main={tabs}
            // La colonne de droite n'existe que si elle a un contenu : sans projet à tester, la
            // page garde deux colonnes, sans vide à droite.
            aside={hasTesters ? testers : undefined}
          />
        ) : (
          tabs
        )}
      </Stack>
      <QuitHiveDialog
        hive={page}
        open={quitting}
        onClose={() => setQuitting(false)}
        onDone={() => {
          setQuitting(false)
          // La page n'est plus à elle : l'onglet Ruches, sans garder la ruche dans l'historique.
          router.dismissTo('/hives')
        }}
      />
      <RemoveMemberDialog
        hive={page}
        member={removeTarget}
        open={removing}
        onClose={closeRemove}
        onDone={closeRemove}
        onClosed={releaseMembers}
      />
    </Screen>
  )
}

// --- Le haut --------------------------------------------------------------------------------------

/**
 * L'alvéole, le nom (le titre de la page), les visages et le nombre de membres ; sur
 * ordinateur, « animée par Papi Jean ». Une ruche pleine, ou où seul l'animateur invite, le dit ici.
 */
function HiveHead({ page, desktop }: { page: HivePage; desktop: boolean }) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const { summary } = page
  const memberCount = t(($) => $.hives.members, { count: summary.memberCount })
  const count =
    page.pendingInvitations > 0
      ? t(($) => $.hives.page.membersAndInvited, {
          members: memberCount,
          invited: t(($) => $.hives.page.invited, { count: page.pendingInvitations }),
        })
      : memberCount
  const why =
    page.invite === 'full'
      ? t(($) => $.hives.page.full)
      : page.invite === 'animatorOnly'
        ? t(($) => $.hives.page.animatorOnly)
        : null
  return (
    <Row gap="md" align="center">
      <HiveBadge icon={summary.icon} name={summary.name} size={64} />
      <Stack gap="xxs" grow>
        <Text variant="title1" heading={1}>
          {summary.name ?? t(($) => $.hives.unnamed)}
        </Text>
        <Row gap="sm" align="center" wrap>
          {/* Les visages : un décor, le nombre écrit à côté dit déjà tout. */}
          <AvatarStack
            members={summary.faces.map((face) => ({
              name: face.name,
              source: toSource(face.avatarUrl),
            }))}
            max={4}
          />
          <MetaLine>
            <Text variant="callout" tone="muted">
              {count}
            </Text>
            {desktop && summary.animator ? (
              <Text variant="callout" tone="muted">
                {t(($) => $.hives.animatedBy, { name: summary.animator.name })}
              </Text>
            ) : null}
          </MetaLine>
        </Row>
        {why ? (
          <Text variant="caption" tone="muted">
            {why}
          </Text>
        ) : null}
      </Stack>
    </Row>
  )
}

// --- L'épingle et les testeurs --------------------------------------------------------------------

/**
 * Le projet épinglé, en grande carte, « Épinglé par Papi Jean » dans sa pastille. Pour l'animateur,
 * un menu « … » sur la photo, à côté du lien de la carte (jamais dedans) : « Retirer l'épingle ».
 */
function PinnedProject({ page, canUnpin }: { page: HivePage; canUnpin: boolean }) {
  const { t } = useTranslation()
  const patch = usePatchHive(page.summary.id)
  const [failed, setFailed] = useState(false)
  const pinned = page.pinned
  if (!pinned) return null
  const by = pinned.pinnedBy
  const unpin = () => {
    setFailed(false)
    patch.mutateAsync({ pinnedProjectId: null }).then(
      () => setFailed(false),
      () => setFailed(true),
    )
  }
  return (
    <Stack gap="sm">
      <SummaryCard
        project={pinned}
        badge={
          by ? t(($) => $.hives.page.pinnedBy, { name: by.name }) : t(($) => $.hives.page.pinned)
        }
        {...(canUnpin
          ? {
              overlay: (
                <ActionMenu
                  variant="glass"
                  align="end"
                  items={[
                    { label: t(($) => $.hives.page.unpin), icon: 'push-pin', onPress: unpin },
                  ]}
                />
              ),
            }
          : null)}
      />
      {/* Sous la carte : l'erreur reste près du geste. */}
      {failed ? <Notice message={t(($) => $.hives.page.pinError)} /> : null}
    </Stack>
  )
}

/**
 * « Papi Jean cherche des testeurs » (un seul auteur) ou « Ils cherchent des testeurs » : les projets
 * des membres qui appellent des testeurs, avec « Tester » par la page d'avertissement des liens
 * externes. Un projet sans démo n'a rien à tester ici : il n'est pas montré.
 */
function SeekingTesters({
  projects,
  onOpen,
}: {
  projects: ProjectSummary[]
  onOpen: (projectId: string) => void
}) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const openDemo = useOpenDemo()
  const testable = projects.filter((project) => project.demoUrl !== null)
  const first = testable[0]
  if (!first) return null
  const oneAuthor = testable.every((project) => project.author.id === first.author.id)
  return (
    <ListGroup
      list
      title={
        oneAuthor
          ? t(($) => $.hives.page.seekingOne, { name: first.author.name })
          : t(($) => $.hives.page.seekingMany)
      }
    >
      {testable.map((project) => {
        const visual = project.cover
        const { demoUrl } = project
        return (
          <TesterRow
            key={project.id}
            title={project.title}
            author={project.author.name}
            // R12b : « Exemple » sur un projet du compte d'exemples de l'équipe.
            example={project.author.example === true}
            image={
              visual
                ? {
                    source: toSource(visual.url),
                    thumbhash: visual.thumbhash,
                    label: project.title,
                  }
                : null
            }
            onTest={() => {
              if (demoUrl) openDemo(demoUrl, project.id)
            }}
            onOpen={() => onOpen(project.id)}
          />
        )
      })}
    </ListGroup>
  )
}

// --- L'actualité ----------------------------------------------------------------------------------

/** Ce que font les membres, du plus récent au plus ancien, 20 par page, sur 30 jours. */
function ActivityList({
  id,
  hiveName,
  onOpen,
}: {
  id: string
  hiveName: string | null
  onOpen: (projectId: string) => void
}) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const activity = useHiveActivity(id)
  if (!activity.data) {
    if (activity.isError)
      return (
        <Notice
          message={t(($) => $.hives.page.loadError)}
          action={{
            label: t(($) => $.common.retry),
            onPress: () => void activity.refetch(),
            role: 'button',
          }}
        />
      )
    return <SkeletonList count={2} />
  }
  const items = activity.data.pages.flatMap((one) => one.items)
  if (items.length === 0)
    return <StateMessage kind="empty" message={t(($) => $.hives.page.activityEmpty)} />
  return (
    <Stack gap="md">
      <ListGroup list>
        {items.map((item) => (
          <HiveActivityRow
            key={`${item.kind}-${item.project.id}-${item.at}`}
            item={item}
            hiveName={hiveName}
            toSource={toSource}
            onPress={() => onOpen(item.project.id)}
          />
        ))}
      </ListGroup>
      {/* Une suite qui ne se charge pas garde ce qui est affiché. */}
      {activity.isFetchNextPageError ? <Notice message={t(($) => $.hives.page.moreError)} /> : null}
      {activity.hasNextPage ? (
        <Button
          label={t(($) => $.hives.page.more)}
          variant="secondary"
          onPress={() => void activity.fetchNextPage()}
          loading={activity.isFetchingNextPage}
        />
      ) : null}
    </Stack>
  )
}

// --- Les projets ----------------------------------------------------------------------------------

/**
 * Les projets réservés à la ruche, en mosaïque de tuiles, du plus récent au plus ancien. Pour
 * l'animateur, chaque tuile a un menu « … », à côté de son lien (jamais dedans) : « Épingler », ou
 * « Retirer l'épingle » sur le projet déjà épinglé.
 */
function HiveProjects({
  id,
  animator,
  pinnedId,
  columns,
  onOpen,
}: {
  id: string
  animator: boolean
  pinnedId: string | null
  columns: 2 | 4
  onOpen: (projectId: string) => void
}) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const projects = useHiveProjects(id)
  const patch = usePatchHive(id)
  // L'épingle qui n'a pas pu changer : dite sous la mosaïque jusqu'au geste suivant.
  const [pinFailed, setPinFailed] = useState(false)
  const setPin = (pinnedProjectId: string | null) => {
    setPinFailed(false)
    patch.mutateAsync({ pinnedProjectId }).then(
      () => setPinFailed(false),
      () => setPinFailed(true),
    )
  }
  // Une tuile n'a pas de garde à elle : la seconde tape d'une double tape n'ouvre pas deux pages.
  const guard = useTapGuard()
  if (!projects.data) {
    if (projects.isError)
      return (
        <Notice
          message={t(($) => $.hives.page.loadError)}
          action={{
            label: t(($) => $.common.retry),
            onPress: () => void projects.refetch(),
            role: 'button',
          }}
        />
      )
    return <SkeletonList count={2} />
  }
  const items = projects.data.pages.flatMap((one) => one.items)
  if (items.length === 0)
    return <StateMessage kind="empty" message={t(($) => $.hives.page.projectsEmpty)} />
  return (
    <Stack gap="md">
      <TileMosaic columns={columns}>
        {items.map((project) => {
          const visual = project.portraitCover ?? project.cover
          return (
            <ProjectTile
              key={project.id}
              title={project.title}
              author={project.author.name}
              // R12b : « Exemple » sur un projet du compte d'exemples de l'équipe.
              example={project.author.example === true}
              image={
                visual
                  ? {
                      source: toSource(visual.url),
                      thumbhash: visual.thumbhash,
                      label: project.title,
                    }
                  : null
              }
              onPress={guard(() => onOpen(project.id))}
              menu={
                animator ? (
                  <ActionMenu
                    variant="glass"
                    align="end"
                    label={t(($) => $.hives.page.projectMenu, { title: project.title })}
                    items={[
                      project.id === pinnedId
                        ? {
                            label: t(($) => $.hives.page.unpin),
                            icon: 'push-pin',
                            onPress: () => setPin(null),
                          }
                        : {
                            label: t(($) => $.hives.page.pin),
                            icon: 'push-pin',
                            onPress: () => setPin(project.id),
                          },
                    ]}
                  />
                ) : undefined
              }
            />
          )
        })}
      </TileMosaic>
      {pinFailed ? <Notice message={t(($) => $.hives.page.pinError)} /> : null}
      {projects.isFetchNextPageError ? <Notice message={t(($) => $.hives.page.moreError)} /> : null}
      {projects.hasNextPage ? (
        <Button
          label={t(($) => $.hives.page.more)}
          variant="secondary"
          onPress={() => void projects.fetchNextPage()}
          loading={projects.isFetchingNextPage}
        />
      ) : null}
    </Stack>
  )
}

// --- Les membres ----------------------------------------------------------------------------------

type MembersPanelProps = {
  /** La liste à montrer (figée pendant un retrait) ; undefined tant qu'elle se charge. */
  members: HiveMember[] | undefined
  loadFailed: boolean
  onRetry: () => void
  canRemove: boolean
  canInvite: boolean
  onInvite: () => void
  onOpen: (member: HiveMember) => void
  onRemove: (member: HiveMember) => void
  onLeave: () => void
}

/**
 * L'onglet Membres (la colonne de gauche sur ordinateur) : la liste, « Inviter un proche », la phrase
 * sur l'animateur, « Ne pas me proposer aux autres », puis « Quitter la ruche », tout en bas.
 */
function MembersPanel({
  members,
  loadFailed,
  onRetry,
  canRemove,
  canInvite,
  onInvite,
  onOpen,
  onRemove,
  onLeave,
}: MembersPanelProps) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  let list: ReactNode
  if (members)
    list = (
      <HiveMemberList
        members={members}
        canRemove={canRemove}
        onOpen={onOpen}
        onRemove={onRemove}
        toSource={toSource}
      />
    )
  else if (loadFailed)
    list = (
      <Notice
        message={t(($) => $.hives.page.loadError)}
        action={{ label: t(($) => $.common.retry), onPress: onRetry, role: 'button' }}
      />
    )
  else list = <SkeletonList count={3} />
  return (
    <Stack gap="lg">
      <Stack gap="md">
        {list}
        {canInvite ? (
          <Button
            label={t(($) => $.hives.page.inviteOne)}
            icon="user-plus"
            variant="secondary"
            onPress={onInvite}
          />
        ) : null}
        <Hint icon="hexagon" text={t(($) => $.hives.page.membersPhrase)} />
      </Stack>
      <SuggestionsChoice />
      <Button
        label={t(($) => $.hives.page.leave)}
        icon="sign-out"
        variant="danger"
        onPress={onLeave}
      />
    </Stack>
  )
}

/**
 * « Ne pas me proposer aux autres », seul dans son groupe : le curseur bouge au toucher ; un
 * refus le remet où il était et le dit dessous.
 */
function SuggestionsChoice() {
  const { t } = useTranslation()
  const me = useMe()
  const hide = useSetHideFromSuggestions()
  const [failed, setFailed] = useState(false)
  return (
    <Stack gap="sm">
      <ListGroup>
        <Switch
          inGroup
          label={t(($) => $.hives.hideFromSuggestions)}
          hint={t(($) => $.hives.hideFromSuggestionsHint)}
          value={me.data?.hideFromSuggestions ?? false}
          disabled={!me.data}
          onValueChange={(value) => {
            setFailed(false)
            void hide.set(value).then((ok) => setFailed(!ok))
          }}
        />
      </ListGroup>
      {failed ? <Notice message={t(($) => $.hives.hideFromSuggestionsError)} /> : null}
    </Stack>
  )
}
