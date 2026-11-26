// Le catalogue des Éclaireuses (tranche R20) : la Goutte (ui/HoneyDrop) dans tous ses états, de jour
// et de nuit, sur le fond de la page : avec deux missions à faire, sans mission (pas de pastille),
// avec plus de neuf missions (« 9+ », un cas qui ne se produit pas : trois au plus, mais la pastille
// le tient), et repliée en languette. Dessinée sur place (`inline`), immobile (`still`) : dans
// l'appli, elle se pose seule dans le coin de l'écran. Les gestes ne mènent nulle part ici.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { kindIcon } from '../moderation/scouts/look'
import { HoneyDrop } from '../ui/HoneyDrop'
import { ListGroup } from '../ui/ListGroup'
import { ScoutReportRow } from '../ui/ScoutReportRow'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Les Éclaireuses : la Goutte',
  intro:
    'Un bouton rond nommé par ce qu’il fait (« Faire un retour sur Waiggle, 2 missions à faire ») ; la pastille, cachée aux lecteurs d’écran, ne fait que le montrer. Un appui long, la touche Menu ou l’action du lecteur la replient ; la languette la rouvre.',
  day: 'jour',
  night: 'nuit',
  missions: 'Deux missions à faire',
  none: 'Toutes faites, ou semaine sans mission : pas de pastille',
  many: 'Plus de neuf (la pastille tient « 9+ »)',
  folded: 'Repliée : la languette, sans pastille (« Rouvrir la Goutte »)',
}

const en: typeof fr = {
  title: 'The Scouts: the Drop',
  intro:
    'A round button named by what it does (“Send feedback on Waiggle, 2 missions to do”); the badge, hidden from screen readers, only shows it. A long press, the Menu key or the reader’s action fold it; the tab reopens it.',
  day: 'day',
  night: 'night',
  missions: 'Two missions to do',
  none: 'All done, or a week without missions: no badge',
  many: 'More than nine (the badge holds “9+”)',
  folded: 'Folded: the tab, without a badge (“Reopen the Drop”)',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

/** Rien : un geste du catalogue ne mène nulle part. */
const nothing = () => {}

/** Un état : sa légende, puis la Goutte. */
function Sample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      <Stack direction="row">{children}</Stack>
    </Stack>
  )
}

function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const { t } = useTranslation()
  const named = (count: number) =>
    count > 0 ? t(($) => $.scout.drop.labelMissions, { count }) : t(($) => $.scout.drop.label)
  const drop = (count: number, folded = false) => (
    <HoneyDrop
      label={named(count)}
      count={count}
      folded={folded}
      onPress={nothing}
      onLongPress={nothing}
      onUnfold={nothing}
      inline
      still
    />
  )
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.title} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.missions}>{drop(2)}</Sample>
      <Sample caption={l.none}>{drop(0)}</Sample>
      <Sample caption={l.many}>{drop(12)}</Sample>
      <Sample caption={l.folded}>{drop(2, true)}</Sample>
    </Stack>
  )
}

/** Une heure figée : les dates des rangées ne bougent pas d'une capture à l'autre. */
const NOW = new Date('2026-11-26T12:00:00.000Z')

/**
 * « Mes retours » (ui/ScoutReportRow, R20) dans tous ses états : envoyé (un bug gênant, avec son
 * menu), prévu (une idée qui répond à une mission), corrigé (bloquant, avec la note de
 * l'administrateur), lu, gardé de côté (un texte long, replié après quatre lignes), et sans menu.
 */
function ReportRows({ scheme }: { scheme: Scheme }) {
  const { t } = useTranslation()
  const kind = (code: 'bug' | 'confusing' | 'idea' | 'love') => ({
    label: t(($) => $.scout.kinds[code]),
    icon: kindIcon[code],
  })
  const status = (code: 'sent' | 'read' | 'planned' | 'fixed' | 'parked') => {
    const label = t(($) => $.scout.statuses[code])
    const tone = code === 'fixed' ? 'strong' : code === 'planned' ? 'soft' : 'neutral'
    return { label, tone } as const
  }
  const menu = {
    label: t(($) => $.scout.reportMenu),
    items: [{ label: t(($) => $.scout.deleteReport), tone: 'danger' as const, onPress: nothing }],
  }
  return (
    <Stack gap="md">
      <Text variant="headline" heading={3}>
        {`ScoutReportRow — ${scheme}`}
      </Text>
      <ListGroup title={t(($) => $.scout.myReports)} footer={t(($) => $.scout.retention)} list>
        <ScoutReportRow
          kind={kind('bug')}
          severity={{ label: t(($) => $.scout.severities.annoying), strong: false }}
          text="Quand je touche « 2 nouveaux projets », le fil remonte mais les cartes restent."
          date="2026-11-26T10:00:00.000Z"
          status={status('sent')}
          menu={menu}
          now={NOW}
        />
        <ScoutReportRow
          kind={kind('love')}
          text="Tout glisse bien sur mon téléphone, et la goutte sous le pouce."
          date="2026-11-25T10:00:00.000Z"
          mission={t(($) => $.scout.sheet.mission, { mission: 'Essaie Waiggle sur ton téléphone' })}
          status={status('read')}
          menu={menu}
          now={NOW}
        />
        <ScoutReportRow
          kind={kind('idea')}
          text="Pouvoir épingler une ruche en haut du fil."
          date="2026-11-24T10:00:00.000Z"
          status={status('planned')}
          menu={menu}
          now={NOW}
        />
        <ScoutReportRow
          kind={kind('bug')}
          severity={{ label: t(($) => $.scout.severities.blocking), strong: true }}
          text="Le bouton Publier ne répond plus après une troisième photo."
          date="2026-11-21T10:00:00.000Z"
          status={status('fixed')}
          note={t(($) => $.scout.fixedNote, { note: 'Corrigé le 28/11, merci !' })}
          menu={menu}
          now={NOW}
        />
        <ScoutReportRow
          kind={kind('confusing')}
          severity={{ label: t(($) => $.scout.severities.minor), strong: false }}
          text={
            'Je ne vois pas la différence entre suivre un projet et rejoindre ses testeurs. '.repeat(
              4,
            ) + 'Un texte long se replie après quatre lignes.'
          }
          date="2026-11-20T10:00:00.000Z"
          status={status('parked')}
          now={NOW}
        />
      </ListGroup>
    </Stack>
  )
}

export function ScoutCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit, sur le fond de la page, où la
        // Goutte se pose.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="sheet" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
      {schemes.map((scheme) => (
        // « Mes retours », de jour puis de nuit, sur le fond de la page.
        <ThemeProvider key={`rows-${scheme}`} appearance={scheme}>
          <Surface variant="sheet" padding="lg" gap="lg">
            <ReportRows scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
