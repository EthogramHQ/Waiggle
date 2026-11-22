// L'attente de l'onglet Ruches (R16), sortie de HivesScreen.tsx en R18 : la page vide des ruches,
// la même pendant l'arrivée du morceau de l'écran (`lazyScreen`, app/hives.tsx), pendant la lecture
// de la session (`SessionGate`) et pendant celle des ruches. Elle part dans le script de départ avec
// le fichier de la route : elle n'importe donc rien de l'écran lui-même, qui reste à la demande
// (relecture de design de R18 : le squelette commun, plus étroit, faisait rétrécir la barre du haut).
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { TopNav } from '../navigation/TopNav'
import { Button } from '../ui/Button'
import { CardGrid, useCardColumns, useWideTemplate } from '../ui/CardGrid'
import { HiveCardSkeleton, hiveCardGrid } from '../ui/HiveCard'
import { HiveRowSkeleton } from '../ui/HiveRow'
import { ListGroup } from '../ui/ListGroup'
import { Screen } from '../ui/Screen'
import { Loading } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useTapGuard } from '../ui/tapGuard'

/**
 * Les propriétés de la page communes à tous ses états : le titre « Ruches », lu mais jamais
 * affiché ; dès 1 280 points, le gabarit large de R15 (`width="wide"`), en dessous la largeur d'un
 * formulaire, comme avant R16. Le squelette les prend aussi : rien ne bouge à l'arrivée.
 */
export const usePageFrame = () => {
  const { t } = useTranslation()
  const wide = useWideTemplate()
  return {
    wide,
    frame: {
      title: t(($) => $.hives.title),
      titleHidden: true,
      header: <TopNav />,
      width: wide ? 'wide' : 'form',
    } as const,
  }
}

/** Les lignes vides de l'attente, sous 1 280 points. */
const LOADING_ROWS = 3

/**
 * L'attente (planche R16-Ruches-Squelette-1920) : « Créer une ruche » à sa place, « Mes ruches »,
 * puis une rangée de cartes vides aux colonnes de la page finie (4 à 1 920, 3 à 1 440) ; sous
 * 1 280, trois lignes vides de la forme des vraies. Aucune place pour les invitations : souvent
 * absentes, elles s'ajoutent au-dessus quand elles arrivent (choix 8 des planches).
 */
export function HivesLoading() {
  const { t } = useTranslation()
  const router = useRouter()
  const guard = useTapGuard()
  const { wide, frame } = usePageFrame()
  return (
    <Screen
      {...frame}
      // Déjà vrai pendant l'attente (la planche) : le titre caché ne laisse au haut de la page que
      // ce bouton, qui ne doit pas arriver après le reste.
      titleAside={
        <Button
          label={t(($) => $.hives.create)}
          icon="plus"
          variant="secondary"
          size="compact"
          onPress={guard(() => router.push('/hives/new'))}
        />
      }
    >
      <Stack gap="md" align="stretch">
        <Text variant="heading" heading={2}>
          {t(($) => $.hives.mine)}
        </Text>
        <Loading>
          {wide ? (
            <EmptyCardRow />
          ) : (
            <ListGroup>
              {Array.from({ length: LOADING_ROWS }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: des lignes vides identiques.
                <HiveRowSkeleton key={index} />
              ))}
            </ListGroup>
          )}
        </Loading>
      </Stack>
    </Screen>
  )
}

/**
 * Une rangée de cartes vides, autant que la grille aura de colonnes. Un composant à part, posé
 * dans la page : le nombre de colonnes se lit sur la largeur que `Screen` publie à son contenu.
 */
function EmptyCardRow() {
  const { columns } = useCardColumns(hiveCardGrid.minWidth, hiveCardGrid.gap)
  return (
    <CardGrid {...hiveCardGrid} list={false}>
      {Array.from({ length: columns }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides identiques.
        <HiveCardSkeleton key={index} />
      ))}
    </CardGrid>
  )
}
