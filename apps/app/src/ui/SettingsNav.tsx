// Les rubriques des réglages (tranche R2) : Mon profil, Notifications, Langue, Apparence, Mes
// données, Sécurité, Compte, À propos. Sur ordinateur, une colonne de liens à gauche de la rubrique
// ouverte, la rubrique en cours sur un fond de miel pâle ; sur téléphone, une liste de réglages
// (ListGroup) dont chaque ligne mène à la page de la rubrique.
//
// Pour les lecteurs d'écran : une région de navigation (`navigation`, nommée), un lien par rubrique,
// et la rubrique ouverte dite par `aria-current="page"` (le lecteur d'écran lit « page actuelle »).
// Chaque lien porte sa vraie adresse (`href`) : sur le web, react-native-web en fait un `<a>`, et
// le navigateur offre « ouvrir dans un nouvel onglet ». Le geste ordinaire passe par le routeur
// d'Expo Router (`useRouter().push`), qui change de page sans la recharger : c'est, avec le titre
// de l'onglet (Screen), le seul endroit où src/ui touche à expo-router.
import { layout, radii, space } from '@ruche/brand'
import { useRouter } from 'expo-router'
import { Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { ListGroup, ListRow, type PressEvent } from './ListGroup'
import { Text } from './Text'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/** Une rubrique : sa clé (stable), son libellé, son adresse et, en option, son icône. */
export type SettingsNavItem<K extends string> = {
  key: K
  label: string
  href: string
  icon?: IconName
}

type Props<K extends string> = {
  /** Le nom de la région de navigation, lu par les lecteurs d'écran (« Rubriques des réglages »). */
  label: string
  items: readonly SettingsNavItem<K>[]
  /** La clé de la rubrique ouverte, s'il y en a une (sur téléphone, la liste seule : aucune). */
  current?: K | null
}

/**
 * Ce qu'un lien avec adresse porte : `href` et, pour la page ouverte, `aria-current`. Ces
 * propriétés manquent aux types de React Native (sur téléphone, elles sont ignorées).
 */
export const linkProps = (href: string, current: boolean): object => ({
  href,
  ...(current ? { 'aria-current': 'page' } : null),
})

export function SettingsNav<K extends string>({ label, items, current }: Props<K>) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()
  const router = useRouter()

  // Le geste sur un lien : le routeur change de page, et sur le web le navigateur ne recharge pas
  // la page (preventDefault sur le clic du `<a>`).
  const press = (item: SettingsNavItem<K>) => (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    router.push(item.href)
  }

  if (sizeClass !== 'wide') {
    return (
      <View role="navigation" aria-label={label}>
        <ListGroup>
          {items.map((item) => (
            <ListRow
              key={item.key}
              label={item.label}
              {...(item.icon ? { icon: item.icon } : null)}
              trailing="chevron"
              href={item.href}
              current={item.key === current}
              onPress={press(item)}
            />
          ))}
        </ListGroup>
      </View>
    )
  }

  return (
    // Pas d'`accessible` sur la région : sur iOS, VoiceOver doit atteindre chaque lien.
    <View role="navigation" aria-label={label} style={{ gap: space.xxs }}>
      {items.map((item) => {
        const active = item.key === current
        return (
          <Pressable
            key={item.key}
            accessibilityRole="link"
            accessibilityLabel={item.label}
            {...linkProps(item.href, active)}
            onPress={press(item)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: layout.touchTarget,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              borderRadius: radii.small,
              // La rubrique ouverte sur du miel pâle ; une rubrique enfoncée, sur le fond groupé.
              backgroundColor: active
                ? colors.honeySoft
                : pressed
                  ? colors.surfaceGrouped
                  : 'transparent',
            })}
          >
            {item.icon ? (
              <Icon name={item.icon} size={20} tone={active ? 'default' : 'secondary'} />
            ) : null}
            <View style={{ flexShrink: 1 }}>
              <Text weight={active ? 700 : 500} tone={active ? 'default' : 'secondary'}>
                {item.label}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
