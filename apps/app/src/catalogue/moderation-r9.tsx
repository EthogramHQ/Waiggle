// La section « Modération R9 » du catalogue : les éléments de la file (`ReportCard` avec une
// adresse) et la fiche de l'auteur (`AuthorRecord`), dans tous leurs états. Un fichier à part :
// les autres sections de la modération (`moderation.tsx`, `reports.tsx`) vivent à côté, sans que
// deux personnes écrivent dans le même fichier. Outil de développement : les exemples sont écrits
// ici, en français et en anglais, pas dans les traductions des membres.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthorRecord } from '../ui/AuthorRecord'
import { ReportCard } from '../ui/ReportCard'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'

const fr = {
  title: 'Modération (R9) : la file et la fiche de l’auteur',
  queue: 'La file : touche un élément pour le marquer « actuel »',
  full: 'La carte entière, avec sa partie et son heure',
  record: 'La fiche de l’auteur',
  comment: 'Commentaire',
  project: 'Projet',
  profile: 'Profil',
  photo2: 'la photo 2',
  bio: 'la bio',
  scam: 'Arnaque ou spam',
  privacy: 'Une photo ou une information sur moi sans mon accord',
  other: 'Autre chose',
  harassment: 'Harcèlement ou haine',
  scamText: 'Gagne 500 € par jour avec mon robot de trading, lien dans mon profil',
  scamContext: 'Gains Rapides (@gains_rapides), sur Décollage !',
  meteoTitle: 'Le ciel de ce soir',
  meteoContext: 'Le ciel de ce soir, d’Inès Haddad (@ines_haddad)',
  bioText: 'Développeur. Écris-moi pour un accès.',
  ownContext: 'Louis (@louis), ton profil',
  concernsMe: 'Te concerne : un autre administrateur doit décider.',
  longReason:
    'Une photo ou une information sur moi sans mon accord, Harcèlement ou haine, Arnaque ou spam',
  longText:
    'https://une-adresse-tres-longue-sans-aucune-espace.example/chemin/encore/plus/long/pour/deborder',
  longContext: 'Bartholomé-Alexandre de La Rochefoucauld (@bartholome_alexandre), sur Météo',
  min12: { relative: 'il y a 12 min', exact: 'aujourd’hui à 17:48' },
  hour1: { relative: 'il y a 1 h', exact: 'aujourd’hui à 17:00' },
  yesterday: { relative: 'hier', exact: 'hier à 21:15' },
  describeScam: 'Commentaire : Gagne 500 € par jour…',
  describeMeteo: 'Projet, la photo 2 : Le ciel de ce soir',
  remove: 'Retirer',
  dismiss: 'Classer sans suite',
  dismissed: 'Signalement classé sans suite.',
  failed: 'La décision n’a pas pu être enregistrée. Réessaie.',
  snapshotLabel: 'Copie au moment du signalement',
  detailsLabel: 'Précisions des personnes qui ont signalé',
  details: ['On me reconnaît sur mon balcon. Je n’ai jamais donné mon accord.'],
  since: 'Premier signalement le 30 oct.',
}

const en: typeof fr = {
  title: 'Moderation (R9): the queue and the author record',
  queue: 'The queue: tap an item to mark it “current”',
  full: 'The whole card, with its part and its time',
  record: 'The author record',
  comment: 'Comment',
  project: 'Project',
  profile: 'Profile',
  photo2: 'photo 2',
  bio: 'the bio',
  scam: 'Scam or spam',
  privacy: 'A photo or information about me without my consent',
  other: 'Something else',
  harassment: 'Harassment or hate',
  scamText: 'Earn €500 a day with my trading bot, link in my profile',
  scamContext: 'Gains Rapides (@gains_rapides), on Décollage!',
  meteoTitle: 'Tonight’s sky',
  meteoContext: 'Tonight’s sky, by Inès Haddad (@ines_haddad)',
  bioText: 'Developer. Write to me for access.',
  ownContext: 'Louis (@louis), your profile',
  concernsMe: 'About you: another administrator must decide.',
  longReason:
    'A photo or information about me without my consent, Harassment or hate, Scam or spam',
  longText: 'https://a-very-long-address-without-any-space.example/path/even/longer/to/overflow',
  longContext: 'Bartholomew-Alexander de La Rochefoucauld (@bartholome_alexandre), on Météo',
  min12: { relative: '12 min ago', exact: 'today at 5:48 PM' },
  hour1: { relative: '1 h ago', exact: 'today at 5:00 PM' },
  yesterday: { relative: 'yesterday', exact: 'yesterday at 9:15 PM' },
  describeScam: 'Comment: Earn €500 a day…',
  describeMeteo: 'Project, photo 2: Tonight’s sky',
  remove: 'Remove',
  dismiss: 'Dismiss',
  dismissed: 'Report dismissed.',
  failed: 'The decision could not be saved. Try again.',
  snapshotLabel: 'Copy at the time of the report',
  detailsLabel: 'Details from the people who reported',
  details: ['You can recognise me on my balcony. I never agreed to it.'],
  since: 'First reported on Oct 30',
}

/** « Maintenant » pour les fiches : le 30 octobre 2026 à midi, à Paris. */
const now = new Date('2026-10-30T11:00:00.000Z')
const noop = () => {}

/** Les éléments de la file, et lequel est « actuel » (celui que le détail montrerait). */
type QueueKey = 'scam' | 'meteo' | 'bio' | 'long'

export function ModerationR9Catalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // L'élément choisi : toucher un autre élément le déplace, comme l'adresse `?item=` de l'écran.
  const [current, setCurrent] = useState<QueueKey>('scam')
  const itemProps = (key: QueueKey) => ({
    href: `/catalogue?item=${key}`,
    current: current === key,
    onSelect: () => setCurrent(key),
  })
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      {/* La file, sur son panneau : signalé deux fois et compte récent ; une partie d'un projet ;
          ce qui concerne l'administrateur ; un motif long, un texte sans espace et un nom long. */}
      <Text variant="headline">{l.queue}</Text>
      <Surface radius="panel" padding="sm" gap="xs">
        <Stack gap="xs" accessibilityRole="list">
          <ReportCard
            {...itemProps('scam')}
            icon="chat-circle"
            kind={l.comment}
            count={2}
            reportedAt={l.min12}
            reasons={[l.scam]}
            snapshot={l.scamText}
            context={l.scamContext}
            recentAccount
            when={l.since}
            description={l.describeScam}
          />
          <ReportCard
            {...itemProps('meteo')}
            icon="squares-four"
            kind={l.project}
            part={l.photo2}
            count={1}
            reportedAt={l.hour1}
            reasons={[l.privacy]}
            snapshot=""
            context={l.meteoContext}
            when={l.since}
            description={l.describeMeteo}
          />
          <ReportCard
            {...itemProps('bio')}
            icon="user"
            kind={l.profile}
            part={l.bio}
            count={1}
            reportedAt={l.yesterday}
            reasons={[l.other]}
            snapshot={l.bioText}
            context={l.ownContext}
            status={l.concernsMe}
            when={l.since}
          />
          <ReportCard
            {...itemProps('long')}
            icon="squares-four"
            kind={l.project}
            part={l.photo2}
            count={12}
            reportedAt={l.hour1}
            reasons={[l.longReason]}
            snapshot={l.longText}
            context={l.longContext}
            recentAccount
            when={l.since}
          />
        </Stack>
      </Surface>

      {/* Un élément avec ses actions hors du lien : en attente, puis refusé (une panne), puis
          décidé (le résultat à la place des boutons). */}
      <Surface radius="panel" padding="sm" gap="md">
        <ReportCard
          href="/catalogue?item=actions"
          onSelect={noop}
          icon="chat-circle"
          kind={l.comment}
          count={3}
          reportedAt={l.min12}
          reasons={[l.harassment]}
          snapshot={l.scamText}
          context={l.scamContext}
          when={l.since}
          description={l.describeScam}
          actions={[
            { label: l.remove, tone: 'danger', onPress: noop },
            { label: l.dismiss, onPress: noop },
          ]}
        />
        <ReportCard
          href="/catalogue?item=failed"
          onSelect={noop}
          icon="chat-circle"
          kind={l.comment}
          count={1}
          reportedAt={l.min12}
          reasons={[l.scam]}
          snapshot={l.scamText}
          context={l.scamContext}
          when={l.since}
          description={l.describeScam}
          error={l.failed}
          actions={[
            { label: l.remove, tone: 'danger', onPress: noop },
            { label: l.dismiss, onPress: noop, loading: true },
          ]}
        />
        <ReportCard
          href="/catalogue?item=decided"
          onSelect={noop}
          icon="chat-circle"
          kind={l.comment}
          count={1}
          reportedAt={l.min12}
          reasons={[l.scam]}
          snapshot={l.scamText}
          context={l.scamContext}
          when={l.since}
          decided={{ message: l.dismissed, ok: true }}
        />
      </Surface>

      {/* La carte entière (sans adresse) : la partie après la sorte, « Signalé 2 fois », l'heure
          relative et exacte. */}
      <Text variant="headline">{l.full}</Text>
      <ReportCard
        kind={l.project}
        part={l.photo2}
        count={2}
        reportedAt={l.hour1}
        snapshot={l.meteoTitle}
        snapshotLabel={l.snapshotLabel}
        reasons={[l.privacy]}
        details={l.details}
        detailsLabel={l.detailsLabel}
        when={l.since}
        description={l.describeMeteo}
        actions={[
          { label: l.remove, tone: 'danger', onPress: noop },
          { label: l.dismiss, onPress: noop },
        ]}
      />

      {/* La fiche de l'auteur : compte récent qu'on peut suspendre ; ancien compte avec ses
          décisions ; suspendu en ce moment (sans bouton) ; sans projet ni commentaire ni décision ;
          un nom et un pseudo longs. */}
      <Text variant="headline">{l.record}</Text>
      <AuthorRecord
        name="Gains Rapides"
        handle="gains_rapides"
        joinedAt="2026-10-27T09:00:00.000Z"
        projectCount={0}
        commentCount={4}
        removals={1}
        suspensions={0}
        suspendedNow={false}
        now={now}
        onSuspend={noop}
      />
      <AuthorRecord
        name="Inès Haddad"
        handle="ines_haddad"
        joinedAt="2026-09-02T08:00:00.000Z"
        projectCount={3}
        commentCount={18}
        removals={2}
        suspensions={1}
        suspendedNow={false}
        now={now}
        onSuspend={noop}
      />
      <AuthorRecord
        name="Promo Express"
        handle="promo_express"
        joinedAt="2026-06-11T08:00:00.000Z"
        projectCount={1}
        commentCount={1}
        removals={3}
        suspensions={2}
        suspendedNow
        now={now}
        onSuspend={null}
      />
      <AuthorRecord
        name="Hugo Lefèvre"
        handle="hugo_lefevre"
        joinedAt="2025-11-20T08:00:00.000Z"
        projectCount={0}
        commentCount={0}
        removals={0}
        suspensions={0}
        suspendedNow={false}
        now={now}
        onSuspend={null}
      />
      <AuthorRecord
        name="Bartholomé-Alexandre de La Rochefoucauld"
        handle="bartholome_alexandre_rochefoucauld"
        joinedAt="2026-10-20T08:00:00.000Z"
        projectCount={12}
        commentCount={240}
        removals={1}
        suspensions={1}
        suspendedNow={false}
        now={now}
        onSuspend={noop}
      />
    </Stack>
  )
}
