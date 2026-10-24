// La section « Modération » du catalogue (tranche 7a) : la carte d'un signalement (ReportCard) dans
// tous ses états, et les deux notifications de la modération. Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne : deux personnes y travaillaient en même temps. Ses exemples (un outil
// de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import { appName, contactEmail } from '@ruche/brand'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
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
  snapshotLabel: 'Copie au moment du signalement',
  scam: 'Envoie-moi le code de ta carte, je te débloque la version pro.',
  scamReasons: ['Arnaque ou spam : 2', 'Harcèlement ou haine : 1'],
  scamDetails: ['Il a écrit la même chose sous trois projets.'],
  since: 'Premier signalement le 20 oct.',
  impersonation:
    'Lucas Martin (@lucas_martin) — Je fais partie de l’équipe, écris-moi pour un accès.',
  impersonationReasons: ['Usurpation d’identité : 1'],
  impersonationDetails: ['Ce n’est pas le vrai Lucas, il est dans ma famille.'],
  ownNote: 'v3 : export en PDF',
  otherReasons: ['Autre chose : 1'],
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
  removedProjectText: 'Photos de la soirée — Toutes les photos de samedi, avec les noms.',
  removedLawGround: ['La loi'],
  removedLawExplanation: ['Des photos de personnes publiées sans leur accord.'],
  view: 'Voir',
  viewProject: 'Voir le projet',
  remove: 'Retirer',
  dismiss: 'Classer sans suite',
  restore: 'Rétablir',
  describeScam: 'Commentaire : Envoie-moi le code de ta carte, je te débloque la version pro.',
  dismissed: 'Signalement classé sans suite.',
  removedDone: 'Contenu retiré.',
  restoredDone: 'Contenu rétabli.',
  alreadyDecided: 'Une décision a déjà été prise sur ce contenu entre-temps.',
  failed: 'Une erreur inattendue est survenue. Réessaie dans un instant.',
  openRemove: 'Ouvrir la fenêtre « Retirer »',
  removeTitle: 'Retirer ce contenu ?',
  removeMessage:
    'Les autres membres ne le verront plus. Son auteur sera prévenu, avec ton explication. Tu pourras le rétablir.',
  confirmRemove: 'Retirer ce contenu',
  cancel: 'Annuler',
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
  snapshotLabel: 'Copy at the time of the report',
  scam: 'Send me your card code and I’ll unlock the pro version.',
  scamReasons: ['Scam or spam: 2', 'Harassment or hate: 1'],
  scamDetails: ['He wrote the same thing under three projects.'],
  since: 'First reported on Oct 20',
  impersonation: 'Lucas Martin (@lucas_martin) — I’m on the team, write to me for access.',
  impersonationReasons: ['Impersonation: 1'],
  impersonationDetails: ['This is not the real Lucas, he is in my family.'],
  ownNote: 'v3: PDF export',
  otherReasons: ['Something else: 1'],
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
  removedProjectText: 'Party photos — All the photos from Saturday, with the names.',
  removedLawGround: ['The law'],
  removedLawExplanation: ['Photos of people published without their consent.'],
  view: 'View',
  viewProject: 'View the project',
  remove: 'Remove',
  dismiss: 'Dismiss',
  restore: 'Restore',
  describeScam: 'Comment: Send me your card code and I’ll unlock the pro version.',
  dismissed: 'Report dismissed.',
  removedDone: 'Content removed.',
  restoredDone: 'Content restored.',
  alreadyDecided: 'A decision was already made on this content in the meantime.',
  failed: 'Something went wrong. Try again in a moment.',
  openRemove: 'Open the “Remove” window',
  removeTitle: 'Remove this content?',
  removeMessage:
    'Other members will no longer see it. Its author will be told, with your explanation. You can restore it.',
  confirmRemove: 'Remove this content',
  cancel: 'Cancel',
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
  // La fenêtre « Retirer » d'exemple, ouverte par un bouton.
  const [dialog, setDialog] = useState(false)
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      {/* Les cartes de la file : un commentaire qu'on peut retirer ou classer ; un profil, qu'on
          ne peut que classer, pendant l'envoi (roue sur le bouton) ; ce qui concerne
          l'administrateur, sans bouton ; un contenu supprimé depuis ; un texte sans espace et des
          précisions en double ; enfin un commentaire retiré, qu'on peut rétablir (son lien mène
          au projet), et un projet retiré, sans lien, qui vient d'être rétabli. */}
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
          description={l.describeScam}
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
          viewLabel={l.viewProject}
          onView={noop}
          actions={[{ label: l.restore, onPress: noop }]}
        />
        {/* Un projet retiré n'a plus de page : pas de lien. Celui-ci vient d'être rétabli. */}
        <ReportCard
          kind={l.project}
          snapshot={l.removedProjectText}
          reasons={l.removedLawGround}
          details={l.removedLawExplanation}
          when={l.removedOn}
          decided={{ message: l.restoredDone, ok: true }}
          actions={[{ label: l.restore, onPress: noop }]}
        />
      </Stack>
      {/* Les cartes après une décision : elles restent à leur place, le résultat à la place des
          boutons (classé, retiré, ou décidé entre-temps par quelqu'un d'autre) ; et une panne, au-
          dessus des boutons, qui restent pour réessayer. */}
      <Stack gap="md" accessibilityRole="list">
        <ReportCard
          kind={l.comment}
          count={l.three}
          snapshot={l.scam}
          snapshotLabel={l.snapshotLabel}
          reasons={l.scamReasons}
          when={l.since}
          viewLabel={l.view}
          onView={noop}
          description={l.describeScam}
          decided={{ message: l.dismissed, ok: true }}
          actions={[{ label: l.dismiss, onPress: noop }]}
        />
        <ReportCard
          kind={l.comment}
          count={l.one}
          snapshot={l.removedText}
          snapshotLabel={l.snapshotLabel}
          reasons={l.otherReasons}
          when={l.since}
          viewLabel={l.view}
          onView={noop}
          decided={{ message: l.removedDone, ok: true }}
        />
        <ReportCard
          kind={l.project}
          count={l.one}
          snapshot={l.longText}
          snapshotLabel={l.snapshotLabel}
          reasons={l.otherReasons}
          when={l.since}
          viewLabel={l.view}
          onView={noop}
          decided={{ message: l.alreadyDecided, ok: false }}
        />
        <ReportCard
          kind={l.profile}
          count={l.one}
          snapshot={l.impersonation}
          snapshotLabel={l.snapshotLabel}
          reasons={l.impersonationReasons}
          when={l.since}
          viewLabel={l.view}
          onView={noop}
          error={l.failed}
          actions={[{ label: l.dismiss, onPress: noop }]}
        />
      </Stack>
      {/* La fenêtre « Retirer » rappelle le contenu visé sous son titre (trois lignes au plus). */}
      <Button label={l.openRemove} variant="secondary" onPress={() => setDialog(true)} />
      <Dialog
        visible={dialog}
        title={l.removeTitle}
        quote={{ label: l.project, text: l.longDetails.join(' ').repeat(3) }}
        message={l.removeMessage}
        onDismiss={() => setDialog(false)}
      >
        <Button label={l.confirmRemove} variant="confirm" onPress={() => setDialog(false)} />
        <Button label={l.cancel} variant="secondary" onPress={() => setDialog(false)} />
      </Dialog>
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
