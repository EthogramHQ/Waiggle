// La section « La récolte : les choix et la semaine » du catalogue (R19, planches R19-Recolte et
// R19-Miel) : ce qu'on coche et ce qui se compte dans « Ma récolte ».
// - Le choix du défi (ChallengeChoice) : rien de coché (« Choisir ce défi » inactif), un défi coché,
//   l'envoi en cours, l'envoi refusé.
// - Le choix de la décoration (DecorationPicker) : Miel et Lisse seuls à soi, l'Ambre déjà acheté,
//   tout acheté.
// - Le pollen de la semaine par famille (FamilyBars) : quatre familles, une seule, et une famille à
//   0 qui n'a pas de ligne.
// Tout s'affiche de jour puis de nuit, sous un thème imposé ; les choix se cochent pour de vrai.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses légendes (un outil de
// développement, absent de l'appli publiée) sont écrites ici, en français et en anglais ; les
// défis, teintes, motifs et familles viennent des vrais textes de l'appli.
import type { Decoration, Family, PersonalChallengeCode } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChallengeChoice, type ChallengeOption } from '../ui/ChallengeChoice'
import { DecorationPicker } from '../ui/DecorationPicker'
import { FamilyBars } from '../ui/FamilyBars'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La récolte : les choix et la semaine',
  intro:
    'Les défis et les pastilles de décoration sont des groupes de boutons radio : un seul arrêt de Tab, les flèches cochent le voisin. Chaque barre de famille se lit « Tests et retours, 47 pollen ».',
  day: 'jour',
  night: 'nuit',
  challengeTitle: 'ChallengeChoice : le défi de la semaine',
  challengeNone: 'Rien de coché : « Choisir ce défi » inactif, toujours atteignable au clavier',
  challengeChecked: 'Un défi coché',
  challengeBusy: 'Le choix part (occupé)',
  challengeError: 'Le choix n’a pas pu s’enregistrer',
  pickerTitle: 'DecorationPicker : teinte et motif',
  pickerFree: 'Miel et Lisse, offerts : le reste montre son prix',
  pickerAmber: 'L’Ambre déjà acheté, Rayé coché (pas encore à soi)',
  pickerAll: 'Tout acheté : « À toi » partout',
  barsTitle: 'FamilyBars : le pollen de la semaine',
  barsFour: 'Quatre familles, de la plus fournie à la moins fournie',
  barsOne: 'Une seule famille',
  barsZero: 'Ruches et invitations à 0 : pas de ligne',
}

const en: typeof fr = {
  title: 'The harvest: choices and the week',
  intro:
    'Challenges and decoration swatches are radio groups: a single Tab stop, arrows check the neighbour. Each family bar reads “Tests and feedback, 47 pollen”.',
  day: 'day',
  night: 'night',
  challengeTitle: 'ChallengeChoice: the challenge of the week',
  challengeNone: 'Nothing checked: “Choose this challenge” inactive, still reachable by keyboard',
  challengeChecked: 'A challenge checked',
  challengeBusy: 'The choice is being sent (busy)',
  challengeError: 'The choice could not be saved',
  pickerTitle: 'DecorationPicker: tint and pattern',
  pickerFree: 'Honey and Smooth, free: the rest shows its price',
  pickerAmber: 'Amber already bought, Striped checked (not owned yet)',
  pickerAll: 'Everything bought: “Yours” everywhere',
  barsTitle: 'FamilyBars: the pollen of the week',
  barsFour: 'Four families, from the most to the least',
  barsOne: 'A single family',
  barsZero: 'Hives and invitations at 0: no row',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

const CODES = ['feedback', 'update', 'comment_3'] as const satisfies PersonalChallengeCode[]

/** Un exemple : sa légende, puis l'état. */
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

/** Un choix de défi qui se coche pour de vrai ; « Choisir ce défi » et « Pas cette semaine » ne font rien. */
function ChallengeSample({
  start,
  busy = false,
  error,
}: {
  start: PersonalChallengeCode | null
  busy?: boolean
  error?: string
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState<PersonalChallengeCode | null>(start)
  const options: ChallengeOption[] = CODES.map((code) => ({
    code,
    label: t(($) => $.game.challenges.personal[code]),
    honey: 10,
  }))
  return (
    <ChallengeChoice
      options={options}
      value={value}
      onChange={setValue}
      onConfirm={() => {}}
      onSkip={() => {}}
      busy={busy}
      error={error}
    />
  )
}

/** Un choix de décoration qui se coche pour de vrai. */
function PickerSample({
  start,
  owned,
}: {
  start: Decoration
  owned: { tints: Decoration['tint'][]; patterns: Decoration['pattern'][] }
}) {
  const [value, setValue] = useState<Decoration>(start)
  return (
    <DecorationPicker
      tints={['honey', 'amber', 'pollen']}
      patterns={['smooth', 'waffle', 'striped', 'dotted']}
      owned={owned}
      value={value}
      balance={30}
      onChange={setValue}
    />
  )
}

const week = (amounts: Partial<Record<Family, number>>): Record<Family, number> => ({
  forager: 0,
  builder: 0,
  keeper: 0,
  dancer: 0,
  ...amounts,
})

/** Les exemples d'un thème. */
function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.challengeTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.challengeNone}>
        <ChallengeSample start={null} />
      </Sample>
      <Sample caption={l.challengeChecked}>
        <ChallengeSample start="update" />
      </Sample>
      <Sample caption={l.challengeBusy}>
        <ChallengeSample start="feedback" busy />
      </Sample>
      <Sample caption={l.challengeError}>
        <ChallengeSample start="feedback" error={t(($) => $.game.harvest.challenge.error)} />
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.pickerTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.pickerFree}>
        <PickerSample
          start={{ tint: 'honey', pattern: 'smooth' }}
          owned={{ tints: ['honey'], patterns: ['smooth'] }}
        />
      </Sample>
      <Sample caption={l.pickerAmber}>
        <PickerSample
          start={{ tint: 'amber', pattern: 'striped' }}
          owned={{ tints: ['honey', 'amber'], patterns: ['smooth'] }}
        />
      </Sample>
      <Sample caption={l.pickerAll}>
        <PickerSample
          start={{ tint: 'pollen', pattern: 'dotted' }}
          owned={{
            tints: ['honey', 'amber', 'pollen'],
            patterns: ['smooth', 'waffle', 'striped', 'dotted'],
          }}
        />
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.barsTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.barsFour}>
        <FamilyBars byFamily={week({ keeper: 47, builder: 20, forager: 18, dancer: 5 })} />
      </Sample>
      <Sample caption={l.barsOne}>
        <FamilyBars byFamily={week({ forager: 6 })} />
      </Sample>
      <Sample caption={l.barsZero}>
        <FamilyBars byFamily={week({ keeper: 12, builder: 6, forager: 18 })} />
      </Sample>
    </Stack>
  )
}

export function HarvestChoicesCatalogue() {
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
