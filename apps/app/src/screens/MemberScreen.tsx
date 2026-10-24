// Page d'un membre : son avatar, son nom, sa bio, ses outils favoris (chacun mène à sa page
// d'étiquette), puis ses projets, du plus récent au plus ancien. Sur sa propre page, un membre voit
// aussi ses projets privés, marqués « Privé », et un bouton pour modifier son profil. Sur la page
// d'un autre membre, le bouton « Suivre » et le menu « … » (tranche 7b) : « Signaler ce profil » et
// « Bloquer » ; sur les deux, le nombre d'abonnés (jamais leurs noms).
//
// Un membre que j'ai bloqué (tranche 7b) : sa page n'est plus que son en-tête (nom, pseudo, photo),
// avec « Tu as bloqué @x », et dans le menu « Débloquer » et « Signaler ce profil ». Un membre qui
// m'a bloqué n'a pas de page pour moi : l'API répond « introuvable », comme pour un inconnu.
import { BLOCKS_PER_DAY, type Member } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useBlock, useUnblock } from '../blocks/api'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { SummaryCard } from '../projects/SummaryCard'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { MemberHeader } from '../ui/MemberHeader'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SignedOutScreen } from './states'

export function MemberScreen({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()
  // Pas de session : aucune requête (la page d'un membre est réservée aux membres).
  const member = useMember(id, Boolean(session))

  if (isPending) return <LoadingScreen width="page" />
  if (!session) return <SignedOutScreen width="page" />
  if (member.error) {
    // Introuvable : un membre inconnu, ou qui m'a bloqué. La même page, le même texte : rien ne
    // trahit le blocage.
    if (errorKey(member.error) === 'notFound') {
      return (
        <NotFoundState
          width="page"
          title={t('member.notFoundTitle')}
          message={t('member.notFound')}
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

/** Le geste en cours de confirmation : bloquer, ou débloquer. */
type Asking = 'block' | 'unblock'

function MemberView({ member }: { member: Member }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil.
  const back = useGoBack('/')
  const follow = useFollow({ kind: 'member', id: member.id })
  const { block } = useBlock()
  const { unblock } = useUnblock()
  const signInAgain = useSignInAgain()
  const followers = t('follow.followers', { count: member.followerCount })
  const handle = member.handle

  // La fenêtre de confirmation ouverte (aucune, bloquer ou débloquer), le geste en cours, son refus,
  // et le dernier geste réussi.
  const [asking, setAsking] = useState<Asking | null>(null)
  const [busy, setBusy] = useState(false)
  // Une ref en plus de l'état : deux tapes dans la même image (double tape) voient toutes deux
  // l'ancien `busy` ; la ref, elle, est déjà à vrai pour la seconde.
  const sending = useRef(false)
  const [refusal, setRefusal] = useState<ApiErrorKey | null>(null)
  const [done, setDone] = useState<Asking | null>(null)

  const ask = (gesture: Asking) => {
    // Une erreur d'un essai précédent ne se montre pas à la réouverture (pôle design).
    setRefusal(null)
    setAsking(gesture)
  }

  // Pendant le geste, la fenêtre reste ouverte : la fermer perdrait le focus prévu après.
  const closeDialog = () => {
    if (!sending.current) setAsking(null)
  }

  const confirm = async (gesture: Asking) => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setRefusal(null)
    const result = gesture === 'block' ? await block(member.id) : await unblock(member.id)
    sending.current = false
    setBusy(false)
    // Refusé : la fenêtre reste ouverte, avec le message ; le bouton permet de réessayer.
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    // Fait : la page du membre se relit (blocks/api) et passe à son nouvel état.
    setDone(gesture)
    setAsking(null)
  }

  // Le message d'un refus. La limite du jour et la session expirée disent pourquoi ; le reste,
  // « Réessaie ».
  const refusalMessage = (gesture: Asking) =>
    refusal === 'rateLimited'
      ? gesture === 'block'
        ? t('block.limited', { max: BLOCKS_PER_DAY })
        : t('errors.rateLimited')
      : refusal === 'unauthorized'
        ? t('states.expired')
        : t('block.error')

  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'member', id: member.id } })

  // Le menu « … » : rien sur sa propre page (ni se signaler, ni se bloquer soi-même).
  const reportItem: ActionMenuItem = { label: t('report.member'), icon: 'flag', onPress: report }
  const menuItems: ActionMenuItem[] = member.isBlocked
    ? [
        { label: t('block.unblock'), icon: 'check-circle', onPress: () => ask('unblock') },
        reportItem,
      ]
    : [
        reportItem,
        {
          label: t('block.action'),
          icon: 'prohibit',
          tone: 'danger',
          onPress: () => ask('block'),
        },
      ]

  // La confirmation du dernier geste, tant que la page n'a pas encore l'état qu'il annonce (le
  // temps de la relire). Lue sans interrompre (role « status »).
  const doneNotice =
    done === 'unblock' && !member.isBlocked ? (
      <Notice tone="success" message={t('block.unblocked', { handle })} polite />
    ) : done === 'block' && !member.isBlocked ? (
      <Notice tone="success" message={t('block.done', { handle })} polite />
    ) : null

  const dialogError = (gesture: Asking) =>
    refusal ? (
      <Notice
        message={refusalMessage(gesture)}
        action={refusal === 'unauthorized' ? signInAgain(() => setAsking(null)) : undefined}
      />
    ) : null

  return (
    <Screen width="page" header={<TopNav />} onBack={back} pageTitle={member.name}>
      <MemberHeader
        name={member.name}
        handle={t('member.handle', { handle })}
        avatar={toSource(member.avatarUrl)}
        bio={member.bio}
        toolsTitle={t('member.favoriteTools')}
        tools={member.favoriteTools.map((tool) => ({
          label: tool.label,
          onPress: () => router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } }),
        }))}
        action={
          member.isMe ? (
            <Stack gap="sm" align="center">
              <FollowerCount text={followers} />
              <Button
                label={t('account.editProfile')}
                variant="secondary"
                icon="pencil-simple"
                onPress={() => router.push('/profile')}
              />
            </Stack>
          ) : (
            <Stack gap="md" align="center">
              {member.isBlocked ? (
                <Notice tone="info" message={t('block.notice', { handle })} />
              ) : null}
              {doneNotice}
              {/* « Suivre » et le menu « … » côte à côte, alignés en haut (le nombre d'abonnés
                  est sous « Suivre »). Le menu garde sa place dans l'arbre, bloqué ou non : après
                  « Bloquer », le focus revient à son bouton au lieu de se perdre. */}
              <Row gap="sm" align="start" justify="center">
                {member.isBlocked ? null : (
                  <FollowButton
                    followed={member.isFollowed}
                    onPress={follow.toggle}
                    // Le nom lu contient toujours le texte affiché (« Suivi : Léa » quand on la
                    // suit) : dire « touche Suivi » à la commande vocale trouve bien ce bouton.
                    label={
                      member.isFollowed
                        ? t('follow.memberFollowing', { name: member.name })
                        : t('follow.member', { name: member.name })
                    }
                    text={member.isFollowed ? t('follow.following') : t('follow.follow')}
                    caption={followers}
                    layout="stacked"
                    error={
                      follow.expired
                        ? t('states.expired')
                        : follow.error
                          ? t('follow.error')
                          : undefined
                    }
                    errorAction={follow.expired ? signInAgain() : undefined}
                  />
                )}
                <ActionMenu items={menuItems} />
              </Row>
            </Stack>
          )
        }
      />
      {/* Bloqué : ni projets, ni « Pas encore de projet public » (l'API n'en donne aucun). */}
      {member.isBlocked ? null : (
        <>
          <Text variant="heading" heading={2}>
            {t('member.projects')}
          </Text>
          <ProjectGrid empty={member.isMe ? t('member.emptyMine') : t('member.empty')}>
            {member.projects.map((project) => (
              <SummaryCard key={project.id} project={project} />
            ))}
          </ProjectGrid>
        </>
      )}
      {/* Bloquer : la fenêtre dit tout ce qui change avant le geste (relecture juridique, J9). */}
      <Dialog
        visible={asking === 'block'}
        title={t('block.title', { handle })}
        message={[
          t('block.hidden'),
          t('block.follows'),
          t('block.notTold', { handle }),
          t('block.notModeration'),
        ].join('\n\n')}
        onDismiss={closeDialog}
      >
        {dialogError('block')}
        <Button
          label={t('block.confirm')}
          variant="confirm"
          onPress={() => void confirm('block')}
          loading={busy}
        />
        <Button
          label={t('block.cancel')}
          variant="secondary"
          onPress={closeDialog}
          disabled={busy}
        />
      </Dialog>
      {/* Débloquer passe aussi par une fenêtre (J10) : les abonnements retirés ne reviennent pas. */}
      <Dialog
        visible={asking === 'unblock'}
        title={t('block.unblockTitle', { handle })}
        message={t('block.unblockMessage')}
        onDismiss={closeDialog}
      >
        {dialogError('unblock')}
        <Button
          label={t('block.unblockConfirm')}
          onPress={() => void confirm('unblock')}
          loading={busy}
        />
        <Button
          label={t('block.cancel')}
          variant="secondary"
          onPress={closeDialog}
          disabled={busy}
        />
      </Dialog>
    </Screen>
  )
}
