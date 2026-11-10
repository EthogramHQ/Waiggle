// La section « Mises à jour : la frise » du catalogue (R7a, U1d) : la frise des mises à jour d'un
// projet (UpdateTimeline) dans chacun de ses états (relecture du plan, A8) : finie, avec
// « Première version » ; avec une suite à demander ; la suite en chargement ; la suite en panne,
// avec « Réessayer » ; l'auteur avec ses corbeilles, dont une en cours de suppression et une mise à
// jour retirée par la modération ; un autre membre, avec « Signaler » ; puis la même de nuit. En
// tête, la ligne de dates d'un projet (ProjectDatesLine), partagée par la page du projet et celle de
// la frise : publique, privée, sans mise à jour, mise à jour sans version.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (la session pose l'import à la
// fusion). Ses libellés (un outil de développement, absent de l'appli publiée) sont écrits ici, en
// français et en anglais ; les textes des composants viennent de l'appli, les mises à jour
// d'exemple sont écrites dans la langue du catalogue.
import { type ColorName, palettes } from '@ruche/brand'
import type { ProjectUpdate, ProjectVisual } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageSource } from '../ui/image'
import { ProjectDatesLine } from '../ui/ProjectDatesLine'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { UpdateTimeline } from '../ui/UpdateTimeline'

const fr = {
  section: 'Mises à jour : la frise',
  intro:
    'La frise d’un projet : ses mises à jour de la plus récente à la plus ancienne, reliées par un trait (le point miel pour la plus récente, un rond vide pour les autres), puis « Afficher la suite », et « Première version » au bout, seulement quand il n’y a plus de suite. Au-dessus, la ligne de dates du projet.',
  datesTitle: 'La ligne de dates d’un projet',
  datesPublic: 'Publique, avec une mise à jour et sa version',
  datesPrivate: 'Privée : « Créé » plutôt que « Publié »',
  datesNoUpdate: 'Sans mise à jour : ni « Mis à jour » ni version',
  datesNoVersion: 'Une mise à jour sans version',
  end: 'Finie : « Première version » au bout, à la date de publication',
  more: 'Avec une suite à demander : « Afficher la suite », pas encore de « Première version »',
  loading: 'La suite en chargement : le bouton occupé ne redemande rien',
  error: 'La suite en panne : ce qui est affiché reste, avec « Réessayer »',
  author: 'L’auteur : une corbeille par mise à jour, l’une en cours de suppression, une retirée',
  other: 'Un autre membre : « Signaler cette mise à jour »',
  night: 'De nuit, l’auteur',
  updates: [
    {
      title: 'Le décompte de la fusée',
      version: 'v1.2',
      lines: [
        { family: 'new', text: 'Un compte à rebours avant chaque question' },
        { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
      ],
    },
    {
      title: 'Le mode nuit',
      version: 'v1.1',
      lines: [{ family: 'polish', text: 'Des étoiles qui scintillent derrière la fusée' }],
    },
    {
      title: null,
      version: 'v1.0.3',
      lines: [
        { family: 'fixed', text: 'La fusée ne sort plus de l’écran sur les petits téléphones' },
      ],
    },
  ],
  photo: 'La fusée de nuit, le décompte affiché',
  explanation: 'Les photos montraient l’adresse d’un autre membre.',
} as const

const en = {
  section: 'Updates: the timeline',
  intro:
    'A project’s timeline: its updates from the most recent to the oldest, joined by a line (the honey dot for the most recent, an empty ring for the others), then “Show more”, and “First version” at the end, only once nothing is left. Above it, the project’s dates line.',
  datesTitle: 'A project’s dates line',
  datesPublic: 'Public, with an update and its version',
  datesPrivate: 'Private: “Created” rather than “Published”',
  datesNoUpdate: 'No update: neither “Updated” nor a version',
  datesNoVersion: 'An update without a version',
  end: 'Finished: “First version” at the end, on the publication date',
  more: 'More to load: “Show more”, no “First version” yet',
  loading: 'Loading more: the busy button asks for nothing again',
  error: 'Loading more failed: what is shown stays, with “Retry”',
  author: 'The author: a trash button per update, one being deleted, one removed',
  other: 'Another member: “Report this update”',
  night: 'At night, the author',
  updates: [
    {
      title: 'The rocket countdown',
      version: 'v1.2',
      lines: [
        { family: 'new', text: 'A countdown before each question' },
        { family: 'fixed', text: 'The score no longer resets at level 3' },
      ],
    },
    {
      title: 'Night mode',
      version: 'v1.1',
      lines: [{ family: 'polish', text: 'Stars twinkling behind the rocket' }],
    },
    {
      title: null,
      version: 'v1.0.3',
      lines: [{ family: 'fixed', text: 'The rocket no longer leaves the screen on small phones' }],
    },
  ],
  photo: 'The rocket by night, the countdown shown',
  explanation: 'The photos showed another member’s address.',
} as const

type Labels = typeof fr | typeof en

/** L'heure du catalogue : les dates relatives ne changent pas d'une capture à l'autre. */
const NOW = new Date('2026-11-05T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
/** Le projet a été publié le 12 septembre (« Première version », et la ligne de dates). */
const PUBLISHED_AT = '2026-09-12T10:00:00.000Z'

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque et un disque d'une troisième, comme dans mises-a-jour-frise.tsx. Palette de jour : une
 * photo ne change pas avec le thème.
 */
const sample = (id: string, description: string): ProjectVisual => {
  const day = palettes.day
  const from: ColorName = 'text'
  const to: ColorName = 'controlChecked'
  const disc: ColorName = 'honeyLight'
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="110" r="70" fill="${day[disc]}"/></svg>`,
  )}`
  return {
    id,
    kind: 'image',
    url,
    width: 400,
    height: 300,
    // Le résumé flou, affiché le temps que la photo arrive (celui des photos des tests).
    thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
    description,
  }
}

/** Les photos servies telles quelles (des adresses `data:`, sans cookie). */
const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)

/** Les trois mises à jour d'exemple, dans la langue du catalogue ; la plus récente a une photo. */
const updatesOf = (l: Labels): ProjectUpdate[] =>
  l.updates.map((one, rank) => ({
    id: `00000000-0000-4000-8000-0000000000${String(rank + 10)}`,
    title: one.title,
    version: one.version,
    lines: one.lines.map((line) => ({ ...line })),
    photos: rank === 0 ? [sample('88888888-8888-4888-8888-888888888888', l.photo)] : [],
    beforeAfter: false,
    createdAt: hoursAgo(3 + rank * 170),
    removal: null,
  }))

export function UpdateTimelineCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const updates = updatesOf(l)
  // Sans photo, pour que les états de la suite se lisent d'un coup d'œil.
  const light: ProjectUpdate[] = updates.map((one) => ({ ...one, photos: [] }))
  const middle = light[1]
  // La plus ancienne, retirée par la modération : son auteur la voit avec le bandeau.
  const withRemoval: ProjectUpdate[] = light.map((one, rank) =>
    rank === light.length - 1
      ? {
          ...one,
          removal: {
            ground: 'rules',
            explanation: l.explanation,
            at: hoursAgo(1),
            afterReport: true,
          },
        }
      : one,
  )
  const common = { publishedAt: PUBLISHED_AT, toSource, onMore: () => {}, now: NOW }

  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.section}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Example caption={l.datesTitle}>
        <Stack gap="md">
          <Labelled caption={l.datesPublic}>
            <ProjectDatesLine
              createdAt={PUBLISHED_AT}
              visibility="public"
              latestUpdateAt={hoursAgo(50)}
              version="v1.2"
              now={NOW}
            />
          </Labelled>
          <Labelled caption={l.datesPrivate}>
            <ProjectDatesLine
              createdAt={PUBLISHED_AT}
              visibility="private"
              latestUpdateAt={hoursAgo(50)}
              version="v1.2"
              now={NOW}
            />
          </Labelled>
          <Labelled caption={l.datesNoUpdate}>
            <ProjectDatesLine
              createdAt={PUBLISHED_AT}
              visibility="public"
              latestUpdateAt={null}
              version={null}
              now={NOW}
            />
          </Labelled>
          <Labelled caption={l.datesNoVersion}>
            <ProjectDatesLine
              createdAt={PUBLISHED_AT}
              visibility="public"
              latestUpdateAt={hoursAgo(3)}
              version={null}
              now={NOW}
            />
          </Labelled>
        </Stack>
      </Example>

      <Example caption={l.end}>
        <UpdateTimeline {...common} updates={updates} hasMore={false} loadingMore={false} />
      </Example>
      <Example caption={l.more}>
        <UpdateTimeline {...common} updates={light} hasMore loadingMore={false} />
      </Example>
      <Example caption={l.loading}>
        <UpdateTimeline {...common} updates={light} hasMore loadingMore />
      </Example>
      <Example caption={l.error}>
        <UpdateTimeline {...common} updates={light} hasMore loadingMore={false} moreError />
      </Example>
      <Example caption={l.author}>
        <UpdateTimeline
          {...common}
          updates={withRemoval}
          hasMore={false}
          loadingMore={false}
          onDelete={() => {}}
          deletingId={middle?.id ?? null}
        />
      </Example>
      <Example caption={l.other}>
        <UpdateTimeline
          {...common}
          updates={light}
          hasMore={false}
          loadingMore={false}
          onReport={() => {}}
        />
      </Example>
      <ThemeProvider appearance="night">
        <Example caption={l.night}>
          <UpdateTimeline
            {...common}
            updates={updates}
            hasMore={false}
            loadingMore={false}
            onDelete={() => {}}
          />
        </Example>
      </ThemeProvider>
    </Stack>
  )
}

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

/** Une légende au-dessus d'une seule ligne de dates. */
function Labelled({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xxs">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}
