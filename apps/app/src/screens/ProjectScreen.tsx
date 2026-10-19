// Page d'un projet : sa couverture, son statut, son titre, son auteur, sa démo, sa « recette »
// (outils, temps passé, prompts clés) et sa description. L'auteur peut le modifier ou le supprimer.
// L'auteur mène à sa page de membre, et chaque outil à la page de son étiquette. Un autre membre
// peut suivre le projet ; tous voient combien de membres le suivent.
// Le journal (tranche 4b) : les notes de l'auteur, de la plus récente à la plus ancienne. L'auteur y
// publie et y supprime ses notes ; après un changement de statut, le formulaire le ramène ici avec
// « ?announce=<statut> », et une note toute prête l'attend dans le champ.
// Sur téléphone, tout se lit de haut en bas ; sur ordinateur, la couverture, la description et le
// journal à gauche, les informations et les actions à droite.
// Les réactions et les commentaires (tranche 5) : un autre membre pose ses réactions sous « Suivre »
// (l'auteur voit seulement les nombres) ; les commentaires viennent après le journal, dans la
// colonne principale sur ordinateur.
// La couverture : sur téléphone, la couverture verticale si l'auteur en a donné une, sinon la
// première photo ; sur ordinateur, la première photo. Des vignettes permettent de voir les autres,
// et la lumière d'ambiance prend la couleur de la photo affichée.
import {
  NoteText,
  PROJECT_NOTE_MAX,
  type Project,
  ProjectStatus,
  type ProjectVisual,
  REACTION_KINDS,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useFollow } from '../follows/api'
import { useOpenOutside } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { type NoteFailure, useDeleteNote, usePublishNote } from '../notes/api'
import { deleteProject } from '../projects/api'
import { hostOf, shortDate } from '../projects/format'
import { useForgetProject, useProject } from '../projects/hooks'
import { useReaction } from '../reactions/api'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { CodeBlock } from '../ui/CodeBlock'
import { Columns } from '../ui/Columns'
import { Dialog } from '../ui/Dialog'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { Hint } from '../ui/Hint'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Markdown } from '../ui/Markdown'
import { NoteComposer } from '../ui/NoteComposer'
import { NoteList, type NoteListHandle } from '../ui/NoteList'
import { Notice } from '../ui/Notice'
import { Pressed } from '../ui/Pressed'
import { ProjectCover } from '../ui/ProjectCover'
import { ReactionBar } from '../ui/ReactionBar'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { StatusPill } from '../ui/StatusPill'
import { Surface } from '../ui/Surface'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { Thumbnails } from '../ui/Thumbnails'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { Comments } from './ProjectComments'
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
  const reaction = useReaction(project.id)
  // Les cinq réactions, telles que la barre les affiche. Le nom lu reprend le texte affiché et dit
  // si la réaction est la sienne (« Bravo, réagi, 4 »).
  const reactions = REACTION_KINDS.map((kind) => {
    const text = t(`project.reactions.${kind}`)
    const count = project.reactions.counts[kind]
    const mine = !project.isMine && project.reactions.mine.includes(kind)
    return {
      kind,
      text,
      count,
      mine,
      label: t(mine ? 'project.reactions.labelMine' : 'project.reactions.label', {
        name: text,
        count,
      }),
    }
  })

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
      {/* Suivre, après la démo : on lit d'abord le projet, puis on décide de le suivre. Seulement le
          projet d'un autre ; l'auteur voit seulement le nombre d'abonnés. */}
      {project.isMine ? (
        <FollowerCount text={followers} />
      ) : (
        <FollowButton
          followed={project.isFollowed}
          onPress={follow.toggle}
          // Le nom lu reprend le texte affiché, « Projet suivi » une fois suivi (voir MemberScreen).
          label={project.isFollowed ? t('follow.projectFollowing') : t('follow.project')}
          text={project.isFollowed ? t('follow.projectFollowing') : t('follow.project')}
          caption={followers}
          error={
            follow.expired ? t('states.expired') : follow.error ? t('follow.error') : undefined
          }
          prominent={false}
        />
      )}
      {/* Réagir, après Suivre. L'auteur ne réagit pas à son propre projet : il voit les nombres. */}
      {project.isMine ? (
        <ReactionBar items={reactions} readOnly caption={t('project.reactions.own')} />
      ) : (
        <ReactionBar
          items={reactions}
          onToggle={reaction.toggle}
          error={
            reaction.expired
              ? t('states.expired')
              : reaction.error
                ? t('project.reactions.error')
                : undefined
          }
        />
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

  // Le journal : pour un autre membre, seulement s'il y a des notes à lire.
  const journal = project.isMine || project.notes.length > 0 ? <Journal project={project} /> : null
  // Les commentaires : pour tous ceux qui voient le projet, l'auteur compris.
  const comments = <Comments project={project} />

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
              {/* Ce qui se lit longtemps va dans la colonne principale ; la latérale garde les
                  informations et les actions. */}
              {journal}
              {comments}
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
      {journal}
      {ownerActions}
      {/* Les commentaires en dernier : la conversation vient après le projet et ses actions. */}
      {comments}
    </Screen>
  )
}

/**
 * Le journal du projet : ses notes et, pour l'auteur, de quoi en publier ou en supprimer une. Un
 * composant à part : ses états (le texte en cours, la note à supprimer) ne redessinent pas toute la
 * page à chaque lettre tapée.
 */
function Journal({ project }: { project: Project }) {
  const { t, i18n } = useTranslation()
  const publishNote = usePublishNote(project.id)
  const deleteNote = useDeleteNote(project.id)
  // Le champ « Ta note » : ouvert ou non, son texte, et le problème du texte s'il y en a un.
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | undefined>()
  // Le texte à jour, lu à la fin d'un envoi (la fonction en cours ne voit que l'ancien).
  const latestDraft = useRef(draft)
  const changeDraft = (text: string) => {
    latestDraft.current = text
    setDraft(text)
    // Le texte a changé : l'ancien reproche (« Écris ta note… ») ne vaut plus.
    setDraftError(undefined)
  }
  // La confirmation affichée : « Note publiée. » ou « Note supprimée. », jusqu'au geste suivant.
  const [done, setDone] = useState<'published' | 'deleted' | null>(null)
  // Le statut annoncé par le formulaire (?announce=) : l'aide du champ dit pourquoi il est ouvert.
  const [announcing, setAnnouncing] = useState<ProjectStatus | null>(null)
  // Deux appuis dans le même instant arrivent avant que le bouton ne passe en « en cours » : ce
  // drapeau, posé au premier, fait ignorer le second (une seule note publiée).
  const sending = useRef(false)
  // La note dont on demande confirmation de la suppression, et sa place dans le journal.
  const [deleting, setDeleting] = useState<{ id: string; index: number } | null>(null)
  const [removing, setRemoving] = useState(false)
  // Les erreurs de React Query restent jusqu'au prochain envoi : on ne les montre qu'après un envoi,
  // et on les cache dès qu'on rouvre le champ ou une nouvelle confirmation.
  const [showPublishError, setShowPublishError] = useState(false)
  const [showDeleteError, setShowDeleteError] = useState(false)
  // Une fois la note supprimée et la fenêtre refermée, le focus va sur la note qui a pris sa place.
  const router = useRouter()
  const notesHandle = useRef<NoteListHandle>(null)
  const focusAfterClose = useRef<number | null>(null)

  // Arrivé du formulaire après un changement de statut (?announce=testable) : le champ s'ouvre avec
  // une note toute prête (« Le projet passe en « Testable ». »). Seulement pour l'auteur, et
  // seulement pour un vrai statut : une adresse fabriquée ne glisse rien dans son champ. L'adresse
  // n'est connue que dans le navigateur : on attend d'y être (voir ui/theme/hydration.ts).
  const announced = firstParam(useLocalSearchParams<{ announce?: string | string[] }>().announce)
  const hydrated = useHydrated()
  // Le statut déjà proposé : changer de langue ensuite ne réécrit pas le champ.
  const proposed = useRef<string | null>(null)
  useEffect(() => {
    if (!hydrated || !project.isMine || proposed.current === announced) return
    const status = ProjectStatus.safeParse(announced)
    if (!status.success) return
    proposed.current = status.data
    const text = t('project.notes.statusPrefill', { status: t(`project.status.${status.data}`) })
    latestDraft.current = text
    setDraft(text)
    setAnnouncing(status.data)
    setComposing(true)
    setDone(null)
    // On retire le paramètre de l'adresse : recharger la page ne rouvre pas le champ.
    router.setParams?.({ announce: undefined })
  }, [hydrated, project.isMine, announced, t, router])

  const submit = async () => {
    if (sending.current) return
    // La même règle que l'API (packages/contracts) : un texte non vide, sans caractères invisibles.
    const checked = NoteText.safeParse(draft)
    if (!checked.success) {
      setDraftError(
        draft.trim() === '' ? t('project.notes.required') : t('project.errors.invalidCharacters'),
      )
      return
    }
    setDraftError(undefined)
    sending.current = true
    setShowPublishError(true)
    const sent = draft
    const ok = await publishNote.publish(checked.data)
    sending.current = false
    // Refusée : le texte reste dans le champ, et l'erreur s'affiche (publishNote.error).
    if (!ok) return
    // Publiée. Si le texte a changé entre-temps, c'est une autre note qui commence : on la garde.
    if (latestDraft.current !== sent) return
    changeDraft('')
    setComposing(false)
    setAnnouncing(null)
    setDone('published')
  }

  const confirmDelete = async () => {
    if (!deleting || removing) return
    setRemoving(true)
    setShowDeleteError(true)
    const ok = await deleteNote.remove(deleting.id)
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    // Supprimée : son bouton n'existe plus ; le focus ira sur sa voisine, une fois la fenêtre
    // refermée. « Note supprimée. » le confirme.
    focusAfterClose.current = deleting.index
    setDone('deleted')
    setDeleting(null)
  }

  // Le message d'un envoi refusé. 429 et 401 : « Réessaie » ne servirait à rien, on dit pourquoi.
  const failure = (reason: NoteFailure | undefined, otherwise: string) =>
    reason === 'limited'
      ? t('project.notes.limited')
      : reason === 'expired'
        ? t('states.expired')
        : otherwise

  const list = (
    <NoteList
      handle={notesHandle}
      notes={project.notes.map((note) => ({
        id: note.id,
        body: note.body,
        when: shortDate(note.createdAt, i18n.language),
      }))}
      {...(project.isMine
        ? {
            onDelete: (id: string) => {
              setShowDeleteError(false)
              setDone(null)
              setDeleting({ id, index: project.notes.findIndex((note) => note.id === id) })
            },
            deleteLabel: t('project.notes.delete'),
            // Sur un projet privé, personne d'autre ne verra ses notes : on le dit.
            empty:
              project.visibility === 'private'
                ? t('project.notes.emptyPrivate')
                : t('project.notes.empty'),
          }
        : null)}
    />
  )
  const empty = project.notes.length === 0

  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" accessibilityRole="header">
        {t('project.notes.title')}
      </Text>
      {/* Un journal vide : l'invitation d'abord, puis le bouton qui y répond. */}
      {empty ? list : null}
      {project.isMine ? (
        <NoteComposer
          open={composing}
          onOpen={() => {
            setDone(null)
            setShowPublishError(false)
            setComposing(true)
          }}
          onCancel={() => {
            setComposing(false)
            setDraftError(undefined)
            setShowPublishError(false)
            setAnnouncing(null)
          }}
          value={draft}
          onChangeText={changeDraft}
          onSubmit={() => void submit()}
          pending={publishNote.pending}
          max={PROJECT_NOTE_MAX}
          labels={{
            open: t('project.notes.add'),
            field: t('project.notes.field'),
            // L'aide dit à qui ira la note : à personne d'autre (projet privé), aux abonnés après
            // un changement de statut (et pourquoi le champ s'est ouvert tout seul), sinon l'usage.
            hint:
              project.visibility === 'private'
                ? t('project.notes.hintPrivate')
                : announcing
                  ? t('project.notes.hintAnnounce', {
                      status: t(`project.status.${announcing}`),
                    })
                  : t('project.notes.hint'),
            submit: t('project.notes.submit'),
            cancel: t('common.cancel'),
          }}
          fieldError={draftError}
          error={
            showPublishError && publishNote.error
              ? failure(publishNote.reason, t('project.notes.error'))
              : undefined
          }
          success={done === 'published' ? t('project.notes.published') : undefined}
        />
      ) : null}
      {/* Après une suppression : la confirmation, lue sans interrompre (role « status »). */}
      {done === 'deleted' ? (
        <Notice tone="success" message={t('project.notes.deleted')} polite />
      ) : null}
      {empty ? null : list}
      {/* Supprimer une note est définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={deleting !== null}
        title={t('project.notes.deleteTitle')}
        message={t('project.notes.deleteBody')}
        // Pendant la suppression, la fenêtre reste ouverte : la fermer perdrait le focus prévu après.
        onDismiss={() => {
          if (!removing) setDeleting(null)
        }}
        onClosed={() => {
          const index = focusAfterClose.current
          focusAfterClose.current = null
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          if (index !== null) requestAnimationFrame(() => notesHandle.current?.focusAt(index))
        }}
      >
        {/* Refusée : le message reste dans la fenêtre, et « Supprimer » permet de réessayer. */}
        {showDeleteError && deleteNote.error ? (
          <Notice message={failure(deleteNote.reason, t('project.notes.deleteError'))} />
        ) : null}
        <Button
          label={t('project.notes.confirmDelete')}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={removing}
        />
        <Button
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => setDeleting(null)}
          disabled={removing}
        />
      </Dialog>
    </Surface>
  )
}
