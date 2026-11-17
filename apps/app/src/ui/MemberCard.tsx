// La carte du membre en tête des réglages (tranche R2) : sa photo, son nom, le lien « Voir ma page »
// (sa page telle que les autres la voient) et le bouton « Modifier » (son profil). Une carte de
// verre, posée sur la lumière d'ambiance de la page.
//
// Pendant que le profil se lit, la carte garde sa place et sa hauteur (R16 : des formes vides à la
// place du nom et du lien, lues « Chargement… ») : rien ne bouge sous le doigt quand le profil
// arrive. Si le profil ne se lit pas, l'écran passe le nom de la session et retire le lien
// (l'adresse de la page dépend du profil). `MemberCardSkeleton`, en bas : la carte vide entière,
// pour un écran qui la pose avant de rien savoir du membre.

import { layout, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { type PressEvent, TextLineShape } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Shape } from './Skeleton'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** Le nom affiché ; null tant que le profil se lit (la carte attend alors, nommée `loadingLabel`). */
  name: string | null
  /** Le nom lu de l'attente, à la place du nom (« Chargement… ») ; il n'est plus écrit (R16). */
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
        <View
          style={{
            flexGrow: 1,
            flexShrink: 1, // La place de « Voir ma page › » sur une ligne : si « Modifier » ne tient plus à côté, il
            // passe dessous plutôt que de couper le lien en deux lignes (390 px).
            flexBasis: 136,
            minWidth: 0,
            gap: space.xxs,
          }}
        >
          {name === null ? (
            // R16 : l'attente n'est plus écrite. Le nom et le lien à venir sont des formes vides,
            // à la place qu'ils prendront ; le lecteur d'écran entend `loadingLabel`, une fois.
            <PendingName label={loadingLabel} />
          ) : (
            <Text variant="headline">{name}</Text>
          )}
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

/** La photo de la carte, en points. */
const PHOTO = 56
/** La largeur du bouton « Modifier » vide (un bouton compact, son icône et son mot). */
const EDIT_WIDTH = 112

/**
 * Les formes du nom et du lien « Voir ma page » à venir : une ligne à la hauteur du nom, puis une
 * plus courte dans la place de 44 points du lien. Sans rôle ni nom : l'appelant les nomme.
 */
function NameShapes() {
  return (
    <>
      <TextLineShape variant="headline" width="60%" />
      <View style={{ minHeight: layout.touchTarget, justifyContent: 'center' }}>
        <TextLineShape variant="body" width="40%" />
      </View>
    </>
  )
}

/**
 * R16 (plan, choix 12) : la carte attend son profil. Elle garde son attente à elle, nommée par
 * l'écran (`loadingLabel`, « Chargement… ») plutôt que par `Loading` (ui/Skeleton.tsx), qui dit
 * toujours le même mot : un `progressbar` occupé, autour des formes du nom et du lien.
 */
function PendingName({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      // Occupé : `aria-busy` sur le web (react-native-web ignore accessibilityState), l'état
      // « busy » sur téléphone.
      {...(Platform.OS === 'web' ? { 'aria-busy': true } : { accessibilityState: { busy: true } })}
      style={{ gap: space.xxs }}
    >
      <NameShapes />
    </View>
  )
}

/**
 * R16 (plan, choix 4) : la carte vide d'un membre, pour un écran qui pose la carte avant de rien
 * en connaître (ni photo ni nom) : la même carte de verre, la photo en rond, le nom, le lien et
 * « Modifier » en formes, aux places et aux hauteurs de la vraie carte. Sans rôle ni nom à elle :
 * le `Loading` de l'écran la nomme. (Une carte dont seul le profil manque, elle, reste une
 * `MemberCard` avec `name={null}`.)
 */
export function MemberCardSkeleton(): ReactNode {
  return (
    <Surface variant="glass" radius="panel" padding="lg">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
        <Shape height={PHOTO} width={PHOTO} round />
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 136, minWidth: 0, gap: space.xxs }}>
          <NameShapes />
        </View>
        <Shape height={layout.controlHeight.compact} width={EDIT_WIDTH} round />
      </View>
    </Surface>
  )
}
