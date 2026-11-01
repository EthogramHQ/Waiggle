// La section « Cartes et pastille Suivre » du catalogue (refonte, tranche R3) : la carte d'un projet
// (ProjectCard) avec, posée sur sa photo, la pastille « Suivre Nora » (FollowButton en variante
// `chip`) dans tous ses états, de jour et de nuit : à suivre, suivie (« Tu suis Max ✓ »), inactive,
// avec un nom long, et la carte sans pastille (ses propres projets). La première se touche
// vraiment : elle passe de « Suivre Nora » à « Tu suis Nora ✓ », et retour.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FollowButton } from '../ui/FollowButton'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Cartes et pastille « Suivre »',
  intro:
    'Dans « Récents » d’Explorer, une pastille de verre est posée sur la photo de la carte d’un auteur qu’on ne suit pas encore. Elle est à côté du lien de la carte, jamais dedans : la toucher suit l’auteur sans ouvrir le projet ; la retoucher arrête de suivre. La première carte se touche pour de vrai.',
  day: 'jour',
  night: 'nuit',
  follow: (name: string) => `Suivre ${name}`,
  following: (name: string) => `Tu suis ${name}`,
  toFollow: 'À suivre (touche-la)',
  followed: 'Déjà suivi',
  inactive: 'Inactive (compte suspendu)',
  longName: 'Nom long, sur la lumière miel (sans photo)',
  none: 'Sans pastille (un de ses propres projets)',
  now: 'il y a 3 h',
  photo: 'Photo du projet',
  idea: 'Idée',
  building: 'En construction',
  testable: 'Testable',
  projects: [
    { title: 'Arrosage malin', pitch: 'Il me dit quand arroser mes plantes, selon la météo.' },
    { title: 'Compte-bonbons', pitch: 'Combien de bonbons dans le bocal ? Une photo suffit.' },
    {
      title: 'Biscotte au parc',
      pitch: 'Les parcs où les chiens peuvent courir, près de chez moi.',
    },
    { title: 'Mon agent de recettes', pitch: 'Un menu avec ce qu’il y a au frigo.' },
    { title: 'Le ciel de ce soir', pitch: 'Ce qu’on verra dans le ciel ce soir, s’il fait beau.' },
  ],
}

const en: typeof fr = {
  title: 'Cards and the “Follow” chip',
  intro:
    'In Explore’s “Recent”, a glass chip sits on the photo of a card whose author you don’t follow yet. It sits next to the card’s link, never inside it: touching it follows the author without opening the project; touching it again stops following. The first card can really be touched.',
  day: 'day',
  night: 'night',
  follow: (name: string) => `Follow ${name}`,
  following: (name: string) => `You follow ${name}`,
  toFollow: 'To follow (touch it)',
  followed: 'Already followed',
  inactive: 'Inactive (suspended account)',
  longName: 'Long name, on the honey light (no photo)',
  none: 'No chip (one of your own projects)',
  now: '3 h ago',
  photo: 'Project photo',
  idea: 'Idea',
  building: 'In progress',
  testable: 'Testable',
  projects: [
    { title: 'Smart watering', pitch: 'It tells me when to water my plants, from the forecast.' },
    { title: 'Candy counter', pitch: 'How many candies in the jar? One photo is enough.' },
    { title: 'Biscotte at the park', pitch: 'Parks near me where dogs can run.' },
    { title: 'My recipe agent', pitch: 'A menu from what’s in the fridge.' },
    { title: 'Tonight’s sky', pitch: 'What we’ll see in the sky tonight, if it’s clear.' },
  ],
}

// Des résumés flous (ThumbHash) de visuels de projet, les mêmes que ceux de CatalogueScreen.tsx.
// « gitleaks:allow » : l'outil qui cherche les secrets oubliés les prendrait pour des clés.
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

const noop = () => {}
// La hauteur de SummaryCard (celle de ProjectCard par défaut) : à texte agrandi, le panneau du bas
// y laisse la place de la pastille ; sur une carte de 360 points, il montait dessous.
const height = 476

export function CardsCatalogue() {
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
            <Cards l={l} />
          </Example>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Les cinq cartes d'un thème, dans la grille d'Explorer (une colonne sur téléphone). */
function Cards({ l }: { l: typeof fr }) {
  // La pastille de la première carte se touche : son état vit ici, comme il vivrait dans l'écran.
  const [following, setFollowing] = useState(false)
  const [arrosage, bonbons, biscotte, recettes, ciel] = l.projects as [
    (typeof fr.projects)[number],
    (typeof fr.projects)[number],
    (typeof fr.projects)[number],
    (typeof fr.projects)[number],
    (typeof fr.projects)[number],
  ]
  return (
    <ProjectGrid empty="">
      <Captioned caption={l.toFollow}>
        <ProjectCard
          {...arrosage}
          author={{ name: 'Nora Benali', avatar: null }}
          when={l.now}
          status={{ label: l.building, strong: false }}
          image={{ source: null, thumbhash: papillon, label: l.photo }}
          onPress={noop}
          height={height}
          overlay={
            <FollowButton
              variant="chip"
              followed={following}
              onPress={() => setFollowing((was) => !was)}
              label={following ? l.following('Nora') : l.follow('Nora')}
              text={following ? l.following('Nora') : l.follow('Nora')}
              avatar={{ name: 'Nora Benali', source: null }}
            />
          }
        />
      </Captioned>
      <Captioned caption={l.followed}>
        <ProjectCard
          {...bonbons}
          author={{ name: 'Max Durand', avatar: null }}
          when={l.now}
          status={{ label: l.idea, strong: false }}
          image={{ source: null, thumbhash: cafe, label: l.photo }}
          onPress={noop}
          height={height}
          overlay={
            <FollowButton
              variant="chip"
              followed
              onPress={noop}
              label={l.following('Max')}
              text={l.following('Max')}
              avatar={{ name: 'Max Durand', source: null }}
            />
          }
        />
      </Captioned>
      <Captioned caption={l.inactive}>
        <ProjectCard
          {...biscotte}
          author={{ name: 'Tante Odile', avatar: null }}
          when={l.now}
          status={{ label: l.testable, strong: true }}
          image={{ source: null, thumbhash: cafe, label: l.photo }}
          onPress={noop}
          height={height}
          overlay={
            <FollowButton
              variant="chip"
              followed={false}
              disabled
              onPress={noop}
              label={l.follow('Odile')}
              text={l.follow('Odile')}
            />
          }
        />
      </Captioned>
      <Captioned caption={l.longName}>
        <ProjectCard
          {...recettes}
          author={{ name: 'Marie-Bénédicte de la Fontaine-Lacroix', avatar: null }}
          when={l.now}
          status={{ label: l.idea, strong: false }}
          image={null}
          onPress={noop}
          height={height}
          overlay={
            <FollowButton
              variant="chip"
              followed={false}
              onPress={noop}
              label={l.follow('Marie-Bénédicte de la Fontaine-Lacroix')}
              text={l.follow('Marie-Bénédicte de la Fontaine-Lacroix')}
              avatar={{ name: 'Marie-Bénédicte de la Fontaine-Lacroix', source: null }}
            />
          }
        />
      </Captioned>
      <Captioned caption={l.none}>
        <ProjectCard
          {...ciel}
          author={{ name: 'Léa Moreau', avatar: null }}
          when={l.now}
          status={{ label: l.idea, strong: false }}
          image={{ source: null, thumbhash: papillon, label: l.photo }}
          onPress={noop}
          height={height}
        />
      </Captioned>
    </ProjectGrid>
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
