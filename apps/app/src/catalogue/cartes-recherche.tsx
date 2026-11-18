// La section « Cartes d'un résultat de recherche » du catalogue (R16, planches R16-Recherche-1440 et
// -1920) : la carte compacte de la Recherche en grand (`ProjectCard match`), de jour et de nuit,
// dans ses états : trouvée par son titre (les lettres cherchées surlignées dans le titre), trouvée
// par sa description (l'extrait surligné à la place de l'accroche, même sur une photo), sans photo,
// et la carte ordinaire de « Récents », pour comparer.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses libellés (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ProjectCard } from '../ui/ProjectCard'
import { GridCardsContext, ProjectGrid } from '../ui/ProjectGrid'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Cartes d’un résultat de recherche',
  intro:
    'En grand (dès 1 280 points), la Recherche montre ses projets en cartes compactes. Les lettres cherchées sont surlignées de miel ; quand c’est la description qui a correspondu, son extrait prend la place de l’accroche, même sur une photo. Sur un écran plus étroit, la carte reste celle de « Récents ».',
  day: 'jour',
  night: 'nuit',
  byTitle: 'Trouvée par son titre',
  byExcerpt: 'Trouvée par sa description',
  noPhoto: 'Sans photo, par sa description',
  plain: 'Sans recherche (« Récents »)',
  photo: 'Photo du projet',
  testable: 'Testable',
  building: 'En construction',
  test: 'Tester',
  now: 'il y a 3 h',
  words: ['carn'],
  cafe: { title: 'Carnet de cafés', pitch: 'Il note le café et devine le prochain.' },
  biscotte: {
    title: 'Biscotte au parc',
    pitch: 'Les parcs où les chiens peuvent courir.',
    excerpt: '« … Le carnet de balades de Biscotte… »',
  },
  rocket: {
    title: 'Décollage !',
    pitch: 'Un quiz sur l’espace pour Yanis.',
    excerpt: '« … un carnet de bord pour Yanis… »',
  },
}

const en: typeof fr = {
  title: 'Cards of a search result',
  intro:
    'On wide screens (from 1,280 points), Search shows its projects as compact cards. The searched letters are marked in honey; when the description matched, its excerpt takes the place of the pitch, even on a photo. On narrower screens, the card stays that of “Recent”.',
  day: 'day',
  night: 'night',
  byTitle: 'Found by its title',
  byExcerpt: 'Found by its description',
  noPhoto: 'No photo, by its description',
  plain: 'No search (“Recent”)',
  photo: 'Project photo',
  testable: 'Testable',
  building: 'In progress',
  test: 'Try',
  now: '3 h ago',
  words: ['note'],
  cafe: { title: 'Coffee notebook', pitch: 'It rates the coffee and guesses the next one.' },
  biscotte: {
    title: 'Biscotte at the park',
    pitch: 'Parks where dogs can run.',
    excerpt: '“… Biscotte’s notebook of walks…”',
  },
  rocket: {
    title: 'Lift-off!',
    pitch: 'A space quiz for Yanis.',
    excerpt: '“… a logbook and notebook for Yanis…”',
  },
}

// Des résumés flous (ThumbHash) de visuels de projet, les mêmes que ceux de cartes.tsx.
// « gitleaks:allow » : l'outil qui cherche les secrets oubliés les prendrait pour des clés.
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow
const noop = () => {}

export function SearchCardsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {(['day', 'night'] as const).map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre.
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

/** Les quatre cartes d'un thème, en compactes sur ordinateur (`GridCardsContext`), comme la Recherche. */
function Cards({ l }: { l: typeof fr }) {
  const common = {
    author: { name: 'Léa Moreau', avatar: null },
    when: l.now,
    onPress: noop,
    tryIt: { label: l.test, onPress: noop },
  }
  return (
    <GridCardsContext.Provider value="compact">
      <ProjectGrid empty="">
        <Captioned caption={l.byTitle}>
          <ProjectCard
            {...common}
            {...l.cafe}
            status={{ label: l.testable, strong: true }}
            image={{ source: null, thumbhash: cafe, label: l.photo }}
            match={{ words: l.words, excerpt: null }}
          />
        </Captioned>
        <Captioned caption={l.byExcerpt}>
          <ProjectCard
            {...common}
            title={l.biscotte.title}
            pitch={l.biscotte.pitch}
            status={{ label: l.building, strong: false }}
            image={{ source: null, thumbhash: papillon, label: l.photo }}
            match={{ words: l.words, excerpt: l.biscotte.excerpt }}
          />
        </Captioned>
        <Captioned caption={l.noPhoto}>
          <ProjectCard
            {...common}
            title={l.rocket.title}
            pitch={l.rocket.pitch}
            status={{ label: l.testable, strong: true }}
            image={null}
            match={{ words: l.words, excerpt: l.rocket.excerpt }}
          />
        </Captioned>
        <Captioned caption={l.plain}>
          <ProjectCard
            {...common}
            {...l.cafe}
            status={{ label: l.testable, strong: true }}
            image={{ source: null, thumbhash: cafe, label: l.photo }}
          />
        </Captioned>
      </ProjectGrid>
    </GridCardsContext.Provider>
  )
}

/** Une carte et sa légende, l'une au-dessus de l'autre, dans une case de la grille. */
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
