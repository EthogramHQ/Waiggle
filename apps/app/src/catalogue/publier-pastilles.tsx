// La section « Publier : les pastilles » du catalogue (R6a, U8) : l'étiquette à icône (Tag `icon`),
// la catégorie d'un projet, en lien, en simple pastille et en verre sur une couverture ; puis la
// question « Facile à refaire ? » (Choices `dot` et `clearLabel`) : trois choix à rond de couleur,
// rien de coché, un choix coché avec « Effacer », et une colonne étroite où les choix passent à la
// ligne (comme le texte à 200 % sur un téléphone). Jour et nuit. Le premier exemple se manipule.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ColorName } from '@ruche/brand'
import type { ProjectDifficulty } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { categoryOption } from '../projects/categories'
import { Choices } from '../ui/Choices'
import { ProjectCover } from '../ui/ProjectCover'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Publier : les pastilles',
  intro:
    'Tag icon : la catégorie d’un projet, son icône avant le nom (décorative : le nom lu reste le nom). Choices dot : un rond de couleur devant le texte d’un choix, jamais seul à dire quelque chose ; cochée, sur le miel, la pastille est cerclée d’encre. Choices clearLabel : « Effacer » vide une question facultative, puis le focus revient au premier choix.',
  live: 'À manipuler : choisir, puis « Effacer »',
  tags: 'Tag icon : en lien, puis en simple pastille',
  glass: 'Tag icon onGlass : sur la couverture d’une carte, en haut à gauche',
  none: 'Rien de coché : pas de « Effacer » (la rangée garde sa hauteur)',
  checked: 'Un choix coché, avec « Effacer »',
  narrow:
    'Colonne étroite (150 points ici, un téléphone ou le texte à 200 %) : chaque choix passe à la ligne dans sa pastille',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Publish: the pills',
  intro:
    'Tag icon: a project’s category, its icon before the name (decorative: the spoken name stays the name). Choices dot: a coloured dot before a choice’s text, never the only thing that says something; checked, on the honey, the dot gets an ink ring. Choices clearLabel: “Clear” empties an optional question, then the focus goes back to the first choice.',
  live: 'Try it: choose, then “Clear”',
  tags: 'Tag icon: as a link, then as a plain pill',
  glass: 'Tag icon onGlass: on a card’s cover, at the top left',
  none: 'Nothing checked: no “Clear” (the row keeps its height)',
  checked: 'One choice checked, with “Clear”',
  narrow:
    'Narrow column (150 points here, a phone or text at 200%): each choice wraps inside its pill',
  day: 'day',
  night: 'night',
}

/** Le rond de chaque niveau : vert, jaune, rouge (les rôles de la marque, décision de la session). */
const DOTS: Record<ProjectDifficulty, ColorName> = {
  easy: 'success',
  medium: 'amber',
  hard: 'danger',
}

const noop = () => {}

/** Les trois choix de « Facile à refaire ? », avec les textes de l'appli. */
const useDifficultyOptions = () => {
  const { t } = useTranslation()
  return (['easy', 'medium', 'hard'] as const).map((value) => ({
    value,
    label: t(($) => $.project.difficulty[value]),
    dot: DOTS[value],
  }))
}

export function PublishPillsCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const options = useDifficultyOptions()
  const question = t(($) => $.project.form.difficulty)
  const clear = t(($) => $.project.form.clear)
  const science = categoryOption(t, 'science')
  const cooking = categoryOption(t, 'cooking')
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LiveDifficulty />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.tags} — ${l[scheme]}`}>
              <Stack direction="row" wrap gap="sm">
                <Tag label={science.label} icon={science.icon} onPress={noop} />
                <Tag label={cooking.label} icon={cooking.icon} />
              </Stack>
            </Example>
            <Example caption={`${l.glass} — ${l[scheme]}`}>
              {/* La lumière miel d'une couverture sans photo, sous le verre de l'étiquette. */}
              <ProjectCover height={160} radius="tile">
                <Stack padding="md">
                  <Tag label={science.label} icon={science.icon} onGlass />
                </Stack>
              </ProjectCover>
            </Example>
            <Example caption={`${l.none} — ${l[scheme]}`}>
              <Choices
                label={question}
                options={options}
                value={null}
                onChange={noop}
                clearLabel={clear}
              />
            </Example>
            <Example caption={`${l.checked} — ${l[scheme]}`}>
              <Choices
                label={question}
                options={options}
                value="medium"
                onChange={noop}
                clearLabel={clear}
              />
            </Example>
            <Example caption={`${l.narrow} — ${l[scheme]}`}>
              <View style={{ alignSelf: 'stretch', maxWidth: 150 }}>
                <Choices
                  label={question}
                  options={options}
                  value="easy"
                  onChange={noop}
                  clearLabel={clear}
                />
              </View>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple qui se manipule : choisir coche vraiment, « Effacer » vide vraiment. */
function LiveDifficulty() {
  const { t } = useTranslation()
  const options = useDifficultyOptions()
  const [value, setValue] = useState<ProjectDifficulty | null>(null)
  return (
    <Choices
      label={t(($) => $.project.form.difficulty)}
      options={options}
      value={value}
      onChange={setValue}
      clearLabel={t(($) => $.project.form.clear)}
    />
  )
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
