// L'état d'une page qui n'a pas (encore) son contenu : chargement, erreur, page introuvable, page
// réservée aux membres, ou liste vide (qui invite à agir). Toujours la même allure, et toujours une issue : un état dit ce qui se
// passe et propose quoi faire ensuite (« Réessayer », « Revenir », « Me connecter »).
import { layout, space } from '@ruche/brand'
import { ActivityIndicator, useWindowDimensions, View } from 'react-native'
import { Button, type ButtonVariant } from './Button'
import { Emblem } from './Illustrations'
import { Mascot, type MascotPose } from './Mascot'
import { Stack } from './Stack'
import { type HeadingLevel, Text } from './Text'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

export type StateKind = 'loading' | 'error' | 'notFound' | 'signedOut' | 'empty'

/** La pose de la mascotte pour chaque état qui la montre. */
const mascotPoses: Record<Exclude<StateKind, 'loading' | 'error'>, MascotPose> = {
  notFound: 'search',
  empty: 'sleep',
  signedOut: 'wave',
}

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
  /**
   * Le niveau du titre : 2 par défaut, car l'état est le plus souvent une section d'une page qui a
   * son propre titre (« Pas encore de notification » sous « Notifications ») ; 1 quand l'état
   * remplace toute la page (page introuvable, erreur de chargement : voir screens/states.tsx).
   */
  level?: HeadingLevel
}

export function StateMessage({ kind, title, message, actions = [], level = 2 }: Props) {
  const { colors } = useTheme()
  const { height } = useLayout()
  // fontScale : le réglage de taille de texte de l'appareil (2 = deux fois plus grand). Sur le web,
  // il vaut toujours 1 (le navigateur agrandit la page autrement) : pas d'écart d'hydratation.
  const { fontScale } = useWindowDimensions()
  // Quand la place manque (écran bas, texte très agrandi), l'image s'efface : le titre, le message
  // et les issues restent sur le premier écran, sans avoir à faire défiler.
  const cramped = fontScale >= 1.5 || (height > 0 && height < 600)
  // L'image qui accompagne l'état : une indication de chargement ; la mascotte pour « introuvable »
  // (la loupe), « liste vide » (le sommeil) et « réservé aux membres » (le salut) ; une tuile de
  // miel avec une icône pour l'erreur, où l'abeille n'aurait pas le ton juste.
  // La mascotte est décorative (J10) : le titre dit déjà l'état, comme l'indicateur de chargement.
  const picture =
    kind === 'loading' ? (
      // aria-hidden : l'indicateur ne dit rien de plus que le texte « Chargement… » qui le suit.
      <ActivityIndicator size="large" color={colors.amber} aria-hidden />
    ) : kind === 'error' ? (
      <Emblem icon="warning-circle" />
    ) : (
      <Mascot pose={mascotPoses[kind]} size="sm" decorative />
    )

  return (
    // Jamais plus large qu'un formulaire, même dans une page large : des boutons de 1 280 points
    // n'auraient pas de sens. align="stretch" : les textes prennent cette largeur et se replient.
    <View style={{ width: '100%', maxWidth: layout.formWidth, alignSelf: 'center' }}>
      <Stack gap="xl" align="stretch">
        {kind === 'loading' || !cramped ? (
          <View style={{ alignItems: 'center', paddingVertical: space.lg }}>{picture}</View>
        ) : null}
        <Stack gap="sm" align="stretch">
          {title ? (
            <Text variant="title2" align="center" heading={level}>
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
