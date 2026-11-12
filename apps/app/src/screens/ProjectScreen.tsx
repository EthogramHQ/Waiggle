// Page d'un projet (R5a, planches « Projet », « Projet-Desktop » et « Projet-Suite ») : sa galerie de
// photos, son en-tête (statut, titre, dates, auteur, pitch), ses actions (« Tester la démo »,
// « Suivre ce projet » ou, pour l'auteur, « Modifier »), les réactions, sa « recette » (mois de
// début, difficulté, outils), sa description, le prompt de départ, son journal et ses commentaires.
// R6a : « Supprimer » est dans le menu « … » de l'auteur (projects/DeleteProjectDialog.tsx).
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
// « Les mises à jour » (R7a, projects/ProjectUpdatesSection.tsx) remplacent le journal des notes :
// la dernière en entier, la frise, et la feuille « Nouvelle mise à jour » de l'auteur (aussi dans
// son menu « … »). Après un changement de statut, le formulaire le ramène ici avec
// « ?announce=<statut> », et la feuille s'ouvre, toute prête.
// Un compte suspendu (tranche 7c) lit la page entière ; il ne garde que supprimer, ne plus suivre et
// retirer ses réactions. Le bandeau qui le lui dit vient de la barre du haut (TopNav).
import { type Project, REACTION_KINDS, type ReactionKind } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { useOpenDemo, useOpenOutside } from '../navigation/links'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { DeleteProjectDialog } from '../projects/DeleteProjectDialog'
import { useProject } from '../projects/hooks'
import { startedMonth } from '../projects/month'
import { ProjectActions } from '../projects/ProjectActions'
import { ProjectHeader } from '../projects/ProjectHeader'
import { ProjectUpdatesSection, useUpdateSheet } from '../projects/ProjectUpdatesSection'
import { useReaction } from '../reactions/api'
import { removalBanner } from '../reports/removal'
import { QuitTestersDialog } from '../testers/QuitTestersDialog'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { Columns } from '../ui/Columns'
import { copyText } from '../ui/clipboard'
import { CoverArrival, CoverFade, useCoverTarget } from '../ui/coverTransition'
import { DIFFICULTY_DOTS } from '../ui/difficultyDots'
import type { Focusable } from '../ui/focus'
import { IconButton } from '../ui/IconButton'
import { Markdown } from '../ui/Markdown'
import { OwnReactions } from '../ui/OwnReactions'
import { PhotoGallery } from '../ui/PhotoGallery'
import { CoverControls, CoverSheet, CoverStraddle } from '../ui/ProjectCover'
import { PromptBlock } from '../ui/PromptBlock'
import { ReactionCapsule } from '../ui/ReactionCapsule'
import { ReactionFan } from '../ui/ReactionFan'
import { RecipeFact } from '../ui/RecipeFact'
import { RemovalNotice } from '../ui/RemovalNotice'
import { Screen } from '../ui/Screen'
import { ShareSheet } from '../ui/ShareSheet'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { useScreenFocused } from '../ui/screenFocus'
import { shareUrl } from '../ui/share'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
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

  // RF (ui-1) : pendant le chargement, pas de fondu des pages. La page ouverte depuis une carte a
  // son propre passage (la photo qui grandit, ou son fondu à elle, coverTransition.tsx), chargement
  // compris ; et on ne peut pas savoir ici si elle vient d'une carte : `useCoverTarget` ne se lit
  // pas avant l'arrivée de la page, il oublierait la carte touchée (ProjectView le lit).
  if (state === 'pending') return <LoadingScreen width="page" fade={false} />
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
  if (!project.data) return <LoadingScreen width="page" fade={false} />
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: Project }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toast = useToast()
  // La carte qui devient la page : le titre reçoit le focus quand la photo est posée, et « Retour »
  // replie d'abord la page dans sa carte. `faded` enveloppe chacun des autres morceaux, qui
  // apparaissent en fondu (un par un : la colonne de `Screen` garde ses écarts entre eux).
  const titleRef = useRef<Focusable>(null)
  const coverTarget = useCoverTarget(project.id)
  const faded = (node: ReactNode) => (node ? <CoverFade id={project.id}>{node}</CoverFade> : null)
  // RF (ui-1) : venue d'une carte, la page garde son passage, sans le fondu des pages par-dessus,
  // tant que dure cette arrivée. Dès que le membre la quitte (sur le web, elle reste montée, cachée
  // sous la page suivante), l'arrivée est finie : à son retour, elle apparaît en fondu comme les
  // autres pages.
  const shownNow = useScreenFocused()
  const [arriving, setArriving] = useState(coverTarget.fromCard)
  useEffect(() => {
    if (!shownNow) setArriving(false)
  }, [shownNow])
  const openOutside = useOpenOutside()
  // « Tester la démo » passe par la page de sortie, qui apprend de quel projet vient le lien (R5a).
  const openDemo = useOpenDemo()
  const toSource = useMediaSources()
  const { sizeClass, columns } = useLayout()
  // large : tablette et ordinateur (barre du haut, Retour hors de la photo) ; columns : les deux
  // colonnes tiennent côte à côte. Entre les deux (tablette), une seule colonne.
  const large = sizeClass !== 'compact'
  // La photo montrée par la galerie : la lumière d'ambiance prend sa couleur.
  const [photoIndex, setPhotoIndex] = useState(0)
  // L'éventail des réactions (appui long sur la capsule), la feuille « Partager », la fenêtre qui
  // confirme la suppression (ouverte depuis le menu « … », dont `menuRef` est le bouton).
  const [fanOpen, setFanOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef<Focusable>(null)

  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil. La
  // page se replie d'abord dans sa carte (ou s'efface), puis on la quitte.
  const goBack = useGoBack('/')
  const back = () => coverTarget.leave(goBack)
  const reaction = useReaction(project.id)
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

  // R6a : supprimé (la fenêtre a déjà rangé le cache), il arrive sur « Mes projets » avec « Projet
  // supprimé. » (choix 7 du scénario). `dismissTo` : la pile revient jusqu'à « Moi » ou la remplace,
  // jamais un retour vers la page d'un projet qui n'existe plus (relecture du plan, ui-M3).
  const onDeleted = () => {
    setConfirming(false)
    toast.show(
      t(($) => $.project.form.deleted),
      { icon: 'check-circle' },
    )
    router.dismissTo('/me')
  }

  // R7b : le coin des testeurs de l'auteur ; la fenêtre « Quitter les testeurs » du testeur, ouverte
  // depuis le menu « … » (dont `menuRef` reprend le focus après « Annuler »).
  const openCorner = () =>
    router.push({ pathname: '/projects/[id]/testers', params: { id: project.id } })
  const [quitting, setQuitting] = useState(false)
  // Parti : la fenêtre se ferme, la bulle le dit, et la page se remet sur elle-même avec
  // `?focus=join` : `ProjectActions` y lit où poser le focus (« Rejoindre les testeurs », ui-B6).
  const onQuit = () => {
    setQuitting(false)
    toast.show(
      t(($) => $.project.testers.quitToast, { title: project.title }),
      {
        icon: 'check-circle',
      },
    )
    router.replace({ pathname: '/projects/[id]', params: { id: project.id, focus: 'join' } })
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
  // R7a : la feuille « Nouvelle mise à jour » (sa propre adresse), ouverte par la section, par le
  // menu « … », ou d'elle-même au retour de « Modifier » avec un nouveau statut (?announce=). Mêmes
  // conditions que « Modifier » : l'API refuserait un projet retiré ou un compte suspendu.
  const canPublish = project.isMine && !project.removal && !suspended
  const updateSheet = useUpdateSheet(project.id, canPublish)
  // Le menu « … » : copier le lien, puis signaler (un autre membre) ou, pour l'auteur, modifier et
  // publier une mise à jour (sauf projet retiré par la modération ou compte suspendu : l'API
  // refuserait) et supprimer.
  // R6a (relecture du plan, jur-J1) : « Supprimer » y est pour **tout** auteur, même d'un projet
  // retiré ou pendant une suspension ; c'est son seul geste alors, et le menu se dessine pour lui.
  // En rouge et en dernier : l'action qui ne se défait pas, loin du doigt qui cherche « Modifier ».
  const menuItems: ActionMenuItem[] = [
    ...(shareable
      ? [{ label: t(($) => $.share.copy), icon: 'link' as const, onPress: () => void copyLink() }]
      : []),
    ...(project.isMine
      ? [
          ...(project.removal || suspended
            ? []
            : [
                {
                  label: t(($) => $.project.page.edit),
                  icon: 'pencil-simple' as const,
                  onPress: edit,
                },
                {
                  label: t(($) => $.project.updates.add),
                  icon: 'megaphone-simple' as const,
                  // Au retour de la feuille, le focus revient au bouton « … ».
                  onPress: () => updateSheet.open(menuRef),
                },
              ]),
          // R7b : « Le coin des testeurs », sous la même condition que son bouton sur la page
          // (le projet cherche des testeurs, ou en a). Même retiré ou suspendu : le coin se lit.
          ...(project.status === 'testable' || (project.testerCount ?? 0) > 0
            ? [
                {
                  label: t(($) => $.project.testers.corner),
                  icon: 'users-three' as const,
                  onPress: openCorner,
                },
              ]
            : []),
          {
            label: t(($) => $.project.page.delete),
            icon: 'trash' as const,
            tone: 'danger' as const,
            onPress: () => setConfirming(true),
          },
        ]
      : [
          // R7b (juridique J1) : partir reste possible depuis la page, qui reste visible quand le
          // coin se ferme (auteur suspendu) ; aussi pour un testeur suspendu, projet en pause ou fini.
          ...(project.isTester
            ? [
                {
                  label: t(($) => $.project.testers.quit),
                  icon: 'sign-out' as const,
                  // En rouge, comme dans le menu du coin : le même geste, le même dessin (ui-A6).
                  tone: 'danger' as const,
                  onPress: () => setQuitting(true),
                },
              ]
            : []),
          { label: t(($) => $.report.project), icon: 'flag' as const, onPress: report },
        ]),
  ]
  // Partager et « … » : posés sur la photo (téléphone) ou en haut de la page (tablette, ordinateur).
  // Le menu a toujours au moins une action (signaler, ou supprimer pour l'auteur). `menuRef` : le
  // bouton « … », qui reprend le focus quand la fenêtre de suppression se ferme sans rien supprimer.
  const pageActions = (
    <>
      {shareable ? (
        <IconButton
          icon="share-network"
          label={t(($) => $.share.action)}
          onPress={() => setSharing(true)}
        />
      ) : null}
      <ActionMenu variant="glass" items={menuItems} ref={menuRef} />
    </>
  )

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
          // R6a : une photo décrite est lue par sa description (texte brut, jamais du Markdown).
          description: visual.description,
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

  // La recette (R6a) : quand l'auteur les a donnés, le mois où il a commencé (« Commencé en
  // septembre 2026 », écrit par Intl dans la langue de l'appli) et la difficulté (« Facile à
  // refaire : À la portée de tous », avec le rond de couleur de la feuille de publication) ; puis
  // les outils. Le temps passé a disparu. Elle se montre dès qu'une de ces trois choses est là,
  // même sans outils. Les prompts ont leur propre bloc.
  const started = project.startedOn ? startedMonth(project.startedOn, i18n.language) : null
  const difficulty = project.difficulty
  const recipe =
    started || difficulty || project.tools.length > 0 ? (
      <Surface variant="grouped" padding="xl" gap="lg">
        <Text variant="heading" heading={2}>
          {t(($) => $.project.page.recipe)}
        </Text>
        {started || difficulty ? (
          <Stack gap="sm">
            {started ? (
              <RecipeFact
                icon="calendar-blank"
                label={t(($) => $.project.page.startedOn, { month: started })}
              />
            ) : null}
            {difficulty ? (
              <RecipeFact
                dot={DIFFICULTY_DOTS[difficulty]}
                label={t(($) => $.project.page.difficulty, {
                  level: t(($) => $.project.difficulty[difficulty]),
                })}
              />
            ) : null}
          </Stack>
        ) : null}
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
                  // R6b : un « Autre » n'a pas de page ; `Tag` l'affiche en texte simple, sans lien.
                  inCatalogue={tool.inCatalogue}
                  onPress={() =>
                    router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } })
                  }
                />
              ))}
            </Stack>
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

  // R7a : « Les mises à jour », à la place du journal des notes. Pour un autre membre, seulement
  // s'il y a une mise à jour à lire (décidé ici : `faded` envelopperait sinon une place vide, qui
  // ajouterait un écart à la colonne).
  const journal =
    project.isMine || project.latestUpdate ? (
      <ProjectUpdatesSection project={project} canPublish={canPublish} sheet={updateSheet} />
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

  // R6a : plus de bouton rouge en bas de la page ; « Supprimer » est dans le menu « … » de l'auteur,
  // et ouvre cette fenêtre (vignette, garde de double tape, une seule suppression, échec lu dedans).
  const deletion = project.isMine ? (
    <DeleteProjectDialog
      project={{
        id: project.id,
        title: project.title,
        cover: project.visuals[0]
          ? {
              source: toSource(project.visuals[0].url),
              thumbhash: project.visuals[0].thumbhash,
              label: project.title,
            }
          : null,
        removed: Boolean(project.removal),
      }}
      visible={confirming}
      onCancel={() => setConfirming(false)}
      onDeleted={onDeleted}
      opener={menuRef}
    />
  ) : null

  // R7b : la fenêtre « Quitter les testeurs » (un autre membre), montée dès l'arrivée : `isTester`
  // bascule dans le cache au toucher de « Quitter », la fenêtre doit rester pour finir son geste.
  const quitDialog = project.isMine ? null : (
    <QuitTestersDialog
      project={{ id: project.id, title: project.title }}
      authorName={project.author.name}
      visible={quitting}
      onCancel={() => setQuitting(false)}
      onQuit={onQuit}
      opener={menuRef}
    />
  )

  // Les couches de la page, montées dès l'arrivée, fermées : l'éventail lit au montage s'il doit
  // montrer son aide (rien ne pousse ses lignes à l'ouverture), la feuille rend le focus à
  // « Partager » quand elle se ferme ; les fenêtres de suppression (l'auteur) et de départ des
  // testeurs, qui couvrent l'écran.
  const layers = (
    <>
      {deletion}
      {quitDialog}
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
        fade={!arriving}
        onBack={back}
        // « Retour » écrit en toutes lettres, d'où qu'on arrive (ui-11).
        backLabel={t(($) => $.project.page.back)}
        topAction={
          <Row gap="sm" align="center">
            {pageActions}
          </Row>
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
                side: <>{faded(comments)}</>,
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
      {/* La conversation vient après le projet ; « Signaler » ferme la page. */}
      {faded(comments)}
      {faded(reportLink)}
    </>
  )
  return (
    <Screen
      thumbhash={thumbhash}
      pageTitle={project.title}
      fade={!arriving}
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
