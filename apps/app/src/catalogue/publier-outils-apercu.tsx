// La section « Publier : les outils, l'aperçu, la vignette » du catalogue (R6a, U7) :
// - le champ des outils (ToolField) : vide, deux outils choisis, liste ouverte (« cl » tapé, avec
//   « Ajouter « … » »), quinze outils (la limite : le champ refuse la saisie) ;
// - l'aperçu de la carte (CardPreview), avec et sans photo, de jour et de nuit (la scène reste de
//   nuit, la carte suit le thème) ;
// - la vignette de la fenêtre « Supprimer » (ProjectThumb), avec et sans photo.
// Le premier exemple du champ se manipule : taper, choisir, ajouter un nom nouveau, retirer.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { type ColorName, palettes } from '@ruche/brand'
import { PROJECT_TOOLS_MAX } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CardPreview } from '../ui/CardPreview'
import type { ImageSource } from '../ui/image'
import { ProjectCard } from '../ui/ProjectCard'
import type { CoverImage } from '../ui/ProjectCover'
import { ProjectGrid } from '../ui/ProjectGrid'
import { ProjectThumb } from '../ui/ProjectThumb'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ToolField, type ToolFieldLabels, type ToolSuggestion } from '../ui/ToolField'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Publier : les outils, l’aperçu, la vignette',
  intro:
    'Le champ des outils de la feuille « Catégorie et outils » : les outils choisis en pastilles (la croix les retire), et une recherche qui propose les outils déjà utilisés, avec leur nombre de projets. Un nom absent s’ajoute tel quel. Au clavier : flèches, Entrée, Échap (ne ferme que la liste). Puis l’aperçu de la carte (ordinateur), sur une scène sombre éclairée par la première photo, et la vignette de la fenêtre « Supprimer ».',
  live: 'À manipuler : taper « cl » ou « Teachable Machine », choisir, retirer',
  empty: 'Champ vide (au focus, la liste des plus utilisés s’ouvre)',
  two: 'Deux outils choisis',
  open: 'Liste ouverte : « cl » tapé, « Claude » en surbrillance, « Ajouter » en dernier',
  fifteen: 'Quinze outils : la limite, le champ refuse la saisie',
  preview: 'L’aperçu de la carte, éclairé par la première photo',
  previewEmpty: 'L’aperçu sans photo : la lumière miel',
  thumb: 'La vignette de « Supprimer », avec et sans photo',
  day: 'jour',
  night: 'nuit',
  cardTitle: 'Le ciel de ce soir',
  cardPitch: 'Ce qu’on peut voir depuis le balcon ce soir, expliqué simplement.',
  now: 'à l’instant',
  testable: 'Testable',
  test: 'Tester',
  photo: 'Photo 1 sur 3',
}

const en: typeof fr = {
  title: 'Publish: tools, preview, thumbnail',
  intro:
    'The tools field of the “Category and tools” sheet: chosen tools as chips (the cross removes them), and a search that offers the tools already used, with their number of projects. A missing name is added as typed. Keyboard: arrows, Enter, Escape (closes only the list). Then the card preview (computer), on a dark stage lit by the first photo, and the thumbnail of the “Delete” dialog.',
  live: 'Try it: type “cl” or “Teachable Machine”, choose, remove',
  empty: 'Empty field (on focus, the most used tools open)',
  two: 'Two tools chosen',
  open: 'Open list: “cl” typed, “Claude” highlighted, “Add” last',
  fifteen: 'Fifteen tools: the limit, the field refuses input',
  preview: 'The card preview, lit by the first photo',
  previewEmpty: 'The preview without a photo: the honey light',
  thumb: 'The “Delete” thumbnail, with and without a photo',
  day: 'day',
  night: 'night',
  cardTitle: 'Tonight’s sky',
  cardPitch: 'What you can see from the balcony tonight, simply explained.',
  now: 'just now',
  testable: 'Testable',
  test: 'Try',
  photo: 'Photo 1 of 3',
}

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque et un disque d'une troisième, comme dans publier-photos.tsx (palette de jour : une photo
 * ne change pas avec le thème).
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="110" r="70" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}

/** Les outils déjà utilisés, comme l'API les rendrait (les plus utilisés d'abord). */
const POPULAR: ToolSuggestion[] = [
  { name: 'Claude', uses: 41 },
  { name: 'Claude Code', uses: 12 },
  { name: 'Python', uses: 9 },
  { name: 'Expo', uses: 6 },
  { name: 'Cursor', uses: 1 },
]

/** Les suggestions pour ce qui est tapé : celles dont le nom contient le texte (ou toutes, vide). */
const lookUp = (query: string) =>
  query === ''
    ? POPULAR
    : POPULAR.filter((tool) => tool.name.toLowerCase().includes(query.toLowerCase()))

const FIFTEEN = Array.from({ length: PROJECT_TOOLS_MAX }, (_, index) =>
  index < POPULAR.length ? (POPULAR[index]?.name ?? '') : `Outil ${index + 1}`,
)

const noop = () => {}

/** Les textes du champ, tirés de l'appli : ceux que l'écran de publication lui donne. */
export const useToolFieldLabels = (): ToolFieldLabels => {
  const { t } = useTranslation()
  return {
    search: t(($) => $.project.form.toolSearch),
    suggestions: t(($) => $.project.form.toolSuggestions),
    chosen: t(($) => $.project.form.toolsChosen),
    counter: (count, max) => ({
      shown: t(($) => $.project.form.toolsCount, { count, max }),
      spoken: t(($) => $.project.form.toolsCountSpoken, { count, max }),
    }),
    uses: (count) => t(($) => $.project.form.toolUses, { count }),
    suggestion: (name, count) => t(($) => $.project.form.toolSuggestion, { name, count }),
    add: (name) => t(($) => $.project.form.addTool, { name }),
    remove: (name) => t(($) => $.project.form.removeTool, { name }),
  }
}

export function PublishToolsPreviewCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const labels = useToolFieldLabels()
  const label = t(($) => $.project.form.tools)
  const schemes = ['day', 'night'] as const
  const fixed = (values: string[], initialText?: string) => (
    <ToolField
      label={label}
      values={values}
      onChange={noop}
      suggestions={lookUp(initialText?.trim() ?? '')}
      onQuery={noop}
      limit={PROJECT_TOOLS_MAX}
      labels={labels}
      {...(initialText ? { initialText } : null)}
    />
  )
  const photo: CoverImage = { source: sample('text', 'controlChecked', 'honey'), label: l.photo }
  const card = (image: CoverImage | null) => (
    <ProjectCard
      title={l.cardTitle}
      pitch={l.cardPitch}
      author={{ name: 'Inès Haddad', avatar: null }}
      image={image}
      when={l.now}
      status={{ label: l.testable, strong: true }}
      tryIt={{ label: l.test, onPress: noop }}
    />
  )
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LiveTools labels={labels} label={label} />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.empty} — ${l[scheme]}`}>{fixed([])}</Example>
            <Example caption={`${l.two} — ${l[scheme]}`}>{fixed(['Claude', 'Expo'])}</Example>
            <Example caption={`${l.open} — ${l[scheme]}`}>{fixed(['Expo'], 'cl')}</Example>
            <Example caption={`${l.fifteen} — ${l[scheme]}`}>{fixed(FIFTEEN)}</Example>
            <Example caption={`${l.preview} — ${l[scheme]}`}>
              <ProjectGrid empty="">
                <CardPreview image={photo}>{card(photo)}</CardPreview>
              </ProjectGrid>
            </Example>
            <Example caption={`${l.previewEmpty} — ${l[scheme]}`}>
              <ProjectGrid empty="">
                <CardPreview image={null}>{card(null)}</CardPreview>
              </ProjectGrid>
            </Example>
            <Example caption={`${l.thumb} — ${l[scheme]}`}>
              <Stack direction="row" gap="xxl" wrap>
                <ProjectThumb image={photo} badge="trash" />
                <ProjectThumb image={null} badge="trash" />
              </Stack>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple qui se manipule : les outils et la recherche vivent ici, comme dans l'écran. */
function LiveTools({ labels, label }: { labels: ToolFieldLabels; label: string }) {
  const [values, setValues] = useState(['Claude', 'Expo'])
  const [query, setQuery] = useState('')
  return (
    <ToolField
      label={label}
      values={values}
      onChange={setValues}
      suggestions={lookUp(query)}
      onQuery={setQuery}
      limit={PROJECT_TOOLS_MAX}
      labels={labels}
    />
  )
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
