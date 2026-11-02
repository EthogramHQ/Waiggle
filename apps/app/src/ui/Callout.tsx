// Un encadré qui met en avant ce qu'il faut savoir avant un geste (tranche R2, relecture de
// l'interface C6) : une icône, un titre court en gras, puis une phrase d'explication. Par exemple,
// sur « Changer ton mot de passe » : « Tes autres appareils seront déconnectés », puis ce qui reste
// connecté (relecture juridique, jur-3). Ce n'est pas un message (Notice) : rien ne vient de se
// passer, il n'est donc pas annoncé quand la page paraît ; il se lit dans l'ordre de la page.
//
// Deux tons (R5a) :
// - `default`, celui d'origine : une surface blanche, l'icône et la phrase en gris ;
// - `caution`, la prudence : un fond ambre doux (`cautionSoft`), le titre et l'icône en ambre foncé
//   (`amberText`), la phrase à l'encre. Il sert sous un prompt : « Relis-le avant de t'en servir… ».
//   L'icône prend `amberText` et non l'ambre des icônes (`amber`) : sur ce fond, l'ambre seul ne
//   fait que 3:1 tout juste (les couples sont mesurés dans `contrastPairs`, @ruche/brand).
// Le ton ne change que les couleurs : la même place, le même ordre de lecture, rien d'annoncé.
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type CalloutTone = 'default' | 'caution'

type Props = {
  /** L'icône, décorative (le titre dit tout) : l'appareil, un cadenas… */
  icon: IconName
  /**
   * Ce qu'il faut retenir, en une ligne. Facultatif (R5a, le bandeau d'un projet privé) : un texte
   * de plusieurs phrases, qui commence déjà par ce qu'il faut retenir (« Privé : … »), se lit mieux
   * à l'encre que tout en gras ; il passe alors seul dans `body`.
   */
  title?: string | undefined
  /** L'explication, sous le titre (facultative : un avertissement court tient dans son titre). */
  body?: string | undefined
  /** `default` par défaut ; `caution` pour une mise en garde (voir l'en-tête du fichier). */
  tone?: CalloutTone
}

export function Callout({ icon, title, body, tone = 'default' }: Props) {
  const { colors } = useTheme()
  const caution = tone === 'caution'

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <Icon name={icon} size={caution ? 20 : 24} tone={caution ? 'accent' : 'secondary'} />
      {/* flexShrink et minWidth 0 : à 200 % de texte, les lignes passent à la ligne au lieu de
          sortir du cadre (sur le web, une vue ne rétrécit pas d'elle-même). */}
      <View style={{ flex: 1, flexShrink: 1, minWidth: 0, gap: space.xs }}>
        {title ? (
          <Text weight={600} {...(caution ? { tone: 'accent' as const } : null)}>
            {title}
          </Text>
        ) : null}
        {body ? (
          <Text variant="callout" tone={caution ? 'default' : 'secondary'}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  )

  if (!caution) return <Surface padding="lg">{content}</Surface>

  // La prudence n'est pas une surface de plus posée sur la page (ni bordure ni ombre) : un fond
  // teinté, aux coins d'un bloc de prompt, qu'on lit comme une note attachée à ce qui précède.
  return (
    <View
      style={{
        backgroundColor: colors.cautionSoft,
        borderRadius: radii.code,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
      }}
    >
      {content}
    </View>
  )
}
