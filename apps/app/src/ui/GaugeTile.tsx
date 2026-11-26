// Une tuile de chiffre (R20, planche R20-Tri : le haut de la page de tri des Éclaireuses) : un petit
// intitulé (« Le mois »), une valeur en grand (« Jour 12 sur 30 »), et selon le cas une jauge (la
// part écoulée du mois, la part des places prises), une phrase dessous (« Jusqu'au 14 déc. à
// minuit »), une action (« Lancer le mois »), un bouton en haut à droite (« Modifier ») ou une liste
// (les missions de la semaine).
//
// L'intitulé est un titre de niveau 2 : on saute d'une tuile à l'autre au lecteur d'écran. La jauge
// est un décor pour l'œil, cachée aux lecteurs d'écran : la valeur écrite dit déjà tout (« 18 sur
// 30 »), la couleur n'est jamais seule à porter le sens.
import { layout, radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Stack } from './Stack'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le petit intitulé, lu comme un titre de niveau 2 (« Le mois », « Les places »). */
  label: string
  /** La valeur en grand (« Jour 12 sur 30 ») ; absente, la tuile ne montre que sa liste. */
  value?: string
  /** La part remplie de la jauge, de 0 à 1 ; absente, pas de jauge. */
  ratio?: number
  /** Une phrase sous la valeur (« Jusqu'au 14 déc. à minuit »). */
  detail?: string
  /** Un bouton en haut à droite, à côté de l'intitulé (« Modifier »). */
  trailing?: ReactNode
  /** Une action sous la phrase (« Lancer le mois »). */
  action?: ReactNode
  /** Un contenu sous l'intitulé (la liste des missions de la semaine). */
  children?: ReactNode
}

export function GaugeTile({ label, value, ratio, detail, trailing, action, children }: Props) {
  const { colors } = useTheme()
  // La part bornée entre 0 et 1 : une valeur fausse ne déborde jamais de la jauge.
  const filled = ratio === undefined ? null : Math.max(0, Math.min(1, ratio))
  return (
    <Surface variant="grouped" padding="lg" gap="sm" fill>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          columnGap: space.md,
          // La rangée garde sa hauteur, bouton ou pas : les tuiles voisines restent alignées.
          minHeight: trailing ? layout.touchTarget : undefined,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <Text variant="caption" weight={600} tone="muted" heading={2}>
            {label}
          </Text>
        </View>
        {trailing}
      </View>
      {value === undefined ? null : (
        <Text variant="heading" tabular>
          {value}
        </Text>
      )}
      {filled === null ? null : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={{
            height: space.sm,
            borderRadius: radii.pill,
            backgroundColor: colors.outline,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${filled * 100}%`,
              height: '100%',
              borderRadius: radii.pill,
              backgroundColor: colors.honey,
            }}
          />
        </View>
      )}
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
      {children}
      {action ? (
        <Stack direction="row" paddingY="xs">
          {action}
        </Stack>
      ) : null}
    </Surface>
  )
}
