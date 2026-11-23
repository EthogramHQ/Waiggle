// La section « La récolte : ce qui bouge » du catalogue (R19, planches R19-Niveau et R19-Gain) :
// - l'alvéole du niveau (LevelCell) à ses trois tailles, immobile, puis le passage du niveau 4 au
//   niveau 5, qu'un bouton rejoue ;
// - la pastille de gain (PollenGain) au-dessus d'un bouton et à sa droite, pour 1, 2 et 25 pollen,
//   chacune rejouée par son bouton (elle ne joue qu'à son arrivée et quand sa clé change).
// Tout s'affiche de jour puis de nuit, sous un thème imposé. « Réduire les animations » se règle
// sur l'appareil (ou le navigateur) : les mêmes boutons rejouent alors les fondus.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses exemples (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { LevelCell } from '../ui/LevelCell'
import { PollenGain } from '../ui/PollenGain'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La récolte : ce qui bouge',
  intro:
    'L’alvéole du niveau est du dessin : l’écran écrit « Niveau 4 » à côté. Au passage, la cire coule, le 5 apparaît, « Niveau 5 » est annoncé une fois. La pastille se voit sans être lue : on entend « 2 pollen gagnés. ».',
  day: 'jour',
  night: 'nuit',
  cellTitle: 'LevelCell : l’alvéole du niveau',
  cellSizes: 'Immobile : small (Activité, rang), regular (panneau), large (gros plan)',
  cellRise: 'Le passage du niveau 4 au niveau 5, en regular puis en large',
  replayRise: 'Rejouer le passage',
  gainTitle: 'PollenGain : la pastille de gain',
  gainAbove: 'Au-dessus du bouton (une réaction, « Envoyer ») : 2 pollen, puis 1',
  gainEnd: 'À droite du bouton (le coin des testeurs) : 25 pollen',
  replayGain: 'Rejouer +{{amount}}',
  button: 'Le bouton du geste',
}

const en: typeof fr = {
  title: 'The harvest: what moves',
  intro:
    'The level cell is drawing: the screen writes “Level 4” next to it. On a level up, the wax flows, the 5 appears, “Level 5” is announced once. The badge is seen, not read: one hears “2 pollen earned.”.',
  day: 'day',
  night: 'night',
  cellTitle: 'LevelCell: the level cell',
  cellSizes: 'Still: small (Activity, rank), regular (panel), large (close-up)',
  cellRise: 'The rise from level 4 to level 5, regular then large',
  replayRise: 'Replay the rise',
  gainTitle: 'PollenGain: the gain badge',
  gainAbove: 'Above the button (a reaction, “Send”): 2 pollen, then 1',
  gainEnd: 'Right of the button (the testers’ corner): 25 pollen',
  replayGain: 'Replay +{{amount}}',
  button: 'The gesture’s button',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

/** Une légende d'exemple, au-dessus de son état. */
function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  )
}

/** Le passage du niveau 4 au 5 ; chaque appui sur « Rejouer » remonte les alvéoles (clé neuve). */
function RiseSample({ l }: { l: Labels }) {
  const [round, setRound] = useState(0)
  return (
    <Stack gap="sm">
      <Caption>{l.cellRise}</Caption>
      <Stack direction="row" gap="lg" align="center" wrap>
        <LevelCell key={`regular-${round}`} level={5} size="regular" rise={{ from: 4 }} />
        <LevelCell key={`large-${round}`} level={5} size="large" rise={{ from: 4 }} />
      </Stack>
      <Stack align="start">
        <Button
          label={l.replayRise}
          variant="secondary"
          size="small"
          icon="arrows-clockwise"
          onPress={() => setRound((n) => n + 1)}
        />
      </Stack>
    </Stack>
  )
}

/**
 * Un bouton du geste et sa pastille, posée `placement` ; « Rejouer » change la clé. La pastille
 * n'est montée qu'au premier appui : à l'arrivée du catalogue, elle aurait déjà fini de jouer.
 */
function GainSample({
  l,
  amount,
  placement,
}: {
  l: Labels
  amount: number
  placement: 'above' | 'end'
}) {
  const [trigger, setTrigger] = useState(0)
  return (
    <Stack direction="row" gap="lg" align="center" wrap>
      {/* La boîte qui porte la pastille : le bouton seul, à sa taille. */}
      <Stack>
        <Button label={l.button} variant="glass" size="small" onPress={() => undefined} />
        {trigger > 0 ? (
          <PollenGain amount={amount} trigger={trigger} placement={placement} />
        ) : null}
      </Stack>
      <Button
        label={l.replayGain.replace('{{amount}}', String(amount))}
        variant="secondary"
        size="small"
        onPress={() => setTrigger((n) => n + 1)}
      />
    </Stack>
  )
}

/** Les exemples d'un thème. */
function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.cellTitle} — ${l[scheme]}`}
      </Text>
      <Stack gap="sm">
        <Caption>{l.cellSizes}</Caption>
        <Stack direction="row" gap="lg" align="center" wrap>
          <LevelCell level={4} size="small" />
          <LevelCell level={4} size="regular" />
          <LevelCell level={12} size="regular" />
          <LevelCell level={4} size="large" />
        </Stack>
      </Stack>
      <RiseSample l={l} />

      <Text variant="headline" heading={3}>
        {`${l.gainTitle} — ${l[scheme]}`}
      </Text>
      {/* De l'air au-dessus des boutons : la pastille naît au-dessus et monte de 36 points. */}
      <Stack gap="xxxl" padding="xl">
        <Caption>{l.gainAbove}</Caption>
        <GainSample l={l} amount={2} placement="above" />
        <GainSample l={l} amount={1} placement="above" />
        <Caption>{l.gainEnd}</Caption>
        <GainSample l={l} amount={25} placement="end" />
      </Stack>
    </Stack>
  )
}

export function HarvestMotionCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit, sur le fond de « Ma récolte ».
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="grouped" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
