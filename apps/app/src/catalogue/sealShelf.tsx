// La section « L'étagère des sceaux » du catalogue (R19, planches R19-Profil et R19-Membre) : les
// sceaux d'un membre sur sa page, en rangée qui défile (téléphone), en grille de 4 (la colonne du
// profil sur ordinateur), avec un seul sceau, puis une longue rangée. De jour puis de nuit, sous un
// thème imposé. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Les exemples (un
// outil de développement, absent de l'appli publiée) sont écrits ici en français et en anglais.
import { SEALS } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { type IconName, iconPaths } from '../ui/icons.generated'
import { SealShelf, type ShelfSeal } from '../ui/SealShelf'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'SealShelf : les sceaux d’un membre',
  intro: 'Une liste lue par les noms ; le sceau est un dessin. Aucune date sur le profil.',
  row: 'En rangée qui défile (téléphone), deux sceaux',
  one: 'Un seul sceau',
  long: 'Une longue rangée : on la fait défiler du doigt',
  grid: 'En grille de 4 (colonne du profil sur ordinateur)',
  day: 'jour',
  night: 'nuit',
  names: ['Premier retour', 'Cuisine explorée', 'Premier retour réglé', '10 projets testés'],
}

const en: typeof fr = {
  title: 'SealShelf: a member’s seals',
  intro: 'A list read by the names; the seal is a drawing. No date on the profile.',
  row: 'As a scrolling row (phone), two seals',
  one: 'A single seal',
  long: 'A long row: swipe it',
  grid: 'As a grid of 4 (profile column on a computer)',
  day: 'day',
  night: 'night',
  names: ['First feedback', 'Cooking explored', 'First settled feedback', '10 projects tested'],
}

type Labels = typeof fr
const isIcon = (name: string): name is IconName => name in iconPaths

/** Des sceaux d'exemple : les noms de la langue pour les quatre premiers, le code ensuite. */
const sample = (l: Labels, count: number): ShelfSeal[] =>
  SEALS.slice(0, count).map((seal, index) => ({
    key: seal.code,
    icon: isIcon(seal.icon) ? seal.icon : 'hexagon',
    matter: seal.matter,
    name: l.names[index] ?? seal.code,
  }))

function Samples({ l, scheme }: { l: Labels; scheme: 'day' | 'night' }) {
  return (
    <Stack gap="md">
      <Text variant="caption" tone="muted">{`${l.row} — ${l[scheme]}`}</Text>
      <SealShelf seals={sample(l, 2)} layout="row" />
      <Text variant="caption" tone="muted">
        {l.one}
      </Text>
      <SealShelf seals={sample(l, 1)} layout="row" />
      <Text variant="caption" tone="muted">
        {l.long}
      </Text>
      <SealShelf seals={sample(l, 12)} layout="row" />
      <Text variant="caption" tone="muted">
        {l.grid}
      </Text>
      <SealShelf seals={sample(l, 6)} layout="grid" />
    </Stack>
  )
}

export function SealShelfCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {(['day', 'night'] as const).map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="plain" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
