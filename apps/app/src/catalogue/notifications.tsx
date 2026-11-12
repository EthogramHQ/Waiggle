// La section « Activité : les lignes » du catalogue (R8, planches `R8-Activite`, `R8-Activite-Plus`
// et leur nuit) : chaque sorte de ligne de la page Activité, de jour puis de nuit.
// - Planche principale : un commentaire nouveau (citation en bulle), des réactions nouvelles (icône
//   miel, pastille des réactions), une mise à jour (version et première ligne), une mention, des
//   abonnés (qui ne mènent nulle part), un retrait de la modération (rond rouge, date écrite).
// - Planche « Plus » : le coin des testeurs (un appel, un retour, une réponse, un retour réglé dans
//   une version) et le catalogue (un projet rangé dans une catégorie, un outil ajouté ou fusionné).
// - Les bords : une nouvelle qui ne mène nulle part (« Nouveau » lu quand même), un projet sans
//   photo, un titre sans espace qui doit se couper.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; « Nouveau » vient de l'appli. Les dates sont fixes
// (le 12 novembre 2026) : le catalogue pré-rendu ne lit pas l'heure.
import { type ColorName, palettes } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageSource } from '../ui/image'
import { NotificationCard, type NotificationPart } from '../ui/NotificationCard'
import type { CoverImage } from '../ui/ProjectCover'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

// Les espaces de la typographie française, écrites par leur code (un caractère invisible dans le
// code ne se relit pas) : l'espace fine avant « ! » et « ? », l'insécable dans « ».
const THIN = ' '
const NBSP = ' '

const fr = {
  title: 'Activité : les lignes',
  intro:
    'Une ligne sans cadre, posée sur la page. Nouvelle : un fond de miel très pâle, et « Nouveau » lu mais jamais montré. À gauche la photo du membre ou une icône (neutre, miel pour les réactions, rouge pour la modération) ; à droite la vignette du projet ou la tuile de l’outil. Toute la ligne est un lien, sauf les abonnés, qui ne mènent nulle part.',
  mainTitle: 'La planche : commentaires, réactions, mises à jour, abonnés, modération',
  plusTitle: 'Le coin des testeurs et le catalogue',
  edgesTitle: 'Les bords',
  day: 'jour',
  night: 'nuit',
  jean: 'Papi Jean',
  max: 'Max Durand',
  lea: 'Léa Moreau',
  sky: 'Le ciel de ce soir',
  painting: 'Raconte-moi un tableau',
  rocket: `Décollage${THIN}!`,
  candies: 'Compte-bonbons',
  butterfly: `Quel papillon${THIN}?`,
  commented: ' a commenté ',
  commentQuote: `«${NBSP}On le regarde avec Yanis ce soir${THIN}!${NBSP}»`,
  reactions: '12 réactions',
  on: ' sur ',
  hasUpdate: ' a une mise à jour ',
  updateDetail: 'Un compte à rebours avant chaque question, et 2 autres changements',
  mentions: ' parle de toi dans un commentaire sur ',
  morePeople: '3 personnes de plus',
  followYou: ' te suivent',
  removedStart: 'La modération a retiré ',
  oneComment: 'un de tes commentaires',
  removedDate: '18 oct.',
  removedDetail: 'Voir la raison et comment contester',
  callStart: ' lance un appel à tester ',
  callQuote: `«${NBSP}Nouveau niveau caché sur Saturne${THIN}! Essayez-le ce week-end…${NBSP}»`,
  sentFeedback: ' t’a envoyé un retour sur ',
  repliedFeedback: ' a répondu à ton retour sur ',
  settledStart: ' a réglé ton retour dans la ',
  of: ' de ',
  teamSorted: `L’équipe de Waiggle a rangé «${NBSP}`,
  into: `${NBSP}» dans `,
  animals: 'Animaux',
  glide: 'Glide',
  toolAdded: `${NBSP}» fait maintenant partie des outils de Waiggle`,
  merged: `${NBSP}» s’affiche maintenant comme «${NBSP}`,
  open: `«${NBSP}`,
  close: `${NBSP}»`,
  typed: 'glide app',
  newNowhere: 'Nouvelle, sans destination',
  noPhoto: 'Projet sans photo',
  longTitle: 'Uncarnetdedégustationdecafésdespécialitéavecunassistantquiproposelamouture',
}

const en: typeof fr = {
  title: 'Activity: the rows',
  intro:
    'A row without a frame, laid on the page. New: a very pale honey background, and “New” read but never shown. On the left the member’s photo or an icon (neutral, honey for reactions, red for moderation); on the right the project thumbnail or the tool tile. The whole row is a link, except followers, which lead nowhere.',
  mainTitle: 'The board: comments, reactions, updates, followers, moderation',
  plusTitle: 'The testers’ corner and the catalogue',
  edgesTitle: 'The edges',
  day: 'day',
  night: 'night',
  jean: 'Grandpa Jean',
  max: 'Max Durand',
  lea: 'Léa Moreau',
  sky: 'Tonight’s sky',
  painting: 'Tell me a painting',
  rocket: 'Liftoff!',
  candies: 'Candy counter',
  butterfly: 'Which butterfly?',
  commented: ' commented on ',
  commentQuote: '“We’re watching it with Yanis tonight!”',
  reactions: '12 reactions',
  on: ' on ',
  hasUpdate: ' has an update ',
  updateDetail: 'A countdown before each question, and 2 other changes',
  mentions: ' mentioned you in a comment on ',
  morePeople: '3 more people',
  followYou: ' follow you',
  removedStart: 'Moderation removed ',
  oneComment: 'one of your comments',
  removedDate: 'Oct 18',
  removedDetail: 'See why and how to appeal',
  callStart: ' calls for testers on ',
  callQuote: '“New hidden level on Saturn! Try it this weekend…”',
  sentFeedback: ' sent you feedback on ',
  repliedFeedback: ' replied to your feedback on ',
  settledStart: ' settled your feedback in ',
  of: ' of ',
  teamSorted: 'The Waiggle team filed “',
  into: '” under ',
  animals: 'Animals',
  glide: 'Glide',
  toolAdded: '” is now one of Waiggle’s tools',
  merged: '” now shows as “',
  open: '“',
  close: '”',
  typed: 'glide app',
  newNowhere: 'New, leading nowhere',
  noPhoto: 'Project without a photo',
  longTitle: 'Acoffeetastingnotebookforspecialtycoffeewithanassistantthatsuggeststhegrind',
}

type Labels = typeof fr

// L'heure figée du catalogue, et les dates des lignes, avant elle.
const NOW = new Date('2026-11-12T15:00:00.000Z')
const minutesAgo = (minutes: number) => ({
  date: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
  now: NOW,
})
const daysAgo = (days: number) => minutesAgo(days * 24 * 60)

/**
 * Une photo d'exemple : un dessin SVG en adresse `data:` (expo-image le dessine aussi sur le web),
 * sans photo à télécharger. Les couleurs viennent de @ruche/brand (palette de jour : une image ne
 * change pas avec le thème).
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="64" cy="34" r="16" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}
const cover = (source: ImageSource, label: string): CoverImage => ({ source, label })

/** Un morceau en gras de la phrase (un nom, un titre). */
const strong = (text: string): NotificationPart => ({ text, style: 'strong' })
/** Un morceau de texte simple. */
const plain = (text: string): NotificationPart => ({ text })

const noop = () => {}

/** Un exemple légendé (« Nouvelle, sans destination — nuit »). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      {children}
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

/** La planche principale : six lignes, comme sur la page. */
function MainRows({ l }: { l: Labels }) {
  const sky = cover(sample('text', 'controlChecked', 'honey'), l.sky)
  const painting = cover(sample('honey', 'controlChecked', 'surface'), l.painting)
  const rocket = cover(sample('text', 'textSecondary', 'honey'), l.rocket)
  const candies = cover(sample('surface', 'honeySoft', 'danger'), l.candies)
  return (
    <Stack gap="xs" accessibilityRole="list">
      <NotificationCard
        leading={{ kind: 'avatar', name: l.jean, image: null }}
        parts={[strong(l.jean), plain(l.commented), strong(l.sky)]}
        when={minutesAgo(12)}
        quote={l.commentQuote}
        thumb={{ kind: 'project', image: sky, title: l.sky }}
        isNew
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'sparkle', tone: 'honey' }}
        parts={[strong(l.reactions), plain(l.on), strong(l.painting)]}
        when={minutesAgo(60)}
        reactions={['amazing', 'inspiring', 'bravo']}
        thumb={{ kind: 'project', image: painting, title: l.painting }}
        isNew
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'arrows-clockwise', tone: 'neutral' }}
        parts={[strong(l.rocket), plain(l.hasUpdate), { text: 'v1.2', style: 'version' }]}
        when={minutesAgo(180)}
        detail={l.updateDetail}
        thumb={{ kind: 'project', image: rocket, title: l.rocket }}
        isNew={false}
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'avatar', name: l.max, image: null }}
        parts={[strong(l.max), plain(l.mentions), strong(l.candies)]}
        when={daysAgo(2)}
        thumb={{ kind: 'project', image: candies, title: l.candies }}
        isNew={false}
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'user-plus', tone: 'neutral' }}
        parts={[strong(l.morePeople), plain(l.followYou)]}
        when={daysAgo(3)}
        isNew={false}
        onPress={null}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'shield-warning', tone: 'danger' }}
        parts={[plain(l.removedStart), strong(l.oneComment), plain(l.on), strong(l.butterfly)]}
        when={l.removedDate}
        detail={l.removedDetail}
        isNew={false}
        onPress={noop}
      />
    </Stack>
  )
}

/** La planche « Plus » : le coin des testeurs, puis les deux gestes du catalogue. */
function PlusRows({ l }: { l: Labels }) {
  const rocket = cover(sample('text', 'textSecondary', 'honey'), l.rocket)
  const butterfly = cover(sample('success', 'honey', 'text'), l.butterfly)
  return (
    <Stack gap="xs" accessibilityRole="list">
      <NotificationCard
        leading={{ kind: 'avatar', name: l.jean, image: null }}
        parts={[strong(l.jean), plain(l.callStart), strong(l.rocket)]}
        when={minutesAgo(20)}
        quote={l.callQuote}
        thumb={{ kind: 'project', image: rocket, title: l.rocket }}
        isNew
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'avatar', name: l.lea, image: null }}
        parts={[strong(l.lea), plain(l.sentFeedback), strong(l.butterfly)]}
        when={minutesAgo(120)}
        thumb={{ kind: 'project', image: butterfly, title: l.butterfly }}
        isNew
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'avatar', name: l.jean, image: null }}
        parts={[strong(l.jean), plain(l.repliedFeedback), strong(l.rocket)]}
        when={minutesAgo(300)}
        thumb={{ kind: 'project', image: rocket, title: l.rocket }}
        isNew={false}
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'avatar', name: l.jean, image: null }}
        parts={[
          strong(l.jean),
          plain(l.settledStart),
          { text: 'v1.3', style: 'version' },
          plain(l.of),
          strong(l.rocket),
        ]}
        when={daysAgo(1)}
        thumb={{ kind: 'project', image: rocket, title: l.rocket }}
        isNew={false}
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'squares-four', tone: 'neutral' }}
        parts={[plain(l.teamSorted), strong(l.butterfly), plain(l.into), strong(l.animals)]}
        when={daysAgo(2)}
        thumb={{ kind: 'project', image: butterfly, title: l.butterfly }}
        isNew={false}
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'puzzle-piece', tone: 'neutral' }}
        parts={[plain(l.open), strong(l.glide), plain(l.toolAdded)]}
        when={daysAgo(3)}
        thumb={{ kind: 'tool', name: l.glide }}
        isNew={false}
        onPress={noop}
      />
      <NotificationCard
        leading={{ kind: 'icon', icon: 'puzzle-piece', tone: 'neutral' }}
        parts={[plain(l.open), strong(l.typed), plain(l.merged), strong(l.glide), plain(l.close)]}
        when={daysAgo(4)}
        thumb={{ kind: 'tool', name: l.glide }}
        isNew={false}
        onPress={noop}
      />
    </Stack>
  )
}

/** Les bords : une nouvelle sans destination, un projet sans photo, un titre sans espace. */
function EdgeRows({ l, scheme }: { l: Labels; scheme: Scheme }) {
  return (
    <Stack gap="md">
      <Example caption={`${l.newNowhere} — ${l[scheme]}`}>
        <Stack gap="xs" accessibilityRole="list">
          <NotificationCard
            leading={{ kind: 'icon', icon: 'user-plus', tone: 'neutral' }}
            parts={[strong(l.morePeople), plain(l.followYou)]}
            when={minutesAgo(5)}
            isNew
            onPress={null}
          />
        </Stack>
      </Example>
      <Example caption={`${l.noPhoto} — ${l[scheme]}`}>
        <Stack gap="xs" accessibilityRole="list">
          <NotificationCard
            leading={{ kind: 'icon', icon: 'sparkle', tone: 'honey' }}
            parts={[strong(l.reactions), plain(l.on), strong(l.longTitle)]}
            when={daysAgo(9)}
            reactions={['useful', 'funny', 'amazing', 'inspiring', 'bravo']}
            thumb={{ kind: 'project', image: null, title: l.longTitle }}
            isNew={false}
            onPress={noop}
          />
        </Stack>
      </Example>
    </Stack>
  )
}

export function NotificationsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit. La surface simple a le fond
        // de la page, sur lequel les lignes se posent sans cadre.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="plain" padding="sm" gap="lg">
            <Text variant="headline" heading={3}>
              {`${l.mainTitle} — ${l[scheme]}`}
            </Text>
            <MainRows l={l} />
            <Text variant="headline" heading={3}>
              {`${l.plusTitle} — ${l[scheme]}`}
            </Text>
            <PlusRows l={l} />
            <Text variant="headline" heading={3}>
              {`${l.edgesTitle} — ${l[scheme]}`}
            </Text>
            <EdgeRows l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
