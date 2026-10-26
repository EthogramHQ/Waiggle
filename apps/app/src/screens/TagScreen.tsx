// Page d'une étiquette : les projets publics faits avec un outil (« Claude Code »), de tous les
// membres, du plus récent au plus ancien. Une étiquette sans projet public affiche simplement une
// liste vide : elle ne dit jamais si des projets privés la portent.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useTag } from '../members/api'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { SummaryCard } from '../projects/SummaryCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { StateMessage } from '../ui/StateMessage'
import { LoadErrorScreen, LoadingScreen, SignedOutScreen } from './states'

export function TagScreen({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const tag = useTag(slug, Boolean(session))
  const back = useGoBack('/')

  if (isPending) return <LoadingScreen width="page" />
  if (!session) return <SignedOutScreen width="page" />
  if (tag.error)
    return <LoadErrorScreen error={tag.error} onRetry={() => void tag.refetch()} width="page" />
  if (!tag.data) return <LoadingScreen width="page" />
  const empty = tag.data.projects.length === 0
  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={back}
      // Le nom tapé par l'auteur du projet le plus récent ; sans projet, l'étiquette elle-même.
      title={tag.data.label ?? tag.data.slug}
      // Le sous-titre décrit la liste : sans liste, il n'a rien à décrire.
      {...(empty ? null : { subtitle: t(($) => $.tag.subtitle) })}
    >
      {empty ? (
        // Une étiquette sans projet public invite à publier le premier, au lieu d'une page vide.
        <StateMessage
          kind="empty"
          title={t(($) => $.tag.emptyTitle)}
          message={t(($) => $.tag.empty)}
          actions={[
            { label: t(($) => $.home.publish), onPress: () => router.push('/projects/new') },
          ]}
        />
      ) : (
        <ProjectGrid empty={t(($) => $.tag.empty)}>
          {tag.data.projects.map((project) => (
            <SummaryCard key={project.id} project={project} />
          ))}
        </ProjectGrid>
      )}
    </Screen>
  )
}
