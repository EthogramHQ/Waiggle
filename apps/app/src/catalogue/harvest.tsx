// La section « La récolte : le rayon et les sceaux » du catalogue (R19, planches R19-Recolte,
// R19-Profil, R19-Sceaux et R19-Miel) : ce qui ne bouge pas.
// - Le rayon (HoneyComb) : vide, à moitié, plein ; celui d'un proche ; chaque teinte et chaque
//   motif de la décoration ; la jauge d'un défi en petit (neuf, en cours, réussi).
// - Le sceau de cire (WaxSeal) : miel et crème, à ses deux tailles, nommé ou décoratif.
// - La tuile d'un sceau (SealTile) : avec et sans date, un nom long, puis tous les sceaux du
//   contrat en grille, comme « Mes sceaux ».
// Tout s'affiche de jour puis de nuit, sous un thème imposé. Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne : le catalogue est partagé par toute l'interface. Ses exemples (un
// outil de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais ;
// les noms des sceaux et la phrase du rayon viennent des vrais textes de l'appli.
import {
  type DecorationPattern,
  type DecorationTint,
  type MILESTONE_SEALS,
  DecorationPattern as Patterns,
  SEALS,
  DecorationTint as Tints,
} from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CardGrid } from '../ui/CardGrid'
import { HoneyComb } from '../ui/HoneyComb'
import { type IconName, iconPaths } from '../ui/icons.generated'
import { SealTile } from '../ui/SealTile'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { WaxSeal } from '../ui/WaxSeal'

const fr = {
  title: 'La récolte : le rayon et les sceaux',
  intro:
    'Le rayon se lit comme une barre de progression (« Mon rayon », sa phrase) ; ses alvéoles sont du dessin. Un sceau seul se lit par son nom ; dans une tuile, c’est la légende qui le dit.',
  day: 'jour',
  night: 'nuit',
  combTitle: 'HoneyComb : le rayon',
  combEmpty: 'Vide, juste après un passage de niveau',
  combHalf: 'Sept alvéoles sur dix (Miel, Lisse : offerts)',
  combFull: 'Plein : dix sur dix',
  combTheirs: 'Le rayon d’un proche, lu « Son rayon »',
  tintsTitle: 'Les teintes, sept alvéoles sur dix',
  patternsTitle: 'Les motifs, en Ambre puis en Miel',
  tints: { honey: 'Miel', amber: 'Ambre', pollen: 'Pollen' } satisfies Record<
    DecorationTint,
    string
  >,
  patterns: {
    smooth: 'Lisse',
    waffle: 'Gaufré',
    striped: 'Rayé',
    dotted: 'Pointillé',
  } satisfies Record<DecorationPattern, string>,
  gaugeTitle: 'La jauge d’un défi (small)',
  gaugeNew: 'Neuf, le lundi : 0 sur 5',
  gaugeActive: 'En cours : 3 sur 5',
  gaugeDone: 'Réussi : 3 sur 3',
  gaugeLabel: 'Défi de Famille',
  gaugeValue: '{{progress}} sur {{target}}',
  sealTitle: 'WaxSeal : le sceau de cire',
  sealMatters: 'Miel (une première fois) et crème (un palier, une catégorie), en 60 puis en 40',
  sealDecorative: 'Décoratif (label vide) : même dessin, rien de lu',
  tileTitle: 'SealTile : la tuile d’un sceau',
  tileDated: 'Avec la date (« Ma récolte »), sans date (le profil), un nom sur deux lignes',
  tileDate: '12 nov. 2026',
  allTitle: 'Tous les sceaux du contrat, en grille',
}

const en: typeof fr = {
  title: 'The harvest: the comb and the seals',
  intro:
    'The comb reads as a progress bar (“My comb”, its sentence); its cells are drawing. A seal on its own reads by its name; in a tile, the caption says it.',
  day: 'day',
  night: 'night',
  combTitle: 'HoneyComb: the comb',
  combEmpty: 'Empty, right after a level up',
  combHalf: 'Seven cells out of ten (Honey, Smooth: free)',
  combFull: 'Full: ten out of ten',
  combTheirs: 'A close one’s comb, read “Their comb”',
  tintsTitle: 'The tints, seven cells out of ten',
  patternsTitle: 'The patterns, in Amber then in Honey',
  tints: { honey: 'Honey', amber: 'Amber', pollen: 'Pollen' },
  patterns: { smooth: 'Smooth', waffle: 'Waffle', striped: 'Striped', dotted: 'Dotted' },
  gaugeTitle: 'A challenge gauge (small)',
  gaugeNew: 'New, on Monday: 0 of 5',
  gaugeActive: 'Under way: 3 of 5',
  gaugeDone: 'Done: 3 of 3',
  gaugeLabel: 'Family challenge',
  gaugeValue: '{{progress}} of {{target}}',
  sealTitle: 'WaxSeal: the wax seal',
  sealMatters: 'Honey (a first time) and cream (a milestone, a category), at 60 then at 40',
  sealDecorative: 'Decorative (empty label): same drawing, nothing read',
  tileTitle: 'SealTile: a seal’s tile',
  tileDated: 'With the date (“My harvest”), without (the profile), a name on two lines',
  tileDate: 'Nov 12, 2026',
  allTitle: 'Every seal of the contract, in a grid',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

type SealCode = (typeof SEALS)[number]['code']
type MilestoneCode = (typeof MILESTONE_SEALS)[number]['code']
type CategoryCode = Exclude<SealCode, MilestoneCode>

/** Un sceau de palier a toujours un « _ » dans son code, une catégorie jamais (contrat). */
const isMilestone = (code: SealCode): code is MilestoneCode => code.includes('_')
/** L'icône du contrat est-elle dessinée ? Une icône manquante se voit ici, par son absence. */
const isIcon = (name: string): name is IconName => name in iconPaths

/** Une légende d'exemple, au-dessus de son état. */
function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  )
}

/** Un exemple : sa légende, puis l'état. */
function Sample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Caption>{caption}</Caption>
      {children}
    </Stack>
  )
}

/** Les exemples d'un thème. */
function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const { t } = useTranslation()
  const mine = t(($) => $.game.comb.mine)
  const cellsText = (count: number) => t(($) => $.game.comb.cells, { count, next: 5 })
  const gauge = (progress: number, target: number) =>
    l.gaugeValue.replace('{{progress}}', String(progress)).replace('{{target}}', String(target))
  const sealName = (code: SealCode) =>
    isMilestone(code)
      ? t(($) => $.game.seals[code])
      : t(($) => $.game.seals.category[code as CategoryCode])

  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.combTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.combEmpty}>
        <HoneyComb
          cells={0}
          label={mine}
          valueText={cellsText(0)}
          tint="honey"
          pattern="smooth"
          size="regular"
        />
      </Sample>
      <Sample caption={l.combHalf}>
        <HoneyComb
          cells={7}
          label={mine}
          valueText={cellsText(7)}
          tint="honey"
          pattern="smooth"
          size="regular"
        />
      </Sample>
      <Sample caption={l.combFull}>
        <HoneyComb
          cells={10}
          label={mine}
          valueText={cellsText(10)}
          tint="honey"
          pattern="smooth"
          size="regular"
        />
      </Sample>
      <Sample caption={l.combTheirs}>
        <HoneyComb
          cells={6}
          label={t(($) => $.game.comb.theirs)}
          valueText={cellsText(6)}
          tint="amber"
          pattern="smooth"
          size="regular"
        />
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.tintsTitle} — ${l[scheme]}`}
      </Text>
      {Tints.options.map((tint) => (
        <Sample key={tint} caption={l.tints[tint]}>
          <HoneyComb
            cells={7}
            label={mine}
            valueText={cellsText(7)}
            tint={tint}
            pattern="smooth"
            size="regular"
          />
        </Sample>
      ))}

      <Text variant="headline" heading={3}>
        {`${l.patternsTitle} — ${l[scheme]}`}
      </Text>
      {Patterns.options.map((pattern) => (
        <Sample key={pattern} caption={l.patterns[pattern]}>
          <HoneyComb
            cells={7}
            label={mine}
            valueText={cellsText(7)}
            tint="amber"
            pattern={pattern}
            size="regular"
          />
          <HoneyComb
            cells={7}
            label={mine}
            valueText={cellsText(7)}
            tint="honey"
            pattern={pattern}
            size="regular"
          />
        </Sample>
      ))}

      <Text variant="headline" heading={3}>
        {`${l.gaugeTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.gaugeNew}>
        <HoneyComb
          cells={0}
          count={5}
          label={l.gaugeLabel}
          valueText={gauge(0, 5)}
          tint="honey"
          pattern="smooth"
          size="small"
        />
      </Sample>
      <Sample caption={l.gaugeActive}>
        <HoneyComb
          cells={3}
          count={5}
          label={l.gaugeLabel}
          valueText={gauge(3, 5)}
          tint="honey"
          pattern="smooth"
          size="small"
        />
      </Sample>
      <Sample caption={l.gaugeDone}>
        <HoneyComb
          cells={3}
          count={3}
          label={l.gaugeLabel}
          valueText={gauge(3, 3)}
          tint="honey"
          pattern="smooth"
          size="small"
        />
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.sealTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.sealMatters}>
        <Stack direction="row" gap="md" align="center" wrap>
          <WaxSeal
            icon="rocket-launch"
            matter="honey"
            size="regular"
            label={sealName('first_project')}
          />
          <WaxSeal icon="cooking-pot" matter="cream" size="regular" label={sealName('cooking')} />
          <WaxSeal
            icon="rocket-launch"
            matter="honey"
            size="small"
            label={sealName('first_project')}
          />
          <WaxSeal icon="cooking-pot" matter="cream" size="small" label={sealName('cooking')} />
        </Stack>
      </Sample>
      <Sample caption={l.sealDecorative}>
        <Stack direction="row" gap="md" align="center" wrap>
          <WaxSeal icon="check-circle" matter="honey" size="regular" label="" />
          <WaxSeal icon="users-three" matter="cream" size="regular" label="" />
        </Stack>
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.tileTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.tileDated}>
        <CardGrid minWidth={96} gap="sm" columns={3}>
          <SealTile
            seal={{ icon: 'check-circle', matter: 'honey', size: 'regular', label: '' }}
            name={sealName('first_settled')}
            date={l.tileDate}
          />
          <SealTile
            seal={{ icon: 'cooking-pot', matter: 'cream', size: 'regular', label: '' }}
            name={sealName('cooking')}
          />
          <SealTile
            seal={{ icon: 'heartbeat', matter: 'cream', size: 'regular', label: '' }}
            name={sealName('health-sport')}
            date={l.tileDate}
          />
        </CardGrid>
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.allTitle} — ${l[scheme]}`}
      </Text>
      <CardGrid minWidth={96} gap="sm">
        {SEALS.map((seal) =>
          isIcon(seal.icon) ? (
            <SealTile
              key={seal.code}
              seal={{ icon: seal.icon, matter: seal.matter, size: 'regular', label: '' }}
              name={sealName(seal.code)}
            />
          ) : null,
        )}
      </CardGrid>
    </Stack>
  )
}

export function HarvestCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit. La surface groupée a le fond
        // de « Ma récolte », où le rayon et les sceaux se posent.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="grouped" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
