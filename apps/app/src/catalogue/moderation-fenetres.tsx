// La section « Fenêtres de la modération » du catalogue (R9) : les briques de la fenêtre « Retirer »
// dans leurs états. Le champ à menu (MenuField) : rien de choisi, un choix fait, une réponse qui
// manque ; et la question « Que retirer ? » en boutons radio avec leur phrase (RadioGroup
// `detail`). Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : le catalogue est
// partagé par toute l'interface. Ses exemples (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuField } from '../ui/MenuField'
import { RadioGroup } from '../ui/Radio'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Fenêtres de la modération',
  none: 'Champ à menu, rien de choisi : touché, il ouvre ses choix',
  chosen: 'Champ à menu, un choix fait (coché dans le menu)',
  missing: 'Champ à menu, la réponse manque',
  field: 'Fondement',
  placeholder: 'À choisir',
  law: 'La loi',
  rules: 'Les règles de Waiggle',
  missingText: 'Choisis un fondement.',
  scope: 'Que retirer ? Des choix avec leur phrase',
  question: 'Que retirer ?',
  part: 'Seulement cette partie : la photo 2',
  partDetail: 'Le reste du projet reste affiché.',
  whole: 'Tout le projet',
  wholeDetail: 'Il n’apparaît plus nulle part pour les autres membres.',
}

const en: typeof fr = {
  title: 'Moderation sheets',
  none: 'Menu field, nothing chosen: tapped, it opens its choices',
  chosen: 'Menu field, a choice made (checked in the menu)',
  missing: 'Menu field, the answer is missing',
  field: 'Ground',
  placeholder: 'To choose',
  law: 'The law',
  rules: 'Waiggle’s rules',
  missingText: 'Choose a ground.',
  scope: 'What to remove? Choices with their sentence',
  question: 'What to remove?',
  part: 'Only this part: photo 2',
  partDetail: 'The rest of the project stays shown.',
  whole: 'The whole project',
  wholeDetail: 'Other members no longer see it anywhere.',
}

type Ground = 'illegal' | 'rules'

export function ModerationSheetsCatalogue() {
  const { i18n } = useTranslation()
  const text = i18n.language.startsWith('fr') ? fr : en
  const [none, setNone] = useState<Ground | null>(null)
  const [chosen, setChosen] = useState<Ground | null>('illegal')
  const [scope, setScope] = useState<'part' | 'whole'>('part')
  const options = [
    { value: 'illegal' as const, label: text.law },
    { value: 'rules' as const, label: text.rules },
  ]
  return (
    <Stack gap="lg">
      <Text variant="title2" heading={2}>
        {text.title}
      </Text>
      <Text variant="caption" tone="muted">
        {text.none}
      </Text>
      <MenuField
        label={text.field}
        value={none}
        options={options}
        onChange={setNone}
        placeholder={text.placeholder}
      />
      <Text variant="caption" tone="muted">
        {text.chosen}
      </Text>
      <MenuField
        label={text.field}
        value={chosen}
        options={options}
        onChange={setChosen}
        placeholder={text.placeholder}
      />
      <Text variant="caption" tone="muted">
        {text.missing}
      </Text>
      <MenuField
        label={text.field}
        value={null}
        options={options}
        onChange={() => {}}
        placeholder={text.placeholder}
        error={text.missingText}
      />
      <Text variant="caption" tone="muted">
        {text.scope}
      </Text>
      <RadioGroup
        label={text.question}
        value={scope}
        onChange={setScope}
        options={[
          { value: 'part', label: text.part, detail: text.partDetail },
          { value: 'whole', label: text.whole, detail: text.wholeDetail },
        ]}
      />
    </Stack>
  )
}
