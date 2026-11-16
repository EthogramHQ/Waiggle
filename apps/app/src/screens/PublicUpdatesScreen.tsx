// « Les mises à jour » d'un projet public vues par un visiteur sans compte (tranche R12, relecture du
// plan, décision 10 : UI B3). Son adresse : /fr/projects/<id>/updates (ou /en/…), où mène « Voir les
// 3 mises à jour » de la page publique du projet. Un membre connecté, à la même adresse, garde sa
// page à lui (`ProjectUpdatesScreen`, choisie par `MemberOrVisitor` dans la route).
//
// La même page que celle d'un membre, sans ce qui lui est réservé : le titre « Les mises à jour · 3 »,
// le lien qui ramène au projet, la ligne des dates, l'avant / après le plus récent en grand, puis la
// frise (`UpdateTimeline`), 20 par 20. Chaque mise à jour se signale (« Signaler », page `/report`,
// qui passe en mode visiteur sans session). Ni « Suivre ce projet » ni corbeille.
//
// Tout se lit aux routes publiques, sans session (public/api.ts). Un projet qui n'est pas public,
// inconnu ou retiré répond le même 404 : la page dit alors « Se connecter », comme la page d'un
// projet réservé aux membres (choix 3 du plan R12), sans rien montrer du projet.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import type { ProjectUpdate, PublicProject, PublicUpdate } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { publicPath } from '../navigation/publicPath'
import { useGoBack } from '../navigation/useGoBack'
import { usePageLanguage, usePublicProject, usePublicUpdates } from '../public/api'
import { BeforeAfter } from '../ui/BeforeAfter'
import { Columns } from '../ui/Columns'
import { CountedTitle } from '../ui/CountedTitle'
import type { GalleryPhoto } from '../ui/PhotoGallery'
import { ProjectDatesLine } from '../ui/ProjectDatesLine'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { UpdateTimeline } from '../ui/UpdateTimeline'
import { VisitorBar } from '../ui/VisitorBar'
import { LoadErrorScreen, LoadingScreen, SignedOutScreen } from './states'

export function PublicUpdatesScreen({ id }: { id: string }) {
  const project = usePublicProject(id)

  if (project.error) {
    if (errorKey(project.error) === 'notFound') return <SignedOutScreen width="page" />
    // Sans page d'avant, « Revenir » mène à l'accueil : le Fil serait « Réservé aux membres ».
    return (
      <LoadErrorScreen
        error={project.error}
        onRetry={() => void project.refetch()}
        fallback="/"
        width="page"
      />
    )
  }
  if (!project.data) return <LoadingScreen width="page" fallback="/" />
  return <UpdatesView project={project.data} />
}

/**
 * Une mise à jour publique dans la forme que dessine la frise : un visiteur ne voit jamais une mise à
 * jour retirée, ni une partie retirée (l'API ne les donne pas), d'où `removal: null` et aucune partie.
 */
const asTimelineUpdate = (update: PublicUpdate): ProjectUpdate => ({
  ...update,
  removal: null,
  removedParts: [],
})

function UpdatesView({ project }: { project: PublicProject }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const { columns } = useLayout()
  const lang = usePageLanguage()
  const projectPage = publicPath('project', lang, project.id)
  const back = useGoBack(projectPage)
  const updates = usePublicUpdates(project.id)

  const shown = (updates.data?.pages.flatMap((page) => page.items) ?? []).map(asTimelineUpdate)

  // L'avant / après en tête de page : celui de la plus récente mise à jour qui en a un ; sa mise à
  // jour, dans la frise, garde ses autres photos sans répéter la comparaison (même règle que la page
  // d'un membre : deux curseurs du même nom ne se distingueraient pas).
  const featured = shown.find((update) => update.beforeAfter && update.photos.length >= 2)
  const photoOf = (visual: ProjectUpdate['photos'][number]): GalleryPhoto => ({
    key: visual.id,
    source: toSource(visual.url),
    thumbhash: visual.thumbhash,
    description: visual.description,
  })
  const [beforePhoto, afterPhoto] = featured?.photos ?? []
  const hero =
    beforePhoto && afterPhoto ? (
      <BeforeAfter before={photoOf(beforePhoto)} after={photoOf(afterPhoto)} />
    ) : null
  const timelineUpdates = shown.map((update) =>
    update === featured
      ? { ...update, beforeAfter: false, photos: update.photos.slice(2) }
      : update,
  )

  const head = (
    <Stack gap="xs">
      <CountedTitle
        title={t(($) => $.project.updates.title)}
        count={project.updateCount}
        spokenCount={t(($) => $.project.updates.count, { count: project.updateCount })}
        level={1}
        variant="title2"
      />
      {/* Le projet et son auteur : un lien qui ramène à sa page publique, dans la langue de la page. */}
      <TextLink
        label={t(($) => $.project.updates.ofProject, {
          title: project.title,
          name: project.author.name,
        })}
        tone="muted"
        breakAnywhere
        onPress={() => router.push(projectPage)}
      />
      {/* « Publié le … · Mis à jour hier · v1.2 », la ligne de la page du projet. Un projet public
          a toujours été publié : `publishedAt`, jamais « Créé le ». */}
      <ProjectDatesLine
        createdAt={project.publishedAt}
        visibility="web"
        latestUpdateAt={project.latestUpdateAt}
        version={project.version}
      />
    </Stack>
  )

  const timeline = updates.data ? (
    <UpdateTimeline
      updates={timelineUpdates}
      publishedAt={project.publishedAt}
      toSource={toSource}
      hasMore={updates.hasNextPage}
      onMore={() => void updates.fetchNextPage()}
      loadingMore={updates.isFetchingNextPage}
      moreError={updates.isFetchNextPageError}
      // Un visiteur peut signaler une mise à jour (R12) : la page « Signaler » passe en mode
      // visiteur et lit la cible aux routes publiques.
      onReport={(update) =>
        router.push({ pathname: '/report', params: { kind: 'update', id: update.id } })
      }
    />
  ) : updates.isError ? (
    // La première page n'a pas pu se charger : le titre reste, et une issue.
    <StateMessage
      kind="error"
      message={t(($) => $.project.updates.loadError)}
      actions={[
        {
          label: t(($) => $.common.retry),
          onPress: () => void updates.refetch(),
          loading: updates.isFetching,
        },
      ]}
    />
  ) : (
    <SkeletonList count={2} />
  )

  return (
    <Screen
      width="page"
      // La barre d'un visiteur (R12) : le logo ramène à l'accueil dans la langue de la page, « Se
      // connecter » revient sur cette frise (la barre d'un membre ne dessine rien sans session).
      header={
        <VisitorBar
          homeHref={publicPath('home', lang)}
          next={publicPath('updates', lang, project.id)}
        />
      }
      onBack={back}
      backLabel={t(($) => $.project.page.back)}
      pageTitle={t(($) => $.project.updates.pageTitle, { title: project.title })}
      thumbhash={project.visuals[0]?.thumbhash ?? null}
    >
      {head}
      {columns && hero ? (
        <Columns main={hero} side={timeline} sideWidth="wide" />
      ) : (
        <>
          {hero}
          {timeline}
        </>
      )}
    </Screen>
  )
}
