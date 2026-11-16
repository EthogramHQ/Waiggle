// La section « Les exemples : les cartes » du catalogue (tranche R12b) : la pastille « Exemple »
// seule (à côté d'un statut, comme sur les cartes), puis les cartes d'un projet du compte
// d'exemples : celle de la vitrine (`ShowcaseCard`, accueil et « À la une » d'Explorer), avec et
// sans photo, avec un titre long qui fait passer « Exemple » sous le statut, à côté d'une carte
// ordinaire ; et celle du fil (`ProjectCard`, Fil, Explorer, recherche), avec et sans démo, « Privé »
// en plus. De jour et de nuit. Les en-têtes de pages ont leur propre section (exemples-pages.tsx).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ExampleBadge } from '../ui/ExampleBadge'
import { ProjectCard } from '../ui/ProjectCard'
import { ShowcaseCard } from '../ui/ShowcaseCard'
import { Row, Stack } from '../ui/Stack'
import { StatusPill } from '../ui/StatusPill'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Les exemples : les cartes',
  intro:
    'Un projet du compte d’exemples porte « Exemple » à côté de son statut, sur toutes les cartes. Sur la carte de la vitrine, la pastille décrit le lien (lue après le titre, entre le statut et l’auteur) ; sur celle du fil, elle est hors du lien, lue à son tour comme le statut.',
  badge: 'La pastille seule, puis après un statut',
  showcase:
    'Carte de la vitrine (accueil, « À la une ») : avec photo, sans photo, titre long, puis un membre ordinaire',
  feed: 'Carte du fil (Fil, Explorer, recherche) : avec démo, puis sans photo ni démo, privé',
  photo: 'Photo du projet',
  plants: 'Le carnet des plantes',
  plantsPitch: 'Une photo de la feuille, et il dit quand arroser.',
  sky: 'Le ciel de ce soir',
  skyPitch: 'Les étoiles et les planètes visibles depuis chez soi, heure par heure.',
  long: 'Un assistant qui range les recettes de saison et propose un menu pour la semaine',
  rocket: 'Décollage !',
  try: 'Tester',
  testable: 'Testable',
  private: 'Privé',
  when: 'il y a 2 h',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Examples: the cards',
  intro:
    'A project of the examples account carries “Example” next to its status, on every card. On the showcase card, the pill describes the link (read after the title, between the status and the author); on the feed card, it sits outside the link and is read in turn, like the status.',
  badge: 'The pill alone, then after a status',
  showcase:
    'Showcase card (home, “Featured”): with a photo, without, long title, then an ordinary member',
  feed: 'Feed card (Feed, Explore, search): with a demo, then without a photo or a demo, private',
  photo: 'Project photo',
  plants: 'The plant notebook',
  plantsPitch: 'A photo of the leaf, and it tells you when to water.',
  sky: 'Tonight’s sky',
  skyPitch: 'The stars and planets you can see from home, hour by hour.',
  long: 'An assistant that sorts seasonal recipes and suggests a menu for the week',
  rocket: 'Lift-off!',
  try: 'Try',
  testable: 'Ready to test',
  private: 'Private',
  when: '2 h ago',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const
/** Le nom du compte d'exemples, celui des données de test (testing/projects.ts). */
const EXAMPLES_NAME = 'WaiggleBot'
/** La largeur d'une carte du fil, à peu près celle d'une colonne de la grille d'Explorer. */
const FEED_CARD_WIDTH = 380

// Des résumés flous de photos (ThumbHash), ceux des autres cartes du catalogue.
const rocket = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const butterfly = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

/** Un exemple légendé, sur une carte. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Surface variant="grouped" padding="xl">
        {children}
      </Surface>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

/** Les cartes de la vitrine : trois du compte d'exemples, puis une ordinaire pour comparer. */
function ShowcaseCards({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const photo = (thumbhash: string) => ({ source: null, thumbhash, label: l.photo })
  const testable = { label: t(($) => $.project.status.testable), strong: true }
  const author = { name: EXAMPLES_NAME, avatar: null }
  return (
    <Row gap="md" align="start" wrap>
      <ShowcaseCard
        title={l.plants}
        author={author}
        image={photo(butterfly)}
        status={testable}
        onPress={noop}
        example
      />
      <ShowcaseCard
        title={l.sky}
        author={author}
        image={null}
        status={{ label: t(($) => $.project.status.done), strong: false }}
        onPress={noop}
        example
      />
      <ShowcaseCard
        title={l.long}
        author={author}
        image={photo(rocket)}
        status={{ label: t(($) => $.project.status.building), strong: false }}
        onPress={noop}
        example
      />
      <ShowcaseCard
        title={l.rocket}
        author={{ name: 'Papi Jean', avatar: null }}
        image={photo(rocket)}
        status={testable}
        onPress={noop}
      />
    </Row>
  )
}

/** Les cartes du fil du compte d'exemples, à la largeur d'une colonne du fil. */
function FeedCards({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const author = { name: EXAMPLES_NAME, avatar: null, onPress: noop }
  return (
    <Row gap="md" align="start" wrap>
      <View style={{ width: FEED_CARD_WIDTH, maxWidth: '100%' }}>
        <ProjectCard
          title={l.plants}
          pitch={l.plantsPitch}
          author={author}
          image={{ source: null, thumbhash: butterfly, label: l.photo }}
          when={l.when}
          status={{ label: t(($) => $.project.status.testable), strong: true }}
          tryIt={{ label: l.try, onPress: noop }}
          reactionTotal={12}
          onPress={noop}
          example
        />
      </View>
      <View style={{ width: FEED_CARD_WIDTH, maxWidth: '100%' }}>
        <ProjectCard
          title={l.sky}
          pitch={l.skyPitch}
          author={author}
          image={null}
          when={l.when}
          status={{ label: t(($) => $.project.status.building), strong: false }}
          badge={l.private}
          onPress={noop}
          example
        />
      </View>
    </Row>
  )
}

export function ExampleCardsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.badge} — ${l[scheme]}`}>
              <Row gap="lg" align="center" wrap>
                <ExampleBadge />
                <Row gap="xs" align="start" wrap>
                  <StatusPill label={l.testable} strong />
                  <ExampleBadge />
                </Row>
              </Row>
            </Example>
            <Example caption={`${l.showcase} — ${l[scheme]}`}>
              <ShowcaseCards l={l} />
            </Example>
            <Example caption={`${l.feed} — ${l[scheme]}`}>
              <FeedCards l={l} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
