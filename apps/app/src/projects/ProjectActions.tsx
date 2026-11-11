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
// l'inscription veut dire (screens/TesterSheet). L'auteur, lui, lit « 12 testeurs » ; les autres ne
// voient jamais ce nombre (juridique T3).
//
// R7b, le coin des testeurs (planche « Entrées », points 1 et 2) : une fois inscrit, le bouton
// devient « Le coin des testeurs », qui mène à la page du coin (/projects/<id>/testers). C'est le même
// élément, à la même place : le focus y reste après l'inscription. La feuille « Tu testes ce projet »
// de R7a a disparu : on quitte depuis le coin, ou depuis le menu « … » de la page (juridique J1). Ce
// bouton reste dès qu'on teste, quel que soit le statut du projet ou du compte : ce qui mène à son
// fil et au départ ne tombe pas avec la condition pour entrer (juridique P3, interface A5). Un
// membre que l'auteur a retiré ne se voit plus proposer « Rejoindre » (`testerJoinable`), sans
// qu'on lui dise pourquoi. Pour l'auteur, « Le coin des testeurs » et « 12 testeurs » à côté, sous
// « Modifier », quand le projet est « Testable » ou a encore des testeurs.
// Au retour du coin après « Quitter les testeurs », la page arrive avec `?focus=join` : le focus va
// sur « Rejoindre les testeurs », ou sur « Suivre ce projet » si l'on ne peut plus rejoindre
// (interface B6).
//
// Deux exports : `ProjectActions`, ce que la page utilise (il suit le projet par `useFollow`, inscrit
// aux testeurs par `testers/api`), et `ProjectActionsView`, le dessin seul, sans lecture ni
// écriture, que le catalogue montre.
// Ce fichier n'écrit aucun style (règle Biome de `src/projects/**`) : il assemble des composants.
import type { Project } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type Ref, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { firstParam } from '../navigation/params'
import { useSignInAgain } from '../navigation/signInAgain'
import { TesterSheet } from '../screens/TesterSheet'
import { useBecomeTester } from '../testers/api'
import { Button } from '../ui/Button'
import { ButtonPair } from '../ui/ButtonPair'
import { Callout } from '../ui/Callout'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { type Focusable, focusWithoutScroll, moveReaderTo, revealWithoutJump } from '../ui/focus'
import { Hint } from '../ui/Hint'
import type { NoticeAction } from '../ui/Notice'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useTapGuard } from '../ui/tapGuard'
import { useHydrated } from '../ui/theme/hydration'
import { useCalmMotion } from '../ui/theme/motion'
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
  | 'testerJoinable'
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
   * R7a : ni « Rejoindre les testeurs » ; « Le coin des testeurs » reste (R7b), pour relire son fil
   * et partir.
   */
  suspended?: boolean
  /**
   * « Rejoindre les testeurs » : ouvre la feuille d'inscription (R7a). Sans lui (le catalogue
   * d'avant R7a), aucun bouton des testeurs pour un autre membre.
   */
  onOpenTesters?: () => void
  /**
   * « Le coin des testeurs » : mène à la page du coin (R7b), pour un testeur comme pour l'auteur.
   * Sans lui, pas de bouton du coin (l'auteur garde son nombre de testeurs).
   */
  onOpenCorner?: () => void
  /** Le bouton des testeurs, pour que la page y rende le focus après la feuille. */
  testersRef?: Ref<Focusable>
  /** « Suivre ce projet », où va le focus quand « Rejoindre les testeurs » n'est plus là (R7b). */
  followRef?: Ref<Focusable>
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
  onOpenCorner,
  testersRef,
  followRef,
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

  // Les testeurs. Même règle que « Suivre ce projet » : testeur à un moment de la visite, le bouton
  // reste à sa place après le départ (fait depuis le menu « … » de la page), sinon le focus se
  // perdrait ; il redevient « Rejoindre les testeurs », inactif si l'on ne peut plus rejoindre
  // (compte suspendu, projet qui ne cherche plus, membre retiré par l'auteur).
  const testerOnce = useRef(false)
  if (project.isTester) testerOnce.current = true
  const canJoin = !suspended && looksForTesters(project) && project.testerJoinable
  // Ce que fait le bouton : mener au coin pour un testeur, ouvrir la feuille d'inscription sinon.
  const testersAction = project.isTester ? onOpenCorner : onOpenTesters
  const showTesters =
    testersAction !== undefined &&
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
  // passe de « Rejoindre les testeurs » à « Le coin des testeurs ». En blanc : « Tester la démo »
  // est l'action miel de la page. Les trois personnes de `users-three` dans les deux cas (planche).
  const testers =
    showTesters && testersAction ? (
      <Row wrap key="testers">
        <Button
          ref={testersRef}
          label={
            project.isTester ? t(($) => $.project.testers.corner) : t(($) => $.project.testers.join)
          }
          icon="users-three"
          variant="secondary"
          size="compact"
          onPress={testersAction}
          disabled={!project.isTester && !canJoin}
          // Inactif après un départ : toujours atteint au clavier, le focus ne retombe pas en haut.
          focusableWhenDisabled
        />
      </Row>
    ) : null

  // Pour l'auteur, le coin des testeurs et leur nombre (l'API ne le donne qu'à lui) : sur un projet
  // « Testable », même à zéro ; ailleurs, seulement s'il en reste (plan R7b, même règle que le menu
  // « … » de la page). Suspendu ou projet retiré : le coin reste, fermé aux testeurs mais lisible
  // par l'auteur, qui y lit pourquoi.
  const authorCorner =
    project.isMine &&
    project.testerCount !== null &&
    (project.status === 'testable' || project.testerCount > 0)
  const testerCount =
    authorCorner && project.testerCount !== null
      ? t(($) => $.project.testers.count, { count: project.testerCount })
      : null
  // « Le coin des testeurs » et « 12 testeurs » à côté, sous « Modifier » (planche « Entrées »).
  const cornerRow = testerCount ? (
    <Row wrap gap="md" align="center" key="corner">
      {onOpenCorner ? (
        <Button
          label={t(($) => $.project.testers.corner)}
          icon="users-three"
          variant="secondary"
          size="compact"
          onPress={onOpenCorner}
        />
      ) : null}
      <FollowerCount text={testerCount} />
    </Row>
  ) : null

  // Pour l'auteur : « Modifier » et le nombre d'abonnés (suspendu : le nombre seul), puis le coin.
  // Pour un autre membre : « Suivre ce projet » et ce nombre (suspendu sans l'avoir suivi : le
  // nombre seul, comme pour l'auteur), puis le bouton des testeurs.
  const follow = canFollow ? (
    <FollowButton
      key="follow"
      ref={followRef}
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

  const mine = suspended ? (
    <FollowerCount text={followers} inButtonRow key="followers" />
  ) : (
    <Row wrap gap="md" align="center" key="followers">
      <Button
        label={t(($) => $.project.page.edit)}
        icon="pencil-simple"
        variant="secondary"
        size="compact"
        onPress={onEdit}
      />
      <FollowerCount text={followers} />
    </Row>
  )

  const second = project.isMine ? (
    <Stack gap="sm" key="second">
      {mine}
      {cornerRow}
    </Stack>
  ) : testers ? (
    // Le bouton des testeurs sous « Suivre ce projet », dans la même moitié de la paire : à côté de
    // « Tester la démo » sur ordinateur, sous elle sur téléphone (scénario R7a).
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

/**
 * Hook : le paramètre `focus` de l'adresse (« /projects/<id>?focus=join », posé par le coin après
 * « Quitter les testeurs »). Hors d'un navigateur (un test qui remplace expo-router par un faux sans
 * cette fonction, le catalogue), il n'y en a pas : la fonction manque, l'appel lève une erreur, et
 * l'aide répond « rien ». Même raisonnement que navigation/TopNav.tsx : l'issue du try est la même
 * à chaque rendu, React compte donc toujours les mêmes hooks.
 */
const useFocusParam = (): string | undefined => {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir ci-dessus)
    return firstParam(useLocalSearchParams<{ focus?: string | string[] }>().focus)
  } catch {
    return undefined
  }
}

/**
 * Les actions de la page d'un projet. Elles suivent le projet elles-mêmes (`useFollow`), inscrivent
 * aux testeurs (`testers/api`), mènent au coin des testeurs, et lisent si le compte est suspendu ;
 * la page leur donne seulement la démo à ouvrir et « Modifier ».
 */
export function ProjectActions({ project, onOpenDemo, onEdit }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const router = useRouter()
  const calm = useCalmMotion()
  const follow = useFollow({ kind: 'project', id: project.id })
  const { suspended } = useSuspension()
  // « Me reconnecter » : un seul pour toute la page, même si deux gestes ont échoué (ui/Notice).
  const signInAgain = useSignInAgain()

  const become = useBecomeTester(project.id)
  // La feuille d'inscription : ouverte ou non. Elle reste montée pendant son fondu de sortie.
  const [sheetOpen, setSheetOpen] = useState(false)
  // Le refus de la dernière demande se montre après un envoi seulement, et disparaît à la
  // réouverture (React Query, lui, le garde jusqu'à l'envoi suivant).
  const [showProblem, setShowProblem] = useState(false)
  // Une demande en route : un `ref`, lu tout de suite, pour qu'une seconde tape arrivée avant que
  // React ait redessiné le bouton en chargement ne reparte pas.
  const sending = useRef(false)
  const testersRef = useRef<Focusable>(null)
  const followRef = useRef<Focusable>(null)
  // Après la feuille, le focus va au bouton des testeurs (« Le coin des testeurs », R7b).
  const [focusTesters, setFocusTesters] = useState(false)

  const problem = showProblem && become.error ? (become.reason ?? 'failed') : null

  const openTesters = () => {
    sending.current = false
    setShowProblem(false)
    setSheetOpen(true)
  }
  const closeTesters = () => setSheetOpen(false)

  // « Le coin des testeurs » : la page du coin. Une page s'ouvre sous le doigt : la garde empêche la
  // seconde tape d'une double tape de l'empiler une deuxième fois (deux « Retour »).
  const guard = useTapGuard()
  const openCorner = guard(() => router.push(`/projects/${encodeURIComponent(project.id)}/testers`))

  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setShowProblem(false)
    // `isTester` change dans le cache au toucher : le bouton de la page, sous la feuille, devient
    // aussitôt « Le coin des testeurs » ; la feuille, elle, garde son texte jusqu'à la réponse.
    const done = await become.join()
    if (!done) {
      sending.current = false
      setShowProblem(true)
      return
    }
    // Accepté : `sending` reste levé jusqu'à la prochaine ouverture. La feuille part en fondu, sa
    // confirmation encore sous le doigt : la seconde tape d'un double clic, après une réponse
    // rapide, renvoyait sinon la demande (deux POST, vus dans le navigateur à 1280 px).
    // La feuille se ferme d'abord : une bulle posée pendant une feuille ouverte resterait cachée.
    closeTesters()
    toast.show(
      t(($) => $.project.testers.joinedToast, { title: project.title }),
      {
        icon: 'check-circle',
      },
    )
    setFocusTesters(true)
  }

  // useEffect : une fois la feuille fermée et le bouton redessiné (« Le coin des testeurs »), le
  // focus y va, sans faire défiler la page. Sur le web, la feuille le rend aussi à son ouvreur, qui
  // est ce même bouton (même élément pour ses deux libellés).
  useEffect(() => {
    if (!focusTesters || sheetOpen) return
    setFocusTesters(false)
    // Sur téléphone, `focusWithoutScroll` ne fait rien (pas de clavier) : le lecteur d'écran est
    // amené sur le bouton, sinon il repartirait du haut quand la feuille disparaît (R7a, ui-C5).
    if (!focusWithoutScroll(testersRef.current)) moveReaderTo(testersRef.current)
  }, [focusTesters, sheetOpen])

  // ?focus=join (interface B6) : arrivé du coin après « Quitter les testeurs », le focus va sur
  // « Rejoindre les testeurs », ou, s'il n'est plus proposé (projet qui ne cherche plus, compte
  // suspendu, membre retiré), sur « Suivre ce projet ». L'adresse n'est connue que dans le
  // navigateur : on attend que la page soit hydratée (ui/theme/hydration.ts). Le paramètre quitte
  // ensuite l'adresse (`setParams` remplace l'adresse sans page de plus dans l'historique) :
  // recharger la page ne redéplace pas le focus. Le geste vient d'avoir lieu (« Quitter ») : poser
  // le focus est permis, et l'élément est amené dans l'écran s'il en sort.
  const focusParam = useFocusParam()
  const hydrated = useHydrated()
  const arrivedFocus = useRef(false)
  useEffect(() => {
    if (!hydrated || focusParam !== 'join' || arrivedFocus.current) return
    arrivedFocus.current = true
    router.setParams?.({ focus: undefined })
    const target = testersRef.current ?? followRef.current
    if (!target) return
    if (focusWithoutScroll(target)) revealWithoutJump(target, calm)
    else moveReaderTo(target)
  }, [hydrated, focusParam, router, calm])

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
        // n'a plus que le nombre d'abonnés (il peut encore le supprimer, plus bas sur la page), et
        // son coin des testeurs, fermé aux testeurs, qu'il relit.
        suspended={suspended || Boolean(project.removal)}
        onOpenTesters={openTesters}
        onOpenCorner={openCorner}
        testersRef={testersRef}
        followRef={followRef}
      />
      {project.isMine ? null : (
        <TesterSheet
          open={sheetOpen}
          authorName={project.author.name}
          title={project.title}
          pending={become.pending}
          problem={problem}
          problemAction={problem === 'expired' ? signInAgain() : undefined}
          onConfirm={() => void confirm()}
          onClose={closeTesters}
        />
      )}
    </>
  )
}
