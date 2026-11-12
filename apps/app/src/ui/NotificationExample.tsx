// L'exemple en tête de l'écran « Notifications » des réglages (R8, planche `R8-Reglages`) : une
// fausse notification de téléphone, « {{appName}} · maintenant » puis « 12 réactions sur Raconte-moi
// un tableau », le titre en gras. Elle montre à quoi ressemble ce qu'on reçoit : le nombre, jamais
// le nom de qui a réagi (choix de la tranche). Ce n'est qu'une illustration : ni bouton ni lien, et
// aucune prop, car ses deux textes sont toujours les mêmes (`notificationSettings.exampleSource` et
// `exampleText`).
//
// Le titre en gras est marqué <b>…</b> dans le texte traduit ; `splitMarks` (notifications/marks.ts)
// découpe la phrase en morceaux, et ce composant ne dessine jamais de HTML.
import { appName } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { splitMarks } from '../notifications/marks'
import { Logo } from './Logo'
import { Stack } from './Stack'
import { Surface } from './Surface'
import { Text } from './Text'

/** La hauteur de l'abeille, à la taille de l'icône d'une notification du téléphone. */
const BEE_SIZE = 36

export function NotificationExample() {
  const { t } = useTranslation()
  const parts = splitMarks(t(($) => $.notificationSettings.exampleText))

  return (
    <Surface variant="glass" radius="lg" padding="md">
      <Stack direction="row" gap="md" align="center">
        {/* L'abeille de l'appli, comme l'icône d'une vraie notification : pure décoration. */}
        <View style={{ flexShrink: 0 }}>
          <Logo variant="bee" size={BEE_SIZE} decorative />
        </View>
        {/* Le texte prend la place restante et passe à la ligne (texte agrandi, 320 points). */}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="caption" tone="muted">
            {t(($) => $.notificationSettings.exampleSource, { appName })}
          </Text>
          <Text variant="callout" breakAnywhere>
            {parts.map((part, index) =>
              part.style === 'strong' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: morceaux fixes, jamais réordonnés
                <Text key={index} variant="callout" weight={700}>
                  {part.text}
                </Text>
              ) : (
                part.text
              ),
            )}
          </Text>
        </View>
      </Stack>
    </Surface>
  )
}
