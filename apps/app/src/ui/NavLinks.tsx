// Les liens de la barre du haut sur ordinateur (refonte, tranche R3) : Fil, Explorer, Ruches (et
// Modération pour un administrateur). Le lien de la page ouverte est posé dans sa « goutte » : une
// pastille blanche en relief sur le verre de la barre (planches R3-*-Desktop). Elle ne glisse pas,
// contrairement à celle de la barre d'onglets du téléphone (TabBar) : sur ordinateur, la page
// change d'un coup, et la goutte apparaît directement sous le nouveau lien.
//
// Pour les lecteurs d'écran, comme SettingsNav et TabBar :
// - une région de navigation nommée (`navigation`), sans `accessible` : sur iOS, `accessible`
//   regrouperait les liens en un seul bloc, et VoiceOver ne les atteindrait plus un par un ;
// - un lien par entrée, avec sa vraie adresse (`href`) : sur le web, react-native-web en fait un
//   `<a>`, que le navigateur sait ouvrir dans un nouvel onglet, et qu'Entrée active ;
// - le lien de la page ouverte dit « page actuelle » (`aria-current`, web) et « sélectionné »
//   (`accessibilityState`, VoiceOver et TalkBack, qui ignorent `aria-current`).
//
// Le composant ne navigue pas lui-même : il dit quel lien a été touché (`onPress`), et
// navigation/TopNav.tsx choisit la page. Ce fichier exporte aussi la photo « Moi » de la barre,
// un lien du même genre (adresse réelle, page actuelle).
import { borders, layout, radii, space } from '@ruche/brand'
import { useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import type { PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

/** Un lien de la barre : sa clé (stable), son libellé et son adresse. */
export type NavLinkEntry<K extends string> = { key: K; label: string; href: string }

type Props<K extends string> = {
  /** Le nom de la région, lu par les lecteurs d'écran (« Navigation principale »). */
  label: string
  links: readonly NavLinkEntry<K>[]
  /** La clé du lien de la page ouverte ; `null` sur une page qui n'est d'aucun lien. */
  active: K | null
  /** Un lien a été touché (jamais celui de la page ouverte, ni deux fois de suite). */
  onPress: (key: K) => void
}

export function NavLinks<K extends string>({ label, links, active, onPress }: Props<K>) {
  const { colors, shadows } = useTheme()
  // La garde contre la double tape : le dernier lien touché, et quand. La seconde tape d'une double
  // tape arrive avant que la page ait changé ; sans garde, la même page s'ouvrait deux fois (deux
  // `push`, et « Retour » ramenait sur elle-même). Même délai que les fenêtres (tapGuard.ts).
  const lastTap = useRef<{ key: K; at: number } | null>(null)

  const press = (entry: NavLinkEntry<K>) => (event?: PressEvent) => {
    // Sur le web, le `<a>` ne recharge pas la page : c'est le routeur qui en change.
    if (Platform.OS === 'web') event?.preventDefault?.()
    // Déjà sur cette page : rien à empiler une seconde fois.
    if (entry.key === active) return
    const now = Date.now()
    const previous = lastTap.current
    lastTap.current = { key: entry.key, at: now }
    if (previous && previous.key === entry.key && now - previous.at < TAP_GUARD_MS) return
    onPress(entry.key)
  }

  return (
    <View
      role="navigation"
      aria-label={label}
      // À texte agrandi, les liens passent à la ligne plutôt que de sortir de la barre : sur le
      // web, une vue ne rétrécit (et donc ne replie ses enfants) qu'avec flexShrink et maxWidth.
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.xxs,
        flexShrink: 1,
        maxWidth: '100%',
      }}
    >
      {links.map((entry) => {
        const isActive = entry.key === active
        return (
          <Pressable
            key={entry.key}
            accessibilityRole="link"
            accessibilityLabel={entry.label}
            {...linkProps(entry.href, isActive)}
            accessibilityState={{ selected: isActive }}
            onPress={press(entry)}
            style={({ pressed }) => ({
              minHeight: layout.touchTarget,
              minWidth: layout.touchTarget,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: space.lg,
              paddingVertical: space.xs,
              borderRadius: radii.pill,
              // La goutte : blanche et en relief sous le lien actif (comme TabBar) ; un lien
              // enfoncé passe sur le fond groupé, le temps du geste.
              backgroundColor: isActive
                ? colors.surfaceRaised
                : pressed
                  ? colors.surfaceGrouped
                  : 'transparent',
              ...(isActive ? { boxShadow: shadows.soft } : null),
            })}
          >
            {/* Sur la goutte, l'encre (ton onHoney) : la goutte reste claire de nuit, comme le choix
                actif de Segmented et de TabBar (couple onHoney / surfaceRaised de contrastPairs). */}
            <Text
              weight={isActive ? 700 : 500}
              tone={isActive ? 'onHoney' : 'secondary'}
              selectable={false}
            >
              {entry.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

type PhotoLinkProps = {
  /** Le nom lu (« Moi ») : la photo n'a pas de texte à elle. */
  label: string
  href: string
  /** La page de ce lien est ouverte : la photo est cerclée, et le lien dit « page actuelle ». */
  current?: boolean
  onPress: () => void
  /** Le nom du membre, pour les initiales quand il n'a pas de photo. */
  name: string
  source: ImageSource | null
}

/**
 * La photo du membre dans la barre du haut, lien vers sa page (« Moi »). Sur sa page, la photo est
 * cerclée d'encre, comme l'onglet « Moi » actif du téléphone.
 */
export function NavPhotoLink({
  label,
  href,
  current = false,
  onPress,
  name,
  source,
}: PhotoLinkProps) {
  const { colors } = useTheme()
  const press = (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    // Déjà sur sa page : rien à empiler.
    if (!current) onPress()
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      {...linkProps(href, current)}
      accessibilityState={{ selected: current }}
      onPress={press}
      style={{
        width: layout.touchTarget,
        height: layout.touchTarget,
        // Rond : l'anneau de focus du clavier suit la photo.
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: borders.strong,
        borderColor: current ? colors.text : 'transparent',
      }}
    >
      {/* Le nom de la photo est celui du lien : la photo elle-même ne se lit pas deux fois. */}
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Avatar
          name={name}
          source={source}
          label={name}
          // Deux points de moins de chaque côté : la place du cercle, sans changer la taille du lien.
          size={layout.touchTarget - 4}
        />
      </View>
    </Pressable>
  )
}
