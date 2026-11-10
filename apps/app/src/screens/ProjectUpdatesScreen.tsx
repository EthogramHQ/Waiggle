// La page « Les mises à jour » d'un projet, la frise (R7a, docs/scenarios/refonte.md, « La frise »,
// « L'avant / après », « Supprimer une mise à jour » ; planches R7-MAJ-Projet et R7-MAJ-Desktop).
// Son adresse : /projects/<id>/updates.
//
// De haut en bas :
// - « Retour » et, pour un autre membre, « Suivre ce projet », sur la même rangée (`Screen
//   topAction`) ;
// - le titre « Les mises à jour · 3 » (lu « Les mises à jour, 3 mises à jour »), le lien qui ramène
//   au projet (« Carnet de recettes, par Léa »), puis la ligne des dates, la même que sous le titre
//   de la page du projet (`ProjectDatesLine`) ;
// - l'avant / après de la plus récente mise à jour qui en a un, en grand (sa mise à jour, dans la
//   frise, ne le répète pas) ;
// - la frise (`UpdateTimeline`), 20 par 20, jusqu'à « Première version ».
// Sur ordinateur, deux colonnes sous le titre : l'avant / après à gauche, la frise à droite. Le titre
// reste au-dessus des deux : il est lu avant le curseur de la comparaison (relecture du plan, A4).
//
// L'auteur supprime une mise à jour par sa corbeille, après confirmation. Deux soins pour le focus
// (relecture U1d) :
// - la frise ne change pas sous la fenêtre de confirmation : la liste affichée est figée pendant
//   qu'elle est ouverte, et ne perd la mise à jour supprimée qu'une fois la fenêtre partie. Sinon, la
//   frise donnait le focus à la mise à jour suivante pendant que la fenêtre était encore là ; la
//   fenêtre le reprenait (son piège à focus, sur le web), puis le rendait en partant à la corbeille…
//   qui n'existait plus. Le focus finissait sur la page entière ;
// - quand il ne reste plus aucune mise à jour, le focus va au titre de la page.
// Un autre membre peut signaler chaque mise à jour, comme un commentaire (page « Signaler »).
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import type { Project, ProjectUpdate } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useProject } from '../projects/hooks'
import { BeforeAfter } from '../ui/BeforeAfter'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { CountedTitle } from '../ui/CountedTitle'
import { Dialog } from '../ui/Dialog'
import { FollowButton } from '../ui/FollowButton'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { LiveStatus } from '../ui/LiveStatus'
import { Notice } from '../ui/Notice'
import type { GalleryPhoto } from '../ui/PhotoGallery'
import { ProjectDatesLine } from '../ui/ProjectDatesLine'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { UpdateTimeline } from '../ui/UpdateTimeline'
import { type UpdateFailure, useDeleteUpdate, useProjectUpdates } from '../updates/api'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'

export function ProjectUpdatesScreen({ id }: { id: string }) {
  const { t } = useTranslation()
  const { state, session, retry } = useMemberSession()
  // Pas de session : aucune requête (« public » veut dire « visible par les membres »).
  const project = useProject(id, Boolean(session))

  if (state === 'pending') return <LoadingScreen width="page" />
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  if (!session) return <SignedOutScreen width="page" />
  if (project.error) {
    // « Introuvable » : le même écran que la page du projet, qu'il n'existe pas ou qu'il soit
    // privé (celui qui n'a pas le droit de le voir n'apprend même pas qu'il existe).
    if (errorKey(project.error) === 'notFound') {
      return (
        <NotFoundState
          variant="project"
          width="page"
          title={t(($) => $.project.page.notFoundTitle)}
          message={t(($) => $.project.page.notFound)}
        />
      )
    }
    return (
      <LoadErrorScreen error={project.error} onRetry={() => void project.refetch()} width="page" />
    )
  }
  if (!project.data) return <LoadingScreen width="page" />
  return <UpdatesView project={project.data} />
}

/** La mise à jour dont la fenêtre de confirmation demande la suppression. */
type Deleting = { update: ProjectUpdate } | null

function UpdatesView({ project }: { project: Project }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const { columns } = useLayout()
  const back = useGoBack(`/projects/${project.id}`)
  const updates = useProjectUpdates(project.id)
  const deletion = useDeleteUpdate(project.id)
  const signInAgain = useSignInAgain()

  // Le titre de la page : où va le focus quand la dernière mise à jour est supprimée.
  const headingRef = useRef<Focusable>(null)
  // « Annuler » reçoit le focus à l'ouverture de la fenêtre : le geste qui ne perd rien.
  const cancelRef = useRef<Focusable>(null)

  const live = updates.data?.pages.flatMap((page) => page.items) ?? []
  // La frise figée pendant la fenêtre de confirmation (voir l'en-tête du fichier) ; null : la frise
  // du cache, telle qu'elle est.
  const [frozen, setFrozen] = useState<ProjectUpdate[] | null>(null)
  // Les mises à jour supprimées pendant la visite, l'API d'accord : elles ne reviennent jamais,
  // même si une relecture partie avant la suppression les rapporte encore.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const shown = (frozen ?? live).filter((update) => !gone.has(update.id))

  const [deleting, setDeleting] = useState<Deleting>(null)
  // La mise à jour dont « Supprimer » a été touché : sa corbeille reste occupée jusqu'à ce que la
  // frise la perde (ou qu'on renonce). La frise s'en sert pour savoir où rendre le focus.
  const [attempted, setAttempted] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  // Le refus se montre après un envoi seulement, et disparaît à la réouverture.
  const [showDeleteError, setShowDeleteError] = useState(false)
  // « Mise à jour supprimée. », lu poliment une fois la fenêtre fermée.
  const [announce, setAnnounce] = useState('')
  // La frise vient de perdre une mise à jour : s'il n'en reste aucune, le focus ira au titre.
  const [justDeleted, setJustDeleted] = useState(false)

  const openDelete = (update: ProjectUpdate) => {
    setShowDeleteError(false)
    setAnnounce('')
    setFrozen(live)
    setDeleting({ update })
  }

  // La mise à jour que l'API vient de supprimer, en attendant que la fenêtre soit partie.
  const confirmed = useRef<string | null>(null)

  /**
   * La frise reprend le cache, et perd la mise à jour supprimée s'il y en a une. Sur le web, une
   * fois la fenêtre partie (`onClosed`) ; sur téléphone, dès sa fermeture (Android ne prévient pas
   * de la fin de son départ).
   */
  const release = () => {
    const id = confirmed.current
    confirmed.current = null
    if (id) {
      setGone((before) => new Set(before).add(id))
      setJustDeleted(true)
    }
    setFrozen(null)
    setAttempted(null)
  }

  const closeDialog = () => {
    setDeleting(null)
    if (Platform.OS !== 'web') release()
  }

  const confirmDelete = async () => {
    if (!deleting || removing) return
    const { update } = deleting
    setRemoving(true)
    setAttempted(update.id)
    setShowDeleteError(false)
    const ok = await deletion.remove(update.id)
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) {
      setShowDeleteError(true)
      return
    }
    confirmed.current = update.id
    setAnnounce(t(($) => $.project.updates.deleted))
    closeDialog()
  }

  // La dernière mise à jour vient de partir : le focus va au titre de la page (la frise n'a plus
  // personne à qui le donner). Web : le focus du clavier, sans défilement ; téléphone : le lecteur.
  useEffect(() => {
    if (!justDeleted || frozen) return
    setJustDeleted(false)
    if (shown.length > 0) return
    if (!focusWithoutScroll(headingRef.current)) moveReaderTo(headingRef.current)
  }, [justDeleted, frozen, shown.length])

  // L'avant / après en tête de page : celui de la plus récente mise à jour qui en a un (une mise à
  // jour retirée par la modération, que seul l'auteur voit, n'est pas mise en avant).
  const featured = shown.find(
    (update) => update.beforeAfter && update.photos.length >= 2 && update.removal === null,
  )
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
  // Dans la frise, la mise à jour mise en avant garde ses autres photos, sans répéter la comparaison
  // (deux curseurs du même nom sur la page ne se distingueraient pas).
  const timelineUpdates = shown.map((update) =>
    update === featured
      ? { ...update, beforeAfter: false, photos: update.photos.slice(2) }
      : update,
  )

  const failure = (reason: UpdateFailure | undefined) =>
    reason === 'expired' ? t(($) => $.states.expired) : t(($) => $.project.updates.deleteError)

  const head = (
    <Stack gap="xs">
      <CountedTitle
        title={t(($) => $.project.updates.title)}
        count={project.updateCount}
        spokenCount={t(($) => $.project.updates.count, { count: project.updateCount })}
        level={1}
        variant="title2"
        focusRef={headingRef}
      />
      {/* Le projet et son auteur : un lien qui y ramène. */}
      <TextLink
        label={t(($) => $.project.updates.ofProject, {
          title: project.title,
          name: project.author.name,
        })}
        tone="muted"
        breakAnywhere
        onPress={() => router.push({ pathname: '/projects/[id]', params: { id: project.id } })}
      />
      <ProjectDatesLine
        createdAt={project.createdAt}
        visibility={project.visibility}
        latestUpdateAt={project.latestUpdate?.createdAt ?? null}
        version={project.version}
      />
    </Stack>
  )

  const timeline = updates.data ? (
    <UpdateTimeline
      updates={timelineUpdates}
      publishedAt={project.createdAt}
      toSource={toSource}
      deletingId={attempted}
      hasMore={updates.hasNextPage}
      onMore={() => void updates.fetchNextPage()}
      loadingMore={updates.isFetchingNextPage}
      moreError={updates.isFetchNextPageError}
      {...(project.isMine
        ? { onDelete: openDelete }
        : {
            // Un autre membre signale une mise à jour comme un commentaire (page « Signaler »).
            onReport: (update: ProjectUpdate) =>
              router.push({ pathname: '/report', params: { kind: 'update', id: update.id } }),
          })}
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

  const removed = deleting?.update.removal != null

  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={back}
      backLabel={t(($) => $.project.page.back)}
      topAction={<FollowProject project={project} />}
      pageTitle={t(($) => $.project.updates.pageTitle, { title: project.title })}
      thumbhash={project.visuals[0]?.thumbhash ?? null}
    >
      {head}
      {hero && columns ? (
        <Columns main={hero} side={timeline} sideWidth="wide" />
      ) : (
        <>
          {hero}
          {timeline}
        </>
      )}
      <LiveStatus message={announce} visible={false} />
      {/* Supprimer une mise à jour est définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={deleting !== null}
        guardTaps
        title={t(($) => $.project.updates.deleteTitle)}
        message={
          removed
            ? t(($) => $.project.updates.deleteBodyRemoved)
            : t(($) => $.project.updates.deleteBody)
        }
        initialFocusRef={cancelRef}
        busy={removing}
        onDismiss={() => {
          if (removing) return
          setAttempted(null)
          closeDialog()
        }}
        // La fenêtre est partie (web) : la frise peut perdre la mise à jour supprimée, et donner le
        // focus à la suivante sans que la fenêtre le lui reprenne.
        onClosed={release}
      >
        {/* Refusée : le message reste dans la fenêtre, et « Supprimer » permet de réessayer ; une
            session expirée propose de se reconnecter (la fenêtre se ferme d'abord). */}
        {showDeleteError && deletion.error ? (
          <Notice
            message={failure(deletion.reason)}
            action={
              deletion.reason === 'expired'
                ? signInAgain(() => {
                    setAttempted(null)
                    closeDialog()
                  })
                : undefined
            }
          />
        ) : null}
        <Button
          label={t(($) => $.project.updates.confirmDelete)}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={removing}
        />
        <Button
          ref={cancelRef}
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => {
            setAttempted(null)
            closeDialog()
          }}
          disabled={removing}
        />
      </Dialog>
    </Screen>
  )
}

/**
 * « Suivre ce projet », pour un autre membre, en haut à droite. Les mêmes règles que sur la page du
 * projet (`ProjectActions`) : un compte suspendu (tranche 7c) ne suit plus, mais garde la pastille
 * pour ne plus suivre ; une fois retirée, elle reste à sa place, inactive.
 */
function FollowProject({ project }: { project: Project }) {
  const { t } = useTranslation()
  const follow = useFollow({ kind: 'project', id: project.id })
  const { suspended } = useSuspension()
  const signInAgain = useSignInAgain()
  const followedOnce = useRef(false)
  if (project.isFollowed) followedOnce.current = true
  if (project.isMine || (suspended && !followedOnce.current)) return null
  const text = project.isFollowed ? t(($) => $.follow.projectFollowing) : t(($) => $.follow.project)
  return (
    <FollowButton
      followed={project.isFollowed}
      onPress={() => follow.toggle(project.isFollowed)}
      label={text}
      text={text}
      error={
        follow.error
          ? follow.expired
            ? t(($) => $.states.expired)
            : t(($) => $.follow.error)
          : undefined
      }
      errorAction={follow.expired ? signInAgain() : undefined}
      // En blanc : la page n'a pas d'action miel à elle (« Tester la démo » est sur le projet).
      prominent={false}
      icon="bell"
      disabled={suspended && !project.isFollowed}
    />
  )
}
