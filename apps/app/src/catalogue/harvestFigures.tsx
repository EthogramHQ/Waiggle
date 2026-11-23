// Catalogue (R19, « Ma récolte ») : le montant en grand (`AmountFigure`) de « Cette semaine » et de
// « Mon miel », de jour puis de nuit, avec un montant à plusieurs chiffres et une phrase sans nombre.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountFigure } from '../ui/AmountFigure'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La récolte : les montants',
  intro:
    'Le nombre en grand, l’unité en texte courant ; la phrase se lit d’un trait (« 85 pollen »).',
  week: 'Le pollen de la semaine',
  honey: 'Le solde de miel',
  large: 'Un grand montant',
  none: 'Une phrase sans le nombre : écrite d’un bloc',
}

const en: typeof fr = {
  title: 'The harvest: amounts',
  intro: 'The number large, the unit in body text; the phrase reads in one go (“85 pollen”).',
  week: 'The pollen of the week',
  honey: 'The honey balance',
  large: 'A large amount',
  none: 'A phrase without the number: written in one block',
}

type Labels = typeof fr
const schemes = ['day', 'night'] as const

/** Un exemple : sa légende, puis le montant. */
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

function Samples({ l }: { l: Labels }) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg">
      <Sample caption={l.week}>
        <AmountFigure text={t(($) => $.game.harvest.week.total, { amount: 85 })} amount={85} />
      </Sample>
      <Sample caption={l.honey}>
        <AmountFigure text={t(($) => $.game.honey, { amount: 35 })} amount={35} />
      </Sample>
      <Sample caption={l.large}>
        <AmountFigure
          text={t(($) => $.game.harvest.week.total, { amount: 12480 })}
          amount={12480}
        />
      </Sample>
      <Sample caption={l.none}>
        <AmountFigure text={t(($) => $.game.side.monday)} amount={0} />
      </Sample>
    </Stack>
  )
}

export function HarvestFiguresCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="grouped" padding="lg" gap="lg">
            <Samples l={l} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
