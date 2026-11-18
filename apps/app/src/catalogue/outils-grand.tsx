// La section « Outils en grand : cartes, liste en colonnes et pièces vides » du catalogue (tranche
// R16, planches R16-Outils-1920, 1440 et Squelette-1920), de jour puis de nuit :
// - la grille de « Les plus utilisés » (`ToolCardGrid`) avec des cartes d'outil (`ToolCard`) : un
//   outil très utilisé, un outil sans projet (« Aucun projet pour l'instant »), un nom long (sur deux
//   lignes : les cartes de sa rangée prennent sa hauteur), et une carte seule sur sa rangée, à la
//   largeur des autres ;
// - la même grille en cartes vides (`ToolCardSkeleton`), dans un `Loading` montré tout de suite ;
// - « De A à Z » en liste lue de haut en bas sur plusieurs colonnes (`ColumnList`), pleine puis avec
//   une dernière colonne plus courte ; et ses lignes vides ;
// - le champ et les familles (`ToolSearchBar`) : sur une ligne quand la place le permet, les
//   familles sous le champ sinon.
// La grille est posée dans une colonne de 1 200 points (cinq cartes, quatre colonnes de liste), comme
// si l'écran la lui publiait ; la barre sur une ligne, dans une colonne de 1 600. Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne. Ses libellés (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais ; les textes des composants
// viennent de l'appli.
import { radii, space } from '@ruche/brand'
import type { CatalogueTool, ToolFamily } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ColumnList } from '../ui/ColumnList'
import { FilterPills } from '../ui/FilterPills'
import { InitialTile } from '../ui/InitialTile'
import { ListRow, ListRowSkeleton } from '../ui/ListGroup'
import { SearchField } from '../ui/SearchField'
import { Loading } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import {
  ToolCard,
  ToolCardGrid,
  ToolCardSkeleton,
  ToolSearchBar,
  useToolText,
} from '../ui/ToolCard'
import { ContentWidthContext } from '../ui/theme/layout'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Outils en grand : cartes, liste en colonnes et pièces vides',
  intro:
    'ToolCardGrid range « Les plus utilisés » en cartes, cinq par rangée (ici une colonne de 1 200 points). ToolCard : un outil en carte, un seul lien nommé comme sa ligne. ColumnList : « De A à Z » lu de haut en bas, colonne après colonne. ToolSearchBar : le champ et les familles, sur une ligne quand ils y tiennent. Puis les pièces vides, sans rôle ni nom.',
  cards: 'Cartes d’outil : très utilisé, sans projet, nom long, une carte seule',
  cardsSkeleton: 'Cartes vides (ToolCardSkeleton), la lueur de colonne en colonne',
  columns: 'Liste en colonnes (ColumnList) : 14 lignes sur 4 colonnes, la dernière plus courte',
  columnsSkeleton: 'Lignes vides en colonnes (ListRowSkeleton dans ColumnList)',
  barOneLine: 'Le champ et les familles sur une ligne (colonne de 1 600 points)',
  barBelow: 'Les familles sous le champ (colonne de 1 200 points)',
  search: 'Chercher un outil',
  families: 'Familles',
  all: 'Tous',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Tools at full width: cards, list in columns and empty pieces',
  intro:
    'ToolCardGrid lays « Most used » out as cards, five per row (here a 1,200-point column). ToolCard: a tool as a card, one link named like its row. ColumnList: « A to Z » read top to bottom, column after column. ToolSearchBar: the field and the families, on one line when they fit. Then the empty pieces, with no role and no name.',
  cards: 'Tool cards: much used, without project, long name, a card alone',
  cardsSkeleton: 'Empty cards (ToolCardSkeleton), the glow from column to column',
  columns: 'List in columns (ColumnList): 14 rows on 4 columns, the last one shorter',
  columnsSkeleton: 'Empty rows in columns (ListRowSkeleton in ColumnList)',
  barOneLine: 'The field and the families on one line (1,600-point column)',
  barBelow: 'The families under the field (1,200-point column)',
  search: 'Search a tool',
  families: 'Families',
  all: 'All',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr

const schemes = ['day', 'night'] as const

/** La largeur de la colonne des exemples : cinq cartes, quatre colonnes de liste. */
const COLUMN = 1200
/** La largeur où le champ et les familles tiennent sur une ligne. */
const WIDE_COLUMN = 1600

const noop = () => {}

const tool = (
  slug: string,
  name: string,
  family: ToolFamily,
  projectCount: number,
): CatalogueTool => ({ slug, name, family, aliases: [], projectCount })

/** Les cartes de l'exemple, dans l'ordre de la légende (six : la sixième seule sur sa rangée). */
const cards: CatalogueTool[] = [
  tool('claude', 'Claude', 'assistant', 41),
  tool('bolt', 'Bolt', 'no-code', 0),
  tool('long', 'Teachable Machine de Google Creative Lab', 'creation', 12),
  tool('python', 'Python', 'development', 22),
  tool('mistral', 'Mistral', 'assistant', 12),
  tool('home-assistant', 'Home Assistant', 'smart-home', 9),
]

/** Les lignes de « De A à Z » de l'exemple : 14, soit 4, 4, 4 et 2. */
const rows: CatalogueTool[] = [
  tool('arduino', 'Arduino', 'hardware', 4),
  tool('bolt', 'Bolt', 'no-code', 4),
  tool('canva', 'Canva', 'creation', 3),
  tool('chatgpt', 'ChatGPT', 'assistant', 38),
  tool('claude', 'Claude', 'assistant', 41),
  tool('cursor', 'Cursor', 'development', 5),
  tool('gemini', 'Gemini', 'assistant', 10),
  tool('glide', 'Glide', 'no-code', 6),
  tool('home-assistant', 'Home Assistant', 'smart-home', 9),
  tool('lovable', 'Lovable', 'no-code', 34),
  tool('midjourney', 'Midjourney', 'creation', 11),
  tool('mistral', 'Mistral', 'assistant', 12),
  tool('n8n', 'n8n', 'automation', 8),
  tool('notion', 'Notion', 'no-code', 7),
]

const families: ToolFamily[] = ['assistant', 'creation', 'no-code', 'development', 'automation']

/** Une ligne d'outil, comme celle de l'écran. */
function Row({ item }: { item: CatalogueTool }) {
  const { detail, label } = useToolText(item)
  return (
    <ListRow
      label={item.name}
      spokenLabel={label}
      leading={<InitialTile name={item.name} />}
      detail={detail}
      trailing="chevron"
      href={`/tags/${item.slug}`}
      onPress={noop}
    />
  )
}

/** Le champ et les familles de l'exemple (rien ne s'y garde : un exemple). */
function Bar({ l }: { l: Labels }) {
  const { t } = useTranslation()
  return (
    <ToolSearchBar
      field={<SearchField label={l.search} placeholder={l.search} value="" onChangeText={noop} />}
      filters={
        <FilterPills
          label={l.families}
          allLabel={l.all}
          value={null}
          options={families.map((code) => ({
            value: code,
            label: t(($) => $.tools.familyPill[code]),
          }))}
          onChange={noop}
        />
      }
    />
  )
}

/** Un exemple légendé, sur le fond de la page (jour ou nuit), dans une colonne de cette largeur. */
function Example({
  caption,
  width = COLUMN,
  children,
}: {
  caption: string
  width?: number
  children: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <ContentWidthContext.Provider value={width}>
      <Stack gap="xs">
        <View
          style={{
            width: width + 2 * space.lg,
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
    </ContentWidthContext.Provider>
  )
}

export function ToolsWideCatalogue() {
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
          <Stack gap="lg">
            <Example caption={`${l.cards} — ${l[scheme]}`}>
              <ToolCardGrid>
                {cards.map((item) => (
                  <ToolCard
                    key={item.slug}
                    tool={item}
                    href={`/tags/${item.slug}`}
                    onPress={noop}
                  />
                ))}
              </ToolCardGrid>
            </Example>
            <Example caption={`${l.cardsSkeleton} — ${l[scheme]}`}>
              <Loading shown>
                <ToolCardGrid list={false}>
                  {Array.from({ length: 5 }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides identiques.
                    <ToolCardSkeleton key={index} />
                  ))}
                </ToolCardGrid>
              </Loading>
            </Example>
            <Example caption={`${l.columns} — ${l[scheme]}`}>
              <ColumnList>
                {rows.map((item) => (
                  <Row key={item.slug} item={item} />
                ))}
              </ColumnList>
            </Example>
            <Example caption={`${l.columnsSkeleton} — ${l[scheme]}`}>
              <Loading shown>
                <ColumnList>
                  {Array.from({ length: 8 }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: des lignes vides identiques.
                    <ListRowSkeleton key={index} leading="square" />
                  ))}
                </ColumnList>
              </Loading>
            </Example>
            <Example caption={`${l.barOneLine} — ${l[scheme]}`} width={WIDE_COLUMN}>
              <Bar l={l} />
            </Example>
            <Example caption={`${l.barBelow} — ${l[scheme]}`}>
              <Bar l={l} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
