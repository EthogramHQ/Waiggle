// La photo de profil en tête de la feuille « Mon profil » (tranche R2) : la photo du membre, floutée,
// en bandeau ; par-dessus, la même photo nette dans un anneau de verre ; et le bouton « Changer la
// photo », en verre, qui chevauche le bas de l'anneau. Sans photo : un bandeau de miel pâle et les
// initiales (Avatar).
import { borders, radii, space } from '@ruche/brand'
import { Image, View } from 'react-native'
import { Avatar } from './Avatar'
import { Button } from './Button'
import type { ImageSource } from './image'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  name: string
  source: ImageSource | null
  /** Ce que les lecteurs d'écran annoncent pour la photo (« Photo de profil »). */
  label: string
  /** « Changer la photo » ; absent, pas de bouton (un profil qu'on ne peut pas modifier). */
  action?: { label: string; onPress: () => void; loading?: boolean }
}

/** Le diamètre de la photo nette, et l'épaisseur de l'anneau de verre autour. */
const AVATAR = 112
const RING = space.sm
/** La hauteur du bandeau flouté : la photo dans son anneau y tient, avec de l'air autour. */
const BAND = AVATAR + 2 * RING + 2 * space.xl
/** Le flou de la photo du bandeau : assez fort pour qu'on n'y lise plus rien, que des couleurs. */
const BLUR = 28

export function AvatarCover({ name, source, label, action }: Props) {
  const { colors } = useTheme()
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: '100%',
          height: BAND,
          borderRadius: radii.tile,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.honeySoft,
        }}
      >
        {source ? (
          // Le flou, un décor : caché aux lecteurs d'écran (la photo nette, elle, a son nom).
          // Agrandie un peu (scale) : le flou laisse sinon un bord clair sur les côtés.
          <Image
            source={source}
            blurRadius={BLUR}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              transform: [{ scale: 1.3 }],
            }}
          />
        ) : null}
        {/* L'anneau de verre : un rond de verre clair, bordé, qui détache la photo du flou. */}
        <View
          style={{
            padding: RING,
            borderRadius: radii.pill,
            backgroundColor: colors.glass,
            borderWidth: borders.hairline,
            borderColor: colors.glassBorder,
          }}
        >
          <Avatar name={name} source={source} label={label} size={AVATAR} />
        </View>
      </View>
      {action ? (
        // Le bouton remonte sur le bas du bandeau (marge négative) : il chevauche l'anneau, comme
        // un badge posé sur la photo. Il reste entier et touchable (44 points).
        <View style={{ marginTop: -(space.xl + space.md), maxWidth: '100%', flexShrink: 1 }}>
          <Button
            label={action.label}
            variant="glass"
            size="compact"
            icon="camera"
            onPress={action.onPress}
            loading={action.loading ?? false}
          />
        </View>
      ) : null}
    </View>
  )
}
