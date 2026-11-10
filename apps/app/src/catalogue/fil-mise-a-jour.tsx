// La section « Le fil : un projet mis à jour (R7a) » du catalogue : la carte du fil remontée par sa
// mise à jour (`updated` de ProjectCard, planche R7-MAJ-Fil), dans tous ses états, de jour et de
// nuit. La carte entière d'« Abonnements » (« Mis à jour · v1.2 » à la place de la date de
// l'auteur, la première ligne à la place de l'accroche, « et 2 autres changements », la date en bas
// à droite) ; le repère seul de Découvrir ; une seule ligne sans version ; « et 1 autre
// changement » ; un titre et une ligne très longs.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses exemples (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les libellés de la carte viennent des traductions,
// comme dans l'appli (SummaryCard).
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { RelativeTime } from '../ui/RelativeTime'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le fil : un projet mis à jour (R7a)',
  intro:
    'Dans « Abonnements », la carte d’un projet qui vient d’être mis à jour remonte : « Mis à jour · v1.2 » à la place de la date de l’auteur, la première ligne de « Ce qui a changé » à la place de l’accroche, puis « et 2 autres changements », jamais coupé, et la date de la mise à jour en bas à droite. Ailleurs (Découvrir, recherche), seul le repère se pose, l’accroche reste. La famille de la ligne est lue dans la description du lien.',
  day: 'jour',
  night: 'nuit',
  full: 'Abonnements : la carte entière (photo, Tester, ✦ 12, trois lignes)',
  badge: 'Découvrir : le repère seul, l’accroche reste',
  single: 'Une seule ligne, une mise à jour sans version (« Mis à jour »)',
  one: 'Deux lignes : « et 1 autre changement »',
  long: 'Un titre et une ligne très longs (coupés à deux lignes ; « et 3 autres changements » jamais)',
  photo: 'Photo du projet',
  testable: 'Testable',
  building: 'En construction',
  test: 'Tester',
  rocket: 'Décollage !',
  rocketPitch: 'Un quiz sur l’espace pour les petits-enfants.',
  rocketLine: 'Un compte à rebours avant chaque question',
  cafes: 'Carnet de cafés',
  cafesPitch: 'Les cafés goûtés, notés, et ceux qui restent à essayer.',
  garden: 'La météo du potager',
  gardenPitch: 'Faut-il arroser ce soir ? La réponse, chaque jour à 18 h.',
  gardenLine: 'La pluie de la nuit compte enfin dans l’arrosage du lendemain',
  quiz: 'Le quiz des capitales',
  quizPitch: 'Dix questions par jour, de plus en plus dures.',
  quizLine: 'Des drapeaux qui ondulent quand la réponse est juste',
  club: 'Le planning du club de badminton du jeudi soir et des tournois du dimanche matin',
  clubPitch: 'Qui joue samedi ? Le planning se remplit tout seul.',
  clubLine:
    'Les inscriptions se ferment toutes seules la veille à midi, avec un rappel envoyé à chacun par https://exemple.fr/planning-du-club/inscriptions',
}

const en: typeof fr = {
  title: 'The feed: an updated project (R7a)',
  intro:
    'In “Following”, the card of a project that was just updated comes back up: “Updated · v1.2” instead of the author’s date, the first line of “What changed” instead of the pitch, then “and 2 more changes”, never cut, and the date of the update at the bottom right. Elsewhere (Discover, search), only the mark is set and the pitch stays. The family of the line is read in the link’s description.',
  day: 'day',
  night: 'night',
  full: 'Following: the whole card (photo, Try it, ✦ 12, three lines)',
  badge: 'Discover: the mark alone, the pitch stays',
  single: 'A single line, an update without a version (“Updated”)',
  one: 'Two lines: “and 1 more change”',
  long: 'A very long title and line (cut at two lines; “and 3 more changes” never)',
  photo: 'Project photo',
  testable: 'Testable',
  building: 'In progress',
  test: 'Try it',
  rocket: 'Lift-off!',
  rocketPitch: 'A space quiz for the grandchildren.',
  rocketLine: 'A countdown before each question',
  cafes: 'Coffee notebook',
  cafesPitch: 'Coffees tasted, rated, and the ones still to try.',
  garden: 'The garden weather',
  gardenPitch: 'Water tonight? The answer, every day at 6 pm.',
  gardenLine: 'Last night’s rain finally counts in the next day’s watering',
  quiz: 'The capitals quiz',
  quizPitch: 'Ten questions a day, harder and harder.',
  quizLine: 'Flags that wave when the answer is right',
  club: 'The planner of the Thursday evening badminton club and the Sunday morning tournaments',
  clubPitch: 'Who plays on Saturday? The planner fills itself.',
  clubLine:
    'Sign-ups close by themselves at noon the day before, with a reminder sent to everyone by https://example.com/club-planner/sign-ups',
}

// Des résumés flous (ThumbHash) de visuels de projet, les mêmes que ceux de fil.tsx.
// « gitleaks:allow » : l'outil qui cherche les secrets oubliés les prendrait pour des clés.
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

const noop = () => {}
// L'heure figée du catalogue : les dates relatives ne bougent pas d'une capture à l'autre.
const now = new Date('2026-10-22T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()

export function FeedUpdateCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="plain" padding="lg" gap="sm">
            <Text variant="caption" tone="muted">
              {l[scheme]}
            </Text>
            <Cards l={l} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Les cartes d'un thème, dans la grille du fil (une colonne sur téléphone, plus sur ordinateur). */
function Cards({ l }: { l: typeof fr }) {
  const { t } = useTranslation()
  // Les libellés de la carte, comme les prépare SummaryCard.
  const updated = (version: string | null) =>
    version ? t(($) => $.feed.updated, { version }) : t(($) => $.feed.updatedPlain)
  const more = (count: number) => t(($) => $.feed.moreChanges, { count })
  return (
    <ProjectGrid empty="">
      <Captioned caption={l.full}>
        <ProjectCard
          title={l.rocket}
          pitch={l.rocketPitch}
          author={{ name: 'Papi Jean', avatar: null, onPress: noop }}
          when={<RelativeTime date={hoursAgo(24 * 21)} now={now} />}
          status={{ label: l.testable, strong: true }}
          tryIt={{ label: l.test, onPress: noop }}
          reactionTotal={12}
          image={{ source: null, thumbhash: papillon, label: l.photo }}
          updated={{
            kind: 'full',
            label: updated('v1.2'),
            line: { family: 'new', text: l.rocketLine },
            more: more(2),
            at: hoursAgo(3),
          }}
          now={now}
          onPress={noop}
        />
      </Captioned>
      <Captioned caption={l.badge}>
        <ProjectCard
          title={l.cafes}
          pitch={l.cafesPitch}
          author={{ name: 'Nora Benali', avatar: null, onPress: noop }}
          when={<RelativeTime date={hoursAgo(24 * 40)} now={now} />}
          status={{ label: l.testable, strong: true }}
          tryIt={{ label: l.test, onPress: noop }}
          reactionTotal={49}
          image={{ source: null, thumbhash: cafe, label: l.photo }}
          updated={{ kind: 'badge', label: updated('v2.0') }}
          onPress={noop}
        />
      </Captioned>
      <Captioned caption={l.single}>
        <ProjectCard
          title={l.garden}
          pitch={l.gardenPitch}
          author={{ name: 'Hugo Lefèvre', avatar: null, onPress: noop }}
          when={<RelativeTime date={hoursAgo(24 * 9)} now={now} />}
          status={{ label: l.building, strong: false }}
          updated={{
            kind: 'full',
            label: updated(null),
            line: { family: 'fixed', text: l.gardenLine },
            more: null,
            at: hoursAgo(26),
          }}
          now={now}
          onPress={noop}
        />
      </Captioned>
      <Captioned caption={l.one}>
        <ProjectCard
          title={l.quiz}
          pitch={l.quizPitch}
          author={{ name: 'Sam Morel', avatar: null, onPress: noop }}
          when={<RelativeTime date={hoursAgo(24 * 5)} now={now} />}
          status={{ label: l.building, strong: false }}
          reactionTotal={1}
          updated={{
            kind: 'full',
            label: updated('v0.3'),
            line: { family: 'polish', text: l.quizLine },
            more: more(1),
            at: hoursAgo(5),
          }}
          now={now}
          onPress={noop}
        />
      </Captioned>
      <Captioned caption={l.long}>
        <ProjectCard
          title={l.club}
          pitch={l.clubPitch}
          author={{ name: 'Jade Martin-Delacroix', avatar: null, onPress: noop }}
          when={<RelativeTime date={hoursAgo(24 * 2)} now={now} />}
          status={{ label: l.testable, strong: true }}
          tryIt={{ label: l.test, onPress: noop }}
          reactionTotal={128}
          image={{ source: null, thumbhash: cafe, label: l.photo }}
          updated={{
            kind: 'full',
            label: updated('v12.4.0-beta.3'),
            line: { family: 'new', text: l.clubLine },
            more: more(3),
            at: hoursAgo(24 * 8),
          }}
          now={now}
          onPress={noop}
        />
      </Captioned>
    </ProjectGrid>
  )
}

function Captioned({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}
