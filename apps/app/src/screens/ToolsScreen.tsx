// « Outils » (refonte : R3, puis le catalogue normé de R6b ; docs/scenarios/refonte.md, « Tous les
// outils », planche R3-Outils) : ce qu'est le catalogue, un champ « Chercher un outil » et les
// pastilles des familles ; puis « Les plus utilisés » (les dix outils qui comptent le plus de
// projets) et « De A à Z » (tout le catalogue, dans l'ordre alphabétique de la langue), chaque outil
// avec sa famille et son nombre de projets, menant à sa page (/tags/<slug>). Le champ et les
// pastilles filtrent les deux listes. En bas, « Pas encore dans le catalogue » : les « Autre » des
// projets visibles, en texte simple, sans lien (ils n'ont pas de page).
import { type CatalogueTool, foldTool, type ToolFamily, type ToolList } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useTools } from '../tools/api'
import { FilterPills } from '../ui/FilterPills'
import { InitialTile, tileVariantOf } from '../ui/InitialTile'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { Screen } from '../ui/Screen'
import { SearchField } from '../ui/SearchField'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Tag } from '../ui/Tag'
import { useLayout } from '../ui/theme/layout'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

/** Le nombre d'outils de « Les plus utilisés » (planche R3-Outils). */
const MOST_USED_MAX = 10

export function ToolsScreen() {
  const { state, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (state === 'signedOut') return <SignedOutScreen />
  return <MemberTools />
}

/**
 * Le filtre du champ, une fois replié par `foldTool` (le repli de l'API : accents, capitales,
 * espaces et ponctuation ne comptent pas) : un outil passe si son nom ou un de ses autres noms
 * (alias, « HASS » pour Home Assistant) contient le texte. Champ vide : tout passe. On ne replie pas
 * un champ vide ou fait d'espaces : `foldTool` ne rend jamais une chaîne vide (il se replie alors
 * sur les numéros des caractères), et rien ne correspondrait.
 */
const matchesText = (names: string[], text: string) => {
  if (text.trim() === '') return true
  const folded = foldTool(text)
  return names.some((name) => foldTool(name).includes(folded))
}

function MemberTools() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  // « Retour » mène à Explorer quand on arrive ici directement (un lien partagé).
  const back = useGoBack('/explore')
  const tools = useTools()
  // Ce qui est tapé et la famille choisie (null : « Tous »), propres à cette visite : la page
  // revient entière quand on la rouvre.
  const [text, setText] = useState('')
  const [family, setFamily] = useState<ToolFamily | null>(null)

  const content = !tools.data ? (
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
  ) : tools.data.tools.length === 0 ? (
    <Stack gap="xl">
      <StateMessage
        kind="empty"
        title={t(($) => $.tools.emptyTitle)}
        message={t(($) => $.tools.empty)}
      />
      <OtherTools others={tools.data.others} text={text} family={family} />
    </Stack>
  ) : (
    <Catalogue
      list={tools.data}
      text={text}
      onText={setText}
      family={family}
      onFamily={setFamily}
      compact={sizeClass === 'compact'}
      language={i18n.language}
      onOpen={(slug) => router.push({ pathname: '/tags/[slug]', params: { slug } })}
    />
  )

  return (
    <Screen
      title={t(($) => $.tools.title)}
      subtitle={t(($) => $.tools.subtitle)}
      pageTitle={t(($) => $.tools.title)}
      header={<TopNav />}
      onBack={back}
    >
      {content}
    </Screen>
  )
}

type CatalogueProps = {
  list: ToolList
  text: string
  onText: (text: string) => void
  family: ToolFamily | null
  onFamily: (family: ToolFamily | null) => void
  /** Sur téléphone, les pastilles restent sur une ligne qui défile de côté. */
  compact: boolean
  /** La langue de l'appli, pour l'ordre alphabétique de « De A à Z ». */
  language: string
  onOpen: (slug: string) => void
}

/** Le champ, les pastilles et les deux listes, quand le catalogue a au moins un outil. */
function Catalogue({
  list,
  text,
  onText,
  family,
  onFamily,
  compact,
  language,
  onOpen,
}: CatalogueProps) {
  const { t } = useTranslation()
  // Les familles qui ont au moins un outil, dans l'ordre de l'API (pas de pastille vide).
  const families = [...new Set(list.tools.map((tool) => tool.family))]
  const shown = (tool: CatalogueTool) =>
    (family === null || tool.family === family) && matchesText([tool.name, ...tool.aliases], text)
  // Les dix plus utilisés du catalogue entier (l'API les range du plus au moins utilisé), puis
  // filtrés : le champ et les pastilles ne font pas entrer un outil moins utilisé dans les dix. Un
  // outil sans projet n'est jamais « le plus utilisé ».
  const mostUsed = list.tools
    .filter((tool) => tool.projectCount > 0)
    .slice(0, MOST_USED_MAX)
    .filter(shown)
  // L'ordre alphabétique de la langue : « cursor » et « Écrivain » se rangent parmi les autres,
  // sans tenir compte des capitales ni des accents (localeCompare, et non l'ordre des codes).
  const aToZ = list.tools
    .filter(shown)
    .sort((a, b) => a.name.localeCompare(b.name, language, { sensitivity: 'base' }))
  const nothing = aToZ.length === 0

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <SearchField
          label={t(($) => $.tools.search)}
          placeholder={t(($) => $.tools.search)}
          value={text}
          onChangeText={onText}
          // La page filtre pendant qu'on tape : Entrée ne fait rien de plus (sur le web, elle
          // garde le focus dans le champ).
          onSubmit={() => {}}
        />
        <FilterPills
          label={t(($) => $.tools.familiesLabel)}
          allLabel={t(($) => $.tools.all)}
          value={family}
          options={families.map((code) => ({
            value: code,
            label: t(($) => $.tools.familyPill[code]),
          }))}
          scroll={compact}
          onChange={onFamily}
        />
        {/* Toujours montée, vide quand des outils correspondent : la phrase est lue dès qu'elle
            paraît, sans que le focus quitte le champ. */}
        <LiveStatus message={nothing ? t(($) => $.tools.noMatch) : ''} />
      </Stack>
      {mostUsed.length > 0 ? (
        <ListGroup title={t(($) => $.tools.mostUsed)}>
          {mostUsed.map((tool) => (
            <ToolRow key={tool.slug} tool={tool} onOpen={onOpen} />
          ))}
        </ListGroup>
      ) : null}
      {aToZ.length > 0 ? (
        <ListGroup title={t(($) => $.tools.aToZ)}>
          {aToZ.map((tool) => (
            <ToolRow key={tool.slug} tool={tool} onOpen={onOpen} />
          ))}
        </ListGroup>
      ) : null}
      <OtherTools others={list.others} text={text} family={family} />
    </Stack>
  )
}

/** Une ligne d'outil : sa tuile, son nom, sa famille et son nombre ; elle mène à sa page. */
function ToolRow({ tool, onOpen }: { tool: CatalogueTool; onOpen: (slug: string) => void }) {
  const { t } = useTranslation()
  const code = tool.family
  // « 41 projets », ou « Aucun projet pour l'instant » (« 0 projet » serait faux en français).
  const projects =
    tool.projectCount === 0
      ? t(($) => $.tools.noProjects)
      : t(($) => $.tools.projects, { count: tool.projectCount })
  const detail = t(($) => $.tools.detail, { family: t(($) => $.tools.family[code]), projects })
  return (
    <ListRow
      label={tool.name}
      // Le nom d'un lien cache le texte qu'il contient : il dit donc tout ce qui se voit, « Claude,
      // Assistant IA · 41 projets ».
      spokenLabel={t(($) => $.tools.withCount, { label: tool.name, projects: detail })}
      leading={<InitialTile name={tool.name} variant={tileVariantOf(tool.slug)} />}
      detail={detail}
      trailing="chevron"
      href={`/tags/${encodeURIComponent(tool.slug)}`}
      onPress={(event) => {
        // Sur le web, le routeur ouvre la page sans que le navigateur la recharge.
        event?.preventDefault?.()
        onOpen(tool.slug)
      }}
    />
  )
}

/**
 * « Pas encore dans le catalogue » : les « Autre » des projets que le membre peut voir, chacun en
 * pastille de texte simple (`Tag inCatalogue={false}` : ni lien, ni page). Le champ les filtre
 * aussi ; une famille choisie les cache (un « Autre » n'a pas de famille). Rien à montrer : la
 * section entière disparaît.
 */
function OtherTools({
  others,
  text,
  family,
}: {
  others: ToolList['others']
  text: string
  family: ToolFamily | null
}) {
  const { t } = useTranslation()
  const shown = family === null ? others.filter((other) => matchesText([other.name], text)) : []
  if (shown.length === 0) return null
  return (
    <ListGroup title={t(($) => $.tools.others)} footer={t(($) => $.tools.othersHint)}>
      <Stack direction="row" gap="sm" wrap padding="md">
        {shown.map((other) => (
          <Tag key={other.name} label={other.name} inCatalogue={false} />
        ))}
      </Stack>
    </ListGroup>
  )
}
