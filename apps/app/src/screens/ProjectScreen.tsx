// Page d'un projet : sa couverture, son statut, son titre, son auteur, sa démo, sa « recette »
// (outils, temps passé, prompts clés) et sa description. L'auteur peut le modifier ou le supprimer.
// L'auteur mène à sa page de membre, et chaque outil à la page de son étiquette. Un autre membre
// peut suivre le projet ; tous voient combien de membres le suivent.
// Sur téléphone, tout se lit de haut en bas ; sur ordinateur, la couverture et la description à
// gauche, le reste à droite.
// La couverture : sur téléphone, la couverture verticale si l'auteur en a donné une, sinon la
// première photo ; sur ordinateur, la première photo. Des vignettes permettent de voir les autres,
// et la lumière d'ambiance prend la couleur de la photo affichée.
import type { Project, ProjectVisual } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useFollow } from '../follows/api'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { deleteProject } from '../projects/api'
import { hostOf, shortDate } from '../projects/format'
import { useForgetProject, useProject } from '../projects/hooks'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { CodeBlock } from '../ui/CodeBlock'
import { Columns } from '../ui/Columns'
import { Dialog } from '../ui/Dialog'
import { FollowButton } from '../ui/FollowButton'
import { Hint } from '../ui/Hint'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Markdown } from '../ui/Markdown'
import { Notice } from '../ui/Notice'
import { Pressed } from '../ui/Pressed'
import { ProjectCover } from '../ui/ProjectCover'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { StatusPill } from '../ui/StatusPill'
import { Surface } from '../ui/Surface'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { Thumbnails } from '../ui/Thumbnails'
import { useLayout } from '../ui/theme/layout'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SignedOutScreen } from './states'

export function ProjectScreen({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()
  // Pas de session : aucune requête (« public » veut dire « visible par les membres »).
  const project = useProject(id, Boolean(session))

  if (isPending) return <LoadingScreen width="page" />
  if (!session) return <SignedOutScreen width="page" />
  if (project.error) {
    // « Introuvable » : le même écran, que le projet n'existe pas ou qu'il soit privé. Celui qui
    // n'a pas le droit de le voir n'apprend même pas qu'il existe.
    if (errorKey(project.error) === 'notFound') {
      return (
        <NotFoundState
          width="page"
          title={t('project.page.notFoundTitle')}
          message={t('project.page.notFound')}
        />
      )
    }
    return (
      <LoadErrorScreen error={project.error} onRetry={() => void project.refetch()} width="page" />
    )
  }
  if (!project.data) return <LoadingScreen width="page" />
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: Project }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const openOutside = useOpenOutside()
  const forgetProject = useForgetProject()
  const toSource = useMediaSources()
  const { sizeClass, columns } = useLayout()
  // large : tablette et ordinateur (barre du haut, retour hors de la couverture) ; wide : ordinateur ;
  // columns : les deux colonnes tiennent côte à côte. Sinon (téléphone, tablette en portrait), la
  // page garde l'ordre du téléphone, où « Tester la démo » vient juste après la couverture.
  const large = sizeClass !== 'compact'
  const wide = sizeClass === 'wide'
  // La photo de la galerie choisie dans les vignettes ; null : la couverture par défaut.
  const [selected, setSelected] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil.
  const back = useGoBack('/')
  const follow = useFollow({ kind: 'project', id: project.id })
  const followers = t('follow.followers', { count: project.followerCount })

  const onDelete = async () => {
    setBusy(true)
    const result = await deleteProject(project.id)
    setBusy(false)
    if (!result.ok) {
      setConfirming(false)
      setError(t(`errors.${result.error}`))
      return
    }
    forgetProject(project.id) // le projet n'existe plus : on l'oublie aussi dans le cache
    router.replace('/')
  }

  const hasRecipe = project.tools.length > 0 || project.timeSpent || project.prompts.length > 0

  // La photo affichée en couverture, et ce qu'en annoncent les lecteurs d'écran.
  const gallery = project.visuals
  const photoLabel = (index: number) =>
    t('project.visuals.photo', { number: index + 1, total: gallery.length })
  const portrait = large ? null : project.portraitCover
  const shown: { visual: ProjectVisual; label: string } | null =
    selected !== null && gallery[selected]
      ? { visual: gallery[selected], label: photoLabel(selected) }
      : portrait
        ? { visual: portrait, label: t('project.visuals.portraitLabel') }
        : gallery[0]
          ? { visual: gallery[0], label: photoLabel(0) }
          : null
  // Les vignettes servent dès qu'il y a autre chose à voir que la couverture affichée.
  const showThumbnails = gallery.length > 1 || (portrait !== null && gallery.length > 0)
  const thumbnails = showThumbnails ? (
    <Thumbnails
      items={gallery.map((visual, index) => ({
        key: visual.id,
        image: {
          source: toSource(visual.url),
          thumbhash: visual.thumbhash,
          label: photoLabel(index),
        },
      }))}
      // -1 : aucune vignette n'est sélectionnée (c'est la couverture verticale qui est affichée).
      selected={selected ?? (portrait ? -1 : 0)}
      onSelect={setSelected}
    />
  ) : null

  // Les morceaux de la page, assemblés différemment sur téléphone et sur ordinateur.
  // Sur téléphone, une couverture verticale a besoin de hauteur pour ne pas être trop recadrée.
  const cover = (
    <ProjectCover
      // Sans photo, la couverture n'est qu'une lumière miel : une bande basse suffit.
      height={!shown ? 'band' : columns ? 'hero' : shown.visual === portrait ? 'portrait' : 'band'}
      radius={large ? 'tile' : 'sheet'}
      image={
        shown
          ? {
              source: toSource(shown.visual.url),
              thumbhash: shown.visual.thumbhash,
              label: shown.label,
            }
          : null
      }
    >
      {large ? null : (
        <Row padding="lg">
          <IconButton icon="arrow-left" label={t('common.back')} onPress={back} />
        </Row>
      )}
    </ProjectCover>
  )

  const info = (
    <Stack gap="lg">
      <StatusPill
        label={t(`project.status.${project.status}`)}
        strong={project.status === 'testable'} // « Testable » en miel plein : on appelle au test
      />
      {/* En colonnes, le titre est au-dessus des deux colonnes (voir plus bas). */}
      {columns ? null : (
        <Text variant="title2" accessibilityRole="header" breakAnywhere>
          {project.title}
        </Text>
      )}
      <Pressed
        label={t('member.open', { name: project.author.name })}
        role="link"
        onPress={() =>
          router.push({ pathname: '/members/[id]', params: { id: project.author.id } })
        }
      >
        <Row gap="md">
          <Avatar
            name={project.author.name}
            source={toSource(project.author.avatarUrl)}
            label={project.author.name}
            size={44}
          />
          <Stack gap="xxs" grow>
            <Text weight={700}>{project.author.name}</Text>
            <Text variant="caption" tone="muted">
              {t('project.page.published', { date: shortDate(project.createdAt, i18n.language) })}
            </Text>
          </Stack>
        </Row>
      </Pressed>
      {/* Suivre : seulement le projet d'un autre ; l'auteur voit seulement le nombre d'abonnés. */}
      {project.isMine ? (
        <Text variant="callout" tone="secondary">
          {followers}
        </Text>
      ) : (
        <FollowButton
          followed={project.isFollowed}
          onPress={follow.toggle}
          label={t('follow.project')}
          text={project.isFollowed ? t('follow.projectFollowing') : t('follow.project')}
          caption={followers}
          error={follow.error ? t('follow.error') : undefined}
        />
      )}
      {project.visibility === 'private' ? (
        <Notice tone="info" message={t('project.page.private')} />
      ) : null}
      <Text variant="headline" tone="secondary" weight={400} readable>
        {project.pitch}
      </Text>
      {project.demoUrl ? (
        <Stack gap="sm">
          <Button
            label={t('project.page.tryDemo')}
            icon="arrow-up-right"
            onPress={() => openOutside(project.demoUrl ?? '')}
          />
          {/* On annonce toujours le site extérieur, avant même la page d'avertissement. */}
          <Hint
            icon="globe-simple"
            text={t('project.page.external', { host: hostOf(project.demoUrl) })}
          />
        </Stack>
      ) : (
        <Text tone="muted">{t('project.page.noDemo')}</Text>
      )}
    </Stack>
  )

  const recipe = hasRecipe ? (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" accessibilityRole="header">
        {t('project.page.recipe')}
      </Text>
      {project.tools.length > 0 ? (
        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted">
            {t('project.page.tools')}
          </Text>
          <Stack direction="row" gap="sm" wrap>
            {project.tools.map((tool) => (
              <Tag
                key={tool.slug}
                label={tool.label}
                onPress={() =>
                  router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } })
                }
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
      {project.timeSpent ? (
        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted">
            {t('project.page.timeSpent')}
          </Text>
          <Row gap="sm">
            <Icon name="clock" size={20} tone="amber" />
            <Text weight={600}>{t(`project.timeSpent.${project.timeSpent}`)}</Text>
          </Row>
        </Stack>
      ) : null}
      {project.prompts.length > 0 ? (
        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted">
            {t('project.page.prompts')}
          </Text>
          {project.prompts.map((prompt, i) => (
            // Les prompts sont affichés tels quels, sans mise en forme : on voit le vrai texte.
            // biome-ignore lint/suspicious/noArrayIndexKey: deux prompts peuvent être identiques
            <CodeBlock key={i}>{prompt}</CodeBlock>
          ))}
        </Stack>
      ) : null}
    </Surface>
  ) : null

  const description = project.description ? (
    <Stack gap="md">
      <Text variant="heading" accessibilityRole="header">
        {t('project.page.description')}
      </Text>
      <Markdown text={project.description} onLinkPress={openOutside} />
    </Stack>
  ) : null

  const ownerActions = project.isMine ? (
    <Stack gap="md">
      {error ? <Notice message={error} /> : null}
      <Button
        label={t('project.page.edit')}
        variant="secondary"
        icon="pencil-simple"
        onPress={() => router.push({ pathname: '/projects/[id]/edit', params: { id: project.id } })}
      />
      <Button
        label={t('project.page.delete')}
        variant="danger"
        icon="trash"
        onPress={() => setConfirming(true)}
      />
      {/* Supprimer est définitif : une fenêtre demande confirmation, avec le titre du projet. */}
      <Dialog
        visible={confirming}
        title={t('project.page.deleteTitle', { title: project.title })}
        message={t('project.page.deleteConfirm')}
        onDismiss={() => setConfirming(false)}
      >
        <Button
          label={t('project.page.deleteConfirmButton')}
          variant="confirm"
          onPress={() => void onDelete()}
          loading={busy}
        />
        <Button
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => setConfirming(false)}
        />
      </Dialog>
    </Stack>
  ) : null

  // La lumière d'ambiance prend la couleur de la photo affichée (sans photo : la lumière miel).
  const thumbhash = shown?.visual.thumbhash ?? null

  if (columns) {
    return (
      <Screen
        width="page"
        header={<TopNav />}
        onBack={back}
        thumbhash={thumbhash}
        pageTitle={project.title}
      >
        {/* Le titre au-dessus des colonnes, sur toute la largeur : dans la colonne latérale, un
            titre long passait sur sept lignes. */}
        <Text variant={wide ? 'display' : 'title1'} accessibilityRole="header" breakAnywhere>
          {project.title}
        </Text>
        <Columns
          main={
            <>
              {cover}
              {thumbnails}
              {description}
            </>
          }
          side={
            <>
              {info}
              {recipe}
              {ownerActions}
            </>
          }
        />
      </Screen>
    )
  }
  return (
    <Screen
      thumbhash={thumbhash}
      pageTitle={project.title}
      // Sur tablette : toute la largeur, la barre du haut, et le retour hors de la couverture.
      {...(large ? { width: 'page' as const, header: <TopNav />, onBack: back } : null)}
    >
      {cover}
      {thumbnails}
      {info}
      {recipe}
      {description}
      {ownerActions}
    </Screen>
  )
}
