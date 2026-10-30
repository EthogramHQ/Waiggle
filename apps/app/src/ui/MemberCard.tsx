// La carte du membre en tête des réglages (tranche R2) : sa photo, son nom, le lien « Voir ma page »
// (sa page telle que les autres la voient) et le bouton « Modifier » (son profil). Une carte de
// verre, posée sur la lumière d'ambiance de la page.
//
// Pendant que le profil se lit, la carte garde sa place et sa hauteur (« Chargement… » à la place du
// nom, sans lien) : rien ne bouge sous le doigt quand le profil arrive. Si le profil ne se lit pas,
// l'écran passe le nom de la session et retire le lien (l'adresse de la page dépend du profil).
import { layout, space } from '@ruche/brand'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import type { PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** Le nom affiché ; null tant que le profil se lit (la carte dit alors `loadingLabel`). */
  name: string | null
  /** Le texte d'attente, à la place du nom (« Chargement… »). */
  loadingLabel: string
  avatar: ImageSource | null
  /** Le nom de la photo pour les lecteurs d'écran (« Photo de profil »). */
  avatarLabel: string
  /**
   * Le lien vers sa page publique : son libellé, son adresse (un vrai lien sur le web) et le geste,
   * que l'écran branche sur son routeur. Absent : pas de lien (profil en attente ou en panne).
   */
  viewPage?: { label: string; href: string; onPress: (event?: PressEvent) => void }
  /** Le bouton qui ouvre le profil à modifier. */
  edit: { label: string; onPress: () => void }
}

export function MemberCard({ name, loadingLabel, avatar, avatarLabel, viewPage, edit }: Props) {
  return (
    <Surface variant="glass" radius="panel" padding="lg">
      {/* flexWrap : à 200 % de texte, « Modifier » passe sous le nom au lieu de le couper. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
        <Avatar name={name ?? ''} source={avatar} label={avatarLabel} size={56} />
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 96, minWidth: 0, gap: space.xxs }}>
          <Text variant="headline" tone={name === null ? 'muted' : 'default'}>
            {name ?? loadingLabel}
          </Text>
          {viewPage ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={viewPage.label}
              {...linkProps(viewPage.href, false)}
              onPress={(event) => {
                // Le routeur change de page ; le navigateur ne recharge pas (vrai `<a>` sur le web).
                if (Platform.OS === 'web') event?.preventDefault?.()
                viewPage.onPress(event)
              }}
              // 44 points de haut à toucher, même autour d'un texte court.
              style={({ pressed }) => ({
                minHeight: layout.touchTarget,
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: space.xxs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text weight={700} tone="accent">
                {viewPage.label}
              </Text>
              <Icon name="caret-right" size={16} tone="accent" />
            </Pressable>
          ) : null}
        </View>
        <Button
          label={edit.label}
          icon="pencil-simple"
          variant="secondary"
          size="compact"
          onPress={edit.onPress}
        />
      </View>
    </Surface>
  )
}
