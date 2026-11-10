// Le contenu de la feuille « Nouvelle mise à jour » (R7a, planche R7-MAJ-Publier), sans la feuille
// ni l'envoi : le projet en tête, pourquoi la feuille s'est ouverte (statut changé), le titre, les
// lignes de « Ce qui a changé », la version, les photos et l'interrupteur « Avant / après ».
//
// À part de `UpdateSheet.tsx` pour que le catalogue montre le vrai contenu dans chacun de ses états
// (vide, rempli, cinq lignes, avant / après, erreur) sans API : l'écran garde les valeurs
// (`updates/form.ts`) et les photos (`usePhotoTiles`), et passe ici de quoi les montrer et les
// changer. Comme tout écran, ce fichier n'assemble que des composants de `src/ui`.
import {
  PHOTO_DESCRIPTION_MAX,
  UPDATE_PHOTOS_MAX,
  UPDATE_TITLE_MAX,
  UPDATE_VERSION_MAX,
} from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import type { PhotoActions } from '../projects/usePhotoTiles'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import type { CoverImage } from '../ui/ProjectCover'
import { ProjectStrip } from '../ui/ProjectStrip'
import { RelativeTime } from '../ui/RelativeTime'
import { Row, Stack } from '../ui/Stack'
import { Switch } from '../ui/Switch'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { UpdateLinesField } from '../ui/UpdateLinesField'
import { addLine, removeLine, setFamily, setText, type UpdateFormValues } from '../updates/form'

/** Le projet, tel que la tête de la feuille le rappelle. */
export type UpdateSheetProject = {
  title: string
  image: CoverImage | null
  /** La date de la dernière mise à jour ; null : « Première mise à jour ». */
  latestAt: string | null
  /** La version de la dernière mise à jour qui en a une ; null : « Dernière mise à jour : … ». */
  version: string | null
}

/** Les photos de la feuille : ce que rend `usePhotoTiles(id, { slot: 'update' })`. */
export type UpdateSheetPhotos = {
  tiles: PhotoTile[]
  actions: PhotoActions
  selectedKey: string | null
  select: (key: string) => void
  descriptionOf: (key: string) => string
  describe: (key: string, text: string) => void
  /** Les photos en place ou en route (les refusées ne comptent pas). */
  count: number
}

type Props = {
  project: UpdateSheetProject
  /** La phrase qui dit pourquoi la feuille s'est ouverte (statut changé) ; null : rien. */
  announce: string | null
  form: UpdateFormValues
  onChange: (next: UpdateFormValues) => void
  /** Le refus de publier sans ligne, posé sur la première ligne. */
  linesError: string | null
  /** La ligne qui porte ce refus (une ligne trop longue) ; absente : la première. */
  linesErrorId?: string | null
  photos: UpdateSheetPhotos
  /** L'envoi est en cours : tout est en lecture seule. */
  busy: boolean
  /** L'heure, pour figer la date de la tête (catalogue) ; l'horloge de l'appareil sinon. */
  now?: Date
}

export function UpdateSheetFields({
  project,
  announce,
  form,
  onChange,
  linesError,
  linesErrorId = null,
  photos,
  busy,
  now,
}: Props) {
  const { t } = useTranslation()
  const { latestAt, version } = project
  const canCompare = photos.count >= 2
  // Sous deux photos, l'interrupteur disparaît, et « Avant / après » ne compte plus.
  const beforeAfter = form.beforeAfter && canCompare

  const tileLabels: PhotoTilesLabels = {
    list: t(($) => $.project.updates.photosLabel),
    add: t(($) => $.project.updates.addPhotos),
    addLabel: t(($) => $.project.form.addPhotosLabel),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    // Le nom d'une tuile reprend la description de sa photo, en texte simple (comme la publication).
    tile: (number) => {
      const key = photos.tiles[number - 1]?.key
      const description = key ? photos.descriptionOf(key).trim() : ''
      return description === ''
        ? t(($) => $.project.form.photoTile, { number })
        : t(($) => $.project.form.photoTileDescribed, { number, description })
    },
    uploading: (number) => t(($) => $.project.form.photoUploading, { number }),
    failed: (number, reason) => t(($) => $.project.form.photoFailed, { number, reason }),
    move: (number) => t(($) => $.project.form.movePhoto, { number }),
    makeCover: t(($) => $.project.form.makeCover),
    earlier: t(($) => $.project.form.movePhotoEarlier),
    later: t(($) => $.project.form.movePhotoLater),
    moved: (place) => t(($) => $.project.form.photoMoved, { place }),
    remove: (number) => t(($) => $.project.form.removePhoto, { number }),
  }
  const selectedIndex = photos.tiles.findIndex((tile) => tile.key === photos.selectedKey)
  const selected = selectedIndex === -1 ? null : photos.tiles[selectedIndex]

  return (
    <Stack gap="xl">
      <ProjectStrip
        image={project.image}
        title={project.title}
        detail={
          latestAt ? (
            // « Dernière version : v1.2, il y a 3 semaines » : la date relative dans sa phrase, lue
            // en entier (« le 20 octobre à 9:30 ») par le lecteur d'écran.
            <RelativeTime
              date={latestAt}
              {...(now ? { now } : null)}
              phrase={({ afterVerb, full }) =>
                version
                  ? {
                      label: t(($) => $.project.updates.lastVersion, { version, when: afterVerb }),
                      spoken: t(($) => $.project.updates.lastVersion, { version, when: full }),
                    }
                  : {
                      label: t(($) => $.project.updates.lastUpdate, { when: afterVerb }),
                      spoken: t(($) => $.project.updates.lastUpdate, { when: full }),
                    }
              }
            />
          ) : (
            t(($) => $.project.updates.firstUpdate)
          )
        }
      />
      {/* Arrivée depuis « Modifier » : pourquoi la feuille s'est ouverte, et qu'on peut l'ignorer.
          Dans le contenu, sous le projet : la tête à action du téléphone n'a pas de place pour une
          phrase sous le titre (`Sheet` n'y montre pas `subtitle`). */}
      {announce ? <Text tone="secondary">{announce}</Text> : null}
      <TextField
        label={t(($) => $.project.updates.titleField)}
        value={form.title}
        onChangeText={(title) => onChange({ ...form, title })}
        placeholder={t(($) => $.project.updates.titlePlaceholder)}
        autoCapitalize="sentences"
        maxLength={UPDATE_TITLE_MAX}
        showCount
        editable={!busy}
      />
      {/* Le titre « Ce qui a changé », le compteur et l'aide sont dessinés par le composant. */}
      <UpdateLinesField
        lines={form.lines}
        onAdd={() => onChange(addLine(form))}
        onRemove={(line) => onChange(removeLine(form, line))}
        onFamilyChange={(line, family) => onChange(setFamily(form, line, family))}
        onTextChange={(line, text) => onChange(setText(form, line, text))}
        error={linesError}
        errorLineId={linesErrorId}
        editable={!busy}
      />
      <TextField
        label={t(($) => $.project.updates.versionField)}
        value={form.version}
        onChangeText={(version) => onChange({ ...form, version })}
        placeholder={t(($) => $.project.updates.versionPlaceholder)}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        code
        maxLength={UPDATE_VERSION_MAX}
        showCount
        editable={!busy}
      />
      <Stack gap="sm">
        <Row justify="between" align="center">
          <Text variant="caption" weight={600} tone="secondary">
            {t(($) => $.project.updates.photos)}
          </Text>
          {/* « 2 / 4 » à l'œil, « 2 photos sur 4 » au lecteur d'écran. */}
          <Text
            variant="caption"
            tone="muted"
            tabular
            accessibilityLabel={t(($) => $.project.form.photosCountSpoken, {
              count: photos.count,
              max: UPDATE_PHOTOS_MAX,
            })}
          >
            {t(($) => $.project.form.photosCount, { count: photos.count, max: UPDATE_PHOTOS_MAX })}
          </Text>
        </Row>
        <PhotoTiles
          tiles={photos.tiles}
          max={UPDATE_PHOTOS_MAX}
          labels={tileLabels}
          selectedKey={photos.selectedKey}
          onSelect={photos.select}
          onAdd={photos.actions.onAdd}
          onDropFiles={photos.actions.onDropFiles}
          onMove={photos.actions.onMove}
          onRemove={photos.actions.onRemove}
          busy={busy}
          // Une mise à jour n'a pas de couverture ; avec l'avant / après, les deux premières photos
          // portent « Avant » et « Après » (elles suivent le rang, pas la photo).
          cover={false}
          {...(beforeAfter
            ? { badges: [t(($) => $.project.updates.before), t(($) => $.project.updates.after)] }
            : null)}
        />
        {/* Les formats, puis le droit à l'image (jur-C1) : les mêmes phrases que la publication d'un
            projet, sous les tuiles, même sans photo. */}
        <Text variant="caption" tone="muted">
          {t(($) => $.project.form.photosRules)}
        </Text>
        <Text variant="caption" tone="muted">
          {t(($) => $.project.form.photosConsent)}
        </Text>
        {selected ? (
          <TextField
            key={selected.key}
            label={t(($) => $.project.form.photoDescription, { number: selectedIndex + 1 })}
            value={photos.descriptionOf(selected.key)}
            onChangeText={(text) => photos.describe(selected.key, text)}
            autoCapitalize="sentences"
            hint={t(($) => $.project.updates.photoDescriptionHint)}
            limit={PHOTO_DESCRIPTION_MAX}
            countFrom={PHOTO_DESCRIPTION_MAX - 50}
            editable={!busy}
          />
        ) : null}
        {canCompare ? (
          <Switch
            label={t(($) => $.project.updates.beforeAfterSwitch)}
            value={beforeAfter}
            onValueChange={(value) => onChange({ ...form, beforeAfter: value })}
            disabled={busy}
          />
        ) : null}
      </Stack>
    </Stack>
  )
}
