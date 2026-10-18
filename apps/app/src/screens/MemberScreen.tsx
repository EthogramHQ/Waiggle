// Page d'un membre : son avatar, son nom, sa bio, ses outils favoris (chacun mène à sa page
// d'étiquette), puis ses projets, du plus récent au plus ancien. Sur sa propre page, un membre voit
// aussi ses projets privés, marqués « Privé », et un bouton pour modifier son profil.
import type { Member } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useMember } from '../members/api'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { SummaryCard } from '../projects/SummaryCard'
import { Button } from '../ui/Button'
import { MemberHeader } from '../ui/MemberHeader'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
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

function MemberView({ member }: { member: Member }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil.
  const back = useGoBack('/')

  return (
    <Screen width="page" header={<TopNav />} onBack={back} pageTitle={member.name}>
      <MemberHeader
        name={member.name}
        avatar={toSource(member.avatarUrl)}
        bio={member.bio}
        toolsTitle={t('member.favoriteTools')}
        tools={member.favoriteTools.map((tool) => ({
          label: tool.label,
          onPress: () => router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } }),
        }))}
        action={
          member.isMe ? (
            <Button
              label={t('account.editProfile')}
              variant="secondary"
              icon="pencil-simple"
              onPress={() => router.push('/profile')}
            />
          ) : undefined
        }
      />
      <Text variant="heading" accessibilityRole="header">
        {t('member.projects')}
      </Text>
      <ProjectGrid empty={member.isMe ? t('member.emptyMine') : t('member.empty')}>
        {member.projects.map((project) => (
          <SummaryCard key={project.id} project={project} />
        ))}
      </ProjectGrid>
    </Screen>
  )
}
