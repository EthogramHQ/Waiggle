// La section « Publier : les photos » du catalogue (R6a, U1) : les tuiles de la feuille de
// publication (PhotoTiles) dans tous leurs états (vide, deux photos dont une choisie, six photos
// sans « Ajouter », une photo en cours d'envoi, une photo refusée, la zone de dépôt du web), de
// jour et de nuit, puis la couverture verticale (VisualEditor, réduit à elle seule).
// Le premier exemple se manipule : choisir une tuile, la déplacer par sa poignée, la retirer,
// en ajouter une.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes du composant viennent de l'appli.
import { type ColorName, palettes } from '@ruche/brand'
import { VISUALS_MAX } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageSource } from '../ui/image'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { VisualEditor, type VisualEditorLabels } from '../ui/VisualEditor'

const fr = {
  title: 'Publier : les photos',
  intro:
    'Les photos de la feuille de publication : une tuile par photo, la première en couverture. La poignée en haut à gauche ouvre « Mettre en couverture », « Avancer », « Reculer » (sans glisser : clavier, lecteur d’écran) ; la croix retire la photo ; toucher une tuile la choisit (anneau de miel) pour écrire sa description. Glisser une tuile la déplace aussi (doigt, souris).',
  live: 'À manipuler : choisir, déplacer, retirer, ajouter',
  empty: 'Aucune photo : « 0 / 6 » et la tuile « Ajouter »',
  two: 'Deux photos, la seconde choisie',
  six: 'Six photos : « Ajouter » disparaît',
  uploading: 'Une photo en cours d’envoi (une barre de progression nommée)',
  failed: 'Une photo refusée : la raison sous sa tuile, les autres continuent',
  drop: 'Web, ordinateur : la zone de dépôt « Glisse tes images ici, ou choisis-les »',
  dropNote: '(sur téléphone et hors du web, la tuile « Ajouter » à la place)',
  portrait: 'La couverture verticale (VisualEditor), vide puis choisie',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Publish: the photos',
  intro:
    'The photos of the publish sheet: one tile per photo, the first one as the cover. The handle at the top left opens “Make cover”, “Move earlier”, “Move later” (no dragging: keyboard, screen readers); the cross removes the photo; tapping a tile selects it (honey ring) to write its description. Dragging a tile moves it too (finger, mouse).',
  live: 'Try it: select, move, remove, add',
  empty: 'No photo: “0 / 6” and the “Add” tile',
  two: 'Two photos, the second one selected',
  six: 'Six photos: “Add” goes away',
  uploading: 'A photo being sent (a named progress bar)',
  failed: 'A refused photo: the reason under its tile, the others go on',
  drop: 'Web, computer: the drop zone “Drag your images here, or choose them”',
  dropNote: '(on phones and outside the web, the “Add” tile instead)',
  portrait: 'The vertical cover (VisualEditor), empty then chosen',
  day: 'day',
  night: 'night',
}

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque et un disque d'une troisième, comme dans projet-galerie.tsx (palette de jour : une photo
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

const SOURCES = [
  sample('text', 'controlChecked', 'honey'),
  sample('honey', 'amber', 'honeySoft'),
  sample('success', 'text', 'honeyLight'),
  sample('amber', 'honeyLight', 'text'),
  sample('controlChecked', 'honeySoft', 'success'),
  sample('textMuted', 'honey', 'background'),
]

const photo = (index: number, state: PhotoTile['state'] = 'ready', error?: string): PhotoTile => ({
  key: `photo-${index}`,
  image: { source: SOURCES[index % SOURCES.length] ?? null, label: '' },
  state,
  ...(error ? { error } : null),
})

const noop = () => {}

/** Les textes des tuiles, tirés de l'appli : ceux que l'écran de publication leur donne. */
export const usePhotoTilesLabels = (): PhotoTilesLabels => {
  const { t } = useTranslation()
  return {
    title: t(($) => $.project.form.photos),
    count: (count, max) => t(($) => $.project.form.photosCount, { count, max }),
    countSpoken: (count, max) => t(($) => $.project.form.photosCountSpoken, { count, max }),
    list: t(($) => $.project.form.photosList),
    add: t(($) => $.project.form.addPhotos),
    addLabel: t(($) => $.project.form.addPhotosLabel),
    rules: t(($) => $.project.form.photosRules),
    order: t(($) => $.project.form.photosOrder),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    tile: (number, cover) =>
      cover
        ? t(($) => $.project.form.photoTileCover, { number })
        : t(($) => $.project.form.photoTile, { number }),
    uploading: (number) => t(($) => $.project.form.photoUploading, { number }),
    failed: (number, reason) => t(($) => $.project.form.photoFailed, { number, reason }),
    move: (number) => t(($) => $.project.form.movePhoto, { number }),
    makeCover: t(($) => $.project.form.makeCover),
    earlier: t(($) => $.project.form.movePhotoEarlier),
    later: t(($) => $.project.form.movePhotoLater),
    moved: (place) => t(($) => $.project.form.photoMoved, { place }),
    remove: (number) => t(($) => $.project.form.removePhoto, { number }),
  }
}

export function PublishPhotosCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const labels = usePhotoTilesLabels()
  const tooLarge = t(($) => $.project.form.photoTooLarge)
  const schemes = ['day', 'night'] as const
  const fixed = (tiles: PhotoTile[], selectedKey: string | null = null, drop = false) => (
    <PhotoTiles
      tiles={tiles}
      max={VISUALS_MAX}
      labels={labels}
      selectedKey={selectedKey}
      onSelect={noop}
      onAdd={noop}
      {...(drop ? { onDropFiles: noop } : null)}
      onMove={noop}
      onRemove={noop}
    />
  )
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LiveTiles labels={labels} />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.empty} — ${l[scheme]}`}>{fixed([])}</Example>
            <Example caption={`${l.two} — ${l[scheme]}`}>
              {fixed([photo(0), photo(1)], 'photo-1')}
            </Example>
            <Example caption={`${l.six} — ${l[scheme]}`}>
              {fixed([0, 1, 2, 3, 4, 5].map((index) => photo(index)))}
            </Example>
            <Example caption={`${l.uploading} — ${l[scheme]}`}>
              {fixed([photo(0), photo(1), photo(2, 'uploading')])}
            </Example>
            <Example caption={`${l.failed} — ${l[scheme]}`}>
              {fixed([photo(0), photo(1), photo(3, 'failed', tooLarge)])}
            </Example>
            <Example caption={`${l.drop} ${l.dropNote} — ${l[scheme]}`}>
              {fixed([photo(0), photo(1)], null, true)}
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Example caption={l.portrait}>
        <Stack gap="md">
          <Portrait />
          <Portrait chosen />
        </Stack>
      </Example>
    </Stack>
  )
}

/** Un exemple qui se manipule : les gestes changent vraiment l'ordre et la sélection. */
function LiveTiles({ labels }: { labels: PhotoTilesLabels }) {
  const [tiles, setTiles] = useState<PhotoTile[]>([photo(0), photo(1), photo(2)])
  const [selected, setSelected] = useState<string | null>('photo-0')
  const [next, setNext] = useState(3)
  return (
    <PhotoTiles
      tiles={tiles}
      max={VISUALS_MAX}
      labels={labels}
      selectedKey={selected}
      onSelect={setSelected}
      onAdd={() => {
        setTiles((current) => [...current, photo(next)].slice(0, VISUALS_MAX))
        setNext(next + 1)
      }}
      onDropFiles={noop}
      onMove={(from, to) =>
        setTiles((current) => {
          const copy = [...current]
          const [moved] = copy.splice(from, 1)
          if (moved) copy.splice(to, 0, moved)
          return copy
        })
      }
      onRemove={(key) => {
        setTiles((current) => current.filter((tile) => tile.key !== key))
        if (selected === key) setSelected(null)
      }}
    />
  )
}

/** La couverture verticale, vide ou choisie. */
function Portrait({ chosen = false }: { chosen?: boolean }) {
  const { t } = useTranslation()
  const labels: VisualEditorLabels = {
    portrait: t(($) => $.project.visuals.portrait),
    portraitHint: t(($) => $.project.visuals.portraitHint),
    choosePortrait: t(($) => $.project.visuals.choosePortrait),
    replacePortrait: t(($) => $.project.visuals.replacePortrait),
    removePortrait: t(($) => $.project.visuals.removePortrait),
  }
  return (
    <VisualEditor
      labels={labels}
      portrait={
        chosen
          ? {
              key: 'portrait',
              image: { source: SOURCES[2] ?? null, label: labels.portrait },
            }
          : null
      }
      onPickPortrait={noop}
      onRemovePortrait={noop}
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
