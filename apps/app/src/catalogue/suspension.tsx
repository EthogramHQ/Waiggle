// La section « Suspension » du catalogue (tranche 7c) : le bandeau d'un compte suspendu
// (SuspensionBanner) dans ses états (7 jours après un signalement, 30 jours, sans fin et sans
// signalement, une explication très longue), et le bouton « Suivre » inactif d'un membre suspendu
// qui vient de ne plus suivre. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne :
// plusieurs agents y travaillaient en même temps. Ses exemples (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais.
import type { Suspension } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { FollowButton } from '../ui/FollowButton'
import { Stack } from '../ui/Stack'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { Text } from '../ui/Text'

const fr = {
  title: 'Suspension',
  sevenDays: '7 jours, après un signalement',
  thirtyDays: '30 jours, sans signalement',
  indefinite: 'Sans fin, au nom de la loi',
  long: 'Une explication très longue, avec une adresse sans espace',
  follow: '« Suivre » inactif, le suivi retiré pendant la suspension',
  scam: 'Trois messages d’arnaque en deux jours, après deux retraits.',
  spam: 'Le même lien publicitaire sous vingt projets en une heure.',
  photos: 'Publication répétée de photos de personnes sans leur accord.',
  longText:
    'Tu as envoyé https://une-adresse-tres-longue-sans-aucune-espace.example/chemin/encore/plus/long à des dizaines de membres, en te présentant comme l’équipe : c’est une usurpation, et les règles l’interdisent.',
  followText: 'Suivre',
  followLabel: 'Suivre Léa',
}

const en: typeof fr = {
  title: 'Suspension',
  sevenDays: '7 days, after a report',
  thirtyDays: '30 days, without a report',
  indefinite: 'With no end, on the ground of the law',
  long: 'A very long explanation, with an address without spaces',
  follow: '“Follow” inactive, the follow removed during the suspension',
  scam: 'Three scam messages in two days, after two removals.',
  spam: 'The same advertising link under twenty projects in one hour.',
  photos: 'Repeated posting of photos of people without their consent.',
  longText:
    'You sent https://a-very-long-address-without-any-space.example/path/even/longer/still to dozens of members, presenting yourself as the team: this is impersonation, and the rules forbid it.',
  followText: 'Follow',
  followLabel: 'Follow Léa',
}

/** Les suspensions d'exemple : leurs dates sont fixes, la fin tombe à 0 h 30 heure de Paris. */
const suspensions = (l: typeof fr) => {
  const sevenDays: Suspension = {
    since: '2026-10-26T23:30:00.000Z',
    endsAt: '2026-11-02T23:30:00.000Z',
    ground: 'rules',
    explanation: l.scam,
    afterReport: true,
  }
  const thirtyDays: Suspension = {
    since: '2026-10-26T09:00:00.000Z',
    endsAt: '2026-11-25T09:00:00.000Z',
    ground: 'rules',
    explanation: l.spam,
    afterReport: false,
  }
  const indefinite: Suspension = {
    since: '2026-10-25T08:00:00.000Z',
    endsAt: null,
    ground: 'illegal',
    explanation: l.photos,
    afterReport: false,
  }
  const long: Suspension = { ...sevenDays, explanation: l.longText }
  return { sevenDays, thirtyDays, indefinite, long }
}

const noop = () => {}

export function SuspensionCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const examples = suspensions(l)
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      {(
        [
          [l.sevenDays, examples.sevenDays],
          [l.thirtyDays, examples.thirtyDays],
          [l.indefinite, examples.indefinite],
          [l.long, examples.long],
        ] as const
      ).map(([caption, suspension]) => (
        <Stack key={caption} gap="sm">
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
          <SuspensionBanner suspension={suspension} />
        </Stack>
      ))}
      <Stack gap="sm" align="start">
        <Text variant="caption" tone="muted">
          {l.follow}
        </Text>
        <FollowButton
          followed={false}
          onPress={noop}
          label={l.followLabel}
          text={l.followText}
          disabled
        />
      </Stack>
    </Stack>
  )
}
