// L'encart « Ou publie ton premier projet. » (R4, planche R4-Fil-Premier) : posé sous « Proches à
// suivre » au premier lancement, dans un cadre en pointillés de miel (une place à remplir, comme
// `AddTile`), avec « Publier ». C'est l'écran qui ne le pose pas pour un membre suspendu.
// « Publier » ouvre la page de publication sous le doigt : une double tape l'ouvrirait deux fois
// (deux pages empilées, deux « Retour ») ; la garde des cartes l'en empêche (useTapGuard).
import { borders, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Mène à la publication d'un projet (l'écran branche son routeur). */
  onPublish: () => void
}

export function PublishPrompt({ onPublish }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const guard = useTapGuard()
  return (
    <View
      style={{
        // Les pointillés de miel des places à remplir (`colors.dashed`, jour et nuit).
        borderWidth: borders.strong,
        borderStyle: 'dashed',
        borderColor: colors.dashed,
        borderRadius: radii.group,
        padding: space.lg,
        // Le texte et le bouton côte à côte ; quand la place manque (texte agrandi, écran
        // étroit), le bouton passe dessous, rangé à gauche.
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.md,
      }}
    >
      {/* Une base réelle (pas flex: 1) : sous 180 points, le texte garde sa largeur et le bouton
          descend, au lieu de couper les mots lettre par lettre. */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, gap: space.xxs }}>
        <Text weight={700}>{t(($) => $.publishPrompt.title)}</Text>
        <Text variant="callout" tone="muted">
          {t(($) => $.publishPrompt.body)}
        </Text>
      </View>
      <Button
        label={t(($) => $.publishPrompt.action)}
        icon="plus"
        size="compact"
        onPress={guard(onPublish)}
      />
    </View>
  )
}
