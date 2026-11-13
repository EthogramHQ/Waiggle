// La section « Mises à jour : une mise à jour » du catalogue (R7a, U1b) : une mise à jour montrée
// en entier (UpdateEntry), dans chacun de ses états : avec un titre et sa version, la version seule
// en titre, sans titre ni version (« Mise à jour »), l'avant / après avec une 3e photo en tuile, la
// galerie, la corbeille de l'auteur (au repos et pendant la suppression), « Signaler » pour un autre
// membre, et la mise à jour retirée par la modération telle que son auteur la lit ; puis la même de
// nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (la session pose l'import à la
// fusion). Ses libellés (un outil de développement, absent de l'appli publiée) sont écrits ici, en
// français et en anglais ; les textes du composant viennent de l'appli, les mises à jour d'exemple
// sont écrites dans la langue du catalogue.
import { type ColorName, palettes } from '@ruche/brand'
import type { ProjectUpdate, ProjectVisual } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageSource } from '../ui/image'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { UpdateEntry } from '../ui/UpdateEntry'

const fr = {
  section: 'Mises à jour : une mise à jour',
  intro:
    'Une mise à jour en entier : son titre (sinon sa version, sinon « Mise à jour »), sa date à droite, ses lignes avec leur pastille (lues « Nouveau : … »), ses photos (l’avant / après, ou la galerie), puis la corbeille de l’auteur ou « Signaler » pour un autre membre.',
  titled: 'Avec un titre et sa version, avant / après (2 photos)',
  versionOnly: 'Sans titre : la version sert de titre, sans se répéter à côté',
  untitled: 'Sans titre ni version : « Mise à jour »',
  third: 'Avant / après et une 3e photo, en petite tuile nommée',
  gallery: 'Sans avant / après : la galerie « Photos de la mise à jour »',
  band: 'Dans la section de la page projet : l’avant / après en bande de 240 points (photoHeight="band")',
  trash: 'L’auteur : la corbeille, nommée par sa mise à jour',
  deleting: 'Pendant la suppression : la corbeille occupée',
  report: 'Un autre membre : « Signaler cette mise à jour »',
  removed: 'Retirée par la modération : le bandeau, que seul l’auteur voit',
  night: 'De nuit, avec la corbeille',
  title: 'Le décompte de la fusée',
  version: 'v1.2',
  lines: [
    { family: 'new', text: 'Un compte à rebours avant chaque question' },
    { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
    { family: 'polish', text: 'Des étoiles qui scintillent derrière la fusée' },
  ],
  before: 'La fusée de jour, sur son pas de tir',
  after: 'La fusée de nuit, le décompte affiché',
  thirdDescription: 'La fusée en vol, au-dessus des nuages',
  explanation: 'Les photos montraient l’adresse d’un autre membre.',
} as const

const en = {
  section: 'Updates: one update',
  intro:
    'An update in full: its title (or its version, or “Update”), its date on the right, its lines with their badge (read “New: …”), its photos (the before / after, or the gallery), then the author’s trash button or “Report” for another member.',
  titled: 'With a title and its version, before / after (2 photos)',
  versionOnly: 'No title: the version stands in, without repeating beside it',
  untitled: 'Neither title nor version: “Update”',
  third: 'Before / after and a 3rd photo, as a small named tile',
  gallery: 'No before / after: the gallery “Photos of the update”',
  band: 'In the project page section: the before / after as a 240-point band (photoHeight="band")',
  trash: 'The author: the trash button, named after its update',
  deleting: 'While deleting: the trash button busy',
  report: 'Another member: “Report this update”',
  removed: 'Removed by moderation: the banner only the author sees',
  night: 'At night, with the trash button',
  title: 'The rocket countdown',
  version: 'v1.2',
  lines: [
    { family: 'new', text: 'A countdown before each question' },
    { family: 'fixed', text: 'The score no longer resets at level 3' },
    { family: 'polish', text: 'Stars twinkling behind the rocket' },
  ],
  before: 'The rocket by day, on its launch pad',
  after: 'The rocket by night, the countdown shown',
  thirdDescription: 'The rocket in flight, above the clouds',
  explanation: 'The photos showed another member’s address.',
} as const

type Labels = typeof fr | typeof en

/** L'heure du catalogue : les dates relatives ne changent pas d'une capture à l'autre. */
const NOW = new Date('2026-11-05T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque et un disque d'une troisième, comme dans avant-apres.tsx. Palette de jour : une photo ne
 * change pas avec le thème.
 */
const sample = (id: string, colors: [ColorName, ColorName, ColorName], description: string) => {
  const day = palettes.day
  const [from, to, disc] = colors
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="110" r="70" fill="${day[disc]}"/></svg>`,
  )}`
  const visual: ProjectVisual = {
    id,
    kind: 'image',
    url,
    width: 400,
    height: 300,
    // Le résumé flou, affiché le temps que la photo arrive (celui des photos des tests).
    thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
    description,
  }
  return visual
}

/** Les photos servies telles quelles (des adresses `data:`, sans cookie). */
const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)

/** La mise à jour d'exemple, celle du scénario, dans la langue du catalogue. */
const rocket = (l: Labels): ProjectUpdate => ({
  id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  title: l.title,
  version: l.version,
  lines: l.lines.slice(0, 2).map((line) => ({ ...line })),
  photos: [
    sample('55555555-5555-4555-8555-555555555555', ['honeySoft', 'honey', 'amber'], l.before),
    sample(
      '66666666-6666-4666-8666-666666666666',
      ['text', 'controlChecked', 'honeyLight'],
      l.after,
    ),
  ],
  beforeAfter: true,
  createdAt: hoursAgo(50),
  removal: null,
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  removedParts: [],
})

export function UpdateEntryCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const base = rocket(l)
  const thirdPhoto = sample(
    '77777777-7777-4777-8777-777777777777',
    ['honeyLight', 'amber', 'background'],
    l.thirdDescription,
  )
  const plain = { ...base, beforeAfter: false, photos: [], createdAt: hoursAgo(3) }
  const examples: { caption: string; entry: ReactNode }[] = [
    {
      caption: l.titled,
      entry: <UpdateEntry update={base} toSource={toSource} now={NOW} />,
    },
    {
      caption: l.versionOnly,
      entry: <UpdateEntry update={{ ...plain, title: null }} toSource={toSource} now={NOW} />,
    },
    {
      caption: l.untitled,
      entry: (
        <UpdateEntry
          update={{ ...plain, title: null, version: null, lines: [{ ...l.lines[2] }] }}
          toSource={toSource}
          now={NOW}
        />
      ),
    },
    {
      caption: l.third,
      entry: (
        <UpdateEntry
          update={{
            ...base,
            photos: [...base.photos, thirdPhoto],
            lines: l.lines.map((x) => ({ ...x })),
          }}
          toSource={toSource}
          now={NOW}
        />
      ),
    },
    {
      caption: l.band,
      entry: <UpdateEntry update={base} toSource={toSource} now={NOW} photoHeight="band" />,
    },
    {
      caption: l.gallery,
      entry: (
        <UpdateEntry
          update={{ ...base, beforeAfter: false, photos: [...base.photos, thirdPhoto] }}
          toSource={toSource}
          now={NOW}
        />
      ),
    },
    {
      caption: l.trash,
      entry: <UpdateEntry update={plain} toSource={toSource} now={NOW} onDelete={() => {}} />,
    },
    {
      caption: l.deleting,
      entry: (
        <UpdateEntry update={plain} toSource={toSource} now={NOW} onDelete={() => {}} deleting />
      ),
    },
    {
      caption: l.report,
      entry: <UpdateEntry update={plain} toSource={toSource} now={NOW} onReport={() => {}} />,
    },
    {
      caption: l.removed,
      entry: (
        <UpdateEntry
          update={{
            ...plain,
            removal: {
              ground: 'rules',
              explanation: l.explanation,
              at: hoursAgo(1),
              afterReport: true,
            },
          }}
          toSource={toSource}
          now={NOW}
          onDelete={() => {}}
        />
      ),
    },
  ]

  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.section}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {examples.map((example) => (
        <Example key={example.caption} caption={example.caption}>
          {example.entry}
        </Example>
      ))}
      <ThemeProvider appearance="night">
        <Example caption={l.night}>
          <UpdateEntry update={base} toSource={toSource} now={NOW} onDelete={() => {}} />
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
