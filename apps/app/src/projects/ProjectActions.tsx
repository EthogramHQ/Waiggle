// Les actions de la page d'un projet (R5a, planches « Projet » et « Auteur ») : « Tester la démo »
// (la seule action miel de la page) et sous lui « recettes.example.com, un site hors de Waiggle » ;
// à côté, « Suivre ce projet » et le nombre d'abonnés, ou, pour l'auteur, « Modifier » et ce nombre.
// Pour l'auteur d'un projet privé, le bandeau qui dit qui le voit vient avant.
// Les deux actions forment une paire (`ButtonPair`, ui-2) : côte à côte quand elles tiennent
// (360 points au plus chacune), l'une sous l'autre sinon. « Supprimer » garde sa place
// d'aujourd'hui, après les commentaires, jusqu'à R6 : c'est la page qui le pose.
//
// Deux exports : `ProjectActions`, ce que la page utilise (il suit le projet par `useFollow`), et
// `ProjectActionsView`, le dessin seul, sans lecture ni écriture, que le catalogue montre.
// Ce fichier n'écrit aucun style (règle Biome de `src/projects/**`) : il assemble des composants.
import type { Project } from '@ruche/contracts'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { ButtonPair } from '../ui/ButtonPair'
import { Callout } from '../ui/Callout'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { Hint } from '../ui/Hint'
import type { NoticeAction } from '../ui/Notice'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { hostOf } from './format'

/** Ce que les actions lisent du projet. */
export type ActionsProject = Pick<
  Project,
  'id' | 'isMine' | 'visibility' | 'demoUrl' | 'isFollowed' | 'followerCount'
>

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
   */
  suspended?: boolean
}

/** Les actions dessinées, sans lecture ni écriture : ce que montrent la page et le catalogue. */
export function ProjectActionsView({
  project,
  onOpenDemo,
  onEdit,
  onToggleFollow,
  followError,
  followErrorAction,
  suspended = false,
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

  // Pour l'auteur : « Modifier » et le nombre d'abonnés (suspendu : le nombre seul).
  // Pour un autre membre : « Suivre ce projet » et ce nombre (suspendu sans l'avoir suivi : le
  // nombre seul, comme pour l'auteur).
  const second = project.isMine ? (
    suspended ? (
      <FollowerCount text={followers} key="second" />
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
      </Row>
    )
  ) : canFollow ? (
    <FollowButton
      key="second"
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
      disabled={suspended && !project.isFollowed}
    />
  ) : (
    <FollowerCount text={followers} key="second" />
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
      <ButtonPair>
        {demo}
        {second}
      </ButtonPair>
    </Stack>
  )
}

type Props = Pick<ViewProps, 'project' | 'onOpenDemo' | 'onEdit'>

/**
 * Les actions de la page d'un projet. Elles suivent le projet elles-mêmes (`useFollow`) et lisent
 * si le compte est suspendu ; la page leur donne seulement la démo à ouvrir et « Modifier ».
 */
export function ProjectActions({ project, onOpenDemo, onEdit }: Props) {
  const { t } = useTranslation()
  const follow = useFollow({ kind: 'project', id: project.id })
  const { suspended } = useSuspension()
  // « Me reconnecter » : un seul pour toute la page, même si deux gestes ont échoué (ui/Notice).
  const signInAgain = useSignInAgain()
  return (
    <ProjectActionsView
      project={project}
      onOpenDemo={onOpenDemo}
      onEdit={onEdit}
      onToggleFollow={follow.toggle}
      followError={
        follow.expired
          ? t(($) => $.states.expired)
          : follow.error
            ? t(($) => $.follow.error)
            : undefined
      }
      followErrorAction={follow.expired ? signInAgain() : undefined}
      suspended={suspended}
    />
  )
}
