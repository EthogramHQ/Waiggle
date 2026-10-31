// « Tous les outils » (refonte, tranche R3, docs/scenarios/refonte.md, « Les outils ») : les outils
// cités par les projets publics, par ordre alphabétique, chacun avec son nombre de projets publics
// et sa tuile à l'initiale ; une ligne mène à la page de l'outil (/tags/<slug>). Les catégories et
// le catalogue normé de la planche R3-Outils viennent en R6.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useTools } from '../tools/api'
import { InitialTile, tileVariantOf } from '../ui/InitialTile'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { StateMessage } from '../ui/StateMessage'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

export function ToolsScreen() {
  const { state, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (state === 'signedOut') return <SignedOutScreen />
  return <MemberTools />
}

function MemberTools() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  // « Retour » mène à Explorer quand on arrive ici directement (un lien partagé).
  const back = useGoBack('/explore')
  const tools = useTools()

  // L'ordre alphabétique du français : « cursor » et « Écrivain » se rangent parmi les autres,
  // sans tenir compte des capitales ni des accents (localeCompare, et non l'ordre des codes).
  const sorted = [...(tools.data?.tools ?? [])].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
  )

  return (
    <Screen
      title={t(($) => $.tools.title)}
      subtitle={t(($) => $.tools.subtitle)}
      pageTitle={t(($) => $.tools.title)}
      header={<TopNav />}
      onBack={back}
    >
      {!tools.data ? (
        tools.isError ? (
          <StateMessage
            kind="error"
            title={t(($) => $.tools.errorTitle)}
            message={t(($) => $.errors[errorKey(tools.error)])}
            actions={[{ label: t(($) => $.common.retry), onPress: () => void tools.refetch() }]}
          />
        ) : (
          <SkeletonList count={1} />
        )
      ) : sorted.length === 0 ? (
        <StateMessage
          kind="empty"
          title={t(($) => $.tools.emptyTitle)}
          message={t(($) => $.tools.empty)}
        />
      ) : (
        <ListGroup>
          {sorted.map((tool) => {
            const projects = t(($) => $.tools.projects, {
              count: tool.projectCount,
              lng: i18n.language,
            })
            return (
              <ListRow
                key={tool.slug}
                label={tool.label}
                // Le nom lu dit aussi le nombre : « Claude, 41 projets publics ».
                spokenLabel={t(($) => $.tools.withCount, { label: tool.label, projects })}
                leading={<InitialTile name={tool.label} variant={tileVariantOf(tool.slug)} />}
                detail={projects}
                trailing="chevron"
                href={`/tags/${encodeURIComponent(tool.slug)}`}
                onPress={(event) => {
                  // Sur le web, le routeur ouvre la page sans que le navigateur la recharge.
                  event?.preventDefault?.()
                  router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } })
                }}
              />
            )
          })}
        </ListGroup>
      )}
    </Screen>
  )
}
