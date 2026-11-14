// La colonne de droite du Fil sur ordinateur (R4, F-Fil11, planche R4-Fil-Desktop) : depuis R10,
// « Tes ruches » en tête (pour un membre d'au moins une ruche), puis « Proches à
// suivre » (trois lignes) puis « Ils cherchent des testeurs » (quelques projets à essayer, avec
// « Tester » en miel). Sous la mise en colonnes (téléphone, fenêtre étroite), il n'y a pas de
// colonne de droite : HomeScreen ne pose pas ce composant.
//
// Comme tout ce qui est dans feed/, ce fichier assemble des composants de ui/ sans écrire de style.
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { useMyHives } from '../hives/api'
import { useOpenDemo } from '../navigation/links'
import { PeopleToFollow } from '../suggestions/PeopleToFollow'
import { HiveRow } from '../ui/HiveRow'
import { ListGroup } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { TesterRow } from '../ui/TesterRow'
import { Text } from '../ui/Text'
import { useDiscoverFeed } from './api'

/** Trois proches à suivre dans la colonne (cinq au premier lancement, dans la colonne principale). */
const SIDE_SUGGESTIONS = 3
/** Trois projets à tester : la colonne reste courte, Explorer montre les autres. */
const SIDE_TESTERS = 3

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
}

export function FeedSide({ withSuggestions, shownProjectIds }: Props) {
  return (
    <Stack gap="xxl" align="stretch">
      {/* R10 (F-Fil11) : ses ruches d'abord, puis les proches à suivre et les testeurs. */}
      <YourHives />
      {/* stacked : la colonne n'a que 320 points ; en rangée, le nom n'y avait qu'une centaine de
          points, et un nom long prenait trois lignes (relecture design A1). Empilée, la ligne pose
          la photo et le nom, puis le projet, puis « Suivre » et « × ». */}
      {withSuggestions ? <PeopleToFollow max={SIDE_SUGGESTIONS} stacked /> : null}
      <Testers exclude={shownProjectIds} />
    </Stack>
  )
}

/**
 * « Tes ruches » (R10, F-Fil11, planche R4-Fil-Desktop) : chaque ruche du membre en ligne courte
 * (`HiveRow compact` : son alvéole, son nom, ses nouveautés), qui ouvre sa page. Les ruches sont
 * celles des pastilles du Fil, lues une seule fois (`useMyHives`, même cache que l'écran). Pendant
 * la lecture, sans ruche, ou si la lecture échoue, rien : ni titre ni cadre vide. Une panne ne
 * prive le membre de rien qu'il ne retrouve dans l'onglet Ruches, qui dit, lui, ce qui manque.
 */
function YourHives() {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const mine = useMyHives()
  const hives = mine.data?.hives ?? []
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
 * quelque part. Pendant la lecture, et quand il n'y en a aucun, rien : ni titre ni cadre vide.
 */
function Testers({ exclude }: { exclude: ReadonlySet<string> }) {
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
  if (projects.length === 0) return null

  return (
    <Stack gap="md" align="stretch">
      {title}
      <ListGroup>
        {projects.map(({ project, demoUrl }) => (
          <TesterRow
            key={project.id}
            title={project.title}
            author={project.author.name}
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
  )
}
