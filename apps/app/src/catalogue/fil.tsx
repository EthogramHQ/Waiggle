// La section « Le fil (R4) » du catalogue : les pièces neuves de l'accueil d'un membre, de jour et de
// nuit. La carte du fil (auteur et « Tester » en liens frères, date relative, total des réactions) et
// son squelette, la carte à une seule réaction, l'en-tête de page et son emplacement `titleAside`,
// l'arrivée des nouvelles cartes, la date relative seule, la grille imposée à deux colonnes, le
// salut du premier lancement, les proches à suivre (une ligne dans ses états, puis la liste),
// l'encart « Publier », la sphère de miel et la ligne d'un projet qui cherche des testeurs.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Arrival } from '../ui/Arrival'
import { Button } from '../ui/Button'
import { Greeting } from '../ui/Greeting'
import { HoneySphere } from '../ui/HoneySphere'
import { ListGroup } from '../ui/ListGroup'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { NoteCard } from '../ui/NoteCard'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { PublishPrompt } from '../ui/PublishPrompt'
import { RelativeTime } from '../ui/RelativeTime'
import { PageHeading } from '../ui/Screen'
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
  cardOne: 'Une seule réaction (au singulier, « 1 réaction »)',
  heading:
    'L’en-tête de page de Screen (PageHeading) : le titre, l’emplacement titleAside (le bouton des nouveautés du Fil), le sous-titre ; puis rien de neuf',
  feedTitle: 'Fil',
  feedCaption: 'Les nouveaux projets et notes des personnes que tu suis.',
  arrival:
    'L’arrivée des nouvelles cartes (Arrival) et la grille qui étire la note à côté d’un projet : « Faire arriver » pose une carte en haut, qui tombe en place (en fondu avec « Réduire les animations ») ; les autres ne bougent pas',
  arrive: 'Faire arriver une carte',
  arrived: (n: number) => `Nouveau projet ${n}`,
  noteBody: 'v2 : mode hors ligne, et les recettes se rangent par saison.',
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
  cardOne: 'A single reaction (singular, “1 reaction”)',
  heading:
    'The page heading of Screen (PageHeading): the title, the titleAside slot (the news button of the feed), the subtitle; then nothing new',
  feedTitle: 'Feed',
  feedCaption: 'New projects and notes from the people you follow.',
  arrival:
    'The arrival of new cards (Arrival) and the grid stretching the note beside a project: “Make one arrive” puts a card at the top, which drops into place (a fade with “Reduce motion”); the others stay still',
  arrive: 'Make a card arrive',
  arrived: (n: number) => `New project ${n}`,
  noteBody: 'v2: offline mode, and recipes are sorted by season.',
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
        <Captioned caption={l.cardOne}>
          <ProjectCard
            title={club}
            pitch={clubPitch}
            author={{ name: 'Hugo Lefèvre', avatar: null, onPress: noop }}
            when={<RelativeTime date={hoursAgo(30)} now={now} />}
            status={{ label: l.building, strong: false }}
            reactionTotal={1}
            onPress={noop}
          />
        </Captioned>
        <Captioned caption={l.skeleton}>
          <SkeletonCard shape="feed" />
        </Captioned>
      </ProjectGrid>

      <Captioned caption={l.heading}>
        <Stack gap="xl">
          <PageHeading
            level={2}
            title={l.feedTitle}
            aside={
              <NewItemsBanner
                count={3}
                more={false}
                kinds={['project']}
                authors={[
                  { name: 'Nora Benali', source: null },
                  { name: 'Sam Morel', source: null },
                ]}
                onPress={noop}
              />
            }
            subtitle={l.feedCaption}
          />
          <PageHeading
            level={2}
            title={l.feedTitle}
            aside={
              <NewItemsBanner count={null} more={false} kinds={[]} authors={[]} onPress={noop} />
            }
            subtitle={l.feedCaption}
          />
        </Stack>
      </Captioned>

      <Captioned caption={l.arrival}>
        <Arrivals l={l} />
      </Captioned>

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

/**
 * L'arrivée des nouvelles cartes, dans une grille à deux colonnes : une note à côté d'un projet
 * (la note s'étire, sa couverture prend la place qui reste), et « Faire arriver une carte » qui en
 * pose une nouvelle en haut. Seule celle-là tombe en place ; les autres étaient là au premier
 * affichage.
 */
function Arrivals({ l }: { l: typeof fr }) {
  const [cafes] = l.projects as [string, string, string, string]
  const [cafesPitch] = l.pitches as [string, string, string]
  // Les cartes arrivées, la plus récente d'abord (un simple numéro).
  const [arrived, setArrived] = useState<number[]>([])
  return (
    <Stack gap="md">
      <Button
        label={l.arrive}
        variant="secondary"
        onPress={() => setArrived((was) => [was.length + 1, ...was])}
      />
      <ProjectGrid columns={2}>
        {[
          ...arrived.map((n) => (
            // Seule la dernière arrivée tombe : dans une grille, les autres changent de case et
            // sont redessinées, sans retomber (comme dans le fil, voir FeedList).
            <Arrival key={`new-${n}`} arriving={n === arrived[0]}>
              <ProjectCard
                title={l.arrived(n)}
                pitch={cafesPitch}
                author={{ name: 'Jade Martin', avatar: null, onPress: noop }}
                when={<RelativeTime date={now.toISOString()} now={now} />}
                status={{ label: l.building, strong: false }}
                onPress={noop}
              />
            </Arrival>
          )),
          <Arrival key="note" arriving={false}>
            <NoteCard
              label={`${l.members[0]} : ${cafes}`}
              project={cafes}
              author={{ name: l.members[0] ?? '', avatar: null }}
              body={l.noteBody}
              when={<RelativeTime date={hoursAgo(2)} now={now} tone="secondary" />}
              image={{ source: null, thumbhash: cafe, label: l.photo }}
              onPress={noop}
            />
          </Arrival>,
          <Arrival key="project" arriving={false}>
            <ProjectCard
              title={cafes}
              pitch={cafesPitch}
              author={{ name: 'Nora Benali', avatar: null, onPress: noop }}
              when={<RelativeTime date={hoursAgo(3)} now={now} />}
              status={{ label: l.testable, strong: true }}
              reactionTotal={49}
              image={{ source: null, thumbhash: papillon, label: l.photo }}
              onPress={noop}
            />
          </Arrival>,
        ]}
      </ProjectGrid>
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
