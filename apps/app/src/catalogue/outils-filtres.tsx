// La section « Outils : filtres et mosaïque » du catalogue (tranche R6b, U2) : la rangée de
// pastilles de filtre (FilterPills) dans tous ses états, puis la mosaïque de tuiles (TileMosaic) en
// deux et en quatre colonnes. Pour FilterPills : « Toutes » coché (aucun filtre), une catégorie
// cochée, des pastilles avec leur nombre (lu « Cuisine, 3 projets »), le statut puis les catégories
// séparés par un trait (la page d'un outil sur ordinateur), la bande qui défile d'un téléphone (la
// pastille cochée, la dernière, se montre en entier), et une colonne étroite où les pastilles
// passent à la ligne (le texte à 200 %). Pour TileMosaic : sept projets (la dernière rangée est
// courte), des rangées hautes et basses en alternance, des teintes et des photos mêlées, un titre
// long. Jour et nuit ; le premier exemple se manipule.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { type FilterPillGroup, type FilterPillOption, FilterPills } from '../ui/FilterPills'
import type { IconName } from '../ui/Icon'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ProjectTile, type TileVariant } from '../ui/Tile'
import { TileMosaic } from '../ui/TileMosaic'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Outils : filtres et mosaïque',
  intro:
    'FilterPills : « Toutes » d’abord (aucun filtre, la valeur null), puis chaque choix ; une seule pastille cochée, en miel. Un groupe de radios nommé : un seul arrêt de Tab, la barre d’espace coche, les flèches passent à la voisine. Le nombre se voit après le nom et se lit dans le nom. TileMosaic : les tuiles en rangées, dans l’ordre des projets (celui de Tab et du lecteur d’écran), chacune à la largeur de sa colonne.',
  live: 'À manipuler : choisir une catégorie, puis « Toutes »',
  none: 'Aucun filtre : « Toutes » cochée',
  checked: 'Une catégorie cochée',
  counts: 'Avec leur nombre (la feuille des catégories), lu « Cuisine, 3 projets »',
  groups: 'Le statut, puis les catégories, séparés par un trait (page d’un outil, ordinateur)',
  scroll:
    'Bande qui défile (scroll, 320 points ici, un téléphone) : la pastille cochée, la dernière, se montre en entier',
  narrow:
    'Colonne étroite (150 points ici, le texte à 200 %) : les pastilles passent à la ligne, un nom long dans sa pastille',
  mosaic2: 'Mosaïque en deux colonnes (téléphone, 390 points ici)',
  mosaic2Narrow: 'Mosaïque en deux colonnes à 320 points',
  mosaic4: 'Mosaïque en quatre colonnes (ordinateur)',
  categories: {
    cooking: 'Cuisine',
    animals: 'Animaux',
    learning: 'Apprendre',
    money: 'Argent et budget',
    family: 'Famille et enfants',
    science: 'Sciences et espace',
  },
  projects: [
    ['Carnet de cafés', 'Sam Petit'],
    ['Quel papillon ?', 'Hugo Lefèvre'],
    ['Mon agent de recettes qui range aussi le frigo et prévoit les courses', 'Inès Garnier'],
    ['Arrosage malin', 'Yann Le Goff'],
    ['Devine la plante', 'Élodie Martin'],
    ['Budget des vacances', 'Sam Petit'],
    ['Lampe qui écoute', 'Hugo Lefèvre'],
  ],
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Tools: filters and mosaic',
  intro:
    'FilterPills: “All” first (no filter, the null value), then each choice; a single checked pill, in honey. A named radio group: a single Tab stop, the space bar checks, the arrows move to the neighbour. The count shows after the name and is read in the name. TileMosaic: the tiles in rows, in the order of the projects (the order of Tab and of the screen reader), each one as wide as its column.',
  live: 'Try it: choose a category, then “All”',
  none: 'No filter: “All” checked',
  checked: 'A category checked',
  counts: 'With their count (the category sheet), read “Cooking, 3 projects”',
  groups: 'The status, then the categories, split by a line (a tool page, computer)',
  scroll:
    'Scrolling strip (scroll, 320 points here, a phone): the checked pill, the last one, shows in full',
  narrow:
    'Narrow column (150 points here, text at 200%): the pills wrap, a long name inside its pill',
  mosaic2: 'Mosaic in two columns (phone, 390 points here)',
  mosaic2Narrow: 'Mosaic in two columns at 320 points',
  mosaic4: 'Mosaic in four columns (computer)',
  categories: {
    cooking: 'Cooking',
    animals: 'Animals',
    learning: 'Learning',
    money: 'Money and budget',
    family: 'Family and kids',
    science: 'Science and space',
  },
  projects: [
    ['Coffee notebook', 'Sam Petit'],
    ['Which butterfly?', 'Hugo Lefèvre'],
    ['My recipe agent that also tidies the fridge and plans the shopping', 'Inès Garnier'],
    ['Smart watering', 'Yann Le Goff'],
    ['Guess the plant', 'Élodie Martin'],
    ['Holiday budget', 'Sam Petit'],
    ['The listening lamp', 'Hugo Lefèvre'],
  ],
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
type Code = keyof Labels['categories']
type Status = 'testable' | 'done'

/** Les catégories de l'exemple, avec leur icône et un nombre de projets, comme GET /v1/categories. */
const CATEGORIES: { code: Code; icon: IconName; count: number }[] = [
  { code: 'cooking', icon: 'cooking-pot', count: 3 },
  { code: 'animals', icon: 'paw-print', count: 1 },
  { code: 'learning', icon: 'graduation-cap', count: 12 },
  { code: 'money', icon: 'piggy-bank', count: 2 },
  { code: 'family', icon: 'users-three', count: 5 },
  { code: 'science', icon: 'planet', count: 7 },
]

/** Une photo floue d'attente (thumbhash), sans image chargée : la tuile montre sa photo. */
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow

/** La teinte et la photo de chaque tuile, dans l'ordre des projets. */
const LOOKS: { variant: TileVariant; photo: boolean }[] = [
  { variant: 'honey', photo: true },
  { variant: 'cream', photo: false },
  { variant: 'honey', photo: false },
  { variant: 'ink', photo: false },
  { variant: 'cream', photo: true },
  { variant: 'honey', photo: false },
  { variant: 'ink', photo: true },
]

const noop = () => {}

/** Les choix des catégories, avec ou sans leur nombre (lu dans le nom, par les textes de l'appli). */
const useCategoryOptions = (l: Labels, withCount = false): FilterPillOption<Code>[] => {
  const { t } = useTranslation()
  return CATEGORIES.map(({ code, icon, count }) => {
    const label = l.categories[code]
    return withCount
      ? {
          value: code,
          label,
          icon,
          count,
          spokenLabel: t(($) => $.tool.categoryWithCount, {
            name: label,
            projects: t(($) => $.tools.projects, { count }),
          }),
        }
      : { value: code, label, icon }
  })
}

export function ToolFiltersCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const options = useCategoryOptions(l)
  const counted = useCategoryOptions(l, true)
  const schemes = ['day', 'night'] as const
  // Le statut, groupe posé devant les catégories sur la page d'un outil.
  const status: FilterPillGroup<Status> = {
    label: t(($) => $.tool.statusLabel),
    allLabel: t(($) => $.tool.statusAll),
    value: 'testable',
    options: [
      { value: 'testable', label: t(($) => $.tool.statusTestable) },
      { value: 'done', label: t(($) => $.tool.statusDone) },
    ],
    onChange: noop,
  }
  const categoryLabel = t(($) => $.tool.categoryLabel)
  const all = t(($) => $.tool.all)
  const explore = { label: t(($) => $.explore.categoriesLabel), allLabel: all }
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LiveFilter labels={explore} options={options} />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.none} — ${l[scheme]}`}>
              <FilterPills {...explore} value={null} options={options} onChange={noop} />
            </Example>
            <Example caption={`${l.checked} — ${l[scheme]}`}>
              <FilterPills {...explore} value="animals" options={options} onChange={noop} />
            </Example>
            <Example caption={`${l.counts} — ${l[scheme]}`}>
              <FilterPills
                label={categoryLabel}
                allLabel={all}
                value="cooking"
                options={counted}
                onChange={noop}
              />
            </Example>
            <Example caption={`${l.groups} — ${l[scheme]}`}>
              {/* Le statut d'abord, puis les catégories : c'est `groups` qui pose le second. */}
              <FilterPills
                {...status}
                groups={[
                  {
                    label: categoryLabel,
                    allLabel: all,
                    value: 'cooking',
                    options,
                    onChange: noop,
                  },
                ]}
              />
            </Example>
            <Example caption={`${l.scroll} — ${l[scheme]}`}>
              <Frame width={320}>
                <FilterPills
                  {...explore}
                  value="science"
                  options={options}
                  scroll
                  onChange={noop}
                />
              </Frame>
            </Example>
            <Example caption={`${l.narrow} — ${l[scheme]}`}>
              <Frame width={150}>
                <FilterPills {...explore} value="money" options={options} onChange={noop} />
              </Frame>
            </Example>
            <Example caption={`${l.mosaic2} — ${l[scheme]}`}>
              <Frame width={390}>
                <Mosaic l={l} columns={2} />
              </Frame>
            </Example>
            <Example caption={`${l.mosaic2Narrow} — ${l[scheme]}`}>
              <Frame width={320}>
                <Mosaic l={l} columns={2} />
              </Frame>
            </Example>
            <Example caption={`${l.mosaic4} — ${l[scheme]}`}>
              <Mosaic l={l} columns={4} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple qui se manipule : choisir coche vraiment, « Toutes » retire vraiment le filtre. */
function LiveFilter({
  labels,
  options,
}: {
  labels: { label: string; allLabel: string }
  options: FilterPillOption<Code>[]
}) {
  const [value, setValue] = useState<Code | null>(null)
  return <FilterPills {...labels} value={value} options={options} onChange={setValue} />
}

/** Les sept projets de l'exemple en mosaïque. */
function Mosaic({ l, columns }: { l: Labels; columns: 2 | 4 }) {
  return (
    <TileMosaic columns={columns}>
      {l.projects.map(([title = '', author = ''], index) => {
        const look = LOOKS[index] ?? { variant: 'honey', photo: false }
        return (
          <ProjectTile
            key={title}
            title={title}
            author={author}
            variant={look.variant}
            image={look.photo ? { source: null, thumbhash: cafe, label: title } : null}
            onPress={noop}
          />
        )
      })}
    </TileMosaic>
  )
}

/** Une colonne de largeur donnée (un téléphone, une colonne étroite), jamais plus large que la page. */
function Frame({ width, children }: { width: number; children: ReactNode }) {
  return <View style={{ width, maxWidth: '100%' }}>{children}</View>
}

/** Un exemple et sa légende, sur le fond de la page de son thème. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
