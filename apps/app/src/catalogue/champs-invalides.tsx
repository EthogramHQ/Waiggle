// La section « Choix sans réponse » du catalogue (correction de R6b) : `Choices` et `IconGrid` dans
// leur état invalide, avec la phrase qui dit ce qui manque (« Choisis une famille. », « Choisis une
// icône. ») sous le groupe. Chaque exemple de jour et de nuit, d'abord sans erreur, puis en erreur.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses libellés (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais ; les
// phrases d'erreur viennent de l'appli.
import { CATEGORY_ICON_CHOICES, type CategoryIcon, TOOL_FAMILIES } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Choices } from '../ui/Choices'
import { IconGrid } from '../ui/IconGrid'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Choix sans réponse',
  intro:
    'Un groupe de choix ou une grille d’icônes auquel il manque une réponse : la phrase s’écrit sous le groupe, avec son icône d’avertissement, et le groupe se déclare invalide aux lecteurs d’écran. Elle part dès qu’un choix est fait.',
  choices: 'Familles d’un outil : sans erreur, sans réponse',
  grid: 'Grille d’icônes : sans erreur, sans réponse',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Choices without an answer',
  intro:
    'A group of choices or an icon grid that lacks an answer: the sentence is written under the group, with its warning icon, and the group declares itself invalid to screen readers. It goes away as soon as a choice is made.',
  choices: 'A tool’s families: no error, no answer',
  grid: 'Icon grid: no error, no answer',
  day: 'day',
  night: 'night',
}

/** Des familles qui gardent leur choix, comme dans la feuille d'un outil. */
function Families({ error }: { error?: string }) {
  const { t } = useTranslation()
  const [family, setFamily] = useState<(typeof TOOL_FAMILIES)[number] | null>(null)
  return (
    <Choices
      label={t(($) => $.moderation.catalogue.family)}
      options={TOOL_FAMILIES.map((one) => ({ value: one, label: t(($) => $.tools.family[one]) }))}
      value={family}
      onChange={setFamily}
      error={family === null ? error : undefined}
    />
  )
}

/** Une grille qui garde son choix, comme dans la feuille de création d'une catégorie. */
function Grid({ error }: { error?: string }) {
  const { t } = useTranslation()
  const [icon, setIcon] = useState<CategoryIcon | null>(null)
  return (
    <IconGrid
      label={t(($) => $.moderation.categories.icon)}
      icons={CATEGORY_ICON_CHOICES.map((name) => ({
        name,
        label: t(($) => $.moderation.categories.iconName[name]),
      }))}
      value={icon}
      onChange={(next) => setIcon(next as CategoryIcon)}
      error={icon === null ? error : undefined}
    />
  )
}

export function InvalidChoicesCatalogue() {
  const { t, i18n } = useTranslation()
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
            <Example caption={`${l.choices} — ${l[scheme]}`}>
              <Families />
              <Families error={t(($) => $.moderation.catalogue.familyRequired)} />
            </Example>
            <Example caption={`${l.grid} — ${l[scheme]}`}>
              <Grid />
              <Grid error={t(($) => $.moderation.categories.iconRequired)} />
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
    <Surface variant="plain" padding="lg" gap="lg">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
