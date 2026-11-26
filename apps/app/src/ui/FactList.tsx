// Une courte liste de renseignements, un intitulé à gauche et sa valeur à droite (R20, planche
// R20-Tri : « Joint au retour » d'un retour d'Éclaireuse : Écran, Appareil, Version, Langue, Thème).
// Sous son titre, dans un cadre crème. Une valeur technique (une adresse, une version) s'écrit en
// police à chasse fixe (`mono`), réservée aux outils et aux versions (pôle design).
//
// Tout est du texte, jamais un lien : l'adresse d'un écran jointe à un retour vient d'un membre, et
// ne doit pas mener où elle veut (relecture de sécurité du plan R20, A3). Chaque ligne se lit
// « Écran : /projects/42 » ; à texte agrandi, la valeur passe sous son intitulé.
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type Fact = { label: string; value: string; mono?: boolean }

type Props = {
  /** Le titre de la liste (« Joint au retour »). */
  title: string
  facts: Fact[]
  /** La phrase à la place des lignes, quand il n'y en a aucune (« Rien n'est joint. »). */
  empty?: string
}

export function FactList({ title, facts, empty }: Props) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        gap: space.sm,
        padding: space.lg,
        borderRadius: radii.tile,
        backgroundColor: colors.honeySoft,
      }}
    >
      <Text variant="caption" weight={600} tone="status">
        {title}
      </Text>
      {facts.length === 0 && empty ? (
        <Text variant="callout" tone="status">
          {empty}
        </Text>
      ) : null}
      {facts.map((fact) => (
        <View
          key={fact.label}
          accessible
          accessibilityLabel={`${fact.label} : ${fact.value}`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 0 }}
        >
          {/* Une colonne d'intitulés de même largeur, tant que la place le permet. */}
          <View style={{ minWidth: space.huge * 2 }}>
            <Text variant="callout" tone="status">
              {fact.label}
            </Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text variant={fact.mono ? 'code' : 'callout'} breakAnywhere>
              {fact.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}
