// La section « La mosaïque d'un membre » du catalogue (tranche R14) : la carte compacte
// (`ProjectCard size="compact"`) dans ses états, avec et sans photo, avec toutes ses pastilles
// (« Privé », « Exemple », « Mis à jour », un total à trois chiffres), sans réactions, à la largeur
// d'une demi-rangée de téléphone (171 points à 390, 136 à 320) ; son squelette ; puis la mosaïque
// (`ProjectMosaic`) à 1, 2, 3, 4 et 5 projets. La mosaïque suit la largeur de la fenêtre : la
// capture de téléphone montre la mise en page du téléphone, celle d'ordinateur le bloc d'en tête.
// Aucune carte ne porte d'auteur : on est sur la page du membre. De jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ProjectCard, type ProjectCardSize } from '../ui/ProjectCard'
import { ProjectMosaic } from '../ui/ProjectMosaic'
import { SkeletonCard } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La mosaïque d’un membre',
  intro:
    'Sur la page d’un membre, son projet le plus récent est une grande carte, les suivants des cartes compactes : titre, statut, pastilles et réactions ; l’accroche seulement sans photo. Ni auteur, ni catégorie, ni « Tester ».',
  compact:
    'Carte compacte, à 171 points (390) : avec photo, sans photo (l’accroche sur deux lignes), sans réactions',
  pills:
    'Toutes les pastilles (privé, exemple, mis à jour, 128 réactions) : à 171 points, puis à 136 (320) ; la carte grandit',
  skeleton: 'Une carte compacte qui charge (SkeletonCard shape="compact")',
  mosaic: (count: number) =>
    count === 1 ? 'La mosaïque, 1 projet' : `La mosaïque, ${count} projets`,
  photo: 'Photo du projet',
  private: 'Privé',
  updated: 'Mis à jour · v1.2',
  try: 'Tester',
  projects: [
    {
      title: 'Biscotte au parc',
      pitch: 'Le carnet des promenades du chien, avec la météo du jour.',
    },
    { title: 'Le ciel de ce soir', pitch: 'Les étoiles et les planètes visibles depuis chez soi.' },
    {
      title: 'Mon agent de recettes',
      pitch: 'Il range les recettes de saison et propose un menu.',
    },
    { title: 'Le carnet des plantes', pitch: 'Une photo de la feuille, et il dit quand arroser.' },
    { title: 'Décollage !', pitch: 'Un compte à rebours pour les fusées en papier du mercredi.' },
  ],
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'A member’s mosaic',
  intro:
    'On a member’s page, their latest project is a big card and the next ones are compact cards: title, status, pills and reactions; the pitch only without a photo. No author, no category, no “Try”.',
  compact:
    'Compact card, 171 points wide (390): with a photo, without (the pitch on two lines), without reactions',
  pills:
    'Every pill (private, example, updated, 128 reactions): 171 points wide, then 136 (320); the card grows',
  skeleton: 'A compact card loading (SkeletonCard shape="compact")',
  mosaic: (count: number) =>
    count === 1 ? 'The mosaic, 1 project' : `The mosaic, ${count} projects`,
  photo: 'Project photo',
  private: 'Private',
  updated: 'Updated · v1.2',
  try: 'Try',
  projects: [
    { title: 'Biscotte at the park', pitch: 'The dog’s walk diary, with the weather of the day.' },
    { title: 'Tonight’s sky', pitch: 'The stars and planets you can see from home.' },
    { title: 'My recipe agent', pitch: 'It sorts seasonal recipes and suggests a menu.' },
    { title: 'The plant notebook', pitch: 'A photo of the leaf, and it tells you when to water.' },
    { title: 'Lift-off!', pitch: 'A countdown for the Wednesday paper rockets.' },
  ],
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const
/** La largeur d'une compacte sur téléphone : une demi-rangée, à 390 puis à 320 points. */
const PHONE_HALF = 171
const NARROW_HALF = 136

// Des résumés flous de photos (ThumbHash), ceux des autres cartes du catalogue.
const rocket = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const butterfly = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow
/** Une photo sur deux, la troisième sans photo : la mosaïque montre les deux fonds. */
const photos = [butterfly, rocket, null, butterfly, rocket] as const

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

/** Une carte compacte posée à une largeur donnée (celle d'une case de la mosaïque). */
function Sized({ width, children }: { width: number; children: ReactNode }) {
  return <View style={{ width, maxWidth: '100%' }}>{children}</View>
}

/** Les compactes ordinaires : avec photo, sans photo, sans réactions. */
function CompactCards({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const [first, second, third] = l.projects
  if (!first || !second || !third) return null
  return (
    <Row gap="md" align="start" wrap>
      <Sized width={PHONE_HALF}>
        <ProjectCard
          size="compact"
          title={first.title}
          pitch={first.pitch}
          image={{ source: null, thumbhash: butterfly, label: l.photo }}
          status={{ label: t(($) => $.project.status.testable), strong: true }}
          tryIt={{ label: l.try, onPress: noop }}
          reactionTotal={12}
          onPress={noop}
        />
      </Sized>
      <Sized width={PHONE_HALF}>
        <ProjectCard
          size="compact"
          title={second.title}
          pitch={second.pitch}
          image={null}
          status={{ label: t(($) => $.project.status.building), strong: false }}
          reactionTotal={3}
          onPress={noop}
        />
      </Sized>
      <Sized width={PHONE_HALF}>
        <ProjectCard
          size="compact"
          title={third.title}
          pitch={third.pitch}
          image={{ source: null, thumbhash: rocket, label: l.photo }}
          status={{ label: t(($) => $.project.status.idea), strong: false }}
          onPress={noop}
        />
      </Sized>
    </Row>
  )
}

/** Toutes les pastilles sur une compacte, à 171 puis à 136 points : elles passent à la ligne. */
function AllPills({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const [first] = l.projects
  if (!first) return null
  const card = (
    <ProjectCard
      size="compact"
      title={first.title}
      pitch={first.pitch}
      image={{ source: null, thumbhash: butterfly, label: l.photo }}
      status={{ label: t(($) => $.project.status.testable), strong: true }}
      badge={l.private}
      example
      updated={{ kind: 'badge', label: l.updated }}
      reactionTotal={128}
      onPress={noop}
    />
  )
  return (
    <Row gap="md" align="start" wrap>
      <Sized width={PHONE_HALF}>{card}</Sized>
      <Sized width={NARROW_HALF}>{card}</Sized>
    </Row>
  )
}

/** La mosaïque de `count` projets, dessinée comme la page d'un membre la dessine. */
function Mosaic({ l, count }: { l: Labels; count: number }) {
  const { t } = useTranslation()
  const items = l.projects.slice(0, count).map((project, rank) => ({
    id: `mosaic-${count}-${rank}`,
    ...project,
    thumbhash: photos[rank] ?? null,
    reactions: rank === 0 ? 49 : rank * 3,
  }))
  const testable = { label: t(($) => $.project.status.testable), strong: true }
  return (
    <ProjectMosaic
      items={items}
      render={(item, size: ProjectCardSize) => (
        <ProjectCard
          size={size}
          title={item.title}
          pitch={item.pitch}
          image={
            item.thumbhash ? { source: null, thumbhash: item.thumbhash, label: l.photo } : null
          }
          status={testable}
          tryIt={{ label: l.try, onPress: noop }}
          reactionTotal={item.reactions}
          onPress={noop}
        />
      )}
    />
  )
}

export function MemberMosaicCatalogue() {
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
            <Example caption={`${l.compact} — ${l[scheme]}`}>
              <CompactCards l={l} />
            </Example>
            <Example caption={`${l.pills} — ${l[scheme]}`}>
              <AllPills l={l} />
            </Example>
            <Example caption={`${l.skeleton} — ${l[scheme]}`}>
              <Sized width={PHONE_HALF}>
                <SkeletonCard shape="compact" />
              </Sized>
            </Example>
            {[1, 2, 3, 4, 5].map((count) => (
              <Example key={count} caption={`${l.mosaic(count)} — ${l[scheme]}`}>
                <Mosaic l={l} count={count} />
              </Example>
            ))}
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
