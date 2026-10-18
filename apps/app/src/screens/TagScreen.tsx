// Page d'une étiquette : les projets publics faits avec un outil (« Claude Code »), de tous les
// membres, du plus récent au plus ancien. Une étiquette sans projet public affiche simplement une
// liste vide : elle ne dit jamais si des projets privés la portent.
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useTag } from '../members/api'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { SummaryCard } from '../projects/SummaryCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { LoadErrorScreen, LoadingScreen, SignedOutScreen } from './states'

export function TagScreen({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()
  const tag = useTag(slug, Boolean(session))
  const back = useGoBack('/')

  if (isPending) return <LoadingScreen />
  if (!session) return <SignedOutScreen />
  if (tag.error) return <LoadErrorScreen error={tag.error} onRetry={() => void tag.refetch()} />
  if (!tag.data) return <LoadingScreen />
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
