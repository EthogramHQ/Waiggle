// Page d'un membre : son avatar, son nom, sa bio, ses outils favoris (chacun mène à sa page
// d'étiquette), puis ses projets, du plus récent au plus ancien, sous « Projets · 3 ». Sur sa
// propre page (« Moi », refonte R3), un membre voit aussi ses projets privés, marqués « Privé »,
// sous « Mes projets · 3 », la roue des réglages en haut à droite, et « Modifier mon profil », qui
// mène à la rubrique « Mon profil » des réglages. Sur la page
// d'un autre membre, le nombre d'abonnés (jamais leurs noms), puis le bouton « Suivre » et le menu
// « … » (tranche 7b) côte à côte : « Signaler ce profil » et « Bloquer ».
//
// Un membre que j'ai bloqué (tranche 7b) : sa page n'est plus que son en-tête (nom, pseudo, photo),
// avec « Tu as bloqué @x. », un bouton « Débloquer » à la place de « Suivre », et « Signaler ce
// profil » dans le menu. Un membre qui m'a bloqué n'a pas de page pour moi : l'API répond
// « introuvable », comme pour un inconnu.
//
// Tranche 7c : un administrateur trouve dans le menu « Suspendre le compte » (ou « Lever la
// suspension ») et « Historique de modération », et lit jusqu'à quand le compte est suspendu. Un
// visiteur suspendu n'a plus « Suivre », sauf pour ne plus suivre un membre qu'il suit déjà.
import { type Member, PROJECT_LIST_MAX } from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useBlock, useUnblock } from '../blocks/api'
import { type BlockAsking, BlockDialog } from '../blocks/BlockDialog'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { useSuspension } from '../moderation/suspension'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { SummaryCard } from '../projects/SummaryCard'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { Button } from '../ui/Button'
import { CountedTitle } from '../ui/CountedTitle'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { IconButton } from '../ui/IconButton'
import { MemberHeader } from '../ui/MemberHeader'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { parisDateTime } from '../ui/parisTime'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'

export function MemberScreen({ id }: { id: string }) {
  const { t } = useTranslation()
  const { state, session, retry } = useMemberSession()
  // Pas de session : aucune requête (la page d'un membre est réservée aux membres).
  const member = useMember(id, Boolean(session))

  if (state === 'pending') return <LoadingScreen width="page" />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  if (!session) return <SignedOutScreen width="page" />
  if (member.error) {
    // Introuvable : un membre inconnu, ou qui m'a bloqué. La même page, le même texte : rien ne
    // trahit le blocage.
    if (errorKey(member.error) === 'notFound') {
      return (
        <NotFoundState
          width="page"
          title={t(($) => $.member.notFoundTitle)}
          message={t(($) => $.member.notFound)}
        />
      )
    }
    return (
      <LoadErrorScreen error={member.error} onRetry={() => void member.refetch()} width="page" />
    )
  }
  if (!member.data) return <LoadingScreen width="page" />
  return <MemberView member={member.data} />
}

function MemberView({ member }: { member: Member }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil.
  const back = useGoBack('/')
  // « Moi » (/me, R3) est la première page d'un onglet, comme le Fil ou Explorer : pas de
  // « Retour » (on change de page par la barre d'onglets). Sa page ouverte par /members/<id> en a un.
  const pathname = usePathname()
  const onBack = pathname === '/me' ? undefined : back
  const follow = useFollow({ kind: 'member', id: member.id })
  const { block } = useBlock()
  const { unblock } = useUnblock()
  const signInAgain = useSignInAgain()
  const followers = t(($) => $.follow.followers, { count: member.followerCount })
  const handle = member.handle
  // Tranche 7c : un compte suspendu ne suit plus personne de nouveau, mais peut retirer ce qu'il a
  // déjà donné (décision de Louis, 26/10/2026). S'il suit ce membre, « Tu suis Léa » reste, pour ne plus
  // le suivre ; s'il ne le suit pas, « Suivre » est absent.
  const { suspended } = useSuspension()
  // Vu « Tu suis Léa » pendant la suspension : le bouton reste toute la visite, inactif une fois le suivi
  // retiré. Sans cela, il disparaîtrait sous le doigt (et le focus avec lui) dès le geste fait.
  const [keepFollow, setKeepFollow] = useState(false)
  if (suspended && member.isFollowed && !keepFollow) setKeepFollow(true)
  const showFollow = !suspended || keepFollow

  // La fenêtre de confirmation ouverte (aucune, bloquer ou débloquer).
  const [asking, setAsking] = useState<BlockAsking | null>(null)
  // L'état annoncé par le dernier geste réussi, tant que la page relue ne le dit pas encore : la
  // page passe à son nouvel état tout de suite, au lieu de montrer l'ancien puis de sauter.
  const [expected, setExpected] = useState<boolean | null>(null)
  // Changer l'état pendant le dessin est permis par React pour suivre une prop : la page relue dit
  // la même chose, on la croit de nouveau.
  if (expected !== null && member.isBlocked === expected) setExpected(null)
  const blocked = expected ?? member.isBlocked
  // « Tu as débloqué @x. » : il reste jusqu'au geste suivant, au lieu de disparaître sous le doigt.
  const [unblocked, setUnblocked] = useState(false)
  // Après un déblocage, « Débloquer » disparaît : le focus du clavier va au message qui le
  // confirme, une fois la fenêtre refermée (avant, elle le garde pour elle).
  const unblockedRef = useRef<Focusable>(null)
  const focusAfterClose = useRef(false)

  const ask = (gesture: BlockAsking['gesture']) =>
    setAsking({ gesture, member: { id: member.id, handle } })

  const done = ({ gesture }: BlockAsking) => {
    setExpected(gesture === 'block')
    setUnblocked(gesture === 'unblock')
    focusAfterClose.current = gesture === 'unblock'
    setAsking(null)
  }

  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'member', id: member.id } })

  // Le menu « … » : rien sur sa propre page (ni se signaler, ni se bloquer soi-même). Bloqué, il
  // garde « Signaler ce profil » ; « Débloquer » est un bouton de la page (le scénario le promet).
  const reportItem: ActionMenuItem = {
    label: t(($) => $.report.member),
    icon: 'flag',
    onPress: report,
  }
  const memberItems: ActionMenuItem[] = blocked
    ? [reportItem]
    : [
        reportItem,
        {
          label: t(($) => $.block.action),
          icon: 'prohibit',
          tone: 'danger',
          onPress: () => ask('block'),
        },
      ]
  // Tranche 7c : ce que seul un administrateur voit (l'API n'envoie `moderation` qu'à lui).
  // Suspendre, ou lever une suspension en cours (la même page, /suspend), puis l'historique des
  // décisions qui visent ce membre. Jamais de suspension d'un autre administrateur (`canSuspend`).
  const { moderation } = member
  const adminItems: ActionMenuItem[] = moderation
    ? [
        ...(moderation.suspension
          ? [
              {
                label: t(($) => $.moderation.memberMenu.lift),
                icon: 'lock-simple-open' as const,
                onPress: () => router.push({ pathname: '/suspend', params: { member: member.id } }),
              },
            ]
          : moderation.canSuspend
            ? [
                {
                  label: t(($) => $.moderation.memberMenu.suspend),
                  icon: 'lock-simple' as const,
                  onPress: () =>
                    router.push({ pathname: '/suspend', params: { member: member.id } }),
                },
              ]
            : []),
        {
          label: t(($) => $.moderation.memberMenu.history),
          icon: 'clock',
          onPress: () =>
            router.push({
              pathname: '/moderation',
              params: { tab: 'history', member: member.id },
            }),
        },
      ]
    : []
  const menuItems = [...memberItems, ...adminItems]
  // La fin de sa suspension, pour l'administrateur seul : le jour et l'heure de Paris (J4).
  const suspension = moderation?.suspension ?? null
  const suspensionEnd = suspension?.endsAt ? parisDateTime(suspension.endsAt, i18n.language) : null
  const suspensionLine = suspension
    ? suspensionEnd
      ? t(($) => $.moderation.memberSuspended, {
          date: suspensionEnd.date,
          time: suspensionEnd.time,
        })
      : t(($) => $.moderation.memberSuspendedIndefinite)
    : null

  // Le nom lu du bouton « Suivre » : « Suivre Léa », puis « Tu suis Léa » (aussi le texte affiché).
  const followName = member.isFollowed
    ? t(($) => $.follow.memberFollowing, { name: member.name })
    : t(($) => $.follow.member, { name: member.name })
  // Le titre de la liste des projets : « Mes projets » sur sa page, « Projets » sur celle d'un
  // autre, suivi du nombre (« Mes projets · 3 », dessiné par CountedTitle). L'API n'envoie que les
  // PROJECT_LIST_MAX (50) premiers projets : une liste pleine en cache peut-être d'autres, et le
  // titre dit alors « 50+ », lu « 50 projets ou plus ».
  const listTitle = member.isMe ? t(($) => $.me.myProjects) : t(($) => $.member.projects)
  const projectCount = member.projects.length
  const capped = projectCount >= PROJECT_LIST_MAX
  const spokenCount = capped
    ? t(($) => $.member.projectCountMore, { max: PROJECT_LIST_MAX })
    : t(($) => $.member.projectCount, { count: projectCount })

  const followError = follow.expired
    ? t(($) => $.states.expired)
    : follow.error
      ? t(($) => $.follow.error)
      : undefined

  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={onBack}
      pageTitle={member.name}
      // Sur sa propre page, la roue des réglages, en haut à droite (R3, F-Nav8) : on entre dans
      // les réglages par « Moi ». Sur la rangée du « Retour » quand il y en a un (sa page ouverte
      // par /members/<id>), pas sur une rangée à elle en dessous. Un bouton à icône seule : son
      // nom (« Réglages ») est lu.
      topAction={
        member.isMe ? (
          <IconButton
            icon="gear-six"
            label={t(($) => $.nav.settings)}
            onPress={() => router.push('/settings')}
          />
        ) : undefined
      }
    >
      <MemberHeader
        name={member.name}
        handle={t(($) => $.member.handle, { handle })}
        avatar={toSource(member.avatarUrl)}
        bio={member.bio}
        toolsTitle={t(($) => $.member.favoriteTools)}
        tools={member.favoriteTools.map((tool) => ({
          label: tool.label,
          onPress: () => router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } }),
        }))}
        action={
          member.isMe ? (
            <Stack gap="sm" align="center">
              <FollowerCount text={followers} />
              {/* R3 (F-Nav8) : la rubrique « Mon profil » des réglages. */}
              <Button
                label={t(($) => $.me.editProfile)}
                variant="secondary"
                icon="pencil-simple"
                onPress={() => router.push('/settings/profile')}
              />
            </Stack>
          ) : (
            <Stack gap="md" align="center">
              {/* Pour l'administrateur seul : jusqu'à quand le compte est suspendu. Lue à son tour
                  (role « status ») : elle est là dès l'ouverture de la page. */}
              {suspensionLine ? <Notice tone="info" message={suspensionLine} polite /> : null}
              {/* Lus sans interrompre (role « status ») : le même texte avant et après la relecture
                  de la page, pour une seule annonce. */}
              {blocked ? (
                <Notice tone="info" message={t(($) => $.block.notice, { handle })} polite />
              ) : unblocked ? (
                <Notice
                  ref={unblockedRef}
                  tone="success"
                  message={t(($) => $.block.unblocked, { handle })}
                  polite
                />
              ) : null}
              {/* Le nombre d'abonnés au-dessus : il ne bouge pas quand « Suivre » devient « Tu suis Léa ». */}
              {blocked ? null : <FollowerCount text={followers} />}
              {/* « Suivre » (ou « Débloquer ») et le menu « … » sur une rangée centrée. Le menu
                  garde sa place dans l'arbre, bloqué ou non : après « Bloquer », le focus revient
                  à son bouton au lieu de se perdre. */}
              <Row gap="sm" align="center" justify="center">
                {blocked ? (
                  <Button
                    label={t(($) => $.block.unblock)}
                    // Le nom lu contient le texte affiché, et dit qui (comme dans la liste).
                    spokenLabel={t(($) => $.block.list.unblockLabel, { handle })}
                    variant="secondary"
                    size="compact"
                    onPress={() => ask('unblock')}
                  />
                ) : showFollow ? (
                  <FollowButton
                    followed={member.isFollowed}
                    onPress={follow.toggle}
                    // Suspendu, le suivi retiré : plus de nouveau suivi (l'API le refuserait).
                    disabled={suspended && !member.isFollowed}
                    // Le nom lu contient toujours le texte affiché : « Suivre », puis « Tu suis
                    // Léa » une fois suivie (R3, planches ; la coche est dessinée par le bouton,
                    // hors du nom lu). Dire « touche Tu suis Léa » à la commande vocale trouve
                    // bien ce bouton.
                    label={followName}
                    text={member.isFollowed ? followName : t(($) => $.follow.follow)}
                  />
                ) : null}
                <ActionMenu items={menuItems} />
              </Row>
              {/* Sous la rangée, pas dans le bouton : « … » reste centré sur « Suivre ». Lu dès
                  qu'il apparaît (role « alert »), comme les autres erreurs. */}
              {!blocked && followError ? (
                <Notice message={followError} action={follow.expired ? signInAgain() : undefined} />
              ) : null}
            </Stack>
          )
        }
      />
      {/* Bloqué : ni projets, ni « Pas encore de projet public » (l'API n'en donne aucun). */}
      {blocked ? null : (
        <>
          <CountedTitle
            title={listTitle}
            count={projectCount}
            more={capped}
            spokenCount={spokenCount}
          />
          <ProjectGrid
            empty={member.isMe ? t(($) => $.member.emptyMine) : t(($) => $.member.empty)}
          >
            {member.projects.map((project) => (
              <SummaryCard key={project.id} project={project} />
            ))}
          </ProjectGrid>
        </>
      )}
      {/* Bloquer et débloquer passent par la même fenêtre, qui dit ce qui change (J9, J10). */}
      <BlockDialog
        asking={asking}
        send={({ gesture, member: target }) =>
          gesture === 'block' ? block(target.id) : unblock(target.id)
        }
        onDone={done}
        onCancel={() => setAsking(null)}
        onClosed={() => {
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          requestAnimationFrame(() => focusWithoutScroll(unblockedRef.current))
        }}
      />
    </Screen>
  )
}
