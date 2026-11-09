// La section « Outils et étiquettes » du catalogue (tranche R6b) : l'étiquette d'un « Autre » (un
// outil cité mais pas encore au catalogue, en texte simple), la grille d'icônes d'une catégorie
// (vide, un choix coché) et le bouton de filtre des catégories (avant et après un choix). Chaque
// exemple de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses libellés (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais ; les
// textes des composants viennent de l'appli.
import { CATEGORY_ICON_CHOICES, type CategoryIcon } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterButton } from '../ui/FilterButton'
import { IconGrid } from '../ui/IconGrid'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Outils et étiquettes',
  intro:
    'Un outil du catalogue est une étiquette qui mène à sa page ; un « Autre », cité par un membre mais pas encore au catalogue, est un texte simple, jamais un lien, lu en entier. La grille d’icônes sert à créer une catégorie : un groupe de choix nommés par le sens de leur icône. Le bouton de filtre ouvre la feuille des catégories.',
  tags: 'Étiquettes : dans le catalogue, « Autre »',
  tagsOnGlass: 'Étiquette « Autre » sur verre',
  grid: 'Grille d’icônes : rien de coché, un choix coché',
  filter: 'Bouton de filtre : toutes les catégories, une catégorie choisie',
  gridLabel: 'Icône',
  all: 'Toutes les catégories',
  chosen: 'Catégorie : Cuisine',
  cooking: 'Cuisine',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Tools and tags',
  intro:
    'A catalogue tool is a tag that leads to its page; an “Other”, named by a member but not in the catalogue yet, is plain text, never a link, read in full. The icon grid is for creating a category: a group of choices named by the meaning of their icon. The filter button opens the categories sheet.',
  tags: 'Tags: in the catalogue, “Other”',
  tagsOnGlass: '“Other” tag on glass',
  grid: 'Icon grid: nothing checked, one choice checked',
  filter: 'Filter button: all categories, one category chosen',
  gridLabel: 'Icon',
  all: 'All categories',
  chosen: 'Category: Cooking',
  cooking: 'Cooking',
  day: 'day',
  night: 'night',
}

const noop = () => {}

/** Une grille qui garde son choix, comme dans la feuille de création d'une catégorie. */
function Grid({ start, label }: { start: CategoryIcon | null; label: string }) {
  const { t } = useTranslation()
  const [value, setValue] = useState<CategoryIcon | null>(start)
  return (
    <IconGrid
      label={label}
      icons={CATEGORY_ICON_CHOICES.map((name) => ({
        name,
        label: t(($) => $.moderation.categories.iconName[name]),
      }))}
      value={value}
      onChange={(next) => setValue(next as CategoryIcon)}
    />
  )
}

export function ToolTagsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.tags} — ${l[scheme]}`}>
              <Stack direction="row" gap="sm" wrap>
                <Tag label="Claude" inCatalogue onPress={noop} />
                <Tag label="Teachable Machine" inCatalogue={false} />
                {/* Un « Autre » ne mène nulle part, même si l'écran lui a donné un onPress. */}
                <Tag label="Mon assistant maison" inCatalogue={false} onPress={noop} />
              </Stack>
            </Example>
            <Example caption={`${l.tagsOnGlass} — ${l[scheme]}`}>
              <Tag label="Teachable Machine" inCatalogue={false} onGlass />
            </Example>
            <Example caption={`${l.grid} — ${l[scheme]}`}>
              <Grid start={null} label={l.gridLabel} />
              <Grid start="flower" label={l.gridLabel} />
            </Example>
            <Example caption={`${l.filter} — ${l[scheme]}`}>
              <Stack direction="row" gap="sm" wrap>
                <FilterButton label={l.all} spokenLabel={l.all} icon="shapes" onPress={noop} />
                <FilterButton
                  label={l.cooking}
                  spokenLabel={l.chosen}
                  icon="cooking-pot"
                  onPress={noop}
                />
              </Stack>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine). */
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
