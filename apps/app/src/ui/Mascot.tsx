// La mascotte de l'appli (refonte, tranche R1) : l'abeille, dans l'une de ses quatre poses, posée
// sur un disque de verre. Elle accompagne les états de l'appli : la loupe pour « introuvable », le
// sommeil pour « rien de nouveau », le salut pour « réservé aux membres », le vol pour « regarde
// ta boîte e-mail ».
// - Seule (l'écran « Vérifie ta boîte », la fin du fil), elle est une image nommée d'après sa pose.
// - À côté d'un texte qui dit déjà tout (un titre d'état, un toast), elle est `decorative` : un
//   décor muet, caché aux lecteurs d'écran, qui sinon liraient deux fois la même chose (J10).
// Les images sont fabriquées par scripts/images.mts (assets/mascot/*.png, sans métadonnées).
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Surface } from './Surface'

export type MascotPose = 'fly' | 'wave' | 'sleep' | 'search'

/**
 * Les tailles de la mascotte, en points : `inline` devant un texte (un toast), sans disque ; les
 * autres sur leur disque de verre, de la petite (un état dans une page) à la grande (un écran de
 * marque).
 */
export type MascotSize = 'inline' | 'sm' | 'md' | 'lg'
const sizes: Record<MascotSize, number> = { inline: 28, sm: 96, md: 144, lg: 200 }

/**
 * Les fichiers des poses. `require` d'une image : Metro (le constructeur de l'appli) la copie avec
 * l'appli et donne à la place un identifiant qu'Image sait afficher, sur téléphone comme sur le web.
 */
const sources: Record<MascotPose, number> = {
  fly: require('../../assets/mascot/fly.png'),
  wave: require('../../assets/mascot/wave.png'),
  sleep: require('../../assets/mascot/sleep.png'),
  search: require('../../assets/mascot/search.png'),
}

/** La part du disque occupée par l'abeille : le reste est la marge du verre autour d'elle. */
const BEE_IN_DISC = 0.72

type Props = {
  pose: MascotPose
  size?: MascotSize
  /** Cachée aux lecteurs d'écran, quand le texte voisin dit déjà tout. */
  decorative?: boolean
}

export function Mascot({ pose, size = 'md', decorative = false }: Props) {
  const { t } = useTranslation()
  const side = sizes[size]
  const inline = size === 'inline'
  const bee = (
    <Image
      source={sources[pose]}
      // contain : la pose garde ses proportions (le vol est plus large que haut) dans le carré.
      contentFit="contain"
      style={{
        width: inline ? side : side * BEE_IN_DISC,
        height: inline ? side : side * BEE_IN_DISC,
      }}
      // L'image elle-même est muette : c'est la vue qui l'entoure qui porte le nom.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    />
  )
  return (
    <View
      // Un seul élément pour les lecteurs d'écran : une image, avec un nom. Décorative, elle garde
      // son rôle et son nom (un test la retrouve), mais elle est cachée aux lecteurs d'écran.
      accessible
      role="img"
      accessibilityLabel={t(($) => $.mascot[pose])}
      {...(decorative
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
            'aria-hidden': true,
          }
        : null)}
      // Centrée dans son parent : une Surface qui ne s'étire pas se range sinon à gauche.
      style={{ alignSelf: 'center' }}
    >
      {inline ? (
        bee
      ) : (
        <Surface variant="glass" radius="pill" fill={false}>
          <View
            style={{ width: side, height: side, alignItems: 'center', justifyContent: 'center' }}
          >
            {bee}
          </View>
        </Surface>
      )}
    </View>
  )
}
