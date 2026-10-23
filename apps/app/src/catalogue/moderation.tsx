// La section « Modération » du catalogue (tranche 7a) : la carte d'un signalement (ReportCard) dans
// tous ses états, et les deux notifications de la modération. Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne : deux personnes y travaillaient en même temps. Ses exemples (un outil
// de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import { appName, contactEmail } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { NotificationCard } from '../ui/NotificationCard'
import { ReportCard } from '../ui/ReportCard'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Modération',
  comment: 'Commentaire',
  profile: 'Profil',
  note: 'Note',
  project: 'Projet',
  three: '3 signalements',
  one: '1 signalement',
  snapshotLabel: 'Texte au moment du signalement ; images actuelles',
  scam: 'Envoie-moi le code de ta carte, je te débloque la version pro.',
  scamReasons: ['Arnaque ou spam ×2', 'Harcèlement ou haine ×1'],
  scamDetails: ['Il a écrit la même chose sous trois projets.'],
  since: 'Premier signalement le 20 oct.',
  impersonation:
    'Lucas Martin (@lucas_martin) — Je fais partie de l’équipe, écris-moi pour un accès.',
  impersonationReasons: ['Usurpation d’identité ×1'],
  impersonationDetails: ['Ce n’est pas le vrai Lucas, il est dans ma famille.'],
  ownNote: 'v3 : export en PDF',
  otherReasons: ['Autre chose ×1'],
  concernsMe: 'Te concerne : un autre administrateur doit décider.',
  gone: 'Supprimé depuis par son auteur',
  longText:
    'Regarde https://une-adresse-tres-longue-sans-aucune-espace.example/chemin/encore/plus/long/pour/deborder et dis-moi.',
  longDetails: [
    'Lien douteux.',
    'Lien douteux.',
    'Il envoie ce lien à tout le monde depuis hier soir, sous chaque projet testable.',
  ],
  removedText: 'Clique ici pour gagner un téléphone.',
  removedGround: [`Les règles de ${appName}`],
  removedExplanation: ['Les liens d’arnaque ne sont pas permis ici.'],
  removedOn: 'Retiré le 21 oct.',
  view: 'Voir',
  remove: 'Retirer',
  dismiss: 'Classer sans suite',
  restore: 'Rétablir',
  notifRemoved: 'Ton commentaire sur « Météo » a été retiré par la modération',
  notifRemovedDetail: [
    'Il n’est plus visible que de toi, jusqu’à un éventuel rétablissement.',
    'Après un signalement, une personne de la modération a décidé de le retirer.',
    `Fondement : les règles de ${appName}.`,
    'Explication : Demander un code de carte bancaire n’est pas permis ici.',
    `Pour contester : ${contactEmail}`,
  ].join('\n'),
  notifRemovedQuote: 'Écris-moi en privé pour le code',
  notifHandled: 'Ton signalement d’un commentaire a été traité : le commentaire a été retiré.',
  notifDismissed: 'Ton signalement d’un projet a été traité : nous ne l’avons pas retiré.',
  notifContest: `Pas d’accord ? Écris-nous : ${contactEmail}`,
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  isNew: 'Nouveau',
}

const en: typeof fr = {
  title: 'Moderation',
  comment: 'Comment',
  profile: 'Profile',
  note: 'Note',
  project: 'Project',
  three: '3 reports',
  one: '1 report',
  snapshotLabel: 'Text when reported; current images',
  scam: 'Send me your card code and I’ll unlock the pro version.',
  scamReasons: ['Scam or spam ×2', 'Harassment or hate ×1'],
  scamDetails: ['He wrote the same thing under three projects.'],
  since: 'First reported on Oct 20',
  impersonation: 'Lucas Martin (@lucas_martin) — I’m on the team, write to me for access.',
  impersonationReasons: ['Impersonation ×1'],
  impersonationDetails: ['This is not the real Lucas, he is in my family.'],
  ownNote: 'v3: PDF export',
  otherReasons: ['Something else ×1'],
  concernsMe: 'Concerns you: another administrator must decide.',
  gone: 'Since deleted by its author',
  longText:
    'Look at https://a-very-long-address-without-any-space.example/path/even/longer/to/overflow and tell me.',
  longDetails: [
    'Dodgy link.',
    'Dodgy link.',
    'He has been sending this link to everyone since last night, under every testable project.',
  ],
  removedText: 'Click here to win a phone.',
  removedGround: [`The rules of ${appName}`],
  removedExplanation: ['Scam links are not allowed here.'],
  removedOn: 'Removed on Oct 21',
  view: 'View',
  remove: 'Remove',
  dismiss: 'Dismiss',
  restore: 'Restore',
  notifRemoved: 'Your comment on “Météo” was removed by the moderation',
  notifRemovedDetail: [
    'Only you can see it now, until it is restored, if it ever is.',
    'After a report, a person from the moderation decided to remove it.',
    `Ground: the rules of ${appName}.`,
    'Explanation: Asking for a bank card code is not allowed here.',
    `To contest: ${contactEmail}`,
  ].join('\n'),
  notifRemovedQuote: 'Write to me privately for the code',
  notifHandled: 'Your report of a comment was handled: the comment was removed.',
  notifDismissed: 'Your report of a project was handled: we did not remove it.',
  notifContest: `Disagree? Write to us: ${contactEmail}`,
  today: 'Today',
  yesterday: 'Yesterday',
  isNew: 'New',
}

const noop = () => {}

export function ModerationCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" accessibilityRole="header">
        {l.title}
      </Text>
      {/* Les cartes de la file : un commentaire qu'on peut retirer ou classer ; un profil, qu'on
          ne peut que classer, pendant l'envoi (roue sur le bouton) ; ce qui concerne
          l'administrateur, sans bouton ; un contenu supprimé depuis ; un texte sans espace et des
          précisions en double ; enfin un contenu retiré, qu'on peut rétablir. */}
      <Stack gap="md" accessibilityRole="list">
        <ReportCard
          kind={l.comment}
          count={l.three}
          snapshot={l.scam}
          snapshotLabel={l.snapshotLabel}
          reasons={l.scamReasons}
          details={l.scamDetails}
          when={l.since}
          viewLabel={l.view}
          onView={noop}
          actions={[
            { label: l.remove, tone: 'danger', onPress: noop },
            { label: l.dismiss, onPress: noop },
          ]}
        />
        <ReportCard
          kind={l.profile}
          count={l.one}
          snapshot={l.impersonation}
          snapshotLabel={l.snapshotLabel}
          reasons={l.impersonationReasons}
          details={l.impersonationDetails}
          when={l.since}
          viewLabel={l.view}
          onView={noop}
          actions={[{ label: l.dismiss, onPress: noop, loading: true }]}
        />
        <ReportCard
          kind={l.note}
          count={l.one}
          snapshot={l.ownNote}
          snapshotLabel={l.snapshotLabel}
          reasons={l.otherReasons}
          when={l.since}
          status={l.concernsMe}
          viewLabel={l.view}
          onView={noop}
        />
        <ReportCard
          kind={l.project}
          count={l.three}
          snapshot={l.longText}
          snapshotLabel={l.snapshotLabel}
          reasons={l.scamReasons}
          details={l.longDetails}
          when={l.since}
          status={l.gone}
          viewLabel={l.view}
          onView={noop}
          actions={[{ label: l.dismiss, onPress: noop }]}
        />
        <ReportCard
          kind={l.comment}
          snapshot={l.removedText}
          reasons={l.removedGround}
          details={l.removedExplanation}
          when={l.removedOn}
          viewLabel={l.view}
          onView={noop}
          actions={[{ label: l.restore, onPress: noop }]}
        />
      </Stack>
      {/* Les deux notifications de la modération : un commentaire retiré (le détail, une phrase
          par ligne, puis l'extrait), un signalement traité sans lien (la cible n'est plus
          visible), et un autre qui mène encore au projet. */}
      <Stack gap="sm" accessibilityRole="list">
        <NotificationCard
          icon="prohibit"
          text={l.notifRemoved}
          detail={l.notifRemovedDetail}
          quote={l.notifRemovedQuote}
          when={l.today}
          isNew
          newLabel={l.isNew}
          onPress={noop}
        />
        <NotificationCard
          icon="flag"
          text={l.notifHandled}
          detail={l.notifContest}
          when={l.today}
          isNew
          newLabel={l.isNew}
        />
        <NotificationCard
          icon="flag"
          text={l.notifDismissed}
          detail={l.notifContest}
          when={l.yesterday}
          isNew={false}
          newLabel={l.isNew}
          onPress={noop}
        />
      </Stack>
    </Stack>
  )
}
