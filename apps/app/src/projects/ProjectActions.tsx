// Les actions de la page d'un projet (R5a, planches « Projet » et « Auteur ») : « Tester la démo »
// (la seule action miel de la page) et sous lui « recettes.example.com, un site hors de Waiggle » ;
// à côté, « Suivre ce projet » et le nombre d'abonnés, ou, pour l'auteur, « Modifier » et ce nombre.
// Pour l'auteur d'un projet privé, le bandeau qui dit qui le voit vient avant.
// Les deux actions forment une paire (`ButtonPair`, ui-2) : côte à côte quand elles tiennent
// (360 points au plus chacune), l'une sous l'autre sinon. « Supprimer » garde sa place
// d'aujourd'hui, après les commentaires, jusqu'à R6 : c'est la page qui le pose.
//
// R7a, les testeurs : sous « Suivre ce projet », « Rejoindre les testeurs » pour un autre membre,
// sur un projet « Testable » qui a une démo. Le bouton ouvre une feuille qui dit ce que
// l'inscription veut dire (screens/TesterSheet) ; une fois inscrit, il devient « Tu testes ce
// projet », qui ouvre la feuille d'où l'on part (« Quitter les testeurs »). Ce bouton reste dès
// qu'on teste, quel que soit le statut du projet ou du compte : ce qui permet de partir ne tombe
// pas avec la condition pour entrer (juridique P3, interface A5). L'auteur, lui, lit « 12 testeurs »
// à côté du nombre d'abonnés ; les autres ne voient jamais ce nombre (juridique T3).
//
// Deux exports : `ProjectActions`, ce que la page utilise (il suit le projet par `useFollow`, inscrit
// et retire des testeurs par `testers/api`), et `ProjectActionsView`, le dessin seul, sans lecture
// ni écriture, que le catalogue montre.
// Ce fichier n'écrit aucun style (règle Biome de `src/projects/**`) : il assemble des composants.
import type { Project } from '@ruche/contracts'
import { type Ref, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { useSignInAgain } from '../navigation/signInAgain'
import { TesterSheet, type TesterSheetMode } from '../screens/TesterSheet'
import { useBecomeTester, useQuitTester } from '../testers/api'
import { Button } from '../ui/Button'
import { ButtonPair } from '../ui/ButtonPair'
import { Callout } from '../ui/Callout'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Hint } from '../ui/Hint'
import type { NoticeAction } from '../ui/Notice'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useToast } from '../ui/theme/toast'
import { hostOf } from './format'

/** Ce que les actions lisent du projet. */
export type ActionsProject = Pick<
  Project,
  | 'id'
  | 'title'
  | 'author'
  | 'isMine'
  | 'visibility'
  | 'status'
  | 'demoUrl'
  | 'isFollowed'
  | 'followerCount'
  | 'isTester'
  | 'testerCount'
> & {
  /** Retiré par la modération (tranche 7a) : il ne se modifie plus (l'API refuserait, 409). */
  removal?: Project['removal']
}

type ViewProps = {
  project: ActionsProject
  /** « Tester la démo » : la page passe par la page de sortie (`useOpenDemo`, navigation/). */
  onOpenDemo: () => void
  /** « Modifier », pour l'auteur. */
  onEdit: () => void
  /** Suivre ou ne plus suivre le projet ; reçoit l'état affiché au toucher (voir `useFollow`). */
  onToggleFollow: (shown: boolean) => void
  /** Le message si le dernier changement d'abonnement n'a pas pu être enregistré. */
  followError?: string | undefined
  /** Un lien sous ce message (« Me reconnecter », session expirée). */
  followErrorAction?: NoticeAction | undefined
  /**
   * Compte suspendu (tranche 7c) : ni « Modifier », ni nouvel abonnement. Un projet suivi à un
   * moment de la visite garde son interrupteur, pour ne plus le suivre, inactif une fois retiré.
   * R7a : ni « Rejoindre les testeurs » ; « Tu testes ce projet » reste, pour pouvoir partir.
   */
  suspended?: boolean
  /**
   * « Rejoindre les testeurs » ou « Tu testes ce projet » : ouvre la feuille qui va avec (R7a).
   * Sans lui (le catalogue d'avant R7a), aucun bouton des testeurs.
   */
  onOpenTesters?: () => void
  /** Le bouton des testeurs, pour que la page y rende le focus après la feuille. */
  testersRef?: Ref<Focusable>
}

/** Le projet cherche-t-il des testeurs ? « Testable », avec une démo à essayer (scénario R7a). */
const looksForTesters = (project: ActionsProject) =>
  project.status === 'testable' && Boolean(project.demoUrl)

/** Les actions dessinées, sans lecture ni écriture : ce que montrent la page et le catalogue. */
export function ProjectActionsView({
  project,
  onOpenDemo,
  onEdit,
  onToggleFollow,
  followError,
  followErrorAction,
  suspended = false,
  onOpenTesters,
  testersRef,
}: ViewProps) {
  const { t } = useTranslation()
  const followers = t(($) => $.follow.followers, { count: project.followerCount })
  // Suivi à un moment de la visite : il reste à sa place (sinon le focus se perdrait et la rangée
  // bougerait sous le doigt). Un nouvel appui serait refusé par l'API.
  const followedOnce = useRef(false)
  if (project.isFollowed) followedOnce.current = true
  const canFollow = !suspended || followedOnce.current
  const followText = project.isFollowed
    ? t(($) => $.follow.projectFollowing)
    : t(($) => $.follow.project)

  // Les testeurs (R7a). Même règle que « Suivre ce projet » : testeur à un moment de la visite, le
  // bouton reste à sa place après le départ (sinon le focus, rendu au bouton par la feuille, se
  // perdrait), inactif si l'on ne peut plus rejoindre (compte suspendu, projet qui ne cherche plus).
  const testerOnce = useRef(false)
  if (project.isTester) testerOnce.current = true
  const canJoin = !suspended && looksForTesters(project)
  const showTesters =
    onOpenTesters !== undefined &&
    !project.isMine &&
    (project.isTester || canJoin || testerOnce.current)

  const demo = project.demoUrl ? (
    <Stack gap="sm" key="demo">
      <Button label={t(($) => $.project.page.tryDemo)} icon="arrow-up-right" onPress={onOpenDemo} />
      {/* On annonce toujours le site extérieur, avant même la page d'avertissement. */}
      <Hint
        icon="globe-simple"
        text={t(($) => $.project.page.external, { host: hostOf(project.demoUrl) })}
      />
    </Stack>
  ) : (
    <Text tone="muted" key="demo">
      {t(($) => $.project.page.noDemo)}
    </Text>
  )

  // Le bouton des testeurs, dans une rangée pour garder la largeur de son libellé (comme « Suivre
  // ce projet » au-dessus). Un seul élément pour ses deux libellés : le focus y reste quand il
  // passe de l'un à l'autre. En blanc : « Tester la démo » est l'action miel de la page.
  const testers =
    showTesters && onOpenTesters ? (
      <Row wrap key="testers">
        <Button
          ref={testersRef}
          label={
            project.isTester ? t(($) => $.project.testers.joined) : t(($) => $.project.testers.join)
          }
          icon={project.isTester ? 'check' : 'users-three'}
          variant="secondary"
          size="compact"
          onPress={onOpenTesters}
          disabled={!project.isTester && !canJoin}
          // Inactif après un départ : toujours atteint au clavier, le focus ne retombe pas en haut.
          focusableWhenDisabled
        />
      </Row>
    ) : null

  // Pour l'auteur, le nombre de testeurs à côté de celui des abonnés (l'API ne le donne qu'à lui) :
  // sur un projet qui en cherche, même à zéro ; ailleurs, seulement s'il en reste.
  const testerCount =
    project.isMine &&
    project.testerCount !== null &&
    (project.testerCount > 0 || looksForTesters(project))
      ? t(($) => $.project.testers.count, { count: project.testerCount })
      : null

  // Pour l'auteur : « Modifier » et le nombre d'abonnés (suspendu : le nombre seul).
  // Pour un autre membre : « Suivre ce projet » et ce nombre (suspendu sans l'avoir suivi : le
  // nombre seul, comme pour l'auteur), puis le bouton des testeurs.
  const follow = canFollow ? (
    <FollowButton
      key="follow"
      followed={project.isFollowed}
      onPress={() => onToggleFollow(project.isFollowed)}
      // Le nom lu reprend le texte affiché, « Projet suivi » une fois suivi.
      label={followText}
      text={followText}
      caption={followers}
      error={followError}
      errorAction={followErrorAction}
      // En blanc : « Tester la démo » est l'action miel de la page.
      prominent={false}
      // Une cloche : « Suivre ce projet » n'est pas « Suivre » l'auteur, juste au-dessus.
      icon="bell"
      disabled={suspended && !project.isFollowed}
    />
  ) : (
    <FollowerCount text={followers} inButtonRow key="follow" />
  )

  const second = project.isMine ? (
    suspended ? (
      testerCount ? (
        <Row wrap gap="md" key="second">
          <FollowerCount text={followers} inButtonRow />
          <FollowerCount text={testerCount} inButtonRow />
        </Row>
      ) : (
        <FollowerCount text={followers} inButtonRow key="second" />
      )
    ) : (
      <Row wrap gap="md" align="center" key="second">
        <Button
          label={t(($) => $.project.page.edit)}
          icon="pencil-simple"
          variant="secondary"
          size="compact"
          onPress={onEdit}
        />
        <FollowerCount text={followers} />
        {testerCount ? <FollowerCount text={testerCount} /> : null}
      </Row>
    )
  ) : testers ? (
    // « Rejoindre les testeurs » sous « Suivre ce projet », dans la même moitié de la paire : à côté
    // de « Tester la démo » sur ordinateur, sous elle sur téléphone (scénario R7a).
    <Stack gap="sm" key="second">
      {follow}
      {testers}
    </Stack>
  ) : (
    follow
  )

  return (
    <Stack gap="lg">
      {/* Privé : seul l'auteur le voit ; le bandeau dit ce que deviennent commentaires et
          réactions déjà reçus (jur-1). Un encadré, pas un message : rien ne vient de se passer. */}
      {project.visibility === 'private' ? (
        // Sans titre : le texte, de plusieurs phrases, commence déjà par « Privé : » ; tout en gras,
        // il se lirait mal (voir Callout).
        <Callout tone="caution" icon="lock-simple" body={t(($) => $.project.page.privateBanner)} />
      ) : null}
      {/* Alignés en haut : « Suivre ce projet » reste à la hauteur de « Tester la démo », que
          suit la ligne de l'hôte (planche R5a-Projet-Desktop). */}
      <ButtonPair align="start">
        {demo}
        {second}
      </ButtonPair>
    </Stack>
  )
}

type Props = Pick<ViewProps, 'project' | 'onOpenDemo' | 'onEdit'>

/** La feuille ouverte : laquelle (gardée pendant le fondu de sortie), et si elle est ouverte. */
type SheetState = { mode: TesterSheetMode; open: boolean }

/**
 * Les actions de la page d'un projet. Elles suivent le projet elles-mêmes (`useFollow`), inscrivent
 * aux testeurs et les quittent (`testers/api`), et lisent si le compte est suspendu ; la page leur
 * donne seulement la démo à ouvrir et « Modifier ».
 */
export function ProjectActions({ project, onOpenDemo, onEdit }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const follow = useFollow({ kind: 'project', id: project.id })
  const { suspended } = useSuspension()
  // « Me reconnecter » : un seul pour toute la page, même si deux gestes ont échoué (ui/Notice).
  const signInAgain = useSignInAgain()

  const become = useBecomeTester(project.id)
  const quit = useQuitTester(project.id)
  const [sheet, setSheet] = useState<SheetState>({ mode: 'join', open: false })
  // Le refus de la dernière demande se montre après un envoi seulement, et disparaît à la
  // réouverture (React Query, lui, le garde jusqu'à l'envoi suivant).
  const [showProblem, setShowProblem] = useState(false)
  // Une demande en route : un `ref`, lu tout de suite, pour qu'une seconde tape arrivée avant que
  // React ait redessiné le bouton en chargement ne reparte pas.
  const sending = useRef(false)
  const testersRef = useRef<Focusable>(null)
  // Après la feuille, le focus va au bouton des testeurs (« Tu testes ce projet », scénario R7a).
  const [focusTesters, setFocusTesters] = useState(false)

  const change = sheet.mode === 'join' ? become : quit
  const problem = showProblem && change.error ? (change.reason ?? 'failed') : null

  const openTesters = () => {
    setShowProblem(false)
    setSheet({ mode: project.isTester ? 'member' : 'join', open: true })
  }
  const closeTesters = () => setSheet((shown) => ({ ...shown, open: false }))

  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setShowProblem(false)
    const joining = sheet.mode === 'join'
    // `isTester` change dans le cache au toucher : le bouton de la page, sous la feuille, change
    // aussitôt ; la feuille, elle, garde son texte jusqu'à la réponse.
    const done = joining ? await become.join() : await quit.quit()
    sending.current = false
    if (!done) {
      setShowProblem(true)
      return
    }
    // La feuille se ferme d'abord : une bulle posée pendant une feuille ouverte resterait cachée.
    closeTesters()
    toast.show(
      joining
        ? t(($) => $.project.testers.joinedToast, { title: project.title })
        : t(($) => $.project.testers.quitToast, { title: project.title }),
      { icon: 'check-circle' },
    )
    setFocusTesters(true)
  }

  // useEffect : une fois la feuille fermée et le bouton redessiné (« Tu testes ce projet »), le
  // focus y va, sans faire défiler la page. Sur le web, la feuille le rend aussi à son ouvreur, qui
  // est ce même bouton (même élément pour ses deux libellés).
  useEffect(() => {
    if (!focusTesters || sheet.open) return
    setFocusTesters(false)
    focusWithoutScroll(testersRef.current)
  }, [focusTesters, sheet.open])

  // Ne plus suivre un projet qu'on teste ne fait pas quitter les testeurs : la bulle le dit
  // (juridique T5). `shown` est l'état affiché au toucher : vrai, on cesse de suivre.
  const toggleFollow = (shown: boolean) => {
    follow.toggle(shown)
    if (shown && project.isTester) toast.show(t(($) => $.project.testers.stillTester))
  }

  return (
    <>
      <ProjectActionsView
        project={project}
        onOpenDemo={onOpenDemo}
        onEdit={onEdit}
        onToggleFollow={toggleFollow}
        followError={
          follow.expired
            ? t(($) => $.states.expired)
            : follow.error
              ? t(($) => $.follow.error)
              : undefined
        }
        followErrorAction={follow.expired ? signInAgain() : undefined}
        // Un projet retiré par la modération ne se modifie plus : comme un compte suspendu, l'auteur
        // n'a plus que le nombre d'abonnés (il peut encore le supprimer, plus bas sur la page).
        suspended={suspended || Boolean(project.removal)}
        onOpenTesters={openTesters}
        testersRef={testersRef}
      />
      {project.isMine ? null : (
        <TesterSheet
          open={sheet.open}
          mode={sheet.mode}
          authorName={project.author.name}
          title={project.title}
          pending={change.pending}
          problem={problem}
          problemAction={problem === 'expired' ? signInAgain() : undefined}
          onConfirm={() => void confirm()}
          onClose={closeTesters}
        />
      )}
    </>
  )
}
