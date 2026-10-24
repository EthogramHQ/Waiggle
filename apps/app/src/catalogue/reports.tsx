// La section « Signaler, et ce qui est retiré » du catalogue (tranche 7a) : le bandeau d'un contenu
// retiré, les commentaires et le journal avec leur « Signaler », et ce que lit l'auteur d'un
// contenu retiré ; depuis la tranche 7b, la carte de la file avec sa copie champ par champ et l'état
// de ses images. Un fichier à part, avec ses propres textes : la section de la modération
// (`moderation.tsx`) vit à côté, sans que deux personnes écrivent dans le même fichier.
// Outil de développement : les exemples sont écrits ici, pas dans les traductions des membres.
import { useTranslation } from 'react-i18next'
import { CommentCard } from '../ui/CommentCard'
import { NoteList } from '../ui/NoteList'
import { RemovalNotice } from '../ui/RemovalNotice'
import { ReportCard } from '../ui/ReportCard'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'

const fr = {
  section: 'Signaler, et ce qui est retiré',
  removedTitle: 'Retiré par la modération',
  onlyYou: 'Les autres membres ne voient plus ce contenu, jusqu’à un éventuel rétablissement.',
  afterReport: 'Après un signalement, une personne de la modération a décidé de le retirer.',
  direct: 'Une personne de la modération a décidé de le retirer.',
  groundRules: 'Fondement : les règles de Waiggle.',
  groundLaw: 'Fondement : la loi.',
  explanation: 'Explication : Écrire de faux avis n’est pas permis ici.',
  explanationLong:
    'Explication : Demander un code de carte bancaire n’est pas permis ici, même pour rire : https://exemple.fr/une-adresse-tres-longue-qui-doit-se-couper',
  contest: 'Pour contester : contact@waiggle.com',
  removedPlaceholder: 'Contenu retiré par la modération',
  when: '18 oct.',
  maxPage: 'Voir la page de Max',
  inesPage: 'Voir la page d’Inès',
  commentBody: 'Testé avec les restes de raclette : trois idées, dont une soupe. Bluffant.',
  removedBody: 'Écris-moi en privé, je te fais tes avis pour 5 €.',
  report: 'Signaler',
  deleteComment: 'Supprimer le commentaire',
  deleteShort: 'Supprimer',
  reportNote: 'Signaler cette note',
  noteRecent: 'v2 : il publie les avis tout seul, sur plusieurs sites à la fois.',
  noteOlder: 'Première version : il propose trois avis à recopier.',
  noteWhen: '19 oct.',
  noteOlderWhen: '14 oct.',
  journalOther: 'Le journal vu par un autre membre : un drapeau par note.',
  journalAuthor: 'Le journal vu par son auteur : la note retirée garde sa place, avec le bandeau.',
  // Tranche 7b : la copie d'un signalement champ par champ, ses images, et une copie qui a changé.
  copyCaption:
    'La file de modération (tranche 7b) : la copie champ par champ, l’état des images, une copie qui a changé.',
  projectKind: 'Projet',
  profileKind: 'Profil',
  copyLabel: 'Copie au moment du signalement',
  count2: '2 signalements',
  count1: '1 signalement',
  scamReason: 'Arnaque ou spam : 2',
  impersonationReason: 'Usurpation d’identité : 1',
  since: 'Premier signalement le 22 oct.',
  view: 'Voir',
  remove: 'Retirer',
  dismiss: 'Classer sans suite',
  changed: 'Le contenu a changé entre deux signalements : voici sa version la plus récente.',
  fields: [
    { label: 'Titre', value: 'Faux avis en masse' },
    { label: 'Pitch', value: 'Cinquante avis cinq étoiles pour ta boutique, en un clic.' },
    { label: 'Prompt', value: 'Écris 50 avis enthousiastes et variés pour la boutique {{nom}}.' },
    { label: 'Lien de démo', value: 'https://faux-avis.example/essai-gratuit-sans-inscription' },
  ],
  images: ['Couverture : toujours affichée', 'Photo : supprimée ou remplacée depuis'],
  profileFields: [
    { label: 'Nom', value: 'Équipe officielle' },
    { label: 'Pseudo', value: 'waiggle_support' },
    { label: 'Bio', value: 'Je fais partie de l’équipe, écris-moi pour un accès.' },
  ],
  avatarImage: ['Photo de profil : toujours affichée'],
}

const en: typeof fr = {
  section: 'Reporting, and what is removed',
  removedTitle: 'Removed by the moderation',
  onlyYou: 'Other members can no longer see it, until it may be restored.',
  afterReport: 'After a report, a person from the moderation decided to remove it.',
  direct: 'A person from the moderation decided to remove it.',
  groundRules: 'Ground: the rules of Waiggle.',
  groundLaw: 'Ground: the law.',
  explanation: 'Explanation: Writing fake reviews is not allowed here.',
  explanationLong:
    'Explanation: Asking for a bank card code is not allowed here, even as a joke: https://example.com/a-very-long-address-that-has-to-wrap',
  contest: 'To contest: contact@waiggle.com',
  removedPlaceholder: 'Content removed by the moderation',
  when: 'Oct 18',
  maxPage: 'See Max’s page',
  inesPage: 'See Inès’s page',
  commentBody: 'Tried it with leftover raclette: three ideas, one of them a soup. Amazing.',
  removedBody: 'Message me privately, I’ll write your reviews for €5.',
  report: 'Report',
  deleteComment: 'Delete the comment',
  deleteShort: 'Delete',
  reportNote: 'Report this note',
  noteRecent: 'v2: it posts the reviews by itself, on several sites at once.',
  noteOlder: 'First version: it suggests three reviews to copy.',
  noteWhen: 'Oct 19',
  noteOlderWhen: 'Oct 14',
  journalOther: 'The journal seen by another member: a flag per note.',
  journalAuthor:
    'The journal seen by its author: the removed note keeps its place, with the banner.',
  copyCaption:
    'The moderation queue (slice 7b): the copy field by field, the state of the images, a copy that changed.',
  projectKind: 'Project',
  profileKind: 'Profile',
  copyLabel: 'Copy made when reported',
  count2: '2 reports',
  count1: '1 report',
  scamReason: 'Scam or spam: 2',
  impersonationReason: 'Impersonation: 1',
  since: 'First reported on Oct 22',
  view: 'See',
  remove: 'Remove',
  dismiss: 'Dismiss',
  changed: 'The content changed between two reports: here is its latest version.',
  fields: [
    { label: 'Title', value: 'Fake reviews in bulk' },
    { label: 'Pitch', value: 'Fifty five-star reviews for your shop, in one click.' },
    { label: 'Prompt', value: 'Write 50 enthusiastic and varied reviews for the shop {{name}}.' },
    { label: 'Demo link', value: 'https://fake-reviews.example/free-trial-no-sign-up' },
  ],
  images: ['Cover: still shown', 'Photo: deleted or replaced since'],
  profileFields: [
    { label: 'Name', value: 'Official team' },
    { label: 'Handle', value: 'waiggle_support' },
    { label: 'Bio', value: 'I’m part of the team, message me for access.' },
  ],
  avatarImage: ['Profile photo: still shown'],
}

export function ReportSamples() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // Le bandeau après un signalement, au nom des règles ; puis sans signalement, au nom de la loi,
  // avec une explication longue qui doit se couper.
  const afterReport = {
    title: l.removedTitle,
    lines: [l.onlyYou, l.afterReport, l.groundRules, l.explanation, l.contest],
  }
  const byLaw = {
    title: l.removedTitle,
    lines: [l.onlyYou, l.direct, l.groundLaw, l.explanationLong, l.contest],
  }
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.section}
      </Text>
      {/* En tête d'un projet retiré, pour son auteur : les deux sortes de retrait. */}
      <RemovalNotice {...afterReport} />
      <RemovalNotice {...byLaw} />
      {/* Les commentaires : celui d'un autre membre, avec « Signaler » ; le sien, retiré (le
          bandeau, et « Supprimer » seul : il ne se modifie plus) ; l'emplacement que lisent les
          autres, l'auteur du projet compris. */}
      <Surface variant="grouped" padding="xl" gap="xl">
        <CommentCard
          author={{ name: 'Inès Haddad', avatar: null }}
          authorLabel={l.inesPage}
          onAuthorPress={() => {}}
          when={l.when}
          body={l.commentBody}
          actions={[{ id: 'report', label: l.report, icon: 'flag', onPress: () => {} }]}
        />
        <CommentCard
          author={{ name: 'Max Durand', avatar: null }}
          authorLabel={l.maxPage}
          onAuthorPress={() => {}}
          when={l.when}
          body={l.removedBody}
          removed={afterReport}
          actions={[
            {
              id: 'delete',
              label: l.deleteComment,
              text: l.deleteShort,
              icon: 'trash',
              tone: 'danger',
              onPress: () => {},
            },
          ]}
        />
        <CommentCard author={null} when={l.when} body="" placeholder={l.removedPlaceholder} />
      </Surface>
      {/* Le journal : vu par un autre membre (un drapeau par note), puis par son auteur, avec une
          note retirée. */}
      <Text variant="caption" tone="muted">
        {l.journalOther}
      </Text>
      <Surface variant="grouped" padding="xl" gap="lg">
        <NoteList
          notes={[
            { id: 'n2', body: l.noteRecent, when: l.noteWhen },
            { id: 'n1', body: l.noteOlder, when: l.noteOlderWhen },
          ]}
          onReport={() => {}}
          reportLabel={l.reportNote}
        />
      </Surface>
      <Text variant="caption" tone="muted">
        {l.journalAuthor}
      </Text>
      <Surface variant="grouped" padding="xl" gap="lg">
        <NoteList
          notes={[
            { id: 'n2', body: l.noteRecent, when: l.noteWhen, removed: byLaw },
            { id: 'n1', body: l.noteOlder, when: l.noteOlderWhen },
          ]}
          onDelete={() => {}}
        />
      </Surface>
      {/* Tranche 7b : la carte de la file avec une copie en champs. Un projet signalé deux fois,
          qui a changé entre-temps, avec ses deux images (l'une encore là, l'autre partie) ; puis
          un profil, sa photo toujours affichée, sans phrase sur la copie. */}
      <Text variant="caption" tone="muted">
        {l.copyCaption}
      </Text>
      <ReportCard
        kind={l.projectKind}
        count={l.count2}
        snapshot={l.fields}
        snapshotLabel={l.copyLabel}
        snapshotNote={l.changed}
        images={l.images}
        reasons={[l.scamReason]}
        when={l.since}
        viewLabel={l.view}
        onView={() => {}}
        actions={[
          { label: l.remove, onPress: () => {}, tone: 'danger' },
          { label: l.dismiss, onPress: () => {} },
        ]}
      />
      <ReportCard
        kind={l.profileKind}
        count={l.count1}
        snapshot={l.profileFields}
        snapshotLabel={l.copyLabel}
        images={l.avatarImage}
        reasons={[l.impersonationReason]}
        when={l.since}
        viewLabel={l.view}
        onView={() => {}}
        actions={[{ label: l.dismiss, onPress: () => {} }]}
      />
    </Stack>
  )
}
