// La colonne de droite du Fil sur ordinateur (R4, F-Fil11, planche R4-Fil-Desktop) : depuis R10,
// « Tes ruches » en tête (pour un membre d'au moins une ruche), puis « Proches à
// suivre » (trois lignes) puis « Ils cherchent des testeurs » (quelques projets à essayer, avec
// « Tester » en miel). Sous la mise en colonnes (téléphone, fenêtre étroite), il n'y a pas de
// colonne de droite : HomeScreen ne pose pas ce composant.
//
// Comme tout ce qui est dans feed/, ce fichier assemble des composants de ui/ sans écrire de style.
import type { HiveSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { useMyHives } from '../hives/api'
import { useOpenDemo } from '../navigation/links'
import { useSuggestions } from '../suggestions/api'
import { PeopleToFollow } from '../suggestions/PeopleToFollow'
import { HiveRow } from '../ui/HiveRow'
import { ListGroup, ListRowSkeleton } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Reveal } from '../ui/Reveal'
import { Loading } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { SuggestionRowSkeleton } from '../ui/SuggestionList'
import { Surface } from '../ui/Surface'
import { TesterRow } from '../ui/TesterRow'
import { Text } from '../ui/Text'
import { useDiscoverFeed } from './api'

/** Trois proches à suivre dans la colonne (cinq au premier lancement, dans la colonne principale). */
const SIDE_SUGGESTIONS = 3
/** Trois projets à tester : la colonne reste courte, Explorer montre les autres. */
const SIDE_TESTERS = 3
/**
 * R16 : les lignes vides de « Tes ruches » pendant leur lecture. On ne sait pas encore combien il y
 * en aura : trois, comme sur la planche R16-Fil-1440.
 */
const SIDE_HIVES = 3

type Props = {
  /**
   * Montrer « Proches à suivre ». Au premier lancement, la colonne principale les montre déjà (cinq
   * lignes) : la colonne de droite ne les répète pas et garde « Ils cherchent des testeurs » seule
   * (décision de R4).
   */
  withSuggestions: boolean
  /**
   * Les projets déjà affichés en carte dans le fil : la colonne ne les propose pas une seconde fois
   * (deux liens du même nom sur la page, et une ligne qui n'apprend rien).
   */
  shownProjectIds: ReadonlySet<string>
  /**
   * R16 : les lignes vides se montrent tout de suite, sans les 160 ms d'attente de `Loading` : la
   * colonne prend la suite de la colonne vide déjà à l'écran pendant la lecture de la session.
   */
  skeletonShown?: boolean
}

export function FeedSide({ withSuggestions, shownProjectIds, skeletonShown = false }: Props) {
  // Ses ruches, lues une seule fois (`useMyHives`, même cache que les pastilles du Fil).
  const mine = useMyHives()
  const hives = mine.data?.hives ?? []
  // R16 : la colonne est posée tout de suite, chaque section avec son titre et ses lignes vides
  // (planche R16-Fil-1440). Avant, elle attendait ses ruches, vide (relecture du design de R10 :
  // « Tes ruches » arrivait en tête et poussait le reste sous le pointeur) ; maintenant « Tes
  // ruches » garde sa place dès le début. Une lecture ratée, ou aucune ruche : la section part, sans
  // titre ni cadre vide.
  return (
    <Stack gap="xxl" align="stretch">
      {/* R10 (F-Fil11) : ses ruches d'abord, puis les proches à suivre et les testeurs. */}
      {mine.isPending || hives.length > 0 ? (
        <Reveal
          loading={mine.isPending}
          skeleton={<SideSkeleton section="hives" shown={skeletonShown} />}
        >
          <YourHives hives={hives} />
        </Reveal>
      ) : null}
      {withSuggestions ? <Suggestions shown={skeletonShown} /> : null}
      <Testers exclude={shownProjectIds} shown={skeletonShown} />
    </Stack>
  )
}

/**
 * R16 : la colonne vide, pendant la lecture de la session (avant que le Fil sache qui le lit et
 * puisse rien demander à l'API). Les trois sections, avec leurs titres et leurs lignes vides, aux
 * places de `FeedSide`.
 */
export function FeedSideSkeleton() {
  return (
    <Stack gap="xxl" align="stretch">
      <SideSkeleton section="hives" />
      <SideSkeleton section="suggestions" />
      <SideSkeleton section="testers" />
    </Stack>
  )
}

/**
 * Ce que dessine chaque section vide : son titre, et des lignes vides de la forme des siennes (la
 * photo ou l'alvéole ronde, la vignette carrée d'un projet ; à droite, la pastille de « Suivre » ou
 * de « Tester »), autant qu'elle en montrera au plus.
 */
const SIDE_SECTIONS = {
  hives: { rows: SIDE_HIVES, leading: 'round' },
  suggestions: { rows: SIDE_SUGGESTIONS, leading: 'round' },
  testers: { rows: SIDE_TESTERS, leading: 'square' },
} as const

/**
 * Une section de la colonne qui charge. Son titre est le vrai, lisible hors du « Chargement… » (un
 * titre dans une zone `progressbar` ne serait plus lu : la zone n'a qu'un nom) ; ses lignes vides
 * dans le groupe blanc d'une vraie liste, sous un seul `Loading`.
 */
function SideSkeleton({
  section,
  shown = false,
}: {
  section: keyof typeof SIDE_SECTIONS
  shown?: boolean
}) {
  const { t } = useTranslation()
  const { rows, leading } = SIDE_SECTIONS[section]
  const title =
    section === 'hives'
      ? t(($) => $.hives.side)
      : section === 'suggestions'
        ? t(($) => $.feed.side.suggestions)
        : t(($) => $.feed.side.testers)
  return (
    <Stack gap="md" align="stretch">
      <Text variant="heading" heading={2}>
        {title}
      </Text>
      <Loading shown={shown}>
        <ListGroup>
          {Array.from({ length: rows }, (_, index) =>
            // Les proches à suivre ont leur ligne vide à elles, à la hauteur d'une vraie suggestion
            // empilée (une ligne de liste en ferait 72 au lieu de ~149 : la section sautait à l'arrivée).
            section === 'suggestions' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
              <SuggestionRowSkeleton key={index} stacked />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
              <ListRowSkeleton key={index} leading={leading} trailing="pill" />
            ),
          )}
        </ListGroup>
      </Loading>
    </Stack>
  )
}

/**
 * Hook : vrai une fois qu'une lecture a abouti, en bien ou en mal, et ensuite pour toute la visite.
 * React Query v5 efface l'erreur pendant qu'on relance une lecture ratée (« Réessayer ») : sans ce
 * verrou, la section repasserait en lignes vides sous le doigt, et le focus partirait avec
 * « Réessayer ».
 */
const useSettled = (settledNow: boolean) => {
  const [settled, setSettled] = useState(settledNow)
  // Rempli pendant le rendu (comme useReadBefore) : aucun rendu intermédiaire sans la décision.
  if (settledNow && !settled) setSettled(true)
  return settled || settledNow
}

/**
 * « Proches à suivre » dans la colonne : ses lignes vides pendant la lecture (la section arrivait
 * seule et poussait les testeurs vers le bas), puis la liste (`PeopleToFollow`, qui a son titre).
 * Rien à suggérer : ni titre ni cadre vide.
 */
function Suggestions({ shown }: { shown: boolean }) {
  // La même lecture que `PeopleToFollow` (même clé : React Query ne la fait qu'une fois).
  const suggestions = useSuggestions()
  const settled = useSettled(suggestions.data !== undefined || suggestions.isError)
  // Seulement sur une liste lue et vide : pendant « Réessayer », sans données, `PeopleToFollow`
  // reste monté (il garde son message et son bouton).
  if (suggestions.data !== undefined && suggestions.data.members.length === 0) return null
  return (
    <Reveal loading={!settled} skeleton={<SideSkeleton section="suggestions" shown={shown} />}>
      {/* stacked : la colonne est étroite (340 points depuis R15, le panneau) ; en rangée, le nom
          n'y avait qu'une centaine de points, et un nom long prenait trois lignes (relecture
          design A1). Empilée, la ligne pose la photo et le nom, puis le projet, puis « Suivre »
          et « × ». */}
      <PeopleToFollow max={SIDE_SUGGESTIONS} stacked />
    </Reveal>
  )
}

/**
 * « Tes ruches » (R10, F-Fil11, planche R4-Fil-Desktop) : chaque ruche du membre en ligne courte
 * (`HiveRow compact` : son alvéole, son nom, ses nouveautés), qui ouvre sa page. Les ruches sont
 * celles des pastilles du Fil, lues par FeedSide. Sans ruche, ou si la lecture échoue, rien : ni
 * titre ni cadre vide. Une panne ne prive le membre de rien qu'il ne retrouve dans l'onglet Ruches,
 * qui dit, lui, ce qui manque.
 */
function YourHives({ hives }: { hives: readonly HiveSummary[] }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  if (hives.length === 0) return null
  return (
    <Stack gap="md" align="stretch">
      <Text variant="heading" heading={2}>
        {t(($) => $.hives.side)}
      </Text>
      {/* Le même cadre groupé que la liste de l'onglet Ruches (catalogue/ruches-lignes.tsx). */}
      <Surface variant="grouped" padding="xs">
        {hives.map((hive) => (
          <HiveRow
            key={hive.id}
            hive={hive}
            compact
            toSource={toSource}
            onPress={() => router.push({ pathname: '/hives/[id]', params: { id: hive.id } })}
          />
        ))}
      </Surface>
    </Stack>
  )
}

/**
 * « Ils cherchent des testeurs » : la première page des projets testables (jamais la suite : la
 * colonne ne se charge pas sans fin, jur-J7), ceux qui ont une démo, puisque « Tester » doit mener
 * quelque part. R16 : pendant la lecture, son titre et ses lignes vides (la section garde sa
 * hauteur) ; quand il n'y en a aucun, rien : ni titre ni cadre vide.
 */
function Testers({ exclude, shown }: { exclude: ReadonlySet<string>; shown: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const openDemo = useOpenDemo()
  const toSource = useMediaSources()
  const feed = useDiscoverFeed({ testers: true })
  // React Query v5 : relancer une lecture en échec, sans données, efface l'erreur pendant la
  // relecture. Sans cet état, le message et « Réessayer » disparaîtraient sous le doigt, et le
  // focus du clavier avec eux.
  const [retrying, setRetrying] = useState(false)
  const title = (
    <Text variant="heading" heading={2}>
      {t(($) => $.feed.side.testers)}
    </Text>
  )

  if (!feed.data && (feed.isError || retrying)) {
    return (
      <Stack gap="md" align="stretch">
        {title}
        <Notice
          message={t(($) => $.explore.testersError)}
          action={{
            label: t(($) => $.common.retry),
            onPress: () => {
              setRetrying(true)
              void feed.refetch().finally(() => setRetrying(false))
            },
          }}
        />
      </Stack>
    )
  }
  const projects = (feed.data?.pages[0]?.items ?? [])
    .flatMap((item) =>
      item.kind === 'project' && item.project.demoUrl && !exclude.has(item.project.id)
        ? [{ project: item.project, demoUrl: item.project.demoUrl }]
        : [],
    )
    .slice(0, SIDE_TESTERS)
  // Pas encore lu (ni en panne, ni relancé après une panne : le message ci-dessus garde sa place).
  const loading = !feed.data && !feed.isError
  if (!loading && projects.length === 0) return null

  return (
    <Reveal loading={loading} skeleton={<SideSkeleton section="testers" shown={shown} />}>
      <Stack gap="md" align="stretch">
        {title}
        <ListGroup>
          {projects.map(({ project, demoUrl }) => (
            <TesterRow
              key={project.id}
              title={project.title}
              author={project.author.name}
              // R12b : « Exemple » sur un projet du compte d'exemples de l'équipe.
              example={project.author.example === true}
              image={
                project.cover
                  ? {
                      source: toSource(project.cover.url),
                      thumbhash: project.cover.thumbhash,
                      label: project.title,
                    }
                  : null
              }
              // La démo passe par la page d'avertissement des liens externes (« Tu quittes… »,
              // relecture de sécurité sec-A7), jamais tout droit.
              onTest={() => openDemo(demoUrl, project.id)}
              // La vignette, le titre et l'auteur ouvrent la page du projet, comme dans Explorer.
              onOpen={() => router.push({ pathname: '/projects/[id]', params: { id: project.id } })}
            />
          ))}
        </ListGroup>
      </Stack>
    </Reveal>
  )
}
