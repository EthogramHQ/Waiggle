// Page d'une étiquette : les projets publics faits avec un outil (« Claude Code »), de tous les
// membres, du plus récent au plus ancien. Une étiquette sans projet public affiche simplement une
// liste vide : elle ne dit jamais si des projets privés la portent.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { ApiError } from '../api/errors'
import { useTag } from '../members/api'
import { TopNav } from '../navigation/TopNav'
import { SummaryCard } from '../projects/SummaryCard'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'

export function TagScreen({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const tag = useTag(slug, Boolean(session))
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  if (isPending) return <Screen title={t('common.loading')}>{null}</Screen>
  if (!session) {
    return (
      <Screen>
        <Notice tone="info" message={t('errors.unauthorized')} />
        <Button label={t('home.signIn')} onPress={() => router.replace('/sign-in')} />
      </Screen>
    )
  }
  if (tag.error) {
    const key = tag.error instanceof ApiError ? tag.error.key : 'internal'
    return (
      <Screen>
        <Notice message={t(`errors.${key}`)} />
      </Screen>
    )
  }
  if (!tag.data) return <Screen title={t('common.loading')}>{null}</Screen>
  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={back}
      // Le nom tapé par l'auteur du projet le plus récent ; sans projet, l'étiquette elle-même.
      title={tag.data.label ?? tag.data.slug}
      subtitle={t('tag.subtitle')}
    >
      <ProjectGrid empty={t('tag.empty')}>
        {tag.data.projects.map((project) => (
          <SummaryCard key={project.id} project={project} />
        ))}
      </ProjectGrid>
    </Screen>
  )
}
