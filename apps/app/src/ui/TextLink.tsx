// Un lien en texte souligné, pour une action secondaire dans une phrase ou sous un formulaire
// (« Créer un compte », « Changer d'adresse »). Pour l'action principale : un Button.
import { layout } from '@ruche/brand'
import type { Ref } from 'react'
import { Platform, Pressable, type View } from 'react-native'
import { describedBy } from './aria'
import { enterActivates } from './keyboard'
import { Text, type Tone } from './Text'

type Props = {
  label: string
  onPress: () => void
  tone?: Tone
  /** link : mène ailleurs (une autre page) ; button : agit sur place. */
  role?: 'link' | 'button'
  /**
   * Indisponible pour l'instant (« Annuler » pendant un envoi) : il pâlit, ne réagit plus, et les
   * lecteurs d'écran l'annoncent comme désactivé (aria-disabled).
   */
  disabled?: boolean
  /**
   * Le texte (caché) qui précise où mène le lien, quand plusieurs liens portent le même nom
   * (« Voir » sur chaque carte de la modération) : relié par aria-describedby sur le web.
   */
  describedById?: string | undefined
  /** La même précision sur téléphone, où aria-describedby n'existe pas : un indice lu après le nom. */
  hint?: string | undefined
  /** Pour y poser le focus du clavier quand l'élément qui l'avait disparaît (voir focus.ts). */
  ref?: Ref<View>
  /**
   * Un bouton qui déplie ou replie quelque chose sur place (« Afficher tout » d'une copie, 7b) :
   * les lecteurs d'écran annoncent « replié » ou « déplié » (aria-expanded, web et téléphone).
   */
  expanded?: boolean
  /**
   * Le libellé peut se couper n'importe où : pour une donnée sans espace (une adresse e-mail), qui
   * sortirait sinon du cadre sur un petit téléphone, à 200 % de texte (bandeau de suspension, 7c).
   */
  breakAnywhere?: boolean
}

export function TextLink({
  label,
  onPress,
  tone = 'default',
  role = 'link',
  disabled = false,
  describedById,
  hint,
  ref,
  expanded,
  breakAnywhere = false,
}: Props) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole={role}
      accessibilityLabel={label}
      {...(expanded === undefined ? null : { 'aria-expanded': expanded })}
      {...describedBy(describedById)}
      // Sur le web, aria-describedby suffit ; ailleurs, l'indice joue ce rôle (comme IconButton).
      accessibilityHint={Platform.OS === 'web' ? undefined : hint}
      aria-disabled={disabled}
      disabled={disabled}
      // Un lien s'ouvre avec Entrée sur le web (react-native-web ne le fait que pour un bouton).
      {...(role === 'link' ? enterActivates(onPress, disabled) : null)}
      onPress={onPress}
      // La zone à toucher fait au moins 44 points de côté, même autour d'un mot court. (hitSlop, qui
      // agrandit la zone sans changer l'allure, est ignoré sur le web : on donne donc une vraie taille.)
      style={({ pressed }) => ({
        minHeight: layout.touchTarget,
        minWidth: layout.touchTarget,
        justifyContent: 'center',
        // Sur le web, react-native-web interdit à toute vue de rétrécir (flexShrink 0) : sans ces
        // deux réglages, le lien garderait la largeur de son libellé entier et sortirait du cadre.
        ...(breakAnywhere ? { flexShrink: 1, maxWidth: '100%' as const } : null),
        opacity: disabled ? 0.55 : pressed ? 0.6 : 1,
      })}
    >
      <Text variant="callout" weight={700} tone={tone} underline breakAnywhere={breakAnywhere}>
        {label}
      </Text>
    </Pressable>
  )
}
