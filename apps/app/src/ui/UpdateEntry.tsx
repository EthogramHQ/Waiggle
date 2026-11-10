// Une mise à jour d'un projet, montrée en entier (R7a, scénarios « Les mises à jour sur la page
// projet », « La frise », « Supprimer une mise à jour », planches R7-MAJ-Projet et R7-MAJ-Desktop) :
// - en tête, son titre (sinon sa version, sinon « Mise à jour »), en titre de niveau 2 dans la frise
//   ou 3 dans la section « Les mises à jour » de la page projet ; la version en Geist Mono à côté
//   (jamais deux fois quand elle sert de titre) ; la date relative à droite sur ordinateur, sous
//   le titre (« v1.2 · dimanche », à gauche) sur téléphone ;
// - au bord droit, la corbeille de l'auteur, nommée par sa mise à jour, ou « Signaler cette mise à
//   jour » pour un autre membre ;
// - le bandeau de retrait, pour l'auteur d'une mise à jour retirée par la modération ;
// - ses lignes, chacune avec la pastille de sa famille, et lue « Nouveau : … » (la pastille seule ne
//   dirait sa famille que par sa couleur et son icône) ;
// - ses photos : l'avant / après des deux premières (puis les photos 3 et 4 en petites tuiles), ou
//   la galerie « Photos de la mise à jour ».
//
// Le composant ne parle jamais à l'API (règle des étages) : l'écran lui donne `toSource`, la fonction
// de `useMediaSources()` qui fait une adresse de photo une source d'image (avec le cookie de session
// sur téléphone).

import { layout, radii, space } from '@ruche/brand'
import type { ProjectUpdate, Removal } from '@ruche/contracts'
import { type Ref, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import { BeforeAfter } from './BeforeAfter'
import type { Focusable } from './focus'
import { hiddenFrame } from './HiddenHeading'
import { IconButton } from './IconButton'
import type { ImageSource } from './image'
import { MetaLine } from './MetaLine'
import { type GalleryPhoto, PhotoGallery } from './PhotoGallery'
import { type CoverShape, ProjectCover } from './ProjectCover'
import { RelativeTime } from './RelativeTime'
import { RemovalNotice, type RemovedBanner } from './RemovalNotice'
import { Stack } from './Stack'
import { Text } from './Text'
import { useLayout } from './theme/layout'
import { UpdateFamilyBadge } from './UpdateFamilyBadge'
import { VersionText } from './VersionText'

type Props = {
  update: ProjectUpdate
  /**
   * Fait d'une adresse de photo une source d'image : celle que rend `useMediaSources()`
   * (api/media.ts), donnée par l'écran. Null : la photo n'est pas encore lisible (le résumé flou
   * s'affiche).
   */
  toSource: (url: string | null | undefined) => ImageSource | null
  /** Le niveau du titre : 2 dans la frise (par défaut), 3 dans la section de la page projet. */
  headingLevel?: 2 | 3
  /** Pour l'auteur : la corbeille, qui demande la suppression (l'écran ouvre la confirmation). */
  onDelete?: () => void
  /** La suppression est en route : la corbeille est occupée et ignore une nouvelle tape. */
  deleting?: boolean
  /** Pour un autre membre : « Signaler cette mise à jour ». Jamais avec `onDelete`. */
  onReport?: () => void
  /**
   * Pour poser le focus sur le titre de la mise à jour depuis la frise (après une suppression, le
   * focus va à la mise à jour suivante) : le titre devient focalisable par le code, jamais par Tab.
   */
  focusRef?: Ref<Focusable>
  /** L'heure qu'il est, pour figer la date relative (catalogue, tests). */
  now?: Date
  /**
   * La hauteur de la photo ou de l'avant / après (jetons `layout.cover`). Par défaut : une bande
   * sur téléphone, `medium` ailleurs (la frise). La section de la page projet demande `band`.
   */
  photoHeight?: CoverShape
}

/** Une ligne de « Ce qui a changé » visible à droite de sa pastille, alignée sur sa première ligne. */
const BADGE_ROOM = space.xxs

/**
 * Le bandeau d'un retrait, phrase par phrase (article 17 du DSA). La même suite que
 * `reports/removal.ts`, que `src/ui` ne peut pas importer (un composant ne connaît pas les modules
 * de domaine) : si l'une change, l'autre aussi (le test `missingSentences(removalSentences(…))`
 * de UpdateEntry.test.tsx vérifie celle-ci).
 */
const banner = (removal: Removal, t: ReturnType<typeof useTranslation>['t']): RemovedBanner => ({
  title: t(($) => $.removal.banner),
  lines: [
    t(($) => $.removal.onlyYou),
    removal.afterReport ? t(($) => $.removal.afterReport) : t(($) => $.removal.direct),
    t(($) => $.removal.grounds[removal.ground]),
    t(($) => $.removal.explanation, { explanation: removal.explanation }),
    t(($) => $.removal.contest),
  ],
})

export function UpdateEntry({
  update,
  toSource,
  headingLevel = 2,
  onDelete,
  deleting = false,
  onReport,
  focusRef,
  now,
  photoHeight: photoShape,
}: Props) {
  const { t } = useTranslation()
  const { sizeClass } = useLayout()
  const compact = sizeClass === 'compact'
  const titleId = `update-title-${useId().replace(/[^\w-]/g, '')}`

  // Le titre : celui de l'auteur, sinon sa version, sinon « Mise à jour ». La version ne se répète
  // pas à côté quand c'est elle qui sert de titre (relecture du plan, interface A3).
  const title = update.title ?? update.version ?? t(($) => $.project.updates.untitled)
  const versionBeside = update.title !== null ? update.version : null

  // Les photos, telles que la galerie et l'avant / après les reçoivent.
  const photos: GalleryPhoto[] = update.photos.map((visual) => ({
    key: visual.id,
    source: toSource(visual.url),
    thumbhash: visual.thumbhash,
    description: visual.description,
  }))
  const [before, after] = photos
  const comparison = update.beforeAfter && before && after ? { before, after } : null
  // Avec l'avant / après, les photos 3 et 4 restent visibles, en petites tuiles (interface A3 : le
  // plan les perdait).
  const extras = comparison ? photos.slice(2) : []
  // La hauteur des photos : celle d'une bande sur téléphone, moyenne ailleurs (la galerie d'un projet
  // est plus grande ; ici, la mise à jour se lit dans une page qui a déjà sa couverture), sauf si
  // l'écran en demande une (la section de la page projet : une bande, même sur ordinateur).
  const photoHeight = photoShape ?? (compact ? 'band' : 'medium')

  return (
    <View style={{ alignSelf: 'stretch', gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        {/* Ordinateur : le titre et la date passent à la ligne quand la place manque (texte
            agrandi) ; la date reste à droite (`marginLeft: 'auto'`). Téléphone : le titre seul sur
            sa ligne, puis « v1.2 · dimanche » dessous, à gauche (à 320 et 390 points, la date
            tombait seule à droite sur une deuxième ligne). */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: compact ? 'column' : 'row',
            flexWrap: compact ? 'nowrap' : 'wrap',
            alignItems: compact ? 'stretch' : 'baseline',
            columnGap: space.sm,
            rowGap: space.xxs,
            // Le titre centré sur le bouton de 44 points (corbeille ou « Signaler ») quand il tient
            // sur une ligne ; sans bouton, il commence en haut.
            paddingTop: onDelete || onReport ? space.sm : 0,
          }}
        >
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              maxWidth: '100%',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              columnGap: space.sm,
            }}
          >
            <View style={{ flexShrink: 1, maxWidth: '100%' }}>
              <Text
                variant="headline"
                heading={headingLevel}
                nativeID={titleId}
                focusRef={focusRef}
                breakAnywhere
              >
                {title}
              </Text>
            </View>
            {versionBeside && !compact ? <VersionText version={versionBeside} /> : null}
          </View>
          {compact ? (
            <MetaLine>
              {versionBeside ? <VersionText version={versionBeside} tone="muted" /> : null}
              <RelativeTime date={update.createdAt} now={now} />
            </MetaLine>
          ) : (
            <View style={{ marginLeft: 'auto' }}>
              <RelativeTime date={update.createdAt} now={now} />
            </View>
          )}
        </View>
        {onDelete ? (
          <IconButton
            icon="trash"
            variant="plain"
            label={t(($) => $.project.updates.delete, { title })}
            loading={deleting}
            onPress={() => {
              if (!deleting) onDelete()
            }}
          />
        ) : onReport ? (
          // Le même nom sur chaque mise à jour de la frise : le titre le précise (web : décrit par
          // le titre ; téléphone : l'indice lu après le nom).
          <IconButton
            icon="flag"
            variant="plain"
            label={t(($) => $.report.update)}
            describedBy={titleId}
            hint={title}
            onPress={onReport}
          />
        ) : null}
      </View>

      {update.removal ? <RemovalNotice {...banner(update.removal, t)} compact /> : null}

      <Stack gap="sm" accessibilityRole="list">
        {update.lines.map((line, rank) => (
          // Deux lignes peuvent avoir le même texte : leur rang les distingue (la liste ne change pas
          // d'ordre).
          // biome-ignore lint/suspicious/noArrayIndexKey: une ligne n'a pas d'autre identité que sa place
          <UpdateLine key={rank} line={line} />
        ))}
      </Stack>

      {comparison ? (
        <BeforeAfter before={comparison.before} after={comparison.after} height={photoHeight} />
      ) : photos.length > 0 ? (
        <PhotoGallery
          photos={photos}
          height={photoHeight}
          label={t(($) => $.project.updates.photosLabel)}
        />
      ) : null}
      {extras.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {extras.map((photo, rank) => (
            <PhotoTile
              key={photo.key}
              photo={photo}
              // Le nom de la tuile : sa description et sa place parmi toutes les photos de la mise à
              // jour (« La fusée en vol, photo 3 sur 3 »), ou « Photo 3 sur 3 ».
              label={
                photo.description?.trim()
                  ? t(($) => $.gallery.photoDescribed, {
                      description: photo.description,
                      index: rank + 3,
                      count: photos.length,
                    })
                  : t(($) => $.gallery.photoOf, { index: rank + 3, count: photos.length })
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Une ligne de « Ce qui a changé » : la pastille de sa famille, puis son texte. */
function UpdateLine({ line }: { line: ProjectUpdate['lines'][number] }) {
  const { t } = useTranslation()
  const read = t(($) => $.update.lineRead, {
    family: t(($) => $.update.family[line.family]),
    text: line.text,
  })
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      <View style={{ flexShrink: 0, marginTop: -BADGE_ROOM }}>
        <UpdateFamilyBadge family={line.family} />
      </View>
      <LineText text={line.text} read={read} />
    </View>
  )
}

/**
 * Le texte d'une ligne, lu avec sa famille (« Réparé : Le score… », relecture du plan, interface
 * B4). Sur téléphone, le lecteur d'écran lit le nom donné au texte. Sur le web, le navigateur ignore
 * le nom d'une balise sans rôle : le texte vu est caché au lecteur, et la phrase entière est écrite
 * à côté, cachée à l'œil seulement (comme la date de `RelativeTime`).
 */
function LineText({ text, read }: { text: string; read: string }) {
  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text breakAnywhere readable accessibilityLabel={read}>
          {text}
        </Text>
      </View>
    )
  }
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View aria-hidden>
        <Text breakAnywhere readable>
          {text}
        </Text>
      </View>
      <View style={hiddenFrame} pointerEvents="none">
        <Text>{read}</Text>
      </View>
    </View>
  )
}

/**
 * Une petite tuile de photo (les photos 3 et 4 d'un avant / après) : une image nommée, qui ne
 * s'ouvre pas (un bouton qui n'ouvre rien mentirait). L'image intérieure n'a pas de nom à elle :
 * la tuile porte déjà le sien (sinon le navigateur expose deux noms).
 */
function PhotoTile({ photo, label }: { photo: GalleryPhoto; label: string }) {
  const tile = layout.thumb.size * 2
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: tile, maxWidth: '100%', borderRadius: radii.tile, overflow: 'hidden' }}
    >
      <ProjectCover
        height={layout.thumb.size + space.xxl}
        radius="tile"
        image={{ source: photo.source, thumbhash: photo.thumbhash ?? null, label: '' }}
      />
    </View>
  )
}
