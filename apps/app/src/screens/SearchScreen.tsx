// La recherche par mots (refonte, tranche R3, docs/scenarios/refonte.md, « La recherche par mots »,
// planche R3-Recherche) : on tape « carn », les projets, les membres et les outils qui correspondent
// arrivent pendant qu'on tape, rangés en trois groupes, avec la partie trouvée surlignée de miel.
//
// Le texte vit dans l'adresse (« /search?q=carn ») : on peut partager une recherche entre membres, et
// revenir dessus. Il s'y écrit à chaque frappe par `setParams`, qui remplace l'adresse au lieu d'en
// ajouter une : taper « carnaval » ne crée pas huit pages dans l'historique du navigateur
// (relecture juridique, jur-J5).
//
// Où est le champ ?
// - Sur téléphone, dans la page, avec « Annuler » à côté (revenir à Explorer), ou dessous quand le
//   texte est grand ;
// - en largeur moyenne (700 à 1 100 points), dans la page aussi : la barre du haut n'y a qu'une
//   loupe (relecture de l'interface du plan, ui-6) ;
// - sur ordinateur, dans la barre du haut (navigation/TopNav.tsx) : la page lit alors ce que la
//   barre écrit dans l'adresse, et n'a pas de champ à elle.
//
// Le texte cherché n'est jamais interprété : il s'affiche tel quel, en texte simple, et jamais dans
// le titre de la page ou de l'onglet du navigateur (relecture de sécurité, sec-A8).
import {
  SEARCH_OTHERS_FROM,
  SEARCH_QUERY_MAX,
  SearchQuery,
  type SearchResults,
  searchWords,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { useSearch } from '../search/api'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { HighlightedText } from '../ui/HighlightedText'
import { InitialTile, tileVariantOf } from '../ui/InitialTile'
import { ListGroup, ListRow, type PressEvent } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { Screen } from '../ui/Screen'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

/** Le temps sans frappe après lequel la recherche part : une demande par mot, pas une par lettre. */
const SEARCH_DELAY_MS = 250

/** Les onglets : tous les groupes, ou un seul. */
type Tab = 'all' | keyof SearchResults
const GROUPS: readonly (keyof SearchResults)[] = ['projects', 'members', 'tools']

export function SearchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, session, retry } = useMemberSession()
  const { sizeClass } = useLayout()
  // Les photos des membres trouvés (servies par l'API, avec la session sur téléphone).
  const toSource = useMediaSources()
  // L'adresse n'est lue qu'une fois la page hydratée : la page web est pré-rendue sans connaître
  // l'adresse complète, et lire `q` plus tôt ferait un écart entre le pré-rendu et le navigateur.
  const hydrated = useHydrated()
  const fromAddress = firstParam(useLocalSearchParams<{ q?: string | string[] }>().q) ?? ''
  const address = hydrated ? fromAddress : ''

  // Ce qui est dans le champ (téléphone, largeur moyenne), ou ce que la barre du haut a écrit dans
  // l'adresse (ordinateur). Ce qu'on tape fait foi : l'adresse revient un instant plus tard (son
  // « écho »), et ne doit pas effacer une lettre tapée entre-temps.
  const [text, setText] = useState(address)
  // Le texte cherché : `text`, une fois que le membre a cessé de taper depuis 250 ms.
  const [query, setQuery] = useState(address)
  // Les valeurs écrites dans l'adresse dont l'écho n'est pas encore revenu, dans l'ordre.
  const pending = useRef<string[]>([])
  // L'adresse a-t-elle déjà été lue ? La première lecture (lien partagé, page rechargée) cherche
  // tout de suite, sans attendre.
  const read = useRef(hydrated)
  const wide = sizeClass === 'wide'

  // L'adresse a changé sans nous : le bouton « Précédent » du navigateur, un lien vers une
  // recherche, ou, sur ordinateur, une frappe dans la barre du haut. Le champ la suit.
  useEffect(() => {
    if (!hydrated) return
    const echo = pending.current.indexOf(address)
    if (echo >= 0) {
      // L'écho d'une frappe dans la page : on l'oublie, avec ceux d'avant, déjà dépassés.
      pending.current = pending.current.slice(echo + 1)
      return
    }
    pending.current = []
    setText(address)
    // Sur ordinateur, la barre du haut écrit l'adresse à chaque lettre : on attend comme pour une
    // frappe. Ailleurs (ou à la première lecture), l'adresse est une recherche finie.
    if (!read.current || !wide) setQuery(address)
    read.current = true
  }, [hydrated, address, wide])

  // Le minuteur de l'attente (on dit « debounce ») : chaque frappe le relance ; l'ancien est effacé
  // par le nettoyage de useEffect (la fonction rendue, appelée avant l'effet suivant).
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  // Le texte demandé à l'API : sans les blancs autour, et coupé à 80 caractères (au-delà, l'API
  // refuserait tout ; on cherche plutôt le début).
  const searched = query.trim().slice(0, SEARCH_QUERY_MAX)
  const search = useSearch(searched)
  const [tab, setTab] = useState<Tab>('all')

  // « Réessayer » : React Query remet une lecture en erreur sans données « en attente », et
  // l'erreur disparaît pendant la nouvelle tentative ; on la garde affichée (et le focus sur le
  // bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)
  const lastError = useRef<unknown>(null)
  if (search.error) lastError.current = search.error

  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />

  const write = (next: string) => {
    setText(next)
    pending.current.push(next)
    // Un champ vide retire le paramètre, plutôt que de laisser « ?q= » dans l'adresse.
    router.setParams({ q: next === '' ? undefined : next })
  }

  // « Annuler » : vider, puis revenir à Explorer (la page d'où l'on vient d'ordinaire ; sinon, elle
  // remplace la recherche).
  const cancel = () => {
    write('')
    router.dismissTo('/explore')
  }

  const field = wide ? null : (
    <SearchField
      label={t(($) => $.search.label)}
      placeholder={t(($) => $.search.placeholder)}
      value={text}
      onChangeText={write}
      // Entrée ne fait rien de plus (la page cherche pendant qu'on tape) ; sur le web, elle garde
      // le focus dans le champ.
      onSubmit={() => {}}
      // On vient ici pour chercher : le curseur est déjà dans le champ.
      autoFocus
      // Sur téléphone, « Annuler » à côté du champ ; le champ le fait passer dessous quand le
      // texte est grand (SearchField, `action`).
      action={
        sizeClass === 'compact' ? (
          <Button
            label={t(($) => $.common.cancel)}
            variant="glass"
            size="compact"
            onPress={cancel}
          />
        ) : undefined
      }
    />
  )

  // Les mots à surligner : ceux de la recherche qui a donné les résultats affichés.
  const words = searchWords(searched)
  // Rien de cherchable dans le champ (moins de deux caractères, ou seulement des mots d'une
  // lettre) : on le dit, sans rien demander ni montrer de résultats d'avant.
  const tooShort = searchWords(text).length === 0
  const failed = !tooShort && (search.isError || (retrying && lastError.current !== null))
  const shownError = search.error ?? lastError.current
  const data = tooShort || failed ? undefined : search.data
  // Le texte tapé, une fois posé, contient un caractère que l'API refuse (un caractère invisible) :
  // rien ne peut correspondre. Pendant l'attente des 250 ms, `query` est encore l'ancien texte : on
  // ne conclut rien.
  const unsearchable =
    !tooShort && query === text && !SearchQuery.safeParse({ q: searched }).success

  const open = (event: PressEvent | undefined, path: string) => {
    // Une ligne-lien est un vrai `<a>` sur le web : c'est le routeur qui change de page, sans
    // recharger.
    event?.preventDefault?.()
    router.push(path)
  }

  const onRetry = () => {
    setRetrying(true)
    void search.refetch().finally(() => setRetrying(false))
  }

  const groups = data ? results(data) : null
  const found = groups ? GROUPS.some((group) => groups[group].count > 0) : false

  // Rien trouvé (ou rien qui puisse l'être) : l'abeille à la loupe dit « Aucun résultat ».
  const nothingFound = (groups !== null && !found) || unsearchable
  // Aucun mot de 3 lettres : l'API ne cherche alors que parmi les membres suivis (décision de Louis
  // du 30/10/2026, sec-B1 et jur-J1, la même règle que l'API, search/load.ts). « Aucun résultat »
  // le dit, sinon on croirait que la personne cherchée n'est pas membre (relecture juridique, C1).
  const onlyFollowed = words.length > 0 && words.every((word) => word.length < SEARCH_OTHERS_FROM)

  // « 3 projets, 1 membre, 0 outil » : les nombres d'une réponse (0 partout quand le texte ne peut
  // rien trouver).
  const counts = groups ?? results({ projects: none, members: none, tools: none })
  const summary = t(($) => $.search.summary, {
    projects: counts.projects.more
      ? t(($) => $.search.projectsMore, { max: counts.projects.count })
      : t(($) => $.search.projects, { count: counts.projects.count }),
    members: counts.members.more
      ? t(($) => $.search.membersMore, { max: counts.members.count })
      : t(($) => $.search.members, { count: counts.members.count }),
    tools: counts.tools.more
      ? t(($) => $.search.toolsMore, { max: counts.tools.count })
      : t(($) => $.search.tools, { count: counts.tools.count }),
  })

  // La ligne d'état, lue poliment par les lecteurs d'écran à chaque changement (relecture de
  // l'interface du plan, ui-7 ; LiveStatus, toujours montée) : « Tape au moins deux caractères »,
  // « Recherche en cours… », puis « 3 projets, 1 membre, 0 outil ». Une panne n'y ajoute rien : son
  // message est déjà une alerte.
  const status = tooShort
    ? t(($) => $.search.typeMore)
    : failed
      ? ''
      : groups || unsearchable
        ? summary
        : t(($) => $.search.searching)

  const tabLabel = (group: keyof SearchResults) => {
    const { count, more } = groups?.[group] ?? { count: 0, more: false }
    const name = t(($) => $.search.tabs[group])
    return {
      // Le nombre affiché (« 20+ ») reste hors du nom lu, qui le dit en toutes lettres.
      label: `${name} ${count}${more ? '+' : ''}`,
      spokenLabel: t(($) => $.search.tabWithCount, {
        tab: name,
        results: more
          ? t(($) => $.search.resultsMore, { max: count })
          : t(($) => $.search.results, { count }),
      }),
    }
  }

  const shows = (group: keyof SearchResults) =>
    (tab === 'all' || tab === group) && groups !== null && groups[group].count > 0

  return (
    <Screen
      title={t(($) => $.search.title)}
      // Le titre de l'onglet du navigateur ne reprend jamais le texte cherché (sec-A8).
      pageTitle={t(($) => $.search.title)}
      header={<TopNav />}
    >
      <Stack gap="lg" align="stretch">
        {field}

        {groups && found ? (
          <Segmented
            label={t(($) => $.search.tabsLabel)}
            value={tab}
            onChange={setTab}
            fill={false}
            options={[
              { value: 'all', label: t(($) => $.search.tabs.all) },
              ...GROUPS.map((group) => ({ value: group, ...tabLabel(group) })),
            ]}
          />
        ) : null}

        {/* Rien trouvé : « 0 projet, 0 membre, 0 outil » reste lu, mais ne se montre pas au-dessus
            de « Aucun résultat », qui le dit déjà à l'œil (relecture de design, 13). */}
        <LiveStatus message={status} visible={!nothingFound} />

        {failed ? (
          errorKey(shownError) === 'rateLimited' ? (
            <StateMessage
              kind="error"
              title={t(($) => $.search.tooManyTitle)}
              message={t(($) => $.search.tooMany)}
              actions={[{ label: t(($) => $.common.retry), onPress: onRetry, loading: retrying }]}
            />
          ) : (
            <StateMessage
              kind="error"
              title={t(($) => $.search.errorTitle)}
              message={t(($) => $.search.error)}
              actions={[{ label: t(($) => $.common.retry), onPress: onRetry, loading: retrying }]}
            />
          )
        ) : null}

        {nothingFound ? (
          // Rien trouvé : l'abeille à la loupe, et le texte cherché tel quel (les traductions ne
          // l'interprètent pas : i18n.ts neutralise les « {{ » des valeurs). Sous 3 lettres, le
          // conseil « Essaie un mot plus court » serait faux : la phrase dit plutôt qu'avec un mot
          // plus long, on trouve aussi les membres qu'on ne suit pas.
          <StateMessage
            kind="notFound"
            title={t(($) => $.search.emptyTitle, { q: query.trim() })}
            message={onlyFollowed ? t(($) => $.search.shortQuery) : t(($) => $.search.empty)}
          />
        ) : null}

        {data && shows('projects') ? (
          <ListGroup title={t(($) => $.search.tabs.projects)}>
            {data.projects.items.map((project) => {
              const path = `/projects/${project.id}`
              const statusLabel = t(($) => $.project.status[project.status])
              const mine = project.visibility === 'private'
              // Sous le titre : l'extrait de la description quand c'est elle qui a correspondu,
              // sinon l'auteur.
              const detail = project.excerpt
                ? t(($) => $.search.excerpt, { excerpt: project.excerpt })
                : project.author.name
              const pill = mine ? t(($) => $.member.private) : statusLabel
              return (
                <ListRow
                  key={project.id}
                  label={project.title}
                  title={<HighlightedText text={project.title} words={words} weight={600} />}
                  detail={
                    <HighlightedText
                      variant="callout"
                      tone="muted"
                      text={detail}
                      words={project.excerpt ? words : []}
                    />
                  }
                  // Le nom d'une ligne cache ce qu'elle contient : il dit aussi la pastille.
                  spokenLabel={t(($) => $.search.projectWithStatus, {
                    title: project.title,
                    status: pill,
                  })}
                  hint={detail}
                  trailing={
                    <StatusPill label={pill} strong={!mine && project.status === 'testable'} />
                  }
                  href={path}
                  onPress={(event) => open(event, path)}
                />
              )
            })}
          </ListGroup>
        ) : null}

        {data && shows('members') ? (
          <ListGroup title={t(($) => $.search.tabs.members)}>
            {data.members.items.map((member) => {
              const path = `/members/${member.id}`
              const meta = t(($) => $.search.memberMeta, {
                handle: member.handle,
                followers: t(($) => $.follow.followers, { count: member.followerCount }),
              })
              return (
                <ListRow
                  key={member.id}
                  label={member.name}
                  // La photo (ou les initiales) : un repère pour l'œil, comme sur la planche. Sans
                  // nom à elle : le nom de la ligne dit déjà qui c'est.
                  leading={
                    <Avatar
                      name={member.name}
                      source={toSource(member.avatarUrl)}
                      label=""
                      size={40}
                    />
                  }
                  title={<HighlightedText text={member.name} words={words} weight={600} />}
                  detail={
                    <HighlightedText variant="callout" tone="muted" text={meta} words={words} />
                  }
                  hint={meta}
                  trailing="chevron"
                  href={path}
                  onPress={(event) => open(event, path)}
                />
              )
            })}
          </ListGroup>
        ) : null}

        {data && shows('tools') ? (
          <ListGroup title={t(($) => $.search.tabs.tools)}>
            {data.tools.items.map((tool) => {
              const path = `/tags/${encodeURIComponent(tool.slug)}`
              const projects = t(($) => $.tools.projects, { count: tool.projectCount })
              return (
                <ListRow
                  key={tool.slug}
                  label={tool.label}
                  title={<HighlightedText text={tool.label} words={words} weight={600} />}
                  // La tuile à l'initiale, comme dans « Tous les outils » (ToolsScreen) : même outil,
                  // même teinte d'une page à l'autre.
                  leading={<InitialTile name={tool.label} variant={tileVariantOf(tool.slug)} />}
                  detail={projects}
                  spokenLabel={t(($) => $.tools.withCount, { label: tool.label, projects })}
                  trailing="chevron"
                  href={path}
                  onPress={(event) => open(event, path)}
                />
              )
            })}
          </ListGroup>
        ) : null}
      </Stack>
    </Screen>
  )
}

/** Un groupe vide, pour dire « 0 projet, 0 membre, 0 outil » sans réponse de l'API. */
const none = { items: [], more: false }

/** Le nombre de résultats de chaque groupe, et s'il y en avait plus de 20. */
const results = (data: SearchResults) => ({
  projects: { count: data.projects.items.length, more: data.projects.more },
  members: { count: data.members.items.length, more: data.members.more },
  tools: { count: data.tools.items.length, more: data.tools.more },
})
