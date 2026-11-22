// Le cadre de la page de recherche et ses résultats vides (R16, planche R16-Recherche-Squelette-1920),
// sortis de SearchScreen.tsx en R18 : la même attente pendant l'arrivée du morceau de l'écran
// (`lazyScreen`, app/search.tsx) et pendant la lecture de la session (`SessionGate`). Sur
// ordinateur, le squelette commun, plus étroit que le gabarit large, faisait rétrécir la barre du
// haut, puis se réélargir (relecture de design de R18). Ce module part dans le script de départ
// avec la route : il n'importe rien de l'écran, ni ses lectures de l'API.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TopNav } from '../navigation/TopNav'
import { Columns } from '../ui/Columns'
import { ListGroup, ListRowSkeleton } from '../ui/ListGroup'
import { ProjectCardSkeleton } from '../ui/ProjectCard'
import { GridCardsContext, ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { SidePanel } from '../ui/SidePanel'
import { Loading } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useWideTemplate } from '../ui/theme/wideTemplate'

/**
 * R16 (choix 9 des planches) : pendant la recherche, huit cartes vides (deux rangées à 1 920), deux
 * membres et un outil vides, avant de connaître les nombres.
 */
const SKELETON_PROJECTS = 8
const SKELETON_MEMBERS = 2
const SKELETON_TOOLS = 1
/** Les lignes vides de la page qui attend la session, sous 1 280 points (une liste). */
const SKELETON_ROWS = 5

/** Le cadre de la page, le même pour l'attente de la session et pour les résultats. */
export function SearchPage({ wide, children }: { wide: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Screen
      // R16 : le gabarit large dès 1 280 points ; en dessous, la colonne d'aujourd'hui.
      {...(wide ? { width: 'wide' as const } : null)}
      title={t(($) => $.search.title)}
      // R16 (« Moins de mots », décision de Louis du 17/11) : le titre n'est affiché à aucune
      // largeur ; il reste le titre de niveau 1 des lecteurs d'écran.
      titleHidden
      // Le titre de l'onglet du navigateur ne reprend jamais le texte cherché (sec-A8).
      pageTitle={t(($) => $.search.title)}
      header={<TopNav />}
    >
      {children}
    </Screen>
  )
}

/**
 * R16 : la page pendant la lecture de la session. Rien n'y lit l'API : on ne sait pas encore qui
 * regarde. Une seule zone « Chargement… » (comme toute page gardée) : en grand, la forme de la
 * planche (« Projets », huit cartes vides, le panneau) ; en dessous, une liste de lignes vides.
 */
export function SearchWaiting() {
  const large = useWideTemplate()
  return (
    <SearchPage wide={large}>
      <Loading>
        {large ? (
          <ResultsSkeleton whole />
        ) : (
          <ListGroup>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
              <ListRowSkeleton key={index} />
            ))}
          </ListGroup>
        )}
      </Loading>
    </SearchPage>
  )
}

/**
 * R16 (planche R16-Recherche-Squelette-1920) : les résultats en grand, vides. Les titres sont vrais,
 * hors des zones « Chargement… » ; chaque zone (la grille, les membres, les outils) a la sienne.
 * `whole` : la page entière est déjà une seule zone qui charge (l'attente de la session) ; les
 * pièces se posent alors sans zone à elles.
 */
export function ResultsSkeleton({ whole = false }: { whole?: boolean }) {
  const { t } = useTranslation()
  const zone = (pieces: ReactNode) => (whole ? pieces : <Loading>{pieces}</Loading>)
  // Les lignes vides d'un groupe du panneau, dans le groupe blanc qui porte son vrai titre : le
  // titre reste hors de la zone « Chargement… », posée dans le groupe, autour des seules lignes.
  const rows = (title: string, count: number, leading: 'round' | 'square') => (
    <ListGroup title={title}>
      {zone(
        Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
          <ListRowSkeleton key={index} leading={leading} />
        )),
      )}
    </ListGroup>
  )
  return (
    <Columns
      sideWidth="panel"
      main={
        <ProjectsSection>
          {zone(
            <ProjectGrid>
              {Array.from({ length: SKELETON_PROJECTS }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides, jamais réordonnées.
                <ProjectCardSkeleton key={index} />
              ))}
            </ProjectGrid>,
          )}
        </ProjectsSection>
      }
      side={
        <SidePanel>
          {rows(
            t(($) => $.search.tabs.members),
            SKELETON_MEMBERS,
            'round',
          )}
          {rows(
            t(($) => $.search.tabs.tools),
            SKELETON_TOOLS,
            'square',
          )}
        </SidePanel>
      }
    />
  )
}

/**
 * R16 : « Projets » en grand, son titre de section (comme « Récents » d'Explorer, choix 5 des
 * planches), puis sa grille de cartes compactes (`GridCardsContext`) : la grille compte ses colonnes
 * dans la largeur que lui laisse le panneau (`ui/ProjectGrid`), quatre à 1 920, trois à 1 440.
 */
export function ProjectsSection({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <GridCardsContext.Provider value="compact">
      <Stack gap="md" align="stretch">
        <Text variant="heading" heading={2}>
          {t(($) => $.search.tabs.projects)}
        </Text>
        {children}
      </Stack>
    </GridCardsContext.Provider>
  )
}
