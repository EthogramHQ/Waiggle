// La section « Ruches : les alvéoles » du catalogue (R10) : l'alvéole d'une ruche (HiveBadge) à ses
// trois tailles, avec plusieurs icônes et sans nom (retiré par la modération), et le choix de son
// icône (HiveIconPicker) : la maison cochée, comme à l'ouverture de « Créer une ruche » ; une autre
// icône cochée ; le groupe inactif pendant l'envoi. Le premier choix se manipule (toucher, flèches),
// les autres sont figés. Tout s'affiche de jour puis de nuit, sous un thème imposé. Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne : le catalogue est partagé par toute l'interface.
// Ses exemples (un outil de développement, absent de l'appli publiée) sont écrits ici, en français et
// en anglais.
import { layout } from '@ruche/brand'
import type { HiveIcon } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiveBadge } from '../ui/HiveBadge'
import { HiveIconPicker } from '../ui/HiveIconPicker'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Ruches : les alvéoles',
  intro:
    'L’alvéole d’une ruche, lue « Ruche Famille » (l’icône est décorative), et le choix de son icône : douze alvéoles en boutons radio, nommées par leur sens.',
  day: 'jour',
  night: 'nuit',
  badgesTitle: 'HiveBadge : 28, 44 et 64 points',
  badgeSizes: 'Famille, aux trois tailles (« Tes ruches », la ligne de l’onglet, l’en-tête)',
  badgeIcons: 'D’autres ruches, en 44 : Amis du jeudi, Atelier IA, Café du dimanche, Jardin',
  badgeUnnamed: 'Un nom retiré par la modération : lu « Ruche sans nom »',
  family: 'Famille',
  friends: 'Amis du jeudi',
  workshop: 'Atelier IA',
  coffee: 'Café du dimanche',
  garden: 'Jardin',
  pickerTitle: 'HiveIconPicker : le choix de l’icône',
  pickerLive: 'À l’ouverture de « Créer une ruche » : la maison cochée (touche, flèches, espace)',
  pickerOther: 'Une autre icône cochée : le café (figé)',
  pickerDisabled: 'Pendant l’envoi : inactif, la fusée cochée',
}

const en: typeof fr = {
  title: 'Hives: the cells',
  intro:
    'A hive’s cell, read “Family hive” (the icon is decorative), and the choice of its icon: twelve cells as radio buttons, named by their meaning.',
  day: 'day',
  night: 'night',
  badgesTitle: 'HiveBadge: 28, 44 and 64 points',
  badgeSizes: 'Family, at the three sizes (“Your hives”, the tab’s row, the header)',
  badgeIcons: 'Other hives, at 44: Thursday friends, AI workshop, Sunday coffee, Garden',
  badgeUnnamed: 'A name removed by moderation: read “Unnamed hive”',
  family: 'Family',
  friends: 'Thursday friends',
  workshop: 'AI workshop',
  coffee: 'Sunday coffee',
  garden: 'Garden',
  pickerTitle: 'HiveIconPicker: choosing the icon',
  pickerLive: 'When “Create a hive” opens: the house checked (tap, arrows, space)',
  pickerOther: 'Another icon checked: the coffee (frozen)',
  pickerDisabled: 'While sending: disabled, the rocket checked',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

const noop = () => {}

/** Une légende d'exemple, au-dessus de son état. */
function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  )
}

/** Le choix qu'on manipule : il garde l'icône touchée, comme la feuille de création. */
function LivePicker() {
  const [value, setValue] = useState<HiveIcon>('house-line')
  return <HiveIconPicker value={value} onChange={setValue} />
}

/** Les exemples d'un thème : les alvéoles, puis les choix. */
function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const others: { icon: HiveIcon; name: string }[] = [
    { icon: 'users-three', name: l.friends },
    { icon: 'code', name: l.workshop },
    { icon: 'coffee', name: l.coffee },
    { icon: 'leaf', name: l.garden },
  ]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.badgesTitle} — ${l[scheme]}`}
      </Text>
      <Stack gap="sm">
        <Caption>{l.badgeSizes}</Caption>
        <Stack direction="row" gap="md" align="center" wrap>
          <HiveBadge icon="house-line" name={l.family} size={layout.hive.small} />
          <HiveBadge icon="house-line" name={l.family} size={layout.hive.regular} />
          <HiveBadge icon="house-line" name={l.family} size={layout.hive.large} />
        </Stack>
      </Stack>
      <Stack gap="sm">
        <Caption>{l.badgeIcons}</Caption>
        <Stack direction="row" gap="md" align="center" wrap>
          {others.map((hive) => (
            <HiveBadge
              key={hive.icon}
              icon={hive.icon}
              name={hive.name}
              size={layout.hive.regular}
            />
          ))}
        </Stack>
      </Stack>
      <Stack gap="sm">
        <Caption>{l.badgeUnnamed}</Caption>
        <Stack direction="row" gap="md" align="center" wrap>
          <HiveBadge icon="heart" name={null} size={layout.hive.regular} />
          <HiveBadge icon="heart" name={null} size={layout.hive.large} />
        </Stack>
      </Stack>
      <Text variant="headline" heading={3}>
        {`${l.pickerTitle} — ${l[scheme]}`}
      </Text>
      <Stack gap="sm">
        <Caption>{l.pickerLive}</Caption>
        <LivePicker />
      </Stack>
      <Stack gap="sm">
        <Caption>{l.pickerOther}</Caption>
        <HiveIconPicker value="coffee" onChange={noop} />
      </Stack>
      <Stack gap="sm">
        <Caption>{l.pickerDisabled}</Caption>
        <HiveIconPicker value="rocket-launch" onChange={noop} disabled />
      </Stack>
    </Stack>
  )
}

export function HiveCellsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit. La surface de feuille a le
        // fond de « Créer une ruche », où le choix de l'icône se pose (le liseré de sa coche en
        // reprend la couleur).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="sheet" padding="sm" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
