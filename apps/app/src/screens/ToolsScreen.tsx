// « Outils » (refonte : R3, puis le catalogue normé de R6b ; docs/scenarios/refonte.md, « Tous les
// outils », planche R3-Outils) : un champ « Chercher un outil » et les pastilles des familles ; puis
// « Les plus utilisés » (les dix outils qui comptent le plus de projets) et « De A à Z » (tout le
// catalogue, dans l'ordre alphabétique de la langue), chaque outil avec sa famille et son nombre de
// projets, menant à sa page (/tags/<slug>). Le champ et les pastilles filtrent les deux listes. En
// bas, « Pas encore dans le catalogue » : les « Autre » des projets visibles, en texte simple, sans
// lien (ils n'ont pas de page).
//
// R16 (« Ruches, Recherche et Outils en grand » ; planches R16-Outils-1920, R16-Outils-1440 et
// R16-Outils-Squelette-1920) :
// - la garde de session commune (`SessionGate`) ;
// - le titre « Outils » n'est affiché à aucune largeur (« Chercher un outil » dit déjà où l'on est),
//   mais reste le titre de niveau 1 des lecteurs d'écran (`titleHidden`) ;
// - dès 1 280 points (`useWideTemplate`), le gabarit large de R15 (`Screen width="wide"`) : « Les
//   plus utilisés » en cartes, cinq par rangée (`ToolCardGrid`) ; « De A à Z » en une liste lue de
//   haut en bas sur plusieurs colonnes (`ColumnList`, 5 à 1 920, 4 à 1 440) ; le champ et les
//   familles sur une ligne quand ils y tiennent (`ToolSearchBar`) ;
// - sous 1 280, rien ne change : une colonne de lignes ;
// - pendant le chargement, le champ et « Tous » sont vrais (on peut taper avant que la liste
//   arrive), les titres aussi ; dessous, des cartes et des lignes vides aux places des vraies.
import { type CatalogueTool, foldTool, type ToolFamily, type ToolList } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useTools } from '../tools/api'
import { ColumnList } from '../ui/ColumnList'
import { FilterPills } from '../ui/FilterPills'
import { InitialTile } from '../ui/InitialTile'
import { ListBlock, ListGroup, ListRow, ListRowSkeleton, type PressEvent } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { Screen } from '../ui/Screen'
import { SearchField } from '../ui/SearchField'
import { Loading } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import {
  ToolCard,
  ToolCardGrid,
  ToolCardSkeleton,
  ToolSearchBar,
  useToolText,
} from '../ui/ToolCard'
import { useLayout } from '../ui/theme/layout'
import { useWideTemplate } from '../ui/theme/wideTemplate'

/** Le nombre d'outils de « Les plus utilisés » (planche R3-Outils). */
const MOST_USED_MAX = 10

/** Le squelette en grand (planche R16-Outils-Squelette-1920) : 2 rangées de 5 cartes, 20 lignes. */
const LOADING_CARDS = 10
const LOADING_ROWS_WIDE = 20
/** Sous 1 280 : cinq lignes vides d'une liste (plan R16, choix 11). */
const LOADING_ROWS = 5

export function ToolsScreen() {
  // R16 : la garde commune. Pendant la lecture de la session, la page qui charge, la même que
  // pendant celle des outils ; une session illisible propose de réessayer ; un visiteur, de se
  // connecter. La lecture des outils ne part qu'avec une session : elle vit dans `MemberTools`.
  return <SessionGate loading={<WaitingTools />}>{() => <MemberTools />}</SessionGate>
}

/**
 * Le cadre de la page, commun à tous ses états (chargement compris : rien ne bouge à l'arrivée) :
 * le titre « Outils », lu mais jamais affiché ; « Retour » ; dès 1 280 points, le gabarit large.
 */
function ToolsFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  // « Retour » mène à Explorer quand on arrive ici directement (un lien partagé).
  const back = useGoBack('/explore')
  const wide = useWideTemplate()
  return (
    <Screen
      title={t(($) => $.tools.title)}
      titleHidden
      pageTitle={t(($) => $.tools.title)}
      header={<TopNav />}
      onBack={back}
      // Sous 1 280, la largeur d'avant R16 (celle par défaut de `Screen`).
      {...(wide ? { width: 'wide' as const } : null)}
    >
      {children}
    </Screen>
  )
}

/** La page pendant la lecture de la session : le champ et sa saisie sont à elle seule. */
function WaitingTools() {
  const { i18n } = useTranslation()
  const [text, setText] = useState('')
  return (
    <ToolsFrame>
      <Catalogue
        list={undefined}
        text={text}
        onText={setText}
        family={null}
        onFamily={() => {}}
        language={i18n.language}
        onOpen={() => {}}
      />
    </ToolsFrame>
  )
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
  const tools = useTools()
  // Ce qui est tapé et la famille choisie (null : « Tous »), propres à cette visite : la page
  // revient entière quand on la rouvre. Ce qui est tapé pendant le chargement est gardé.
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
      // Le même composant que la page finie : le champ reste le même à l'arrivée de la liste (il
      // garde son focus et ce qui est tapé), seules les pièces vides laissent leur place.
      <Catalogue
        list={undefined}
        text={text}
        onText={setText}
        family={family}
        onFamily={setFamily}
        language={i18n.language}
        onOpen={() => {}}
      />
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
      language={i18n.language}
      onOpen={(slug) => router.push({ pathname: '/tags/[slug]', params: { slug } })}
    />
  )

  return <ToolsFrame>{content}</ToolsFrame>
}

/**
 * Le champ « Chercher un outil » et les familles. Pendant le chargement, `families` est vide :
 * seule « Tous » est là (les familles qui ont des outils ne se savent qu'avec la liste).
 */
function SearchAndFamilies({
  text,
  onText,
  family,
  onFamily,
  families,
}: {
  text: string
  onText: (text: string) => void
  family: ToolFamily | null
  onFamily: (family: ToolFamily | null) => void
  families: ToolFamily[]
}) {
  const { t } = useTranslation()
  const { sizeClass } = useLayout()
  return (
    <ToolSearchBar
      field={
        <SearchField
          label={t(($) => $.tools.search)}
          placeholder={t(($) => $.tools.search)}
          value={text}
          onChangeText={onText}
          // La page filtre pendant qu'on tape : Entrée ne fait rien de plus (sur le web, elle
          // garde le focus dans le champ).
          onSubmit={() => {}}
        />
      }
      filters={
        <FilterPills
          label={t(($) => $.tools.familiesLabel)}
          allLabel={t(($) => $.tools.all)}
          value={family}
          options={families.map((code) => ({
            value: code,
            label: t(($) => $.tools.familyPill[code]),
          }))}
          // Sur téléphone, les pastilles restent sur une ligne qui défile de côté.
          scroll={sizeClass === 'compact'}
          onChange={onFamily}
        />
      }
    />
  )
}

/**
 * Sous le champ, pendant le chargement : en grand, les deux titres et sous chacun ses pièces vides
 * (2 rangées de 5 cartes, 20 lignes réparties en colonnes) ; sous 1 280, cinq lignes vides. Les
 * titres restent hors de la zone « Chargement » : ils sont lus tout de suite.
 */
function LoadingSections({ wide }: { wide: boolean }) {
  const { t } = useTranslation()
  if (!wide)
    return (
      <Loading>
        <ListGroup>
          {Array.from({ length: LOADING_ROWS }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: des lignes vides identiques.
            <ListRowSkeleton key={index} leading="square" />
          ))}
        </ListGroup>
      </Loading>
    )
  return (
    <>
      <Section title={t(($) => $.tools.mostUsed)}>
        <Loading>
          <ToolCardGrid list={false}>
            {Array.from({ length: LOADING_CARDS }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides identiques.
              <ToolCardSkeleton key={index} />
            ))}
          </ToolCardGrid>
        </Loading>
      </Section>
      <Section title={t(($) => $.tools.aToZ)}>
        <Loading>
          <ColumnList>
            {Array.from({ length: LOADING_ROWS_WIDE }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: des lignes vides identiques.
              <ListRowSkeleton key={index} leading="square" />
            ))}
          </ColumnList>
        </Loading>
      </Section>
    </>
  )
}

/** Une section en grand : son titre (niveau 2), puis ce qu'elle contient. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="md" align="stretch">
      <Text variant="heading" heading={2}>
        {title}
      </Text>
      {children}
    </Stack>
  )
}

type CatalogueProps = {
  /** Le catalogue ; `undefined` tant qu'il charge (le champ et « Tous » sont déjà là). */
  list: ToolList | undefined
  text: string
  onText: (text: string) => void
  family: ToolFamily | null
  onFamily: (family: ToolFamily | null) => void
  /** La langue de l'appli, pour l'ordre alphabétique de « De A à Z ». */
  language: string
  onOpen: (slug: string) => void
}

/**
 * Le champ, les pastilles et les deux listes, quand le catalogue a au moins un outil ; le champ,
 * « Tous » et les pièces vides tant qu'il charge. Un seul composant pour les deux : à l'arrivée de
 * la liste, l'arbre du champ ne change pas (il garde son focus et ce qui est tapé).
 */
function Catalogue({ list, text, onText, family, onFamily, language, onOpen }: CatalogueProps) {
  const { t } = useTranslation()
  const wide = useWideTemplate()
  const tools = list?.tools ?? []
  // Les familles qui ont au moins un outil, dans l'ordre de l'API (pas de pastille vide).
  const families = [...new Set(tools.map((tool) => tool.family))]
  const shown = (tool: CatalogueTool) =>
    (family === null || tool.family === family) && matchesText([tool.name, ...tool.aliases], text)
  // Les dix plus utilisés du catalogue entier (l'API les range du plus au moins utilisé), puis
  // filtrés : le champ et les pastilles ne font pas entrer un outil moins utilisé dans les dix. Un
  // outil sans projet n'est jamais « le plus utilisé ».
  const mostUsed = tools
    .filter((tool) => tool.projectCount > 0)
    .slice(0, MOST_USED_MAX)
    .filter(shown)
  // L'ordre alphabétique de la langue : « cursor » et « Écrivain » se rangent parmi les autres,
  // sans tenir compte des capitales ni des accents (localeCompare, et non l'ordre des codes).
  const aToZ = tools
    .filter(shown)
    .sort((a, b) => a.name.localeCompare(b.name, language, { sensitivity: 'base' }))
  // « Aucun outil ne correspond » : seulement une fois la liste là (pendant le chargement, rien
  // n'est encore dit).
  const nothing = list !== undefined && aToZ.length === 0
  const rows = aToZ.map((tool) => <ToolRow key={tool.slug} tool={tool} onOpen={onOpen} />)
  const others = list ? (
    <OtherTools others={list.others} text={text} family={family} readable={wide} />
  ) : null

  return (
    <Stack gap={wide ? 'xxl' : 'xl'}>
      <Stack gap="md">
        <SearchAndFamilies
          text={text}
          onText={onText}
          family={family}
          onFamily={onFamily}
          families={families}
        />
        {/* Toujours montée, vide quand des outils correspondent : la phrase est lue dès qu'elle
            paraît, sans que le focus quitte le champ. */}
        <LiveStatus message={nothing ? t(($) => $.tools.noMatch) : ''} />
      </Stack>
      {list === undefined ? <LoadingSections wide={wide} /> : null}
      {mostUsed.length === 0 ? null : wide ? (
        <Section title={t(($) => $.tools.mostUsed)}>
          <ToolCardGrid>
            {mostUsed.map((tool) => (
              <ToolCard
                key={tool.slug}
                tool={tool}
                href={toolHref(tool)}
                onPress={openWith(tool, onOpen)}
              />
            ))}
          </ToolCardGrid>
        </Section>
      ) : (
        <ListGroup title={t(($) => $.tools.mostUsed)}>
          {mostUsed.map((tool) => (
            <ToolRow key={tool.slug} tool={tool} onOpen={onOpen} />
          ))}
        </ListGroup>
      )}
      {aToZ.length === 0 ? null : wide ? (
        <Section title={t(($) => $.tools.aToZ)}>
          <ColumnList>{rows}</ColumnList>
        </Section>
      ) : (
        <ListGroup title={t(($) => $.tools.aToZ)}>{rows}</ListGroup>
      )}
      {/* En grand, la phrase du pied se lit à la largeur d'une colonne de lecture (560 au plus). */}
      {others}
    </Stack>
  )
}

/** L'adresse de la page d'un outil. */
const toolHref = (tool: CatalogueTool) => `/tags/${encodeURIComponent(tool.slug)}`

/** Le geste d'une ligne ou d'une carte : sur le web, le routeur ouvre la page sans la recharger. */
const openWith = (tool: CatalogueTool, onOpen: (slug: string) => void) => (event?: PressEvent) => {
  event?.preventDefault?.()
  onOpen(tool.slug)
}

/** Une ligne d'outil : sa tuile, son nom, sa famille et son nombre ; elle mène à sa page. */
function ToolRow({ tool, onOpen }: { tool: CatalogueTool; onOpen: (slug: string) => void }) {
  const { detail, label } = useToolText(tool)
  return (
    <ListRow
      label={tool.name}
      // Le nom d'un lien cache le texte qu'il contient : il dit donc tout ce qui se voit, « Claude,
      // Assistant IA · 41 projets » (le même que la carte du même outil).
      spokenLabel={label}
      leading={<InitialTile name={tool.name} />}
      detail={detail}
      trailing="chevron"
      href={toolHref(tool)}
      onPress={openWith(tool, onOpen)}
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
  readable = false,
}: {
  others: ToolList['others']
  text: string
  family: ToolFamily | null
  /** En grand : la section garde la largeur d'une colonne de lecture (560 au plus), sa phrase aussi. */
  readable?: boolean
}) {
  const { t } = useTranslation()
  const shown = family === null ? others.filter((other) => matchesText([other.name], text)) : []
  if (shown.length === 0) return null
  const group = (
    <ListGroup title={t(($) => $.tools.others)} footer={t(($) => $.tools.othersHint)}>
      {/* Une case de pastilles, aux marges d'une ligne (ListBlock) : l'écran n'en écrit aucune. */}
      <ListBlock wrap>
        {shown.map((other) => (
          <Tag key={other.name} label={other.name} inCatalogue={false} />
        ))}
      </ListBlock>
    </ListGroup>
  )
  return readable ? <Stack readable>{group}</Stack> : group
}
