// La section des photos de la feuille de publication (R6a, planches R6-Publier et
// R6-Publier-Desktop), sortie de `ProjectFormFields` après les relectures (ui-C6) : le titre et
// le compte des photos, les tuiles, leurs règles, la description de la photo choisie, puis la
// couverture verticale du téléphone (facultative, scénario : « reste possible »).
//
// Comme les autres champs, elle ne fait qu'assembler des composants de `src/ui` : l'écran garde les
// photos (`usePhotoTiles`) et la couverture (`usePortraitCover`), et passe ici de quoi les montrer et
// les changer.
import { PHOTO_DESCRIPTION_MAX, VISUALS_MAX } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import type { PhotoActions } from '../projects/usePhotoTiles'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { VisualEditor, type VisualEditorLabels, type VisualTile } from '../ui/VisualEditor'

/**
 * La description des photos : celle de la tuile choisie s'écrit sous les tuiles. L'écran branche
 * ici ce que rend `usePhotoTiles` (`selectedKey`, `select`, `descriptionOf`, `describe`) ; `onLeave`
 * part quand le champ perd le focus (en modification, l'écran enregistre alors : `flushPending`).
 */
export type PhotoDescriptions = {
  selectedKey: string | null
  onSelect: (key: string) => void
  textOf: (key: string) => string
  onChange: (key: string, text: string) => void
  onLeave: (key: string) => void
}

/**
 * La couverture verticale, sous les photos : l'écran branche ici ce que rend `usePortraitCover`
 * (`tile`, `onPick`, `onRemove`, `busy`).
 */
export type PortraitCover = {
  tile: VisualTile | null
  onPick: () => void
  onRemove: () => void
  busy?: boolean
}

type Props = {
  /** Les tuiles des photos et leurs gestes (`usePhotoTiles`). */
  tiles: PhotoTile[]
  photos: PhotoActions
  descriptions: PhotoDescriptions
  /** La couverture verticale ; absente, la section n'a que les photos (tests des seuls champs). */
  portrait?: PortraitCover | undefined
  /** L'envoi du projet est en cours : les gestes sur les photos attendent. */
  busy: boolean
  /** En modification, chaque geste s'enregistre tout de suite (jur-J4) : les règles le disent. */
  editing: boolean
}

/** Le compteur de la description d'une photo n'apparaît qu'à l'approche de sa limite. */
const PHOTO_DESCRIPTION_COUNT_FROM = PHOTO_DESCRIPTION_MAX - 50

export function ProjectPhotoFields({
  tiles,
  photos,
  descriptions,
  portrait,
  busy,
  editing,
}: Props) {
  const { t } = useTranslation()
  const kept = tiles.filter((tile) => tile.state !== 'failed').length
  const selectedIndex = tiles.findIndex((tile) => tile.key === descriptions.selectedKey)
  const selected = selectedIndex === -1 ? null : tiles[selectedIndex]
  // Le nom d'une tuile reprend la description de sa photo, en texte simple (sec-M3).
  const tileName = (number: number, cover: boolean) => {
    const key = tiles[number - 1]?.key
    const description = key ? descriptions.textOf(key).trim() : ''
    if (description === '') {
      return cover
        ? t(($) => $.project.form.photoTileCover, { number })
        : t(($) => $.project.form.photoTile, { number })
    }
    return cover
      ? t(($) => $.project.form.photoTileCoverDescribed, { number, description })
      : t(($) => $.project.form.photoTileDescribed, { number, description })
  }
  const tileLabels: PhotoTilesLabels = {
    list: t(($) => $.project.form.photosList),
    add: t(($) => $.project.form.addPhotos),
    addLabel: t(($) => $.project.form.addPhotosLabel),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    tile: tileName,
    uploading: (number) => t(($) => $.project.form.photoUploading, { number }),
    failed: (number, reason) => t(($) => $.project.form.photoFailed, { number, reason }),
    move: (number) => t(($) => $.project.form.movePhoto, { number }),
    makeCover: t(($) => $.project.form.makeCover),
    earlier: t(($) => $.project.form.movePhotoEarlier),
    later: t(($) => $.project.form.movePhotoLater),
    moved: (place) => t(($) => $.project.form.photoMoved, { place }),
    remove: (number) => t(($) => $.project.form.removePhoto, { number }),
  }
  const portraitLabels: VisualEditorLabels = {
    portrait: t(($) => $.project.visuals.portrait),
    portraitHint: t(($) => $.project.visuals.portraitHint),
    choosePortrait: t(($) => $.project.visuals.choosePortrait),
    replacePortrait: t(($) => $.project.visuals.replacePortrait),
    removePortrait: t(($) => $.project.visuals.removePortrait),
  }
  // Les règles des photos ; en modification, chaque geste s'enregistre tout de suite (jur-J4).
  const photoRules = [
    t(($) => $.project.form.photosRules),
    t(($) => $.project.form.photosOrder),
    ...(editing ? [t(($) => $.project.form.photosSaved)] : []),
  ].join(' ')

  return (
    <Stack gap="sm">
      <Row justify="between" align="center">
        <Text variant="headline" heading={2}>
          {t(($) => $.project.form.photos)}
        </Text>
        <Text
          variant="caption"
          tone="muted"
          tabular
          accessibilityLabel={t(($) => $.project.form.photosCountSpoken, {
            count: kept,
            max: VISUALS_MAX,
          })}
        >
          {t(($) => $.project.form.photosCount, { count: kept, max: VISUALS_MAX })}
        </Text>
      </Row>
      <PhotoTiles
        tiles={tiles}
        max={VISUALS_MAX}
        labels={tileLabels}
        selectedKey={descriptions.selectedKey}
        onSelect={descriptions.onSelect}
        onAdd={photos.onAdd}
        onDropFiles={photos.onDropFiles}
        onMove={photos.onMove}
        onRemove={photos.onRemove}
        busy={busy}
      />
      <Text variant="caption" tone="muted">
        {photoRules}
      </Text>
      {selected ? (
        <TextField
          key={selected.key}
          label={t(($) => $.project.form.photoDescription, { number: selectedIndex + 1 })}
          value={descriptions.textOf(selected.key)}
          onChangeText={(text) => descriptions.onChange(selected.key, text)}
          onBlur={() => descriptions.onLeave(selected.key)}
          autoCapitalize="sentences"
          hint={t(($) => $.project.form.photoDescriptionHint)}
          limit={PHOTO_DESCRIPTION_MAX}
          countFrom={PHOTO_DESCRIPTION_COUNT_FROM}
        />
      ) : null}
      {/* La couverture verticale du téléphone, facultative : sous les photos, dans leur section. */}
      {portrait ? (
        <VisualEditor
          labels={portraitLabels}
          portrait={portrait.tile}
          onPickPortrait={portrait.onPick}
          onRemovePortrait={portrait.onRemove}
          busy={busy || Boolean(portrait.busy)}
        />
      ) : null}
    </Stack>
  )
}
