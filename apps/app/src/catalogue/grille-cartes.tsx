// La section « Ruches en grand : grille de cartes et pièces vides » du catalogue (tranche R16,
// planches R16-Ruches-1920, 1440 et Squelette-1920), de jour puis de nuit :
// - la grille de cartes commune (`CardGrid`) avec des cartes de ruche (`HiveCard`) : des nouveautés,
//   « rien de neuf », sans visages, un nom retiré par la modération, un nom de 40 caractères (sur
//   deux lignes : les cartes de sa rangée prennent sa hauteur, leur bas reste aligné), et une
//   cinquième carte seule sur sa rangée, à la largeur des autres ;
// - la même grille en cartes vides (`HiveCardSkeleton`), dans un `Loading` montré tout de suite ;
// - les lignes vides d'une ruche (`HiveRowSkeleton`), pleine et courte (« Tes ruches » du Fil) ;
// - les pastilles vides du filtre du Fil (`HivePillsSkeleton`).
// La grille est posée dans une colonne de 900 points (deux cartes de 400 au moins par rangée), comme
// si l'écran la lui publiait. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne :
// plusieurs personnes y travaillent en même temps. Ses libellés (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais ; les textes des composants
// viennent de l'appli.
import { radii, space } from '@ruche/brand'
import type { HiveSummary } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { CardGrid } from '../ui/CardGrid'
import { HiveCard, HiveCardSkeleton, hiveCardGrid } from '../ui/HiveCard'
import { HivePillsSkeleton } from '../ui/HivePills'
import { HiveRowSkeleton } from '../ui/HiveRow'
import { ListGroup } from '../ui/ListGroup'
import { Loading } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ContentWidthContext } from '../ui/theme/layout'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Ruches en grand : grille de cartes et pièces vides',
  intro:
    'CardGrid range des cartes en rangées, autant de colonnes que la place en tient (ici une colonne de 900 points : deux cartes de 400 au moins). HiveCard : une ruche en carte, un seul lien nommé comme sa ligne. Puis les pièces vides de l’onglet Ruches et du Fil, sans rôle ni nom.',
  cards:
    'Cartes de ruche : nouveautés, rien de neuf, sans visages, nom retiré, nom de 40 caractères, une carte seule',
  skeleton: 'Cartes vides (HiveCardSkeleton), la lueur de colonne en colonne',
  rows: 'Lignes vides d’une ruche (HiveRowSkeleton), pleine puis courte',
  pills: 'Pastilles vides du filtre du Fil (HivePillsSkeleton)',
  longName: 'Les cousins de la côte atlantique, amis',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Hives at full width: card grid and empty pieces',
  intro:
    'CardGrid lays cards out in rows, as many columns as the room holds (here a 900-point column: two cards of at least 400). HiveCard: a hive as a card, one link named like its row. Then the empty pieces of the Hives tab and of the Feed, with no role and no name.',
  cards: 'Hive cards: news, nothing new, no faces, name removed, 40-character name, a card alone',
  skeleton: 'Empty cards (HiveCardSkeleton), the glow from column to column',
  rows: 'Empty hive rows (HiveRowSkeleton), full then short',
  pills: 'Empty pills of the Feed filter (HivePillsSkeleton)',
  longName: 'The cousins from the Atlantic coast, pals',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr

const schemes = ['day', 'night'] as const

/** La largeur de la colonne de l'exemple : deux cartes de ruche par rangée. */
const COLUMN = 900

const noop = () => {}

const family: HiveSummary = {
  id: '0f5b8a64-2c1e-4c55-9d1a-6b7e4a3c2d10',
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: 'u-jean', name: 'Papi Jean' },
  faces: [
    { id: 'u-jean', name: 'Papi Jean', avatarUrl: null },
    { id: 'u-lea', name: 'Léa Moreau', avatarUrl: null },
    { id: 'u-odile', name: 'Tante Odile', avatarUrl: null },
  ],
  news: 2,
  role: 'member',
}

/** Les cartes de l'exemple, dans l'ordre de la légende. */
const hivesOf = (l: Labels): HiveSummary[] => [
  family,
  { ...family, id: 'thursday', name: 'Amis du jeudi', icon: 'users-three', news: 0 },
  { ...family, id: 'alone', name: 'Club lecture', icon: 'book-open', faces: [], news: 1 },
  { ...family, id: 'unnamed', name: null, icon: 'leaf', news: 12 },
  { ...family, id: 'long', name: l.longName, icon: 'music-notes', news: 3, animator: null },
]

/** Un exemple légendé, sur le fond de la page (jour ou nuit). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <Stack gap="xs">
      <View
        style={{
          width: COLUMN + 2 * space.lg,
          maxWidth: '100%',
          padding: space.lg,
          borderRadius: radii.group,
          backgroundColor: colors.background,
        }}
      >
        {children}
      </View>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

export function CardGridCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <ContentWidthContext.Provider value={COLUMN}>
            <Stack gap="lg">
              <Example caption={`${l.cards} — ${l[scheme]}`}>
                <CardGrid {...hiveCardGrid}>
                  {hivesOf(l).map((hive) => (
                    <HiveCard key={hive.id} hive={hive} onPress={noop} />
                  ))}
                </CardGrid>
              </Example>
              <Example caption={`${l.skeleton} — ${l[scheme]}`}>
                <Loading shown>
                  <CardGrid {...hiveCardGrid} list={false}>
                    <HiveCardSkeleton key="a" />
                    <HiveCardSkeleton key="b" />
                  </CardGrid>
                </Loading>
              </Example>
              <Example caption={`${l.rows} — ${l[scheme]}`}>
                <Loading shown>
                  <ListGroup>
                    <HiveRowSkeleton key="full" />
                    <HiveRowSkeleton key="compact" compact />
                  </ListGroup>
                </Loading>
              </Example>
              <Example caption={`${l.pills} — ${l[scheme]}`}>
                <HivePillsSkeleton />
              </Example>
            </Stack>
          </ContentWidthContext.Provider>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
