// La section « Réglages : notifications » du catalogue (R8, planche `R8-Reglages`) : l'exemple de
// notification en tête de l'écran, et la ligne de choix (ChoiceRow) fermée, ouverte, avec sa note
// (« Le récap est coupé : rien ne part »), désactivée et avec l'erreur d'un choix non enregistré ;
// puis la carte « Ce que tu reçois par e-mail » (EmailSummary), avec sa phrase et sans ; de jour
// puis de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Les légendes (un outil de développement, absent de l'appli publiée)
// sont écrites ici en français et en anglais ; les textes de l'appli viennent de ses traductions.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../ui/ChoiceRow'
import { EmailSummary } from '../ui/EmailSummary'
import { ListGroup } from '../ui/ListGroup'
import { NotificationExample } from '../ui/NotificationExample'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

type When = 'now' | 'digest' | 'never'
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

const fr = {
  title: 'Réglages : notifications',
  intro:
    'En tête, un exemple de ce qu’on reçoit : le nombre, jamais le nom. Dessous, une ligne par type : fermée (le choix actuel), ouverte (les trois choix, sur du miel pâle), avec une note quand le récap est coupé, désactivée pendant un enregistrement.',
  day: 'jour',
  night: 'nuit',
  example: 'L’exemple',
  rows: 'Les lignes de choix',
  reactions: 'Réactions',
  comments: 'Commentaires sur tes projets',
  follows: 'Nouveaux abonnés',
  updates: 'Mises à jour suivies',
  testers: 'Coin des testeurs',
  summary: 'Ce que tu reçois par e-mail (Activité, ordinateur)',
  summaryIntro: 'Avec la phrase des réglages :',
  summaryEmpty: 'Réglages pas encore lus (summary: null) : la carte ne promet rien.',
  sentence:
    'Les réponses et les mentions tout de suite ; le reste dans le récap du dimanche, à 10 h.',
}
const en: typeof fr = {
  title: 'Settings: notifications',
  intro:
    'At the top, an example of what you get: the number, never the name. Below, one row per type: closed (the current choice), open (the three choices, on pale honey), with a note when the recap is off, disabled while saving.',
  day: 'day',
  night: 'night',
  example: 'The example',
  rows: 'The choice rows',
  reactions: 'Reactions',
  comments: 'Comments on your projects',
  follows: 'New followers',
  updates: 'Followed updates',
  testers: 'Testers’ corner',
  summary: 'What you get by e-mail (Activity, desktop)',
  summaryIntro: 'With the sentence from the settings:',
  summaryEmpty: 'Settings not read yet (summary: null): the card promises nothing.',
  sentence: 'Replies and mentions right away; the rest in the Sunday recap, at 10 am.',
}

/** Les lignes d'un groupe : un état par ligne, les choix pris restent dans l'état local. */
function Rows({ l }: { l: typeof fr }) {
  const { t } = useTranslation()
  const choices = [
    { value: 'now' as const, label: t(($) => $.notificationSettings.choices.now) },
    { value: 'digest' as const, label: t(($) => $.notificationSettings.choices.digest) },
    { value: 'never' as const, label: t(($) => $.notificationSettings.choices.never) },
  ]
  // Une seule ligne ouverte à la fois, comme sur l'écran : « comments » l'est au départ.
  const [open, setOpen] = useState<string | null>('comments')
  const [values, setValues] = useState<Record<string, When>>({
    reactions: 'digest',
    comments: 'digest',
    follows: 'digest',
    updates: 'digest',
  })
  const row = (
    key: string,
    label: string,
    extra?: { note?: string; disabled?: boolean; error?: string },
  ) => (
    <ChoiceRow
      label={label}
      value={values[key] ?? 'digest'}
      choices={choices}
      open={open === key}
      onToggle={() => setOpen(open === key ? null : key)}
      onChange={(value) => setValues({ ...values, [key]: value })}
      note={extra?.note ?? null}
      disabled={extra?.disabled ?? false}
      error={extra?.error ?? null}
    />
  )
  return (
    <ListGroup>
      {row('reactions', l.reactions)}
      {row('comments', l.comments)}
      {row('follows', l.follows, { note: t(($) => $.notificationSettings.recapOff) })}
      {row('updates', l.updates, { disabled: true })}
      {row('testers', l.testers, { error: t(($) => $.notificationSettings.saveError) })}
    </ListGroup>
  )
}

export function NotificationSettingsCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="plain" padding="sm" gap="lg">
            <Text variant="headline" heading={3}>
              {`${l.example} — ${l[scheme]}`}
            </Text>
            <NotificationExample />
            <Text variant="headline" heading={3}>
              {`${l.rows} — ${l[scheme]}`}
            </Text>
            <Rows l={l} />
            <Text variant="headline" heading={3}>
              {`${l.summary} — ${l[scheme]}`}
            </Text>
            <Text tone="secondary">{l.summaryIntro}</Text>
            <EmailSummary
              title={t(($) => $.notifications.emailColumn.title)}
              summary={l.sentence}
              note={t(($) => $.notifications.emailColumn.counts)}
              actionLabel={t(($) => $.notifications.emailColumn.settings)}
              onAction={() => {}}
            />
            <Text tone="secondary">{l.summaryEmpty}</Text>
            <EmailSummary
              title={t(($) => $.notifications.emailColumn.title)}
              summary={null}
              note={t(($) => $.notifications.emailColumn.counts)}
              actionLabel={t(($) => $.notifications.emailColumn.settings)}
              onAction={() => {}}
            />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
