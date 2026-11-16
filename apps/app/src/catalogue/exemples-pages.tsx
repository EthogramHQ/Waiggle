// La section « Les exemples : les pages » du catalogue (tranche R12b) : l'en-tête d'un projet du
// compte d'exemples (« Exemple » après le statut, la phrase qui dit le projet fictif sous le pitch)
// et l'en-tête de la page de ce compte (« Exemple » à côté du nom, la phrase dessous), avec un nom
// court et un nom long qui passe à la ligne, de jour et de nuit. Les cartes ont leur propre section.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ProjectHeaderView } from '../projects/ProjectHeader'
import { exampleProject } from '../testing/projects'
import { MemberHeader } from '../ui/MemberHeader'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { sampleCategory } from './categories-exemples'

const fr = {
  title: 'Les exemples : les pages',
  intro:
    'Le compte d’exemples de l’équipe publie des projets fictifs. Sur la page d’un de ses projets, « Exemple » suit le statut et une phrase discrète, sous le pitch, dit le projet fictif. Sur la page du compte, « Exemple » est à côté du nom, et la phrase dessous.',
  project: 'En-tête d’un projet d’exemple',
  member: 'En-tête du compte d’exemples',
  longName: 'Un nom long : la pastille passe sous le nom',
  longNameValue: 'L’équipe des exemples de démonstration',
  bio: 'Des projets pour montrer à quoi ressemble un projet.',
  tools: 'Outils favoris',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Examples: the pages',
  intro:
    'The team’s examples account publishes made-up projects. On the page of one of them, “Example” follows the status and a quiet sentence, under the pitch, says the project is made up. On the page of the account, “Example” sits next to the name, with the sentence below.',
  project: 'Header of an example project',
  member: 'Header of the examples account',
  longName: 'A long name: the pill moves under the name',
  longNameValue: 'The team of demonstration examples',
  bio: 'Projects that show what a project looks like.',
  tools: 'Favourite tools',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const
/** L'heure figée des dates de l'en-tête : la capture ne change pas d'un jour à l'autre. */
const NOW = new Date('2026-11-16T12:00:00.000Z')

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

/** L'en-tête du projet d'exemple, comme sur sa page (la ligne de l'auteur sans « Suivre »). */
function ProjectExample() {
  const { i18n } = useTranslation()
  return (
    <ProjectHeaderView
      project={exampleProject}
      categories={{ primary: sampleCategory(i18n.language, 'home-garden') }}
      author={{
        name: exampleProject.author.name,
        handle: '@waigglebot',
        avatar: null,
        openLabel: exampleProject.author.name,
        onOpen: noop,
        follow: null,
      }}
      now={NOW}
    />
  )
}

/** L'en-tête de la page du compte d'exemples, avec la phrase de l'appli. */
function MemberExample({ l, name }: { l: Labels; name: string }) {
  const { t } = useTranslation()
  return (
    <MemberHeader
      name={name}
      handle="@waigglebot"
      avatar={null}
      bio={l.bio}
      toolsTitle={l.tools}
      tools={[]}
      exampleNote={t(($) => $.member.exampleNote)}
    />
  )
}

export function ExamplePagesCatalogue() {
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
            <Example caption={`${l.project} — ${l[scheme]}`}>
              <ProjectExample />
            </Example>
            <Example caption={`${l.member} — ${l[scheme]}`}>
              <MemberExample l={l} name="WaiggleBot" />
            </Example>
            <Example caption={`${l.longName} — ${l[scheme]}`}>
              <MemberExample l={l} name={l.longNameValue} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
