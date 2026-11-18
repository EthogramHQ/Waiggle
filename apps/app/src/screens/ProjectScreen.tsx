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
// R12 : la mise en page, la recette et la description vivent dans projects/ProjectPage.tsx,
// partagées avec la page d'un projet public vue par un visiteur (plan R12, décision 12).
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
// R9 (7d) : l'auteur suspendu peut aussi « Rendre privé » un projet public (menu « … »,
// projects/MakePrivateDialog.tsx) ; et l'auteur voit, à leur place, les parties retirées seules par
// la modération (projects/ProjectRemovedPart.tsx), la photo retirée restant marquée dans sa galerie.
// R16 (« Les squelettes ») : la garde de session commune (accounts/SessionGate.tsx) ; ouverte depuis
// une carte, la page montre l'aperçu (photo, statut, titre, auteur, accroche) hors du
// « Chargement… », et le reste a la forme de la page (`ProjectPageSkeleton`), puis arrive en fondu.
import {
  type Project,
  type ProjectSummary,
  REACTION_KINDS,
  type ReactionKind,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import type { SessionData } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { useOpenDemo } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { DeleteProjectDialog } from '../projects/DeleteProjectDialog'
import { useProject, useProjectPreview } from '../projects/hooks'
import { MakePrivateDialog } from '../projects/MakePrivateDialog'
import { ProjectActions } from '../projects/ProjectActions'
import { type HeaderProject, ProjectHeader } from '../projects/ProjectHeader'
import {
  hasRecipe,
  ProjectDescription,
  ProjectPageLayout,
  ProjectPageSkeleton,
  ProjectRecipe,
} from '../projects/ProjectPage'
import {
  isDeletablePhoto,
  isProjectPart,
  type ProjectPartField,
  ProjectRemovedPart,
  type ProjectRemovedPartData,
  useDeleteRemovedPhoto,
} from '../projects/ProjectRemovedPart'
import { ProjectUpdatesSection, useUpdateSheet } from '../projects/ProjectUpdatesSection'
import { useReaction } from '../reactions/api'
import { removalBanner } from '../reports/removal'
import { QuitTestersDialog } from '../testers/QuitTestersDialog'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { copyText } from '../ui/clipboard'
import { CoverArrival, CoverFade, useCoverTarget } from '../ui/coverTransition'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { IconButton } from '../ui/IconButton'
import { OwnReactions } from '../ui/OwnReactions'
import { PhotoGallery } from '../ui/PhotoGallery'
import { CoverControls, CoverStraddle } from '../ui/ProjectCover'
import { PromptBlock } from '../ui/PromptBlock'
import { ReactionCapsule } from '../ui/ReactionCapsule'
import { ReactionFan } from '../ui/ReactionFan'
import { RemovalNotice } from '../ui/RemovalNotice'
import { ShareSheet, useShareLink } from '../ui/ShareSheet'
import { Row, Stack } from '../ui/Stack'
import { useScreenFocused } from '../ui/screenFocus'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useToast } from '../ui/theme/toast'
import { Comments } from './ProjectComments'
import { LoadErrorScreen, LoadingScreen, NotFoundState } from './states'

/**
 * R16 : la garde de session commune (accounts/SessionGate.tsx). En attente, la page vide d'un projet ;
 * en erreur, « Réessayer » (on ne sait pas qui est là, on ne propose pas de se connecter) ; sans
 * session, « Réservé aux membres ». Aucune requête avant la session (« public » veut dire « visible
 * par les membres »). La fonction enfant ne fait que rendre `ProjectContent`, qui porte les hooks.
 *
 * RF (ui-1) : pendant le chargement, pas de fondu des pages. La page ouverte depuis une carte a son
 * propre passage (la photo qui grandit, ou son fondu à elle, coverTransition.tsx), chargement
 * compris ; et on ne peut pas savoir ici si elle vient d'une carte : `useCoverTarget` ne se lit pas
 * avant l'arrivée de la page, il oublierait la carte touchée (ProjectView le lit).
 */
export function ProjectScreen({ id }: { id: string }) {
  return (
    <SessionGate width="page" loading={<ProjectWaiting />}>
      {(session) => <ProjectContent id={id} session={session} />}
    </SessionGate>
  )
}

/**
 * La page vide d'un projet, pendant l'attente de la session puis du projet (un lien direct, sans
 * aperçu). R16 : avec, dès le début, le « Retour » du haut de la page qui arrive (`backLabel`) :
 * sur téléphone, une page de projet n'a ni barre ni onglets, et l'attente restait 4 s sans issue.
 */
function ProjectWaiting() {
  const { t } = useTranslation()
  return <LoadingScreen shape="project" fade={false} backLabel={t(($) => $.project.page.back)} />
}

function ProjectContent({ id, session }: { id: string; session: SessionData }) {
  const { t } = useTranslation()
  const project = useProject(id)
  // R14 (plan, choix 4) : ce qu'une liste déjà lue sait du projet (la page de son auteur, le Fil),
  // montré tant que l'API n'a pas répondu ; null si aucune ne le connaît.
  const preview = useProjectPreview(id)

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
  // R14 : le projet complet, sinon son aperçu, sinon la page de chargement (un lien direct). Le
  // complet et l'aperçu passent par le **même** `ProjectView`, à la même place : quand la réponse
  // arrive, React garde l'arbre et ne fait que le compléter. Le titre (qui a reçu le focus) et la
  // photo (posée par la carte qui grandit) restent les mêmes éléments : rien ne remonte, rien ne
  // rejoue son arrivée. Un 404, plus haut, remplace l'aperçu par « Introuvable ». R16 : sans aperçu
  // (un lien direct), la page vide a la forme du haut de la page d'un projet (galerie et en-tête).
  if (project.data) return <ProjectView project={project.data} viewerId={session.user.id} />
  if (preview) return <ProjectView project={preview} viewerId={session.user.id} />
  return <ProjectWaiting />
}

/**
 * Hook : le paramètre `comment` de l'adresse (« /projects/<id>?comment=<id> », posé par une
 * notification). Hors d'un navigateur (un test qui remplace expo-router par un faux sans cette
 * fonction), il n'y en a pas : l'appel lève, et la réponse est « rien ». Même raisonnement que
 * `useFocusParam` (projects/ProjectActions.tsx) : l'issue du try est la même à chaque rendu.
 */
const useCommentParam = (): string | undefined => {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir ci-dessus)
    return firstParam(useLocalSearchParams<{ comment?: string | string[] }>().comment)
  } catch {
    return undefined
  }
}

/**
 * R14 : l'en-tête de l'aperçu, tiré de ce qu'une liste sait du projet : statut, catégorie, titre,
 * dates, auteur et accroche. « Mis à jour » suit sa dernière mise à jour, comme pour le projet
 * complet : la liste en donne la date sous le nom `at`. « C'est le sien » se déduit du membre
 * connecté, sans rien supposer.
 */
const previewHeader = (summary: ProjectSummary, viewerId: string): HeaderProject => ({
  id: summary.id,
  author: summary.author,
  title: summary.title,
  pitch: summary.pitch,
  status: summary.status,
  visibility: summary.visibility,
  isMine: summary.author.id === viewerId,
  createdAt: summary.createdAt,
  updatedAt: summary.updatedAt,
  latestUpdate: summary.latestUpdate ? { createdAt: summary.latestUpdate.at } : null,
  version: summary.version,
  primaryCategory: summary.primaryCategory,
  secondaryCategory: summary.secondaryCategory,
})

type ViewProps = {
  /**
   * Ce que la page sait du projet : le projet complet (`Project`, la réponse de l'API), ou son aperçu
   * (`ProjectSummary`, tiré d'une liste en cache, R14) tant que l'API n'a pas répondu.
   */
  project: Project | ProjectSummary
  /** L'identifiant du membre connecté : l'aperçu en tire seul s'il est l'auteur. */
  viewerId: string
}

/**
 * La page d'un projet, complet ou en aperçu (R14, plan, choix 4). Dans ce composant :
 * - `shown` est ce qui se montre dans les deux cas : la photo de couverture, le statut, le titre,
 *   l'accroche, l'auteur, la catégorie, la visibilité ;
 * - `project` est le projet complet, ou `null` pendant l'aperçu. Tout ce qui en dépend (les actions,
 *   le menu, les réactions, la recette, la description, le journal, les commentaires) attend qu'il
 *   soit là : l'aperçu n'invente rien, ni ce que la liste ne sait pas, ni ce qui dépend de qui lit.
 *   À la place de « Tester la démo » et de la suite, un squelette nommé « Chargement… ».
 * Tous les hooks sont appelés dans les deux cas (React exige le même ordre à chaque rendu) : le
 * passage de l'aperçu au projet complet n'est qu'un nouveau rendu du même composant.
 */
function ProjectView({ project: shown, viewerId }: ViewProps) {
  // `visuals` (la galerie entière) n'existe que dans le projet complet : c'est ce qui les distingue.
  const project = 'visuals' in shown ? shown : null
  const { t } = useTranslation()
  const router = useRouter()
  // L'adresse n'est connue que dans le navigateur : on attend l'hydratation (sinon écart de rendu).
  const hydrated = useHydrated()
  const commentParam = useCommentParam()
  const focusCommentId = hydrated && commentParam ? commentParam : null
  // Fermer la feuille retire le paramètre (`setParams` remplace l'adresse sans page de plus dans
  // l'historique) ; `?.` : un faux routeur de test n'a pas toujours cette méthode.
  const closeCommentContext = () => router.setParams?.({ comment: undefined })
  const toast = useToast()
  // La carte qui devient la page : le titre reçoit le focus quand la photo est posée, et « Retour »
  // replie d'abord la page dans sa carte. `faded` enveloppe chacun des autres morceaux, qui
  // apparaissent en fondu (un par un : la colonne de `Screen` garde ses écarts entre eux).
  const titleRef = useRef<Focusable>(null)
  const coverTarget = useCoverTarget(shown.id)
  const faded = (node: ReactNode) => (node ? <CoverFade id={shown.id}>{node}</CoverFade> : null)
  // RF (ui-1) : venue d'une carte, la page garde son passage, sans le fondu des pages par-dessus,
  // tant que dure cette arrivée. Dès que le membre la quitte (sur le web, elle reste montée, cachée
  // sous la page suivante), l'arrivée est finie : à son retour, elle apparaît en fondu comme les
  // autres pages.
  const shownNow = useScreenFocused()
  const [arriving, setArriving] = useState(coverTarget.fromCard)
  useEffect(() => {
    if (!shownNow) setArriving(false)
  }, [shownNow])
  // « Tester la démo » passe par la page de sortie, qui apprend de quel projet vient le lien (R5a).
  const openDemo = useOpenDemo()
  const toSource = useMediaSources()
  const { sizeClass } = useLayout()
  // large : tablette et ordinateur (Retour hors de la photo, la capsule à cheval sur la galerie).
  // Le reste de la mise en page est décidé par `ProjectPageLayout` (projects/ProjectPage.tsx).
  const large = sizeClass !== 'compact'
  // La photo montrée par la galerie : la lumière d'ambiance prend sa couleur.
  const [photoIndex, setPhotoIndex] = useState(0)
  // L'éventail des réactions (appui long sur la capsule), la feuille « Partager », la fenêtre qui
  // confirme la suppression (ouverte depuis le menu « … », dont `menuRef` est le bouton).
  const [fanOpen, setFanOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef<Focusable>(null)

  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène au Fil (`/feed`
  // depuis R12). La page se replie d'abord dans sa carte (ou s'efface), puis on la quitte.
  const goBack = useGoBack('/feed')
  const back = () => coverTarget.leave(goBack)
  const reaction = useReaction(shown.id)
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
  for (const kind of project?.reactions.mine ?? []) given.current.add(kind)
  // Les cinq réactions, telles que la capsule, l'éventail et la vue de l'auteur les montrent ; les
  // noms lus (« Waggle !, 21, ta réaction ») sont écrits par ces composants. R14 : aucune pendant
  // l'aperçu (la liste n'en sait que le total, et rien de ce que le membre a donné).
  const reactions = project
    ? REACTION_KINDS.map((kind) => {
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
    : []
  // L'auteur ne réagit pas à son propre projet ; un compte suspendu sans réaction à retirer non
  // plus : tous deux voient les nombres seuls.
  const readOnly = !project || project.isMine || reactions.every((item) => item.locked)

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
    router.push({ pathname: '/projects/[id]/testers', params: { id: shown.id } })
  const [quitting, setQuitting] = useState(false)
  // Parti : la fenêtre se ferme, la bulle le dit, et la page se remet sur elle-même avec
  // `?focus=join` : `ProjectActions` y lit où poser le focus (« Rejoindre les testeurs », ui-B6).
  const onQuit = () => {
    setQuitting(false)
    toast.show(
      t(($) => $.project.testers.quitToast, { title: shown.title }),
      {
        icon: 'check-circle',
      },
    )
    router.replace({ pathname: '/projects/[id]', params: { id: shown.id, focus: 'join' } })
  }

  const edit = () => router.push({ pathname: '/projects/[id]/edit', params: { id: shown.id } })
  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'project', id: shown.id } })

  // « Copier le lien » du menu « … » : l'adresse publique du projet, rien d'autre (ui/share.ts),
  // puis un toast qui dit qui pourra l'ouvrir (jur-3, jur-5). Le menu s'est déjà refermé. La même
  // règle que la feuille « Partager » (`useShareLink`) : un projet public se copie à son adresse
  // dans la langue du membre (`/fr/projects/<id>`), et le toast dit que tout le monde pourra
  // l'ouvrir (R12, Q18) ; un projet d'une ruche nomme la ruche (R10).
  const link = useShareLink({
    target: { kind: 'project', id: shown.id },
    visibility: shown.visibility,
    hive: shown.hive,
  })
  const copyLink = async () => {
    if (!link.url) return
    const done = await copyText(link.url)
    if (!done) {
      toast.show(
        t(($) => $.share.copyFailed),
        { icon: 'warning-circle' },
      )
      return
    }
    toast.show(link.copied, { icon: 'check-circle' })
  }
  // Un projet retiré par la modération ne s'ouvre plus que pour son auteur : l'API répond 404 à
  // tous les autres. Ni « Partager » ni « Copier le lien », qui promettraient le contraire
  // (« seuls les membres pourront l'ouvrir » ; décision de Louis du 2/11/2026).
  // R14 : pendant l'aperçu, ni « Partager » ni le menu : la liste ne dit pas si le projet a été
  // retiré, et le menu dépend de qui lit (« Modifier » pour l'auteur, « Signaler » pour les autres).
  const shareable = project !== null && !project.removal
  // R7a : la feuille « Nouvelle mise à jour » (sa propre adresse), ouverte par la section, par le
  // menu « … », ou d'elle-même au retour de « Modifier » avec un nouveau statut (?announce=). Mêmes
  // conditions que « Modifier » : l'API refuserait un projet retiré ou un compte suspendu. R14 :
  // jamais pendant l'aperçu, qui ne sait pas encore si le projet a été retiré.
  const canPublish = Boolean(project?.isMine && !project.removal && !suspended)
  const updateSheet = useUpdateSheet(shown.id, canPublish)
  // R9 (J14, décision L6 de Louis) : « Rendre privé », le seul changement permis à un auteur
  // suspendu, sur un projet public qui n'a pas été retiré (un projet retiré ne se modifie plus).
  // Une fenêtre le confirme d'abord : pendant la suspension, il ne pourra pas revenir en arrière.
  // R12 (plan, décision 11 ; Q6) : un projet ouvert à tous (`web`) se rend aussi privé, au même
  // titre qu'un projet ouvert aux membres.
  const canMakePrivate =
    project?.isMine &&
    suspended &&
    !project.removal &&
    (project.visibility === 'public' || project.visibility === 'web')
  const [makingPrivate, setMakingPrivate] = useState(false)
  const onMadePrivate = () => {
    setMakingPrivate(false)
    toast.show(
      t(($) => $.suspension.madePrivate),
      { icon: 'check-circle' },
    )
  }
  // Le menu « … » : copier le lien, puis signaler (un autre membre) ou, pour l'auteur, modifier et
  // publier une mise à jour (sauf projet retiré par la modération ou compte suspendu : l'API
  // refuserait) et supprimer.
  // R6a (relecture du plan, jur-J1) : « Supprimer » y est pour **tout** auteur, même d'un projet
  // retiré ou pendant une suspension ; c'est son seul geste alors, et le menu se dessine pour lui.
  // En rouge et en dernier : l'action qui ne se défait pas, loin du doigt qui cherche « Modifier ».
  // R14 : aucun pendant l'aperçu (le menu n'est alors pas dessiné, voir `pageActions`).
  const menuItems: ActionMenuItem[] = !project
    ? []
    : [
        ...(shareable
          ? [
              {
                label: t(($) => $.share.copy),
                icon: 'link' as const,
                onPress: () => void copyLink(),
              },
            ]
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
              ...(canMakePrivate
                ? [
                    {
                      label: t(($) => $.suspension.makePrivate),
                      icon: 'lock-simple' as const,
                      onPress: () => setMakingPrivate(true),
                    },
                  ]
                : []),
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
  // R14 : rien pendant l'aperçu ; ils arrivent avec le projet complet, au bout de leur rangée,
  // après « Retour », qui ne bouge pas.
  const pageActions = project ? (
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
  const ownReactions =
    project && readOnly ? (
      <OwnReactions
        reactions={reactions.map(({ kind, count }) => ({ kind, count }))}
        viewer={project.isMine ? 'author' : 'suspended'}
      />
    ) : null

  // La galerie. Sur téléphone, bord à bord sous la barre d'état, sauf sous le bandeau d'un compte
  // suspendu (la photo le couvrirait) ; Retour, Partager et « … » posés dessus. Ailleurs, coins
  // arrondis et la capsule à cheval sur son bas.
  const bleed = !large && !suspended
  // R9 : les photos retirées par la modération restent dans la galerie de leur auteur, marquées
  // (pas celles dont seule la description a été retirée). L'API ne les donne qu'à lui.
  const markedPhotos = new Set(
    project?.isMine
      ? project.removedParts
          .filter((part) => part.field === 'photo' || part.field === 'cover')
          .map((part) => part.mediaId)
      : [],
  )
  // R14 : les photos de la galerie. Pendant l'aperçu, la seule que la liste connaît : sa couverture
  // (`cover`, la première de la galerie, jamais la couverture verticale), avec son `thumbhash` (floue
  // d'abord, puis nette). Même clé que la première du projet complet (`cover.id` = `visuals[0].id`) :
  // la galerie la garde quand les autres photos arrivent derrière elle.
  const visuals = 'visuals' in shown ? shown.visuals : shown.cover ? [shown.cover] : []
  const gallery = (
    // La photo qui grandit depuis la carte touchée : cachée au lecteur d'écran pendant son vol,
    // puis le focus va au titre.
    <CoverArrival
      id={shown.id}
      focusOnArrival={titleRef}
      {...(large ? { radius: 'tile' as const } : null)}
    >
      <PhotoGallery
        photos={visuals.map((visual) => ({
          key: visual.id,
          source: toSource(visual.url),
          thumbhash: visual.thumbhash,
          // R6a : une photo décrite est lue par sa description (texte brut, jamais du Markdown).
          description: visual.description,
          // R9 : une photo retirée par la modération, que son auteur voit encore.
          mark: markedPhotos.has(visual.id) ? t(($) => $.removal.banner) : null,
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

  // R14 : pendant l'aperçu, l'en-tête dit ce que la liste sait (voir `previewHeader`), sans la
  // pastille « Suivre » près de l'auteur (`followable`), qui arrive avec le projet complet.
  const header = (
    <ProjectHeader
      project={'visuals' in shown ? shown : previewHeader(shown, viewerId)}
      titleRef={titleRef}
      followable={project !== null}
    />
  )
  // R14 : « Tester la démo » et ce qui l'accompagne attendent le projet complet. R16 : pendant
  // l'aperçu, leur place et celle de tout ce qui suit ont la forme de la page, sous un seul
  // « Chargement… » (`pending`, posé par `ProjectPageLayout`).
  const actions = project ? (
    <ProjectActions
      project={project}
      onOpenDemo={() => {
        if (project.demoUrl) openDemo(project.demoUrl, project.id)
      }}
      onEdit={edit}
    />
  ) : null

  // Retiré par la modération (tranche 7a) : l'auteur, seul à le voir encore, lit en tête pourquoi,
  // et comment contester.
  const removal = project?.removal ? <RemovalNotice {...removalBanner(project.removal, t)} /> : null

  // R9 (décision L2 de Louis) : les parties retirées seules par la modération. L'API ne les donne
  // qu'à l'auteur ; la page vérifie quand même `isMine`, pour ne jamais les montrer à un autre.
  // Chacune s'affiche à la place de ce qu'elle était : les photos sous la galerie (où la photo reste,
  // marquée), le lien de démo sous les actions, les outils sous la recette, la description dans sa
  // section, le prompt à sa place. « Remplacer » ouvre le formulaire (l'auteur y écrit la partie à
  // nouveau, ce qui efface la marque), sauf pendant une suspension ou sur un projet retiré, où
  // l'API refuserait. « Supprimer » : seulement une photo, qui part pour de bon.
  const removedParts: ProjectRemovedPartData[] = project?.isMine
    ? project.removedParts.filter(isProjectPart)
    : []
  const canReplace = !suspended && !project?.removal
  // Supprimée, la photo part avec son encadré : le focus, posé sur le titre de l'encadré par
  // « Supprimer », passe au titre de la page plutôt que de se perdre ; la bulle le dit.
  const photoDeletion = useDeleteRemovedPhoto(shown.id, () => {
    toast.show(
      t(($) => $.removal.part.photoDeleted),
      { icon: 'check-circle' },
    )
    if (!focusWithoutScroll(titleRef.current)) moveReaderTo(titleRef.current)
  })
  const deletionError = (mediaId: string | null) => {
    const failed = photoDeletion.failed
    if (!failed || failed.mediaId !== mediaId) return null
    if (failed.error === 'unauthorized') return t(($) => $.states.expired)
    if (failed.error === 'rateLimited') return t(($) => $.errors.rateLimited)
    return t(($) => $.removal.part.deleteError)
  }
  /** Les encadrés des parties retirées de ces champs, empilés ; null s'il n'y en a aucune. */
  const partsOf = (fields: readonly ProjectPartField[]) => {
    const parts = removedParts.filter((part) => fields.includes(part.field))
    if (!project || parts.length === 0) return null
    return (
      <Stack gap="lg">
        {parts.map((part) => {
          // L'identifiant de la photo que « Supprimer » ferait partir : la photo ou la couverture
          // seulement. La description d'une photo retirée n'a que « Remplacer ».
          const mediaId = isDeletablePhoto(part) ? part.mediaId : null
          return (
            <ProjectRemovedPart
              key={`${part.field}-${part.mediaId ?? ''}`}
              project={project}
              part={part}
              onReplace={canReplace ? edit : null}
              onDelete={mediaId ? () => void photoDeletion.remove(mediaId) : null}
              error={deletionError(mediaId)}
              deleting={mediaId !== null && photoDeletion.deleting === mediaId}
            />
          )
        })}
      </Stack>
    )
  }
  const removedPhotos = partsOf(['cover', 'photo', 'photoDescription'])
  const removedDemo = partsOf(['demoUrl'])
  const removedTools = partsOf(['tools'])
  const removedDescription = partsOf(['description'])
  const removedPrompt = partsOf(['prompt'])

  // La recette (R6a ; projects/ProjectPage.tsx, partagée avec la page d'un visiteur) : le mois de
  // début, la difficulté, puis les outils, chacun menant à sa page. Rien s'il n'y a rien à dire :
  // décidé ici, comme pour le journal plus bas (`faded` envelopperait sinon une place vide). R14 :
  // la recette, la description, le prompt, le journal, les commentaires et « Signaler » attendent
  // le projet complet (la liste n'en sait rien) : pendant l'aperçu, leurs places sont vides.
  const recipe =
    project && hasRecipe(project) ? (
      <ProjectRecipe
        startedOn={project.startedOn}
        difficulty={project.difficulty}
        tools={project.tools}
        onOpenTool={(slug) => router.push({ pathname: '/tags/[slug]', params: { slug } })}
      />
    ) : null

  // R9 : une description retirée garde sa section, avec son encadré (l'auteur seul).
  const description =
    project && (project.description || removedDescription) ? (
      <ProjectDescription text={project.description} removed={removedDescription} />
    ) : null

  // Le prompt de départ et les autres (repliés). Sans prompt, rien : pas même une place vide. R9 :
  // un prompt retiré, son encadré à la place (l'auteur seul).
  const prompt =
    project && project.prompts.length > 0 ? (
      <PromptBlock prompts={project.prompts} />
    ) : (
      removedPrompt
    )

  // R7a : « Les mises à jour », à la place du journal des notes. Pour un autre membre, seulement
  // s'il y a une mise à jour à lire (décidé ici : `faded` envelopperait sinon une place vide, qui
  // ajouterait un écart à la colonne).
  const journal =
    project && (project.isMine || project.latestUpdate) ? (
      <ProjectUpdatesSection project={project} canPublish={canPublish} sheet={updateSheet} />
    ) : null
  // Les commentaires : pour tous ceux qui voient le projet, l'auteur compris.
  // « Voir en contexte » (R8) : venu d'une notification (`?comment=<id>`), la feuille des commentaires
  // s'ouvre sur ce commentaire. Ouverte, le paramètre reste (recharger la page la rouvre au même
  // endroit) ; fermée, elle le retire : recharger ne la rouvre plus. Rien ne change l'adresse à
  // l'arrivée : le focus posé sur le commentaire n'a pas à attendre un nouveau dessin de la page.
  const comments = project ? (
    <Comments
      project={project}
      focusCommentId={focusCommentId}
      onContextClosed={closeCommentContext}
    />
  ) : null

  // « Signaler ce projet », un lien gris en bas de la page, en plus du menu « … » (F-Pr12). Jamais
  // sur son propre projet. Dans une rangée : le lien garde la largeur de son texte.
  const reportLink =
    !project || project.isMine ? null : (
      <Row>
        <TextLink label={t(($) => $.project.page.report)} tone="muted" onPress={report} />
      </Row>
    )

  // R6a : plus de bouton rouge en bas de la page ; « Supprimer » est dans le menu « … » de l'auteur,
  // et ouvre cette fenêtre (vignette, garde de double tape, une seule suppression, échec lu dedans).
  const deletion = project?.isMine ? (
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
        // R12 : un projet public a pu être copié par les moteurs de recherche ; la fenêtre le dit.
        web: project.visibility === 'web',
      }}
      visible={confirming}
      onCancel={() => setConfirming(false)}
      onDeleted={onDeleted}
      opener={menuRef}
    />
  ) : null

  // R7b : la fenêtre « Quitter les testeurs » (un autre membre), montée dès l'arrivée : `isTester`
  // bascule dans le cache au toucher de « Quitter », la fenêtre doit rester pour finir son geste.
  const quitDialog =
    !project || project.isMine ? null : (
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
  // testeurs, qui couvrent l'écran. R14 : aucune pendant l'aperçu, où rien ne les ouvre.
  const layers = !project ? null : (
    <>
      {deletion}
      {project.isMine && suspended && !project.removal ? (
        // Montée pour tout projet d'un auteur suspendu, public ou non : passé en privé, le projet
        // ne la propose plus, mais la fenêtre finit son fondu de sortie et rend le focus au « … ».
        <MakePrivateDialog
          project={{ id: project.id, title: project.title }}
          visible={makingPrivate}
          onCancel={() => setMakingPrivate(false)}
          onDone={onMadePrivate}
          opener={menuRef}
        />
      ) : null}
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
          // R10 : un projet réservé dit quelle ruche pourra l'ouvrir (« Seuls les membres de
          // Famille pourront l'ouvrir. »).
          visibility={project.visibility}
          hive={project.hive}
          image={project.visuals[0] ? toSource(project.visuals[0].url) : null}
        />
      ) : null}
    </>
  )

  // La lumière d'ambiance prend la couleur de la photo montrée (sans photo : la lumière miel).
  const thumbhash = visuals[photoIndex]?.thumbhash ?? null

  // La mise en page (téléphone, tablette, ordinateur) est partagée avec la page d'un visiteur
  // (projects/ProjectPage.tsx, plan R12, décision 12) : chaque morceau à sa place, dans le même
  // ordre de lecture. Sur téléphone, la barre du haut ne montre que le bandeau d'un compte suspendu
  // (tranche 7c), au-dessus de la galerie ; sinon elle ne dessine rien.
  return (
    <ProjectPageLayout
      topBar={<TopNav />}
      topAction={pageActions}
      onBack={back}
      pageTitle={shown.title}
      thumbhash={thumbhash}
      fade={!arriving}
      // La capsule flotte en bas de l'écran du téléphone, hors du défilement : lue après tout le
      // contenu (décision de Louis du 2/11/2026). Ailleurs, elle est à cheval sur la galerie.
      floating={capsule}
      bleed={bleed}
      wrap={faded}
      banner={removal}
      gallery={gallery}
      galleryNotes={removedPhotos}
      header={header}
      actions={actions}
      actionNotes={removedDemo}
      reactions={ownReactions}
      recipe={recipe}
      recipeNotes={removedTools}
      description={description}
      prompt={prompt}
      journal={journal}
      conversation={comments}
      report={reportLink}
      layers={layers}
      // R16 : l'aperçu attend le projet complet ; ce qui en dépend arrive en fondu, au même endroit.
      pending={project === null}
      skeleton={(part) => <ProjectPageSkeleton part={part} />}
    />
  )
}
