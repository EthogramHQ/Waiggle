// La section « Suspension » du catalogue (tranche 7c) : le bandeau d'un compte suspendu
// (SuspensionBanner) dans ses états (replié, puis déplié : 7 jours après un signalement, 30 jours,
// sans fin et sans signalement, une explication très longue), le bouton « Suivre » inactif d'un
// membre suspendu qui vient de ne plus suivre, et l'en-tête d'un profil verrouillé (MemberHeader,
// des outils sans lien). Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne :
// plusieurs agents y travaillaient en même temps. Ses exemples (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais.
import type { Suspension } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { FollowButton } from '../ui/FollowButton'
import { MemberHeader } from '../ui/MemberHeader'
import { Stack } from '../ui/Stack'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { Text } from '../ui/Text'

const fr = {
  title: 'Suspension',
  folded: 'Replié (hors de l’accueil, la suspension déjà vue) : « Détails » déplie sur place',
  foldedIndefinite: 'Replié, sans fin',
  unfolded: 'Déplié (l’accueil, ou la première visite après une suspension nouvelle)',
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
  locked: 'En-tête d’un profil verrouillé : les outils en pastilles, sans lien',
  lockedName: 'Karim Benali',
  lockedHandle: '@karim_b',
  lockedBio: 'Des petits jeux faits avec Cursor.',
  lockedTools: 'Outils favoris',
}

const en: typeof fr = {
  title: 'Suspension',
  folded: 'Folded (away from home, the suspension already seen): “Details” unfolds in place',
  foldedIndefinite: 'Folded, with no end',
  unfolded: 'Unfolded (home, or the first visit after a new suspension)',
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
  locked: 'Header of a locked profile: the tools as plain pills, without links',
  lockedName: 'Karim Benali',
  lockedHandle: '@karim_b',
  lockedBio: 'Little games made with Cursor.',
  lockedTools: 'Favorite tools',
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
      {/* Replié : la ligne forte et « Détails », imposé ici (initiallyOpen false) pour que
          l'exemple ne dépende pas de la mémoire du navigateur. */}
      {(
        [
          [l.folded, examples.sevenDays],
          [l.foldedIndefinite, examples.indefinite],
        ] as const
      ).map(([caption, suspension]) => (
        <Stack key={caption} gap="sm">
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
          <SuspensionBanner suspension={suspension} initiallyOpen={false} />
        </Stack>
      ))}
      <Text variant="caption" weight={600} tone="muted">
        {l.unfolded}
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
          <SuspensionBanner suspension={suspension} initiallyOpen />
        </Stack>
      ))}
      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.locked}
        </Text>
        <MemberHeader
          name={l.lockedName}
          handle={l.lockedHandle}
          avatar={null}
          bio={l.lockedBio}
          toolsTitle={l.lockedTools}
          tools={[{ label: 'Cursor' }, { label: 'ChatGPT' }]}
        />
      </Stack>
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
