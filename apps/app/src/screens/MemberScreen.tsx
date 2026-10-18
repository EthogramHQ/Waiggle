// Page d'un membre : son avatar, son nom, sa bio, ses outils favoris (chacun mène à sa page
// d'étiquette), puis ses projets, du plus récent au plus ancien. Sur sa propre page, un membre voit
// aussi ses projets privés, marqués « Privé », et un bouton pour modifier son profil.
import type { Member } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { ApiError } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useMember } from '../members/api'
import { TopNav } from '../navigation/TopNav'
import { SummaryCard } from '../projects/SummaryCard'
import { Button } from '../ui/Button'
import { Honeycomb } from '../ui/Illustrations'
import { MemberHeader } from '../ui/MemberHeader'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

export function MemberScreen({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: session, isPending } = useSession()
  // Pas de session : aucune requête (la page d'un membre est réservée aux membres).
  const member = useMember(id, Boolean(session))

  if (isPending) return <Screen title={t('common.loading')}>{null}</Screen>
  if (!session) {
    return (
      <Screen>
        <Notice tone="info" message={t('errors.unauthorized')} />
        <Button label={t('home.signIn')} onPress={() => router.replace('/sign-in')} />
      </Screen>
    )
  }
  if (member.error) {
    const key = member.error instanceof ApiError ? member.error.key : 'internal'
    if (key === 'notFound') return <MemberNotFound />
    return (
      <Screen>
        <Notice message={t(`errors.${key}`)} />
      </Screen>
    )
  }
  if (!member.data) return <Screen title={t('common.loading')}>{null}</Screen>
  return <MemberView member={member.data} />
}

function MemberNotFound() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen>
      <Honeycomb />
      <Stack gap="sm">
        <Text variant="title2" align="center" accessibilityRole="header">
          {t('member.notFoundTitle')}
        </Text>
        <Text tone="secondary" align="center">
          {t('member.notFound')}
        </Text>
      </Stack>
      <Button label={t('project.page.home')} onPress={() => router.replace('/')} />
    </Screen>
  )
}

function MemberView({ member }: { member: Member }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène à l'accueil.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  return (
    <Screen width="page" header={<TopNav />} onBack={back}>
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
