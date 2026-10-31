// La photo de profil d'un membre, en rond. Sans photo : deux initiales sur un rond de miel (Miel 2,
// tranche R1), en graisse très forte (`initialsWeight`).
// La photo vient de l'API et n'est montrée qu'aux membres : l'écran donne une `source` toute prête
// (adresse et session, voir src/api/media.ts).
import { initialsWeight, type TextVariant } from '@ruche/brand'
import { useState } from 'react'
import { Image, type LayoutChangeEvent, Platform, View } from 'react-native'
import type { ImageSource } from './image'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = { name: string; source: ImageSource | null; label: string; size?: number }

/**
 * Les deux initiales d'un nom : la première lettre du premier mot et celle du dernier (« Léa
 * Martin » → « LM »), ou les deux premières lettres d'un mot seul (« Papi » → « PA »).
 * Array.from découpe le texte lettre par lettre sans couper une lettre accentuée ni un emoji en
 * deux (un emoji compte pour deux unités dans une chaîne JavaScript).
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]
  if (!first) return '?'
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const letters = last ? [Array.from(first)[0], Array.from(last)[0]] : Array.from(first).slice(0, 2)
  // toLocaleUpperCase : « é » devient « É », selon les règles de la langue.
  return letters.join('').toLocaleUpperCase()
}

export function Avatar({ name, source, label, size = 96 }: Props) {
  const { colors } = useTheme()
  const round = { width: size, height: size, borderRadius: size / 2 }
  if (source) {
    // accessibilityLabel : ce que les lecteurs d'écran annoncent à la place de l'image.
    return (
      <Image
        accessibilityLabel={label}
        source={source}
        style={{ ...round, backgroundColor: colors.honeySoft }}
      />
    )
  }
  return (
    <View
      accessible
      // Un rôle d'image : sur le web, le navigateur ignore le nom d'un bloc qui n'en a pas.
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        ...round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.honey,
        // Filet de sécurité : rien ne dépasse du rond, même avant la première mesure (web).
        overflow: 'hidden',
      }}
    >
      <Initials name={name} size={size} />
    </View>
  )
}

/**
 * La part du diamètre que les initiales peuvent occuper en largeur : un peu plus que le côté du
 * carré inscrit dans le cercle (0,707), car deux capitales sont plus larges que hautes.
 */
export const INITIALS_ROOM = 0.72

/** Une variante de texte proportionnée au rond : sa taille suit le diamètre, pas l'inverse. */
const variantFor = (size: number): TextVariant =>
  size >= 72 ? 'title1' : size >= 40 ? 'headline' : size >= 28 ? 'caption' : 'micro'

type Size = { width: number; height: number }

/**
 * Le facteur qui fait tenir des initiales de cette taille naturelle dans un rond de ce diamètre :
 * 1 si elles y tiennent, moins sinon (jamais plus : on ne grossit pas des initiales déjà lisibles).
 */
export const initialsScale = (natural: Size | null, size: number): number => {
  if (!natural || natural.width <= 0 || natural.height <= 0) return 1
  return Math.min(1, (size * INITIALS_ROOM) / natural.width, size / natural.height)
}

/**
 * Les initiales, qui tiennent toujours dans leur rond (relecture de design de R3, 11 : « MD »
 * faisait 123 px de large dans un rond de 96 avec le texte à 200 %, et 21 px dans le rond de 20 de
 * la carte d'un testeur, déjà à 100 %).
 * - Sur téléphone, `maxScale={1}` les empêche de suivre la taille de texte de l'appareil.
 * - Sur le web, ce réglage n'existe pas : un navigateur réglé en grand texte les grossit sans que
 *   l'appli le sache. On les mesure donc à leur taille naturelle (`onLayout`), puis on les réduit à
 *   l'œil (`transform: scale`) juste assez pour tenir dans le rond, comme les libellés de la barre
 *   d'onglets (TabBar). La mesure ignore la réduction (elle lit la mise en page, pas l'image) : pas
 *   de boucle. Pour garder leur largeur naturelle même plus larges que le rond, elles sont posées
 *   dans une boîte de largeur nulle centrée, d'où elles débordent également des deux côtés.
 * Le même calcul sert sur les deux : sur téléphone, il rattrape une variante un peu large pour un
 * très petit rond.
 */
function Initials({ name, size }: { name: string; size: number }) {
  const [natural, setNatural] = useState<Size | null>(null)
  const scale = initialsScale(natural, size)
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    // Le même objet quand rien ne change : pas de rendu de plus.
    setNatural((old) =>
      old && old.width === width && old.height === height ? old : { width, height },
    )
  }
  return (
    <View
      style={{
        ...(Platform.OS === 'web' ? { width: 0 } : null),
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      <View onLayout={measure}>
        <Text variant={variantFor(size)} weight={initialsWeight} tone="onHoney" maxScale={1}>
          {initialsOf(name)}
        </Text>
      </View>
    </View>
  )
}
