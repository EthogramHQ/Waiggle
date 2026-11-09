// La section « Administration du catalogue : les cartes » du catalogue (tranche R6b, U8b) : les
// trois morceaux des pages « Outils » et « Catégories » de la Modération, dans tous leurs états.
// PendingToolCard (un « Autre » à vérifier) : à décider avec trois projets, un seul, cinq sur sept,
// puis décidée de chaque façon (ajoutée, rattachée, laissée hors), un nom long sans espace, et une
// colonne de téléphone. UncategorizedCard (un projet à ranger) : à ranger, rangée, un titre long.
// CatalogueChangeRow (une ligne de « Changements récents ») : chaque sorte de geste, un
// administrateur parti, un projet devenu invisible. Jour et nuit ; le premier exemple se manipule
// (décider pour de vrai : la carte garde sa place et sa hauteur).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli. Les
// noms et titres sont des contenus de membres : ils ne se traduisent pas.
import type { CatalogueChange, PendingTool, UncategorizedProject } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { CatalogueChangeRow } from '../ui/CatalogueChangeRow'
import { PendingToolCard, type PendingToolOutcome } from '../ui/PendingToolCard'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { UncategorizedCard } from '../ui/UncategorizedCard'

const fr = {
  title: 'Administration du catalogue : les cartes',
  intro:
    'PendingToolCard : un « Autre » tapé par les membres, ses projets (cinq au plus, chacun ouvre sa page) et trois décisions. UncategorizedCard : un projet classé « Autre », à ranger. Une carte décidée garde sa place : le résultat remplace les boutons, au moins aussi haut, et prend le focus du clavier s’il était sur le bouton touché. CatalogueChangeRow : une ligne de « Changements récents », en une phrase.',
  live: 'À manipuler : décider (la carte reste, à la même hauteur), puis « Recommencer »',
  restart: 'Recommencer',
  pending: 'À vérifier, cité par 3 projets',
  single: 'Cité par 1 projet',
  many: 'Cité par 7 projets : cinq montrés',
  admitted: 'Ajouté au catalogue',
  merged: 'Rattaché à un outil',
  dismissed: 'Laissé hors du catalogue',
  long: 'Un nom long sans espace et un titre long, à 320 points (un téléphone)',
  toFile: 'Projet à ranger',
  filed: 'Projet rangé',
  longTitle: 'Un titre long, à 320 points',
  changes: 'Changements récents : chaque sorte de geste',
  changesEdge: 'Un administrateur parti, un projet que les membres ne voient plus',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Catalogue administration: the cards',
  intro:
    'PendingToolCard: an “Other” typed by members, its projects (five at most, each one opens its page) and three decisions. UncategorizedCard: a project filed under “Other”, to sort. A decided card keeps its place: the result replaces the buttons, at least as tall, and takes the keyboard focus if it was on the button pressed. CatalogueChangeRow: a line of “Recent changes”, in one sentence.',
  live: 'Try it: decide (the card stays, at the same height), then “Start over”',
  restart: 'Start over',
  pending: 'To check, named by 3 projects',
  single: 'Named by 1 project',
  many: 'Named by 7 projects: five shown',
  admitted: 'Added to the catalogue',
  merged: 'Linked to a tool',
  dismissed: 'Left out of the catalogue',
  long: 'A long name without spaces and a long title, at 320 points (a phone)',
  toFile: 'Project to sort',
  filed: 'Project sorted',
  longTitle: 'A long title, at 320 points',
  changes: 'Recent changes: each kind of action',
  changesEdge: 'A departed administrator, a project members no longer see',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr

/** Un identifiant valide (UUID v4) tiré d'un numéro. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const hugo = { name: 'Hugo Lefèvre', handle: 'hugo' }
const ines = { name: 'Inès Moreau', handle: 'ines' }
const yann = { name: 'Yann Le Gall', handle: null }
const nora = { name: 'Nora Benali', handle: 'nora' }

const makeCom: PendingTool = {
  slug: 'make-com',
  name: 'Make.com',
  createdAt: '2026-11-08T09:15:00.000Z',
  projectCount: 3,
  projects: [
    { id: id(11), title: 'Le tri des factures', author: hugo },
    { id: id(12), title: 'Mes rappels de plantes', author: ines },
    { id: id(13), title: 'Le résumé du conseil de classe', author: yann },
  ],
}

const teachable: PendingTool = {
  slug: 'teachable-machine',
  name: 'Teachable Machine',
  createdAt: '2026-11-07T18:40:00.000Z',
  projectCount: 1,
  projects: [{ id: id(21), title: 'Le papillon du jardin', author: hugo }],
}

const suno: PendingTool = {
  slug: 'suno-studio',
  name: 'Suno Studio',
  createdAt: '2026-11-06T07:05:00.000Z',
  projectCount: 7,
  projects: [
    { id: id(31), title: 'La berceuse de Lina', author: { name: 'Élodie Martin', handle: null } },
    { id: id(32), title: 'Le jingle du club', author: { name: 'Samuel Petit', handle: 'sam' } },
    { id: id(33), title: 'Chansons de route', author: ines },
    { id: id(34), title: 'Le générique du podcast', author: nora },
    {
      id: id(35),
      title: 'Une chanson par anniversaire',
      author: { name: 'Paul Roux', handle: null },
    },
  ],
}

const longName: PendingTool = {
  slug: 'mon-assistant-generateur-automatique',
  name: 'MonAssistantGénérateurAutomatiqueDeRecettesDeCuisine',
  createdAt: '2026-11-05T12:00:00.000Z',
  projectCount: 2,
  projects: [
    {
      id: id(41),
      title:
        'Le planificateur des repas de la semaine qui range aussi le frigo et prévoit les courses',
      author: { name: 'Maximilien de La Tour-Fontaine', handle: null },
    },
    { id: id(42), title: 'Soupes du dimanche', author: yann },
  ],
}

const birdhouse: UncategorizedProject = {
  id: id(51),
  title: 'La cabane à oiseaux connectée',
  pitch: 'Une caméra compte les mésanges qui passent dans le jardin.',
  author: ines,
  primaryCategory: 'other',
  secondaryCategory: null,
  publishedAt: '2026-11-02T10:00:00.000Z',
}

const knit: UncategorizedProject = {
  id: id(52),
  title: 'Le patron de tricot qui parle, rang après rang, au rythme des aiguilles de grand-mère',
  pitch:
    'Il lit chaque rang à voix haute, au rythme des aiguilles, et s’arrête quand on lève la main.',
  author: { name: 'Samuel Petit', handle: 'sam' },
  primaryCategory: 'learning',
  secondaryCategory: 'other',
  publishedAt: '2026-11-05T16:30:00.000Z',
}

/** L'heure figée des dates relatives : l'exemple dit toujours la même chose. */
const NOW = new Date('2026-11-09T12:00:00.000Z')

/** Une ligne du journal ; chaque exemple change ce qu'il montre. */
const changeOf = (n: number, over: Partial<CatalogueChange>): CatalogueChange => ({
  id: id(n),
  action: 'tool_admit',
  at: '2026-11-09T10:00:00.000Z',
  admin: nora,
  tool: null,
  mergedName: null,
  category: null,
  project: null,
  fromCategory: null,
  ...over,
})

const CHANGES: CatalogueChange[] = [
  changeOf(61, { action: 'tool_admit', tool: { slug: 'lovable', name: 'Lovable' } }),
  changeOf(62, {
    action: 'tool_create',
    tool: { slug: 'zapier', name: 'Zapier' },
    at: '2026-11-09T11:55:00.000Z',
  }),
  changeOf(63, {
    action: 'tool_edit',
    tool: { slug: 'zapier', name: 'Zapier' },
    admin: hugo,
    at: '2026-11-08T17:00:00.000Z',
  }),
  changeOf(64, {
    action: 'tool_merge',
    tool: { slug: 'make', name: 'Make' },
    mergedName: 'Make (le site)',
    at: '2026-11-06T09:00:00.000Z',
  }),
  changeOf(65, {
    action: 'tool_dismiss',
    tool: { slug: 'truc-bidule', name: 'Truc bidule' },
    at: '2026-10-20T09:00:00.000Z',
  }),
  changeOf(66, { action: 'category_create', category: { code: 'gardening', name: 'Jardinage' } }),
  changeOf(67, {
    action: 'project_recategorize',
    category: { code: 'animals', name: 'Animaux' },
    project: { id: id(44), title: 'Le carnet des hérissons' },
    fromCategory: 'other',
  }),
]

const EDGE_CHANGES: CatalogueChange[] = [
  changeOf(71, { action: 'tool_admit', tool: { slug: 'lovable', name: 'Lovable' }, admin: null }),
  changeOf(72, {
    action: 'project_recategorize',
    category: { code: 'animals', name: 'Animaux' },
    project: null,
    fromCategory: 'other',
  }),
  changeOf(73, {
    action: 'tool_merge',
    tool: { slug: 'mon-assistant', name: 'MonAssistant' },
    mergedName: 'MonAssistantGénérateurAutomatiqueDeRecettesDeCuisine',
  }),
]

const noop = () => {}
const pendingHandlers = { onAdmit: noop, onMerge: noop, onDismiss: noop, onOpenProject: noop }

export function AdminCardsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LivePendingCard l={l} />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.pending} — ${l[scheme]}`}>
              <PendingToolCard tool={makeCom} outcome={null} {...pendingHandlers} />
            </Example>
            <Example caption={`${l.single} — ${l[scheme]}`}>
              <PendingToolCard tool={teachable} outcome={null} {...pendingHandlers} />
            </Example>
            <Example caption={`${l.many} — ${l[scheme]}`}>
              <PendingToolCard tool={suno} outcome={null} {...pendingHandlers} />
            </Example>
            <Example caption={`${l.admitted} — ${l[scheme]}`}>
              <PendingToolCard
                tool={teachable}
                outcome={{ kind: 'admitted' }}
                {...pendingHandlers}
              />
            </Example>
            <Example caption={`${l.merged} — ${l[scheme]}`}>
              <PendingToolCard
                tool={makeCom}
                outcome={{ kind: 'merged', target: 'Make' }}
                {...pendingHandlers}
              />
            </Example>
            <Example caption={`${l.dismissed} — ${l[scheme]}`}>
              <PendingToolCard tool={suno} outcome={{ kind: 'dismissed' }} {...pendingHandlers} />
            </Example>
            <Example caption={`${l.long} — ${l[scheme]}`}>
              <Frame width={320}>
                <PendingToolCard tool={longName} outcome={null} {...pendingHandlers} />
              </Frame>
            </Example>
            <Example caption={`${l.toFile} — ${l[scheme]}`}>
              <UncategorizedCard
                project={birdhouse}
                filedInto={null}
                onFile={noop}
                onOpenProject={noop}
              />
            </Example>
            <Example caption={`${l.filed} — ${l[scheme]}`}>
              <UncategorizedCard
                project={birdhouse}
                filedInto={i18n.language === 'en' ? 'Animals' : 'Animaux'}
                onFile={noop}
                onOpenProject={noop}
              />
            </Example>
            <Example caption={`${l.longTitle} — ${l[scheme]}`}>
              <Frame width={320}>
                <UncategorizedCard
                  project={knit}
                  filedInto={null}
                  onFile={noop}
                  onOpenProject={noop}
                />
              </Frame>
            </Example>
            <Example caption={`${l.changes} — ${l[scheme]}`}>
              <Stack gap="md">
                {CHANGES.map((change) => (
                  <CatalogueChangeRow key={change.id} change={change} now={NOW} />
                ))}
              </Stack>
            </Example>
            <Example caption={`${l.changesEdge} — ${l[scheme]}`}>
              <Frame width={320}>
                <Stack gap="md">
                  {EDGE_CHANGES.map((change) => (
                    <CatalogueChangeRow key={change.id} change={change} now={NOW} />
                  ))}
                </Stack>
              </Frame>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Une carte qui se décide pour de vrai : chaque bouton pose son résultat, « Recommencer » l'efface. */
function LivePendingCard({ l }: { l: Labels }) {
  const [outcome, setOutcome] = useState<PendingToolOutcome>(null)
  return (
    <Stack gap="sm">
      <PendingToolCard
        tool={makeCom}
        outcome={outcome}
        onAdmit={() => setOutcome({ kind: 'admitted' })}
        onMerge={() => setOutcome({ kind: 'merged', target: 'Make' })}
        onDismiss={() => setOutcome({ kind: 'dismissed' })}
        onOpenProject={noop}
      />
      <View style={{ alignSelf: 'flex-start' }}>
        <TextLink role="button" label={l.restart} onPress={() => setOutcome(null)} />
      </View>
    </Stack>
  )
}

/** Une colonne de largeur donnée (un téléphone), jamais plus large que la page. */
function Frame({ width, children }: { width: number; children: ReactNode }) {
  return <View style={{ width, maxWidth: '100%' }}>{children}</View>
}

/** Un exemple et sa légende, sur le fond de la page de son thème. */
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
