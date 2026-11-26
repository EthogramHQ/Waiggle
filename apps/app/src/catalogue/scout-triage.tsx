// Le catalogue de la page de tri des Éclaireuses (tranche R20, planche R20-Tri), de jour et de
// nuit : la tuile de chiffre (ui/GaugeTile : avec jauge, sans jauge, pleine malgré une valeur
// fausse, avec un bouton et une action, avec une liste), la rangée d'un retour (ui/ScoutTriageRow :
// complète, retour ouvert sur le fond crème, sans gravité ni mission, avec chaque statut), la liste
// « Joint au retour » (ui/FactList : remplie, vide) et le statut d'un retour corrigé, inactif
// (ui/Choices `disabled`). Les gestes ne mènent nulle part ici.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { FactList } from '../ui/FactList'
import { GaugeTile } from '../ui/GaugeTile'
import { ScoutTriageRow, SeverityPill, StatusLabel } from '../ui/ScoutTriageRow'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Les Éclaireuses : la page de tri',
  intro:
    'Le haut de la page en tuiles (l’intitulé est un titre, la jauge un décor caché aux lecteurs d’écran), une rangée par retour (un bouton lu dans l’ordre de ce qui est écrit ; le retour ouvert est « actuel », sur le fond crème), ce qui est joint en texte, jamais en lien.',
  day: 'jour',
  night: 'nuit',
  tiles:
    'Tuiles : le mois en cours, les places, pleine malgré 31 sur 30, avant le mois, les missions',
  rows: 'Rangées : complète, ouverte, sans gravité ni mission, et chaque statut',
  facts: 'Joint au retour : rempli, puis vide',
  fixed: 'Le statut d’un retour corrigé : lisible, inactif',
  month: 'Le mois',
  dayValue: 'Jour 12 sur 30',
  until: 'Jusqu’au 14 déc. à minuit',
  places: 'Les places',
  placesValue: '18 sur 30',
  overflow: '31 sur 30',
  notLaunched: 'Pas encore lancé',
  launch: 'Lancer le mois',
  missions: 'Missions de la semaine',
  edit: 'Modifier',
  mission: 'Publie un projet avec une photo',
  bug: 'Bug',
  idea: 'Idée',
  blocking: 'Bloquant',
  annoying: 'Gênant',
  bugText: 'Le fil ne se recharge plus après une heure, il faut quitter l’appli et revenir.',
  ideaText: 'Une ruche pour les petits-enfants, avec des projets à leur hauteur.',
  missionTag: 'Mission',
  statuses: { new: 'Nouveau', read: 'Lu', planned: 'Prévu', fixed: 'Corrigé', parked: 'De côté' },
  attached: 'Joint au retour',
  nothing: 'Rien n’est joint.',
  facts1: [
    { label: 'Écran', value: '/projects/42', mono: true },
    { label: 'Appareil', value: 'Téléphone, Android' },
    { label: 'Langue', value: 'Français' },
    { label: 'Thème', value: 'Nuit' },
  ],
  status: 'Statut',
}

const en: typeof fr = {
  title: 'The Scouts: the triage page',
  intro:
    'The top of the page in tiles (the label is a heading, the gauge a decoration hidden from screen readers), one row per report (a button read in the order of what is written; the opened report is “current”, on the cream background), what is attached as text, never as a link.',
  day: 'day',
  night: 'night',
  tiles:
    'Tiles: the running month, the places, full despite 31 of 30, before the month, the missions',
  rows: 'Rows: complete, opened, without severity or mission, and every status',
  facts: 'Attached to the report: filled, then empty',
  fixed: 'The status of a fixed report: readable, disabled',
  month: 'The month',
  dayValue: 'Day 12 of 30',
  until: 'Until Dec 14 at midnight',
  places: 'The places',
  placesValue: '18 of 30',
  overflow: '31 of 30',
  notLaunched: 'Not launched yet',
  launch: 'Launch the month',
  missions: 'Missions of the week',
  edit: 'Edit',
  mission: 'Publish a project with a photo',
  bug: 'Bug',
  idea: 'Idea',
  blocking: 'Blocking',
  annoying: 'Annoying',
  bugText: 'The feed no longer reloads after an hour, you have to quit the app and come back.',
  ideaText: 'A hive for the grandchildren, with projects at their level.',
  missionTag: 'Mission',
  statuses: { new: 'New', read: 'Read', planned: 'Planned', fixed: 'Fixed', parked: 'Parked' },
  attached: 'Attached to the report',
  nothing: 'Nothing is attached.',
  facts1: [
    { label: 'Screen', value: '/projects/42', mono: true },
    { label: 'Device', value: 'Phone, Android' },
    { label: 'Language', value: 'French' },
    { label: 'Theme', value: 'Night' },
  ],
  status: 'Status',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

/** Rien : un geste du catalogue ne mène nulle part. */
const nothing = () => {}
/** L'heure figée du catalogue : les dates des rangées ne bougent pas d'une capture à l'autre. */
const now = new Date('2026-11-26T10:00:00.000Z')

/** Un groupe d'états : sa légende, puis les exemples. */
function Sample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}

function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const author = { name: 'Inès', avatar: null }
  const bug = { label: l.bug, icon: 'warning-circle' as const }
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.title} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.tiles}>
        <Stack direction="row" gap="md" wrap>
          <GaugeTile label={l.month} value={l.dayValue} ratio={12 / 30} detail={l.until} />
          <GaugeTile label={l.places} value={l.placesValue} ratio={18 / 30} />
          <GaugeTile label={l.places} value={l.overflow} ratio={31 / 30} />
          <GaugeTile
            label={l.month}
            value={l.notLaunched}
            action={<Button label={l.launch} onPress={nothing} />}
          />
          <GaugeTile
            label={l.missions}
            trailing={
              <Button label={l.edit} variant="secondary" size="compact" onPress={nothing} />
            }
          >
            <Text variant="callout">{l.mission}</Text>
          </GaugeTile>
        </Stack>
      </Sample>
      <Sample caption={l.rows}>
        <Stack gap="xxs">
          <ScoutTriageRow
            kind={bug}
            severity={{ label: l.blocking, strong: true }}
            text={l.bugText}
            author={author}
            date="2026-11-26T08:00:00.000Z"
            status={{ label: l.statuses.new, tone: 'soft' }}
            mission={l.missionTag}
            onPress={nothing}
            now={now}
          />
          <ScoutTriageRow
            kind={bug}
            severity={{ label: l.annoying, strong: false }}
            text={l.bugText}
            author={author}
            date="2026-11-24T08:00:00.000Z"
            status={{ label: l.statuses.planned, tone: 'soft' }}
            mission={l.missionTag}
            selected
            onPress={nothing}
            now={now}
          />
          <ScoutTriageRow
            kind={{ label: l.idea, icon: 'lightbulb' }}
            text={l.ideaText}
            author={{ name: 'Papi Jean', avatar: null }}
            date="2026-11-23T08:00:00.000Z"
            status={{ label: l.statuses.read, tone: 'neutral' }}
            onPress={nothing}
            now={now}
          />
        </Stack>
        <Stack direction="row" gap="sm" wrap>
          <SeverityPill label={l.blocking} strong />
          <SeverityPill label={l.annoying} strong={false} />
          <StatusLabel label={l.statuses.new} tone="soft" />
          <StatusLabel label={l.statuses.read} tone="neutral" />
          <StatusLabel label={l.statuses.planned} tone="soft" />
          <StatusLabel label={l.statuses.fixed} tone="strong" />
          <StatusLabel label={l.statuses.parked} tone="neutral" />
        </Stack>
      </Sample>
      <Sample caption={l.facts}>
        <FactList title={l.attached} facts={l.facts1} />
        <FactList title={l.attached} facts={[]} empty={l.nothing} />
      </Sample>
      <Sample caption={l.fixed}>
        <Choices
          label={l.status}
          options={[
            { value: 'read', label: l.statuses.read },
            { value: 'planned', label: l.statuses.planned },
            { value: 'fixed', label: l.statuses.fixed },
            { value: 'parked', label: l.statuses.parked },
          ]}
          value="fixed"
          onChange={nothing}
          disabled
        />
      </Sample>
    </Stack>
  )
}

export function ScoutTriageCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit, sur le fond de la page.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="sheet" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
