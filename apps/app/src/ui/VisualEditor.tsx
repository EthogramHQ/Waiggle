// La couverture verticale d'un projet, dans la feuille de publication : un seul emplacement, au
// format d'un téléphone tenu droit, facultatif (« Couverture verticale, facultative »). Les photos de
// la galerie (l'ordre, la couverture, les retraits) sont passées à `PhotoTiles` en R6a : ce
// composant ne garde que cet emplacement.
// Le composant ne connaît ni l'API ni les traductions : l'écran lui donne les textes et les actions.
import { radii } from '@ruche/brand'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { Button } from './Button'
import type { CoverImage } from './ProjectCover'
import { Row, Stack } from './Stack'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type VisualTile = { key: string; image: CoverImage }

export type VisualEditorLabels = {
  portrait: string
  portraitHint: string
  choosePortrait: string
  replacePortrait: string
  removePortrait: string
}

type Props = {
  labels: VisualEditorLabels
  portrait: VisualTile | null
  onPickPortrait: () => void
  onRemovePortrait: () => void
  /** Une action est en cours (envoi d'une photo…) : les boutons attendent. */
  busy?: boolean
}

/** La hauteur de la vignette ; sa largeur suit le format 9:16 d'un téléphone. */
const HEIGHT = 132
const WIDTH = Math.round((HEIGHT * 9) / 16)

export function VisualEditor({
  labels,
  portrait,
  onPickPortrait,
  onRemovePortrait,
  busy = false,
}: Props) {
  const { colors } = useTheme()
  return (
    <Surface variant="grouped" padding="lg" gap="lg">
      <Stack gap="xs">
        <Text variant="headline">{labels.portrait}</Text>
        <Text variant="callout" tone="muted">
          {labels.portraitHint}
        </Text>
      </Stack>
      <Row gap="lg" align="center">
        {portrait ? (
          <View
            style={{ width: WIDTH, height: HEIGHT, borderRadius: radii.small, overflow: 'hidden' }}
          >
            <Image
              source={portrait.image.source}
              placeholder={
                portrait.image.thumbhash ? { thumbhash: portrait.image.thumbhash } : null
              }
              contentFit="cover"
              accessibilityLabel={portrait.image.label}
              style={{ width: '100%', height: '100%', backgroundColor: colors.honeySoft }}
            />
          </View>
        ) : null}
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
    </Surface>
  )
}
