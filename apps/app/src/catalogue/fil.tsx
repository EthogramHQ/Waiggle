// La section « Le fil (R4) » du catalogue : les pièces neuves de l'accueil d'un membre, de jour et de
// nuit. La carte du fil (auteur et « Tester » en liens frères, date relative, total des réactions) et
// son squelette, la date relative seule, la grille imposée à deux colonnes, le salut du premier
// lancement, les proches à suivre (une ligne dans ses états, puis la liste), l'encart « Publier »,
// la sphère de miel et la ligne d'un projet qui cherche des testeurs.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Greeting } from '../ui/Greeting'
import { HoneySphere } from '../ui/HoneySphere'
import { ListGroup } from '../ui/ListGroup'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { PublishPrompt } from '../ui/PublishPrompt'
import { RelativeTime } from '../ui/RelativeTime'
import { SkeletonCard } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { type SuggestedMemberRow, SuggestionList } from '../ui/SuggestionList'
import { SuggestionRow } from '../ui/SuggestionRow'
import { Surface } from '../ui/Surface'
import { TesterRow } from '../ui/TesterRow'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le fil (R4)',
  intro:
    'Les pièces neuves de l’accueil. La carte du fil a trois liens frères (l’auteur, le projet, « Tester ») ; la date, le statut et le total sont du texte hors des liens. La date est relative (« il y a 3 h ») et sa version complète se lit au survol et au lecteur d’écran.',
  day: 'jour',
  night: 'nuit',
  card: 'Carte du fil (auteur, Tester, ✦ 49)',
  cardQuiet: 'Sans démo ni réaction, il y a trois jours',
  skeleton: 'Une carte du fil qui charge (SkeletonCard shape="feed")',
  dates: 'Dates relatives (RelativeTime) : à l’instant, il y a 3 h, hier, au-delà de 7 jours',
  datePhrase: 'Avec une phrase (prop phrase) : « bloqué le 12 oct. »',
  blockedOn: (when: string) => `bloqué ${when}`,
  grid: 'Grille imposée à deux colonnes (ProjectGrid columns={2}), rangée incomplète',
  greeting: 'Salut du premier lancement (Greeting)',
  hello: 'Bonjour Inès !',
  greetingTitle: 'Ton fil t’attend',
  greetingBody: 'Suis quelques proches : leurs projets arriveront ici.',
  row: 'Une ligne des proches à suivre (SuggestionRow) : à suivre, suivie, inactive',
  list: 'La liste (SuggestionList) : « × » écarte la ligne, « Annuler » la remet',
  publish: 'L’encart « Publier » (PublishPrompt)',
  sphere: 'La sphère de miel (HoneySphere), 128 et 64 points',
  tester: 'Ils cherchent des testeurs (TesterRow dans un ListGroup)',
  testers: 'Ils cherchent des testeurs',
  photo: 'Photo du projet',
  building: 'En cours',
  testable: 'Testable',
  test: 'Tester',
  members: ['Nora Benali', 'Sam Morel', 'Hugo Lefèvre', 'Jade Martin'],
  projects: [
    'Carnet de cafés',
    'Le quiz des capitales',
    'Le planning du club',
    'La météo du potager',
  ],
  pitches: [
    'Les cafés goûtés, notés, et ceux qui restent à essayer.',
    'Dix questions par jour, de plus en plus dures.',
    'Qui joue samedi ? Le planning se remplit tout seul.',
  ],
}

const en: typeof fr = {
  title: 'The feed (R4)',
  intro:
    'The new pieces of the home screen. The feed card has three sibling links (the author, the project, “Try it”); the date, the status and the total are text outside the links. The date is relative (“3 h ago”) and its full version is read on hover and by screen readers.',
  day: 'day',
  night: 'night',
  card: 'Feed card (author, Try it, ✦ 49)',
  cardQuiet: 'No demo nor reaction, three days ago',
  skeleton: 'A feed card loading (SkeletonCard shape="feed")',
  dates: 'Relative dates (RelativeTime): just now, 3 h ago, yesterday, beyond 7 days',
  datePhrase: 'With a phrase (phrase prop): “blocked on Oct 12”',
  blockedOn: (when: string) => `blocked ${when}`,
  grid: 'Grid forced to two columns (ProjectGrid columns={2}), incomplete row',
  greeting: 'First-run greeting (Greeting)',
  hello: 'Hello Inès!',
  greetingTitle: 'Your feed is waiting',
  greetingBody: 'Follow a few close ones: their projects will show up here.',
  row: 'A row of people to follow (SuggestionRow): to follow, followed, disabled',
  list: 'The list (SuggestionList): “×” dismisses the row, “Undo” brings it back',
  publish: 'The “Publish” prompt (PublishPrompt)',
  sphere: 'The honey sphere (HoneySphere), 128 and 64 points',
  tester: 'Looking for testers (TesterRow in a ListGroup)',
  testers: 'Looking for testers',
  photo: 'Project photo',
  building: 'In progress',
  testable: 'Testable',
  test: 'Try it',
  members: ['Nora Benali', 'Sam Morel', 'Hugo Lefèvre', 'Jade Martin'],
  projects: ['Coffee notebook', 'The capitals quiz', 'The club planner', 'The garden weather'],
  pitches: [
    'Coffees tasted, rated, and the ones still to try.',
    'Ten questions a day, harder and harder.',
    'Who plays on Saturday? The planner fills itself.',
  ],
}

// Des résumés flous (ThumbHash) de visuels de projet, les mêmes que ceux de cartes.tsx.
// « gitleaks:allow » : l'outil qui cherche les secrets oubliés les prendrait pour des clés.
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

const noop = () => {}
// L'heure figée du catalogue : les dates relatives ne bougent pas d'une capture à l'autre.
const now = new Date('2026-10-22T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()

export function FeedCatalogue() {
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
          <Example caption={l[scheme]}>
            <Pieces l={l} />
          </Example>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Toutes les pièces d'un thème, l'une sous l'autre. */
function Pieces({ l }: { l: typeof fr }) {
  const [cafes, quiz, club] = l.projects as [string, string, string, string]
  const [cafesPitch, quizPitch, clubPitch] = l.pitches as [string, string, string]
  return (
    <Stack gap="xl">
      <ProjectGrid empty="" columns={1}>
        <Captioned caption={l.card}>
          <ProjectCard
            title={cafes}
            pitch={cafesPitch}
            author={{ name: 'Nora Benali', avatar: null, onPress: noop }}
            when={<RelativeTime date={hoursAgo(3)} now={now} />}
            status={{ label: l.testable, strong: true }}
            tryIt={{ label: l.test, onPress: noop }}
            reactionTotal={49}
            image={{ source: null, thumbhash: cafe, label: l.photo }}
            onPress={noop}
          />
        </Captioned>
        <Captioned caption={l.cardQuiet}>
          <ProjectCard
            title={quiz}
            pitch={quizPitch}
            author={{ name: 'Sam Morel', avatar: null, onPress: noop }}
            when={<RelativeTime date={hoursAgo(72)} now={now} />}
            status={{ label: l.building, strong: false }}
            onPress={noop}
          />
        </Captioned>
        <Captioned caption={l.skeleton}>
          <SkeletonCard shape="feed" />
        </Captioned>
      </ProjectGrid>

      <Captioned caption={l.dates}>
        <Stack gap="xs">
          {[0, 3, 30, 24 * 9].map((hours) => (
            <RelativeTime key={hours} date={hoursAgo(hours)} now={now} />
          ))}
        </Stack>
      </Captioned>
      <Captioned caption={l.datePhrase}>
        <RelativeTime
          date={hoursAgo(24 * 10)}
          now={now}
          variant="callout"
          phrase={({ afterVerb, full }) => ({
            label: l.blockedOn(afterVerb),
            spoken: l.blockedOn(full),
          })}
        />
      </Captioned>

      <Captioned caption={l.grid}>
        <ProjectGrid empty="" columns={2}>
          {[cafes, quiz, club].map((title, index) => (
            <ProjectCard
              key={title}
              title={title}
              pitch={[cafesPitch, quizPitch, clubPitch][index] ?? ''}
              author={{ name: l.members[index] ?? '', avatar: null, onPress: noop }}
              when={<RelativeTime date={hoursAgo(5 + index * 20)} now={now} />}
              status={{ label: l.building, strong: false }}
              image={index === 1 ? { source: null, thumbhash: papillon, label: l.photo } : null}
              onPress={noop}
            />
          ))}
        </ProjectGrid>
      </Captioned>

      <Captioned caption={l.greeting}>
        <Greeting hello={l.hello} title={l.greetingTitle} body={l.greetingBody} />
      </Captioned>

      <Captioned caption={l.row}>
        <Rows l={l} />
      </Captioned>
      <Captioned caption={l.list}>
        <Suggestions l={l} />
      </Captioned>

      <Captioned caption={l.publish}>
        <PublishPrompt onPublish={noop} />
      </Captioned>

      <Captioned caption={l.sphere}>
        <Stack direction="row" gap="lg" align="center">
          <HoneySphere />
          <HoneySphere size={64} />
        </Stack>
      </Captioned>

      <Captioned caption={l.tester}>
        <ListGroup title={l.testers}>
          <TesterRow
            title={cafes}
            author="Nora Benali"
            image={{ source: null, thumbhash: cafe, label: l.photo }}
            onTest={noop}
            onOpen={noop}
          />
          <TesterRow title={club} author="Hugo Lefèvre" image={null} onTest={noop} onOpen={noop} />
        </ListGroup>
      </Captioned>
    </Stack>
  )
}

/** Une ligne dans ses trois états ; la première se touche pour de vrai (« Suivre » ↔ « Tu suis »). */
function Rows({ l }: { l: typeof fr }) {
  const [followed, setFollowed] = useState(false)
  const [nora, sam, hugo] = l.members as [string, string, string, string]
  const [cafes, quiz, club] = l.projects as [string, string, string, string]
  const row = { onOpenMember: noop, onOpenProject: noop, onDismiss: noop, avatar: null }
  return (
    <Stack gap="sm">
      <SuggestionRow
        {...row}
        name={nora}
        project={{ title: cafes, image: { source: null, thumbhash: cafe, label: l.photo } }}
        followed={followed}
        onFollow={() => setFollowed((was) => !was)}
      />
      <SuggestionRow
        {...row}
        name={sam}
        project={{ title: quiz, image: null }}
        followed
        onFollow={noop}
      />
      <SuggestionRow
        {...row}
        name={hugo}
        project={{ title: club, image: null }}
        followed={false}
        followDisabled
        onFollow={noop}
      />
    </Stack>
  )
}

/** La liste entière : « × » écarte vraiment la ligne (l'écart réussit toujours ici). */
function Suggestions({ l }: { l: typeof fr }) {
  const [followed, setFollowed] = useState<ReadonlySet<string>>(new Set())
  const members: SuggestedMemberRow[] = l.members.map((name, index) => ({
    id: `m${index}`,
    name,
    avatar: null,
    project: {
      title: l.projects[index] ?? '',
      image: index === 0 ? { source: null, thumbhash: papillon, label: l.photo } : null,
    },
    followed: followed.has(`m${index}`),
  }))
  return (
    <SuggestionList
      members={members}
      max={3}
      onFollow={(id) =>
        setFollowed((was) => {
          const next = new Set(was)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
      onOpenMember={noop}
      onOpenProject={noop}
      onDismiss={async () => ({ ok: true })}
    />
  )
}

/** Une pièce et sa légende, l'une au-dessus de l'autre. */
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

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
