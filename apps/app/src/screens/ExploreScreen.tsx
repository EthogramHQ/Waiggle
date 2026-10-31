// L'onglet Explorer (refonte, tranche R3, docs/scenarios/refonte.md, « Explorer ») : les projets de
// tous les membres. De haut en bas :
// - le titre, et sur ordinateur une phrase qui dit ce qu'on trouve ici ;
// - sur téléphone, le champ de recherche, qui est un lien vers /search (sur ordinateur, le champ
//   est celui de la barre du haut) ;
// - « Ils cherchent des testeurs » : un carrousel des projets testables qui ont une démo ;
// - « Outils populaires » : les dix outils les plus cités, et « Tous les outils » ;
// - « Récents » : l'ancien fil « Découvrir », page par page, où chaque carte d'un auteur qu'on ne
//   suit pas porte la pastille « Suivre Nora ».
import type { ProjectSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { useMediaSources } from '../api/media'
import { useDiscoverFeed } from '../feed/api'
import { DiscoverFeed } from '../feed/FeedList'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { useTools } from '../tools/api'
import { Carousel } from '../ui/Carousel'
import { FollowButton } from '../ui/FollowButton'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { SearchLink } from '../ui/SearchLink'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Tag } from '../ui/Tag'
import { TesterCard } from '../ui/TesterCard'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { useToast } from '../ui/theme/toast'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

/** Le nombre d'outils de « Outils populaires » : les autres sont dans « Tous les outils ». */
const POPULAR_TOOLS = 10

export function ExploreScreen() {
  const { state, session, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen width="page" />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  if (!session) return <SignedOutScreen />
  return <MemberExplore userId={session.user.id} />
}

function MemberExplore({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const compact = useLayout().sizeClass === 'compact'
  // Les abonnements faits ou défaits ici, auteur par auteur, depuis l'ouverture de la page. Ils
  // l'emportent sur ce que dit le fil : après « Suivre Nora », le fil relu dit que Nora est suivie,
  // et sa pastille doit rester là, « Tu suis Nora », sous le doigt qui vient de la toucher (et
  // pouvoir défaire le geste), au lieu de disparaître.
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const setFollowed = (authorId: string, followed: boolean) =>
    setTouched((current) => ({ ...current, [authorId]: followed }))

  // Un compte suspendu (tranche 7c) ne suit plus personne de nouveau : l'API refuserait, et la
  // pastille finirait en toast d'erreur (relecture de l'interface de R3, C2). Même garde que sur la
  // page d'un membre et celle d'un projet.
  const { suspended } = useSuspension()

  // La pastille d'une carte de « Récents » : jamais sur ses propres projets, ni sur ceux d'un
  // auteur déjà suivi à l'ouverture (rien à proposer) ; toujours sur celui qu'on vient de toucher.
  // Suspendu : aucune pastille à proposer. Une pastille déjà touchée (la suspension est arrivée
  // pendant la visite) reste à sa place, sous le doigt et avec le focus : « Tu suis Nora » peut
  // encore arrêter de suivre ; « Suivre Nora » y devient inactive, comme sur la page d'un membre.
  const chipOf = (project: ProjectSummary, followedAuthorIds: ReadonlySet<string>) => {
    const { author } = project
    if (author.id === userId) return null
    const local = touched[author.id]
    if (local === undefined && (suspended || followedAuthorIds.has(author.id))) return null
    const followed = local ?? false
    return (
      <AuthorChip
        author={author}
        followed={followed}
        disabled={suspended && !followed}
        onChange={(next) => setFollowed(author.id, next)}
      />
    )
  }

  return (
    <Screen
      width="page"
      header={<TopNav />}
      title={t(($) => $.explore.title)}
      // Sur téléphone, la place va vite au contenu : la phrase ne s'affiche que sur ordinateur.
      subtitle={compact ? undefined : t(($) => $.explore.subtitle)}
      pageTitle={t(($) => $.explore.title)}
    >
      {compact ? (
        <SearchLink
          label={t(($) => $.search.label)}
          placeholder={t(($) => $.search.placeholder)}
          href="/search"
          onPress={(event) => {
            // Sur le web, le routeur ouvre la page sans que le navigateur la recharge.
            event?.preventDefault?.()
            router.push('/search')
          }}
        />
      ) : null}
      <Testers />
      <PopularTools />
      <Stack gap="md">
        <Text variant="heading" heading={2}>
          {t(($) => $.explore.recent)}
        </Text>
        <DiscoverFeed overlay={chipOf} errorMessage={t(($) => $.explore.recentError)} />
      </Stack>
    </Screen>
  )
}

/**
 * « Ils cherchent des testeurs » : la première page des projets testables, en carrousel. Seule la
 * première page : le carrousel ne demande jamais la suite (relecture juridique, jur-J7). Seuls les
 * projets qui ont une démo y entrent : « Tester » doit mener quelque part.
 */
function Testers() {
  const { t } = useTranslation()
  const router = useRouter()
  const openOutside = useOpenOutside()
  const toSource = useMediaSources()
  const feed = useDiscoverFeed({ testers: true })
  const projects = (feed.data?.pages[0]?.items ?? []).flatMap((item) =>
    item.kind === 'project' && item.project.demoUrl
      ? [{ project: item.project, demoUrl: item.project.demoUrl }]
      : [],
  )
  const title = (
    <Text variant="heading" heading={2}>
      {t(($) => $.explore.testers)}
    </Text>
  )

  if (!feed.data) {
    return (
      <Stack gap="md">
        {title}
        {feed.isError ? (
          // L'échec se dit dans la section ; le reste de la page (outils, « Récents ») reste.
          // Son propre texte : « Le fil n'a pas pu se charger », dit aussi par « Récents », ne
          // disait pas lequel (relecture de design de R3, #3).
          <Notice
            message={t(($) => $.explore.testersError)}
            action={{ label: t(($) => $.common.retry), onPress: () => void feed.refetch() }}
          />
        ) : (
          <SkeletonList count={1} />
        )}
      </Stack>
    )
  }
  if (projects.length === 0) {
    return (
      <Stack gap="md">
        {title}
        <Text tone="secondary">{t(($) => $.feed.testersEmpty)}</Text>
      </Stack>
    )
  }
  return (
    <Carousel
      label={t(($) => $.explore.carousel)}
      previousLabel={t(($) => $.explore.previous)}
      nextLabel={t(($) => $.explore.next)}
      header={title}
      bleed
    >
      {projects.map(({ project, demoUrl }) => (
        <TesterCard
          key={project.id}
          title={project.title}
          author={project.author.name}
          image={
            project.cover
              ? {
                  source: toSource(project.cover.url),
                  thumbhash: project.cover.thumbhash,
                  label: project.title,
                }
              : null
          }
          // La démo passe par la page d'avertissement des liens externes (« Tu quittes… »).
          onTest={() => openOutside(demoUrl)}
          // Le titre ouvre la page du projet (décision de Louis du 31/10/2026).
          onOpen={() => router.push({ pathname: '/projects/[id]', params: { id: project.id } })}
        />
      ))}
    </Carousel>
  )
}

/**
 * « Outils populaires » : les dix outils les plus cités par les projets publics (l'API les range du
 * plus cité au moins cité), avec leur nombre sur ordinateur, et le lien « Tous les outils ».
 * Sans outil (aucun projet public n'en cite), la section ne s'affiche pas.
 */
function PopularTools() {
  const { t } = useTranslation()
  const router = useRouter()
  const compact = useLayout().sizeClass === 'compact'
  const tools = useTools()
  const list = tools.data?.tools.slice(0, POPULAR_TOOLS) ?? []
  const title = (
    <Text variant="heading" heading={2}>
      {t(($) => $.explore.popularTools)}
    </Text>
  )
  const header = (
    // Le titre à gauche, « Tous les outils » au bout de la ligne ; à 200 %, le lien passe dessous.
    <Stack direction="row" gap="md" align="center" justify="between" wrap>
      {title}
      <TextLink label={t(($) => $.explore.allTools)} onPress={() => router.push('/tools')} />
    </Stack>
  )

  if (!tools.data) {
    // En attente : rien (la ligne est basse) ; en échec, on le dit, avec « Réessayer ».
    return tools.isError ? (
      <Stack gap="md">
        {header}
        <Notice
          message={t(($) => $.tools.errorTitle)}
          action={{ label: t(($) => $.common.retry), onPress: () => void tools.refetch() }}
        />
      </Stack>
    ) : null
  }
  if (list.length === 0) return null
  return (
    <Carousel
      variant="chips"
      label={t(($) => $.explore.popularTools)}
      previousLabel={t(($) => $.explore.previousTools)}
      nextLabel={t(($) => $.explore.nextTools)}
      header={header}
      bleed
    >
      {list.map((tool) => (
        <Tag
          key={tool.slug}
          label={tool.label}
          // Le nombre sur ordinateur seulement : sur téléphone, la place va aux noms.
          count={compact ? undefined : tool.projectCount}
          onPress={() => router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } })}
        />
      ))}
    </Carousel>
  )
}

type ChipProps = {
  author: ProjectSummary['author']
  /** Suivi d'après la page : l'état affiché, que le toucher inverse. */
  followed: boolean
  /** Inactive, à sa place : un compte suspendu qui vient d'arrêter de suivre (voir chipOf). */
  disabled: boolean
  /** L'état à afficher désormais (au toucher, puis en arrière si l'API refuse). */
  onChange: (followed: boolean) => void
}

/**
 * La pastille « Suivre Nora » d'une carte de « Récents » (F-Fil8). Toucher suit, retoucher arrête
 * de suivre (jur-J8). La pastille change au toucher, sans attendre l'API ; si l'API refuse, elle
 * revient en arrière, et un toast dit pourquoi : la pastille n'a pas de place pour un message.
 */
function AuthorChip({ author, followed, disabled, onChange }: ChipProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const toSource = useMediaSources()
  const follow = useFollow({ kind: 'member', id: author.id })
  // L'état demandé au dernier toucher : en cas d'échec, la pastille revient à l'inverse.
  const asked = useRef(followed)
  // Les fonctions de l'écran changent à chaque rendu : on garde les dernières dans un `ref`, pour
  // que l'effet ci-dessous ne se relance qu'à un nouvel échec.
  const latest = useRef({ onChange, toast, t })
  latest.current = { onChange, toast, t }

  // Un échec du dernier changement (l'erreur passe à vrai) : retour en arrière, et le toast. La
  // session expirée a son propre message (réessayer ne servirait à rien).
  useEffect(() => {
    if (!follow.error) return
    const { onChange: change, toast: notify, t: translate } = latest.current
    change(!asked.current)
    notify.show(
      follow.expired ? translate(($) => $.errors.unauthorized) : translate(($) => $.follow.error),
      { icon: 'warning' },
    )
  }, [follow.error, follow.expired])

  // Le texte affiché est aussi le nom lu : « Suivre Nora », puis « Tu suis Nora » (la coche est
  // dessinée par la pastille).
  const text = followed
    ? t(($) => $.follow.memberFollowing, { name: author.name })
    : t(($) => $.follow.member, { name: author.name })
  return (
    <FollowButton
      variant="chip"
      followed={followed}
      disabled={disabled}
      label={text}
      text={text}
      avatar={{ name: author.name, source: toSource(author.avatarUrl) }}
      onPress={() => {
        asked.current = !followed
        onChange(!followed)
        // L'état affiché part avec le geste : sans page de Nora en cache, c'est lui qui dit s'il
        // faut suivre ou arrêter de suivre.
        follow.toggle(followed)
      }}
    />
  )
}
