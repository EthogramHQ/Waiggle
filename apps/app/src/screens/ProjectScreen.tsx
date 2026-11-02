// Page d'un projet (R5a, planches « Projet », « Projet-Desktop » et « Projet-Suite ») : sa galerie de
// photos, son en-tête (statut, titre, dates, auteur, pitch), ses actions (« Tester la démo »,
// « Suivre ce projet » ou, pour l'auteur, « Modifier »), les réactions, sa « recette » (outils,
// temps passé), sa description, le prompt de départ, son journal et ses commentaires.
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style :
// - la galerie (ui/PhotoGallery.tsx), qui grandit depuis la carte touchée (ui/coverTransition.tsx) ;
// - l'en-tête et les actions (projects/ProjectHeader.tsx, projects/ProjectActions.tsx) ;
// - la capsule des réactions et son éventail (ui/ReactionCapsule.tsx, ui/ReactionFan.tsx) ; l'auteur
//   voit seulement ses nombres (ui/OwnReactions.tsx) ;
// - le prompt de départ (ui/PromptBlock.tsx) et la feuille « Partager » (ui/ShareSheet.tsx).
// Trois mises en page :
// - téléphone : la galerie bord à bord, avec Retour, Partager et « … » posés dessus, puis une
//   feuille qui remonte sur le bas de la photo et porte toute la page ; la capsule flotte en bas de
//   l'écran, hors du défilement (lue après tout le contenu, décision de Louis du 2/11/2026) ;
// - tablette (de 768 points à la largeur des colonnes) : une seule colonne, la galerie aux coins
//   arrondis, la capsule à cheval sur son bas ; Retour, Partager et « … » en haut de la page ;
// - ordinateur : deux rangées de colonnes, dans l'ordre de lecture (galerie et capsule | en-tête,
//   actions et recette ; puis description, prompt, journal et « Signaler » | commentaires). Le
//   clavier et le lecteur d'écran passent ainsi par « Suivre » et les réactions avant la
//   description, au lieu de tout le contenu de gauche d'abord.
// Le journal (tranche 4b) : les notes de l'auteur ; après un changement de statut, le formulaire le
// ramène ici avec « ?announce=<statut> », et une note toute prête l'attend dans le champ.
// Un compte suspendu (tranche 7c) lit la page entière ; il ne garde que supprimer, ne plus suivre et
// retirer ses réactions. Le bandeau qui le lui dit vient de la barre du haut (TopNav).
import {
  NoteText,
  PROJECT_NOTE_MAX,
  type Project,
  ProjectStatus,
  REACTION_KINDS,
  type ReactionKind,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { useOpenDemo, useOpenOutside } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { type NoteFailure, useDeleteNote, usePublishNote } from '../notes/api'
import { deleteProject } from '../projects/api'
import { useForgetProject, useProject } from '../projects/hooks'
import { ProjectActions } from '../projects/ProjectActions'
import { ProjectHeader } from '../projects/ProjectHeader'
import { useReaction } from '../reactions/api'
import { removalBanner } from '../reports/removal'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { copyText } from '../ui/clipboard'
import { CoverArrival, CoverFade, useCoverTarget } from '../ui/coverTransition'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Markdown } from '../ui/Markdown'
import { NoteComposer } from '../ui/NoteComposer'
import { NoteList, type NoteListHandle } from '../ui/NoteList'
import { Notice } from '../ui/Notice'
import { OwnReactions } from '../ui/OwnReactions'
import { PhotoGallery } from '../ui/PhotoGallery'
import { CoverControls, CoverSheet, CoverStraddle } from '../ui/ProjectCover'
import { PromptBlock } from '../ui/PromptBlock'
import { ReactionCapsule } from '../ui/ReactionCapsule'
import { ReactionFan } from '../ui/ReactionFan'
import { RelativeTime } from '../ui/RelativeTime'
import { RemovalNotice } from '../ui/RemovalNotice'
import { Screen } from '../ui/Screen'
import { ShareSheet } from '../ui/ShareSheet'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { shareUrl } from '../ui/share'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useToast } from '../ui/theme/toast'
import { Comments } from './ProjectComments'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'

export function ProjectScreen({ id }: { id: string }) {
  const { t } = useTranslation()
  const { state, session, retry } = useMemberSession()
  // Pas de session : aucune requête (« public » veut dire « visible par les membres »).
  const project = useProject(id, Boolean(session))

  if (state === 'pending') return <LoadingScreen width="page" />
  // La session ne se lit pas (trop de demandes, serveur en panne) : on ne sait pas qui est là,
  // on propose de réessayer plutôt que de se connecter.
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  if (!session) return <SignedOutScreen width="page" />
  if (project.error) {
    // « Introuvable » : le même écran, que le projet n'existe pas ou qu'il soit privé. Celui qui
    // n'a pas le droit de le voir n'apprend même pas qu'il existe. R5a : les alvéoles sur le miel,
    // « Retour » en haut et « Retour au fil » en bas (`variant="project"`).
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
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: Project }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toast = useToast()
  // La carte qui devient la page : le titre reçoit le focus quand la photo est posée, et « Retour »
  // replie d'abord la page dans sa carte. `faded` enveloppe chacun des autres morceaux, qui
  // apparaissent en fondu (un par un : la colonne de `Screen` garde ses écarts entre eux).
  const titleRef = useRef<Focusable>(null)
  const coverTarget = useCoverTarget(project.id)
  const faded = (node: ReactNode) => (node ? <CoverFade id={project.id}>{node}</CoverFade> : null)
  const openOutside = useOpenOutside()
  // « Tester la démo » passe par la page de sortie, qui apprend de quel projet vient le lien (R5a).
  const openDemo = useOpenDemo()
  const forgetProject = useForgetProject()
  const toSource = useMediaSources()
  const { sizeClass, columns } = useLayout()
  // large : tablette et ordinateur (barre du haut, Retour hors de la photo) ; columns : les deux
  // colonnes tiennent côte à côte. Entre les deux (tablette), une seule colonne.
  const large = sizeClass !== 'compact'
  // La photo montrée par la galerie : la lumière d'ambiance prend sa couleur.
  const [photoIndex, setPhotoIndex] = useState(0)
  // L'éventail des réactions (appui long sur la capsule), la feuille « Partager », la fenêtre qui
  // confirme la suppression.
  const [fanOpen, setFanOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil. La
  // page se replie d'abord dans sa carte (ou s'efface), puis on la quitte.
  const goBack = useGoBack('/')
  const back = () => coverTarget.leave(goBack)
  const reaction = useReaction(project.id)
  const { timeSpent } = project
  // « Me reconnecter », à côté de « Ta session a expiré » (tranche 6c).
  const signInAgain = useSignInAgain()
  // Un compte suspendu (tranche 7c) lit tout, mais ne modifie plus, ne réagit plus et n'écrit plus
  // de note ; il peut encore supprimer, et retirer ce qu'il a déjà donné (décision de Louis du
  // 26/10/2026). « Suivre ce projet » suit la même règle, dans ProjectActions.
  const suspended = useSuspension().suspended
  // Les réactions qu'il peut encore retirer : celles qu'il avait données à un moment de la visite.
  // Une fois retirée, la réaction reste un bouton, inactif, jusqu'à la fin de la visite : s'il
  // disparaissait, le focus se perdrait et la capsule bougerait sous le doigt.
  const given = useRef(new Set<ReactionKind>())
  for (const kind of project.reactions.mine) given.current.add(kind)
  // Les cinq réactions, telles que la capsule, l'éventail et la vue de l'auteur les montrent ; les
  // noms lus (« Waggle !, 21, ta réaction ») sont écrits par ces composants.
  const reactions = REACTION_KINDS.map((kind) => {
    const mine = !project.isMine && project.reactions.mine.includes(kind)
    return {
      kind,
      count: project.reactions.counts[kind],
      mine,
      locked: suspended && !given.current.has(kind),
      // Donnée puis retirée pendant la visite : le bouton reste, inactif (la remettre serait
      // refusé par l'API, 403).
      disabled: suspended && !mine,
    }
  })
  // L'auteur ne réagit pas à son propre projet ; un compte suspendu sans réaction à retirer non
  // plus : tous deux voient les nombres seuls.
  const readOnly = project.isMine || reactions.every((item) => item.locked)

  const onDelete = async () => {
    setBusy(true)
    const result = await deleteProject(project.id)
    setBusy(false)
    if (!result.ok) {
      setConfirming(false)
      setError(t(($) => $.errors[result.error]))
      return
    }
    forgetProject(project.id) // le projet n'existe plus : on l'oublie aussi dans le cache
    router.replace('/')
  }

  const edit = () => router.push({ pathname: '/projects/[id]/edit', params: { id: project.id } })
  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'project', id: project.id } })

  // « Copier le lien » du menu « … » : l'adresse publique du projet, rien d'autre (ui/share.ts),
  // puis un toast qui dit qui pourra l'ouvrir (jur-3, jur-5). Le menu s'est déjà refermé.
  const copyLink = async () => {
    const url = shareUrl({ kind: 'project', id: project.id })
    if (!url) return
    const done = await copyText(url)
    if (!done) {
      toast.show(
        t(($) => $.share.copyFailed),
        { icon: 'warning-circle' },
      )
      return
    }
    toast.show(
      project.visibility === 'private'
        ? t(($) => $.share.copiedPrivate)
        : t(($) => $.share.copiedMembers),
      { icon: 'check-circle' },
    )
  }
  // Un projet retiré par la modération ne s'ouvre plus que pour son auteur : l'API répond 404 à
  // tous les autres. Ni « Partager » ni « Copier le lien », qui promettraient le contraire
  // (« seuls les membres pourront l'ouvrir » ; décision de Louis du 2/11/2026).
  const shareable = !project.removal
  // Le menu « … » : copier le lien, puis signaler (un autre membre) ou modifier (l'auteur, sauf
  // projet retiré par la modération ou compte suspendu : l'API refuserait).
  const menuItems: ActionMenuItem[] = [
    ...(shareable
      ? [{ label: t(($) => $.share.copy), icon: 'link' as const, onPress: () => void copyLink() }]
      : []),
    ...(project.isMine
      ? project.removal || suspended
        ? []
        : [{ label: t(($) => $.project.page.edit), icon: 'pencil-simple' as const, onPress: edit }]
      : [{ label: t(($) => $.report.project), icon: 'flag' as const, onPress: report }]),
  ]
  // Partager et « … » : posés sur la photo (téléphone) ou en haut de la page (tablette, ordinateur).
  // Un menu sans action (l'auteur d'un projet retiré) ne se dessine pas : il s'ouvrirait sur rien.
  const pageActions =
    shareable || menuItems.length > 0 ? (
      <>
        {shareable ? (
          <IconButton
            icon="share-network"
            label={t(($) => $.share.action)}
            onPress={() => setSharing(true)}
          />
        ) : null}
        {menuItems.length > 0 ? <ActionMenu variant="glass" items={menuItems} /> : null}
      </>
    ) : null

  // La capsule des réactions (un autre membre). Sur un compte suspendu, l'éventail ne s'ouvre pas :
  // il ne pourrait y poser aucune réaction nouvelle (rien n'est décidé pour lui, U3). Sans
  // `onOpenFan`, la capsule ne promet pas non plus l'éventail (ni indice, ni appui long).
  const capsule = readOnly ? null : (
    <ReactionCapsule
      reactions={reactions}
      onToggle={reaction.toggle}
      onOpenFan={suspended ? undefined : () => setFanOpen(true)}
      error={
        reaction.expired
          ? t(($) => $.states.expired)
          : reaction.error
            ? t(($) => $.project.reactions.error)
            : undefined
      }
      errorAction={reaction.expired ? signInAgain() : undefined}
    />
  )
  const ownReactions = readOnly ? (
    <OwnReactions
      reactions={reactions.map(({ kind, count }) => ({ kind, count }))}
      viewer={project.isMine ? 'author' : 'suspended'}
    />
  ) : null

  // La galerie. Sur téléphone, bord à bord sous la barre d'état, sauf sous le bandeau d'un compte
  // suspendu (la photo le couvrirait) ; Retour, Partager et « … » posés dessus. Ailleurs, coins
  // arrondis et la capsule à cheval sur son bas.
  const bleed = !large && !suspended
  const gallery = (
    // La photo qui grandit depuis la carte touchée : cachée au lecteur d'écran pendant son vol,
    // puis le focus va au titre.
    <CoverArrival
      id={project.id}
      focusOnArrival={titleRef}
      {...(large ? { radius: 'tile' as const } : null)}
    >
      <PhotoGallery
        photos={project.visuals.map((visual) => ({
          key: visual.id,
          source: toSource(visual.url),
          thumbhash: visual.thumbhash,
        }))}
        // Sans photo, la lumière miel seule (sans `title`) : le titre est déjà juste à côté ou
        // dessous, dans l'en-tête ; écrit aussi sur la lumière, il se lisait deux fois à l'œil.
        bleed={bleed}
        onIndexChange={setPhotoIndex}
        overlay={
          large ? (
            capsule ? (
              <CoverStraddle>{capsule}</CoverStraddle>
            ) : null
          ) : (
            <CoverControls
              start={
                <IconButton
                  icon="arrow-left"
                  label={t(($) => $.project.page.back)}
                  onPress={back}
                />
              }
              end={pageActions}
            />
          )
        }
      />
    </CoverArrival>
  )

  const header = <ProjectHeader project={project} titleRef={titleRef} />
  const actions = (
    <ProjectActions
      project={project}
      onOpenDemo={() => {
        if (project.demoUrl) openDemo(project.demoUrl, project.id)
      }}
      onEdit={edit}
    />
  )

  // Retiré par la modération (tranche 7a) : l'auteur, seul à le voir encore, lit en tête pourquoi,
  // et comment contester.
  const removal = project.removal ? <RemovalNotice {...removalBanner(project.removal, t)} /> : null

  // La recette : les outils et le temps passé (jusqu'à R6). Les prompts ont leur propre bloc.
  const recipe =
    project.tools.length > 0 || timeSpent ? (
      <Surface variant="grouped" padding="xl" gap="lg">
        <Text variant="heading" heading={2}>
          {t(($) => $.project.page.recipe)}
        </Text>
        {project.tools.length > 0 ? (
          <Stack gap="sm">
            <Text variant="caption" weight={600} tone="muted">
              {t(($) => $.project.page.tools)}
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
        {timeSpent ? (
          <Stack gap="sm">
            <Text variant="caption" weight={600} tone="muted">
              {t(($) => $.project.page.timeSpent)}
            </Text>
            <Row gap="sm">
              <Icon name="clock" size={20} tone="amber" />
              <Text weight={600}>{t(($) => $.project.timeSpent[timeSpent])}</Text>
            </Row>
          </Stack>
        ) : null}
      </Surface>
    ) : null

  const description = project.description ? (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {t(($) => $.project.page.description)}
      </Text>
      <Markdown text={project.description} onLinkPress={openOutside} />
    </Stack>
  ) : null

  // Le prompt de départ et les autres (repliés). Sans prompt, rien : pas même une place vide.
  const prompt = project.prompts.length > 0 ? <PromptBlock prompts={project.prompts} /> : null

  // Le journal : pour un autre membre, seulement s'il y a des notes à lire.
  const journal =
    project.isMine || project.notes.length > 0 ? (
      <Journal project={project} suspended={suspended} />
    ) : null
  // Les commentaires : pour tous ceux qui voient le projet, l'auteur compris.
  const comments = <Comments project={project} />

  // « Signaler ce projet », un lien gris en bas de la page, en plus du menu « … » (F-Pr12). Jamais
  // sur son propre projet. Dans une rangée : le lien garde la largeur de son texte.
  const reportLink = project.isMine ? null : (
    <Row>
      <TextLink label={t(($) => $.project.page.report)} tone="muted" onPress={report} />
    </Row>
  )

  // « Supprimer » garde sa place d'aujourd'hui, après les commentaires, jusqu'à R6 ; « Modifier »
  // est monté dans les actions, sous le titre.
  const deletion = project.isMine ? (
    <Stack gap="md">
      {error ? <Notice message={error} /> : null}
      <Row>
        <Button
          label={t(($) => $.project.page.delete)}
          variant="danger"
          icon="trash"
          onPress={() => setConfirming(true)}
        />
      </Row>
      {/* Supprimer est définitif : une fenêtre demande confirmation, avec le titre du projet.
          guardTaps : la fenêtre s'ouvre sous le doigt qui vient de toucher « Supprimer » ; une
          seconde tape trop rapide n'y décide rien (design 7b). */}
      <Dialog
        visible={confirming}
        guardTaps
        title={t(($) => $.project.page.deleteTitle, { title: project.title })}
        message={t(($) => $.project.page.deleteConfirm)}
        onDismiss={() => setConfirming(false)}
      >
        <Button
          label={t(($) => $.project.page.deleteConfirmButton)}
          variant="confirm"
          onPress={() => void onDelete()}
          loading={busy}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => setConfirming(false)}
        />
      </Dialog>
    </Stack>
  ) : null

  // Les couches de la page, montées dès l'arrivée, fermées : l'éventail lit au montage s'il doit
  // montrer son aide (rien ne pousse ses lignes à l'ouverture), la feuille rend le focus à
  // « Partager » quand elle se ferme.
  const layers = (
    <>
      {capsule && !suspended ? (
        <ReactionFan
          open={fanOpen}
          reactions={reactions.map(({ kind, count, mine }) => ({ kind, count, mine }))}
          onToggle={reaction.toggle}
          onClose={() => setFanOpen(false)}
        />
      ) : null}
      {shareable ? (
        <ShareSheet
          open={sharing}
          onClose={() => setSharing(false)}
          title={project.title}
          target={{ kind: 'project', id: project.id }}
          visibility={project.visibility}
          image={project.visuals[0] ? toSource(project.visuals[0].url) : null}
        />
      ) : null}
    </>
  )

  // La lumière d'ambiance prend la couleur de la photo montrée (sans photo : la lumière miel).
  const thumbhash = project.visuals[photoIndex]?.thumbhash ?? null

  if (large) {
    return (
      <Screen
        width="page"
        header={<TopNav />}
        onBack={back}
        // « Retour » écrit en toutes lettres, d'où qu'on arrive (ui-11).
        backLabel={t(($) => $.project.page.back)}
        topAction={
          pageActions ? (
            <Row gap="sm" align="center">
              {pageActions}
            </Row>
          ) : undefined
        }
        thumbhash={thumbhash}
        pageTitle={project.title}
      >
        {faded(removal)}
        {columns ? (
          // Deux rangées, dans l'ordre de lecture : la galerie (et la capsule) | l'en-tête, les
          // actions, la recette ; un trait ; puis ce qui se lit longtemps | la conversation. Enfin
          // « Signaler ce projet », en bas à gauche : dans une rangée à lui, il vient après les
          // commentaires, au clavier comme sur téléphone (décision de Louis du 2/11/2026).
          // `sideWidth="wide"` : la colonne de droite grandit jusqu'à environ 450 points (planche
          // R5a-Projet-Desktop ; à 320, un titre long prenait six lignes). Décision du 2/11/2026.
          <Columns
            divided
            sideWidth="wide"
            rows={[
              {
                main: (
                  <>
                    {gallery}
                    {faded(ownReactions)}
                  </>
                ),
                side: (
                  <>
                    {faded(header)}
                    {faded(actions)}
                    {faded(recipe)}
                  </>
                ),
              },
              {
                main: (
                  <>
                    {faded(description)}
                    {faded(prompt)}
                    {faded(journal)}
                  </>
                ),
                side: (
                  <>
                    {faded(comments)}
                    {faded(deletion)}
                  </>
                ),
              },
              ...(reportLink ? [{ main: faded(reportLink), side: null, continues: true }] : []),
            ]}
          />
        ) : (
          // Tablette : une seule colonne, dans l'ordre du téléphone.
          <>
            {gallery}
            {faded(header)}
            {faded(actions)}
            {faded(ownReactions)}
            {faded(recipe)}
            {faded(description)}
            {faded(prompt)}
            {faded(journal)}
            {faded(comments)}
            {faded(reportLink)}
            {faded(deletion)}
          </>
        )}
        {layers}
      </Screen>
    )
  }

  const page = (
    <>
      {faded(removal)}
      {faded(header)}
      {faded(actions)}
      {faded(ownReactions)}
      {faded(recipe)}
      {faded(description)}
      {faded(prompt)}
      {faded(journal)}
      {/* La conversation vient après le projet ; « Signaler » et « Supprimer » ferment la page. */}
      {faded(comments)}
      {faded(reportLink)}
      {faded(deletion)}
    </>
  )
  return (
    <Screen
      thumbhash={thumbhash}
      pageTitle={project.title}
      // La capsule flotte en bas de l'écran, hors du défilement : lue après tout le contenu
      // (décision de Louis du 2/11/2026). Screen réserve sa hauteur sous la page.
      floating={capsule}
    >
      {/* Sur téléphone, la barre du haut ne montre que le bandeau d'un compte suspendu (tranche
          7c), au-dessus de la galerie ; sinon elle ne dessine rien. */}
      <TopNav />
      {gallery}
      {/* La feuille qui remonte sur le bas de la photo bord à bord ; sous le bandeau d'un compte
          suspendu, la galerie garde ses marges et la page suit simplement. */}
      {bleed ? <CoverSheet>{page}</CoverSheet> : page}
      {layers}
    </Screen>
  )
}

/**
 * Le journal du projet : ses notes et, pour l'auteur, de quoi en publier ou en supprimer une. Un
 * composant à part : ses états (le texte en cours, la note à supprimer) ne redessinent pas toute la
 * page à chaque lettre tapée.
 */
function Journal({ project, suspended }: { project: Project; suspended: boolean }) {
  const { t } = useTranslation()
  const publishNote = usePublishNote(project.id)
  const deleteNote = useDeleteNote(project.id)
  const signInAgain = useSignInAgain()
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
    const text = t(($) => $.project.notes.statusPrefill, {
      status: t(($) => $.project.status[status.data]),
    })
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
        draft.trim() === ''
          ? t(($) => $.project.notes.required)
          : t(($) => $.project.errors.invalidCharacters),
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
      ? t(($) => $.project.notes.limited)
      : reason === 'expired'
        ? t(($) => $.states.expired)
        : otherwise
  // Le lien « Me reconnecter » qui accompagne « Ta session a expiré » ; `before` referme ce qui
  // doit l'être avant de partir (la fenêtre de confirmation).
  const failureAction = (reason: NoteFailure | undefined, before?: () => void) =>
    reason === 'expired' ? signInAgain(before) : undefined

  const list = (
    <NoteList
      handle={notesHandle}
      notes={project.notes.map((note) => ({
        id: note.id,
        body: note.body,
        // « il y a 2 h », « hier » : une vue à la place du texte de la date (R4).
        when: <RelativeTime date={note.createdAt} />,
        // Une note retirée par la modération (tranche 7a) n'arrive qu'à l'auteur du projet : il
        // lit pourquoi, au-dessus de son texte.
        removed: note.removal ? removalBanner(note.removal, t) : undefined,
      }))}
      {...(project.isMine
        ? {
            onDelete: (id: string) => {
              setShowDeleteError(false)
              setDone(null)
              setDeleting({ id, index: project.notes.findIndex((note) => note.id === id) })
            },
            deleteLabel: t(($) => $.project.notes.delete),
            // Sur un projet privé, personne d'autre ne verra ses notes : on le dit.
            empty:
              project.visibility === 'private'
                ? t(($) => $.project.notes.emptyPrivate)
                : t(($) => $.project.notes.empty),
          }
        : {
            // Un autre membre peut signaler chaque note (tranche 7a).
            onReport: (id: string) =>
              router.push({ pathname: '/report', params: { kind: 'note', id } }),
            reportLabel: t(($) => $.report.note),
          })}
    />
  )
  const empty = project.notes.length === 0

  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" heading={2}>
        {t(($) => $.project.notes.title)}
      </Text>
      {/* Un journal vide : l'invitation d'abord, puis le bouton qui y répond. */}
      {empty ? list : null}
      {/* Un projet retiré par la modération ne reçoit plus de note (l'API refuserait, 409
          `removed`) : le champ disparaît jusqu'à un rétablissement. Un compte suspendu n'en
          publie pas non plus (tranche 7c) ; il peut encore supprimer les siennes. */}
      {project.isMine && !project.removal && !suspended ? (
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
            open: t(($) => $.project.notes.add),
            field: t(($) => $.project.notes.field),
            // L'aide dit à qui ira la note : à personne d'autre (projet privé), aux abonnés après
            // un changement de statut (et pourquoi le champ s'est ouvert tout seul), sinon l'usage.
            hint:
              project.visibility === 'private'
                ? t(($) => $.project.notes.hintPrivate)
                : announcing
                  ? t(($) => $.project.notes.hintAnnounce, {
                      status: t(($) => $.project.status[announcing]),
                    })
                  : t(($) => $.project.notes.hint),
            submit: t(($) => $.project.notes.submit),
            cancel: t(($) => $.common.cancel),
          }}
          fieldError={draftError}
          error={
            showPublishError && publishNote.error
              ? failure(
                  publishNote.reason,
                  t(($) => $.project.notes.error),
                )
              : undefined
          }
          errorAction={
            showPublishError && publishNote.error ? failureAction(publishNote.reason) : undefined
          }
          success={done === 'published' ? t(($) => $.project.notes.published) : undefined}
        />
      ) : null}
      {/* Après une suppression : la confirmation, lue sans interrompre (role « status »). */}
      {done === 'deleted' ? (
        <Notice tone="success" message={t(($) => $.project.notes.deleted)} polite />
      ) : null}
      {empty ? null : list}
      {/* Supprimer une note est définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={deleting !== null}
        guardTaps
        title={t(($) => $.project.notes.deleteTitle)}
        message={t(($) => $.project.notes.deleteBody)}
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
          <Notice
            message={failure(
              deleteNote.reason,
              t(($) => $.project.notes.deleteError),
            )}
            action={failureAction(deleteNote.reason, () => setDeleting(null))}
          />
        ) : null}
        <Button
          label={t(($) => $.project.notes.confirmDelete)}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={removing}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => setDeleting(null)}
          disabled={removing}
        />
      </Dialog>
    </Surface>
  )
}
