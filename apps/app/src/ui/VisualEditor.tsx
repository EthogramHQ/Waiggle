// L'éditeur des visuels d'un projet, dans le formulaire. Deux parties :
// - la galerie : des vignettes dans l'ordre (la première sert de couverture), chacune avec ses
//   boutons « Reculer », « Avancer », « Mettre en couverture » et « Retirer » ;
// - la couverture verticale, affichée sur téléphone : un seul emplacement.
// Pas de glisser-déposer : des boutons nommés, utilisables au clavier et au lecteur d'écran.
// Le composant ne connaît ni l'API ni les traductions : l'écran lui donne les textes et les actions.
import { radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Button } from './Button'
import { IconButton } from './IconButton'
import type { CoverImage } from './ProjectCover'
import { Row, Stack } from './Stack'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type VisualTile = { key: string; image: CoverImage }

export type VisualEditorLabels = {
  gallery: string
  galleryHint: string
  cover: string
  add: string
  earlier: (number: number) => string
  later: (number: number) => string
  makeCover: (number: number) => string
  remove: (number: number) => string
  portrait: string
  portraitHint: string
  choosePortrait: string
  replacePortrait: string
  removePortrait: string
}

type Props = {
  labels: VisualEditorLabels
  gallery: VisualTile[]
  /** Le nombre maximal de photos : au-delà, « Ajouter » est désactivé. */
  max: number
  portrait: VisualTile | null
  onAdd: () => void
  /** Déplace la photo `index` d'une place (-1 : vers le début ; +1 : vers la fin). */
  onMove: (index: number, delta: -1 | 1) => void
  onMakeCover: (index: number) => void
  onRemove: (index: number) => void
  onPickPortrait: () => void
  onRemovePortrait: () => void
  /** Une action est en cours (envoi d'une photo…) : les boutons attendent. */
  busy?: boolean
}

const TILE = 132

export function VisualEditor({
  labels,
  gallery,
  max,
  portrait,
  onAdd,
  onMove,
  onMakeCover,
  onRemove,
  onPickPortrait,
  onRemovePortrait,
  busy = false,
}: Props) {
  const last = gallery.length - 1
  return (
    // Deux sections (la galerie, la couverture verticale), plus espacées entre elles (xxl) que les
    // éléments d'une même section (lg) : on voit d'un coup d'œil ce qui va ensemble.
    <Surface variant="grouped" padding="lg" gap="xxl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Text variant="headline">{labels.gallery}</Text>
          <Text variant="callout" tone="muted">
            {labels.galleryHint}
          </Text>
        </Stack>
        {/* Sans photo, pas de rangée vide : elle ajoutait un double écart avant le bouton. */}
        {gallery.length > 0 ? (
          <Stack direction="row" gap="md" wrap>
            {gallery.map(({ key, image }, index) => {
              const number = index + 1
              return (
                <Stack key={key} gap="sm" align="center">
                  <Picture image={image} width={TILE} height={TILE}>
                    {index === 0 ? (
                      <View style={{ position: 'absolute', top: space.xs, left: space.xs }}>
                        <StatusPill label={labels.cover} strong />
                      </View>
                    ) : null}
                  </Picture>
                  <Row gap="xs">
                    <IconButton
                      icon="caret-left"
                      variant="plain"
                      label={labels.earlier(number)}
                      onPress={() => onMove(index, -1)}
                      disabled={busy || index === 0}
                    />
                    <IconButton
                      icon="caret-right"
                      variant="plain"
                      label={labels.later(number)}
                      onPress={() => onMove(index, 1)}
                      disabled={busy || index === last}
                    />
                  </Row>
                  <Row gap="xs">
                    <IconButton
                      icon="star"
                      variant="plain"
                      label={labels.makeCover(number)}
                      onPress={() => onMakeCover(index)}
                      disabled={busy || index === 0}
                    />
                    <IconButton
                      icon="trash"
                      variant="plain"
                      label={labels.remove(number)}
                      onPress={() => onRemove(index)}
                      disabled={busy}
                    />
                  </Row>
                </Stack>
              )
            })}
          </Stack>
        ) : null}
        <Button
          label={labels.add}
          variant="secondary"
          icon="image"
          onPress={onAdd}
          loading={busy}
          disabled={gallery.length >= max}
        />
      </Stack>

      <Stack gap="lg">
        <Stack gap="xs">
          <Text variant="headline">{labels.portrait}</Text>
          <Text variant="callout" tone="muted">
            {labels.portraitHint}
          </Text>
        </Stack>
        <Row gap="lg" align="center">
          {portrait ? <Picture image={portrait.image} width={TILE * 0.5625} height={TILE} /> : null}
          <Stack gap="sm" grow>
            <Button
              label={portrait ? labels.replacePortrait : labels.choosePortrait}
              variant="secondary"
              size="compact"
              icon="device-mobile"
              onPress={onPickPortrait}
              disabled={busy}
            />
            {portrait ? (
              <Button
                label={labels.removePortrait}
                variant="secondary"
                size="compact"
                icon="trash"
                onPress={onRemovePortrait}
                disabled={busy}
              />
            ) : null}
          </Stack>
        </Row>
      </Stack>
    </Surface>
  )
}

/** Une vignette : la photo, recadrée au centre, avec son nom pour les lecteurs d'écran. */
function Picture({
  image,
  width,
  height,
  children,
}: {
  image: CoverImage
  width: number
  height: number
  children?: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <View style={{ width, height, borderRadius: radii.small, overflow: 'hidden' }}>
      <Image
        source={image.source}
        placeholder={image.thumbhash ? { thumbhash: image.thumbhash } : null}
        contentFit="cover"
        accessibilityLabel={image.label}
        style={{ width: '100%', height: '100%', backgroundColor: colors.honeySoft }}
      />
      {children}
    </View>
  )
}
