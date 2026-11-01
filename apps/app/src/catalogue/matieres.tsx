// La section « Matières » du catalogue (Miel 2, tranche R1) : les cinq matières (surface pleine,
// groupe, verre, panneau, feuille) de jour et de nuit côte à côte, la carte de projet avec son ombre
// et son panneau sans ombre, une surface qui demande l'ombre d'une carte, et le focus au clavier
// (contour miel et halo). Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne :
// plusieurs agents y travaillaient en même temps. Ses exemples (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais.
import { radii, type Scheme, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectCover } from '../ui/ProjectCover'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Matières (Miel 2)',
  day: 'De jour, sur la Cire',
  night: 'De nuit',
  plain: 'Surface pleine : bordure beige, sans ombre',
  grouped: 'Groupe : bordure beige, ombre douce',
  glass: 'Verre : flou, reflet, ombre flottante',
  panel: 'Panneau : verre dense, sans ombre',
  sheet: 'Feuille : posée au centre',
  onLight: 'Le verre et le panneau sur la lumière miel',
  readLong: 'Ce qui se lit longtemps.',
  fields: 'Des champs, des réglages.',
  floating: 'Une barre qui flotte',
  panelText: 'Un texte posé sur une image.',
  sheetText: 'Une fenêtre de confirmation.',
  card: 'La carte du fil : l’ombre sous la carte, jamais sous le panneau',
  cardShadow: 'Une surface pleine qui demande l’ombre d’une carte (shadow="card")',
  focus: 'Le focus au clavier (touche Tab) : contour miel de 2 points et halo',
  focusInset: 'Dans une liste, l’anneau et le halo sont à l’intérieur de la ligne',
  sampleTitle: 'Carnet de cafés',
  samplePitch: 'Note chaque café, retrouve tes préférés, partage-les avec la famille.',
  author: 'Léa Moreau',
  when: 'il y a 2 jours',
  status: 'En test',
  tryIt: 'Tester la démo',
  button: 'Publier',
  link: 'Voir le projet',
  row: 'Notifications',
}

const en: typeof fr = {
  title: 'Materials (Miel 2)',
  day: 'By day, on the Wax',
  night: 'By night',
  plain: 'Plain surface: beige border, no shadow',
  grouped: 'Group: beige border, soft shadow',
  glass: 'Glass: blur, highlight, floating shadow',
  panel: 'Panel: dense glass, no shadow',
  sheet: 'Sheet: placed in the middle',
  onLight: 'Glass and panel on the honey light',
  readLong: 'What takes a while to read.',
  fields: 'Fields, settings.',
  floating: 'A floating bar',
  panelText: 'Text laid on a picture.',
  sheetText: 'A confirmation window.',
  card: 'The feed card: the shadow under the card, never under the panel',
  cardShadow: 'A plain surface asking for a card shadow (shadow="card")',
  focus: 'Keyboard focus (Tab key): 2-point honey outline and halo',
  focusInset: 'In a list, the ring and the halo are inside the row',
  sampleTitle: 'Coffee notebook',
  samplePitch: 'Rate each coffee, find your favourites, share them with the family.',
  author: 'Léa Moreau',
  when: '2 days ago',
  status: 'Testing',
  tryIt: 'Try the demo',
  button: 'Publish',
  link: 'See the project',
  row: 'Notifications',
}

type Labels = typeof fr
const noop = () => {}

export function MaterialsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      {(['day', 'night'] as const).map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit côte à côte, quel que soit le
        // thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Backdrop>
            <Materials l={l} scheme={scheme} />
          </Backdrop>
        </ThemeProvider>
      ))}

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.card}
        </Text>
        <ProjectCard
          title={l.sampleTitle}
          pitch={l.samplePitch}
          author={{ name: l.author, avatar: null }}
          when={l.when}
          status={{ label: l.status, strong: true }}
          tryIt={{ label: l.tryIt, onPress: noop }}
          height={380}
        />
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.cardShadow}
        </Text>
        <Surface padding="lg" shadow="card">
          <Text>{l.readLong}</Text>
        </Surface>
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.focus}
        </Text>
        <Stack direction="row" gap="lg" align="center" wrap>
          <Button label={l.button} icon="plus" onPress={noop} />
          <Button label={l.link} variant="secondary" onPress={noop} />
          <TextLink label={l.link} onPress={noop} />
        </Stack>
        <Text variant="caption" tone="muted">
          {l.focusInset}
        </Text>
        <ListGroup>
          <ListRow label={l.row} icon="bell" trailing="chevron" onPress={noop} />
        </ListGroup>
      </Stack>
    </Stack>
  )
}

/** Le fond de page du thème imposé (la Cire, la Nuit), pour voir les matières là où elles vivent. */
function Backdrop({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{ backgroundColor: colors.background, borderRadius: radii.tile, padding: space.lg }}
    >
      {children}
    </View>
  )
}

function Materials({ l, scheme }: { l: Labels; scheme: Scheme }) {
  return (
    <Stack gap="md">
      <Text variant="callout" weight={700}>
        {scheme === 'day' ? l.day : l.night}
      </Text>
      <Stack direction="row" gap="md" wrap>
        <Sample caption={l.plain}>
          <Surface padding="lg">
            <Text>{l.readLong}</Text>
          </Surface>
        </Sample>
        <Sample caption={l.grouped}>
          <Surface variant="grouped" padding="lg">
            <Text>{l.fields}</Text>
          </Surface>
        </Sample>
      </Stack>
      <Text variant="caption" tone="muted">
        {l.onLight}
      </Text>
      <Text variant="caption" tone="muted">
        {l.glass}
      </Text>
      {/* La lumière miel d'une couverture sans photo : ce que le verre floute et avive. */}
      <ProjectCover height={240} radius="tile">
        <Stack padding="lg" gap="md">
          <Surface variant="glass" padding="md" fill={false}>
            <Text variant="callout" weight={600}>
              {l.floating}
            </Text>
          </Surface>
          <Surface variant="panel" padding="lg" gap="xs">
            <Text variant="callout" weight={700}>
              {l.panel}
            </Text>
            <Text variant="callout" tone="secondary">
              {l.panelText}
            </Text>
          </Surface>
        </Stack>
      </ProjectCover>
      {/* Dans une rangée, comme les deux premiers : la base de 240 points est une largeur. */}
      <Stack direction="row" wrap>
        <Sample caption={l.sheet}>
          <Surface variant="sheet" centered padding="lg">
            <Text>{l.sheetText}</Text>
          </Surface>
        </Sample>
      </Stack>
    </Stack>
  )
}

/** Un exemple et sa légende, qui prend la moitié de la rangée (toute la largeur sur téléphone). */
function Sample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 240, gap: space.sm }}>
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </View>
  )
}
