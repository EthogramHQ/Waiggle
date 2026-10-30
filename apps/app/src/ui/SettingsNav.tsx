// Les rubriques des réglages (tranche R2) : Mon profil, Notifications, Langue, Apparence, Mes
// données, Sécurité, Compte, À propos. Sur ordinateur, une colonne de liens à gauche de la rubrique
// ouverte, la rubrique en cours sur un fond de miel pâle ; sur téléphone, une liste de réglages
// (ListGroup) dont chaque ligne mène à la page de la rubrique.
//
// Pour les lecteurs d'écran : une région de navigation (`navigation`, nommée), un lien par rubrique,
// et la rubrique ouverte dite par `aria-current="page"` (le lecteur d'écran lit « page actuelle »).
// Sur le web, chaque lien a une vraie adresse (`href`) : le navigateur offre « ouvrir dans un nouvel
// onglet » et la touche Entrée ; le geste ordinaire passe par `onNavigate`, que l'écran branche sur
// le routeur (src/ui n'importe pas expo-router), pour changer de page sans la recharger.
import { layout, radii, space } from '@ruche/brand'
import { Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { ListGroup, ListRow } from './ListGroup'
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
  current?: K
  /**
   * Ouvrir une rubrique (l'écran y branche son routeur). Sans elle, sur le web, le lien ordinaire
   * du navigateur fait le travail (la page se recharge).
   */
  onNavigate?: (item: SettingsNavItem<K>) => void
}

/**
 * Ce qu'un lien avec adresse donne au web : `href` (react-native-web dessine alors un vrai `<a>`)
 * et `aria-current` pour la page ouverte. Ces propriétés manquent aux types de React Native.
 */
export const linkProps = (href: string, current: boolean): object =>
  Platform.OS === 'web' ? { href, ...(current ? { 'aria-current': 'page' } : null) } : {}

export function SettingsNav<K extends string>({ label, items, current, onNavigate }: Props<K>) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()

  // Le geste sur un lien : l'écran navigue, et le navigateur ne recharge pas la page
  // (preventDefault sur le clic du `<a>`). Sans `onNavigate`, on laisse le lien faire.
  const press = (item: SettingsNavItem<K>) => (event?: { preventDefault?: () => void }) => {
    if (!onNavigate) return
    event?.preventDefault?.()
    onNavigate(item)
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
