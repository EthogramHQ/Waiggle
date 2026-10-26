// Une petite note discrète précédée d'une icône (« Les projets et les profils ne sont visibles que
// par les membres connectés. »). L'icône reste alignée sur la première ligne du texte, et le texte
// se replie à côté d'elle, aligné à gauche, au lieu de se centrer sous l'icône.
// Un morceau du texte peut être un lien (`link`), par exemple notre adresse de contact : il reste
// dans la phrase, souligné, et s'ouvre au toucher, au clic ou avec Entrée.
import { space } from '@ruche/brand'
// Le Text de React Native pour le lien, posé dans notre Text : il hérite de sa police et de sa
// taille, et ne change que la couleur et le soulignement (comme les liens de Markdown.tsx).
import { Text as NativeText, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { enterActivates } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  icon: IconName
  text: string
  /**
   * Le morceau de `text` qui devient un lien (`label`, écrit tel qu'il apparaît dans le texte), et
   * ce qu'il ouvre. Absent du texte : la note reste un simple texte (rien de cliquable caché).
   */
  link?: { label: string; onPress: () => void } | undefined
}

export function Hint({ icon, text, link }: Props) {
  const { colors } = useTheme()
  // Le texte autour du lien : avant, puis après (la première fois qu'il apparaît seulement).
  const at = link ? text.indexOf(link.label) : -1
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      {/* L'icône est décorative : le texte dit tout. paddingTop la cale sur la première ligne. */}
      <View style={{ paddingTop: space.xxs }} aria-hidden>
        <Icon name={icon} size={14} tone="muted" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" tone="muted">
          {link && at >= 0 ? (
            <>
              {text.slice(0, at)}
              {/* Un texte dans le texte : le lien suit la ligne et se replie avec elle. Même
                  couleur que les liens du Markdown des membres. */}
              <NativeText
                accessibilityRole="link"
                // Entrée l'ouvre sur le web : sans adresse, react-native-web ne le fait pas.
                {...enterActivates(link.onPress)}
                onPress={link.onPress}
                style={{ color: colors.amberText, textDecorationLine: 'underline' }}
              >
                {link.label}
              </NativeText>
              {text.slice(at + link.label.length)}
            </>
          ) : (
            text
          )}
        </Text>
      </View>
    </View>
  )
}
