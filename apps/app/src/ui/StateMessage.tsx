// L'état d'une page qui n'a pas (encore) son contenu : chargement, erreur, page introuvable, ou
// page réservée aux membres. Toujours la même allure, et toujours une issue : un état dit ce qui se
// passe et propose quoi faire ensuite (« Réessayer », « Revenir », « Me connecter »).
import { layout, space } from '@ruche/brand'
import { ActivityIndicator, View } from 'react-native'
import { Button, type ButtonVariant } from './Button'
import { Emblem, Honeycomb } from './Illustrations'
import { Stack } from './Stack'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type StateKind = 'loading' | 'error' | 'notFound' | 'signedOut'

/** Une issue : un bouton, éventuellement en chargement (« Réessayer » pendant la nouvelle tentative). */
type Action = { label: string; onPress: () => void; variant?: ButtonVariant; loading?: boolean }

type Props = {
  kind: StateKind
  /** Le titre de l'état (absent pendant le chargement, où le message suffit). */
  title?: string
  /** Ce qui se passe, et ce qu'on peut faire (facultatif quand le titre suffit). */
  message?: string
  /** Les issues proposées, de la principale à la secondaire. */
  actions?: Action[]
}

export function StateMessage({ kind, title, message, actions = [] }: Props) {
  const { colors } = useTheme()
  // L'image qui accompagne l'état : une indication de chargement, la ruche vide pour « introuvable »,
  // une tuile de miel avec une icône pour l'erreur et la page réservée.
  const picture =
    kind === 'loading' ? (
      // aria-hidden : l'indicateur ne dit rien de plus que le texte « Chargement… » qui le suit.
      <ActivityIndicator size="large" color={colors.amber} aria-hidden />
    ) : kind === 'notFound' ? (
      <Honeycomb />
    ) : (
      <Emblem icon={kind === 'error' ? 'warning-circle' : 'lock-simple'} />
    )

  return (
    // Jamais plus large qu'un formulaire, même dans une page large : des boutons de 1 280 points
    // n'auraient pas de sens. align="stretch" : les textes prennent cette largeur et se replient.
    <View style={{ width: '100%', maxWidth: layout.formWidth, alignSelf: 'center' }}>
      <Stack gap="xl" align="stretch">
        <View style={{ alignItems: 'center', paddingVertical: space.lg }}>{picture}</View>
        <Stack gap="sm" align="stretch">
          {title ? (
            <Text variant="title2" align="center" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {/* Une erreur est une « alerte » : les lecteurs d'écran la lisent dès qu'elle apparaît,
            même si la page entière vient d'être remplacée (le chargement devient une erreur). */}
          {message ? (
            <Text
              tone={title ? 'secondary' : 'default'}
              align="center"
              {...(kind === 'error' ? { accessibilityRole: 'alert' as const } : null)}
            >
              {message}
            </Text>
          ) : null}
        </Stack>
        {actions.length > 0 ? (
          <Stack gap="md" align="stretch">
            {actions.map((action, index) => (
              <Button
                key={action.label}
                label={action.label}
                // La première issue est la principale ; les suivantes, secondaires.
                variant={action.variant ?? (index === 0 ? 'primary' : 'secondary')}
                onPress={action.onPress}
                loading={action.loading ?? false}
              />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </View>
  )
}
