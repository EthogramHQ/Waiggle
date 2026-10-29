// Les polices livrées avec l'appli. Chaque graisse est un fichier séparé, enregistré sous un nom
// à nous (« FunnelSans-600 ») : c'est ce nom que le composant Text donne à React Native.
// On importe chaque graisse par son propre chemin, pour n'embarquer que celles qu'on utilise.

import { FunnelDisplay_700Bold } from '@expo-google-fonts/funnel-display/700Bold'
import { FunnelSans_400Regular } from '@expo-google-fonts/funnel-sans/400Regular'
import { FunnelSans_500Medium } from '@expo-google-fonts/funnel-sans/500Medium'
import { FunnelSans_600SemiBold } from '@expo-google-fonts/funnel-sans/600SemiBold'
import { FunnelSans_700Bold } from '@expo-google-fonts/funnel-sans/700Bold'
import { FunnelSans_800ExtraBold } from '@expo-google-fonts/funnel-sans/800ExtraBold'
import type { FontFamily, FontWeight } from '@ruche/brand'
import { fontWeights } from '@ruche/brand'
import { Platform } from 'react-native'

// Chaque famille a son préfixe ; le fichier des licences (public/licences-tierces.txt) nomme
// chacune d'elles (un test le vérifie).
export const prefixes: Record<FontFamily, string> = {
  display: 'FunnelDisplay',
  text: 'FunnelSans',
  mono: 'GeistMono',
}

/** Le nom sous lequel une police est enregistrée : fontName('text', 600) → 'FunnelSans-600'. */
export const fontName = (family: FontFamily, weight: FontWeight): string => {
  // Si la graisse demandée n'est pas livrée (un titre en 500, par exemple), on prend la plus proche.
  const shipped: readonly number[] = fontWeights[family]
  const closest = shipped.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
  )
  return `${prefixes[family]}-${closest}`
}

/** Les fichiers à charger au démarrage, par nom. Donné tel quel à useFonts (voir app/_layout.tsx). */
export const fontFiles = {
  'FunnelDisplay-700': FunnelDisplay_700Bold,
  'FunnelSans-400': FunnelSans_400Regular,
  'FunnelSans-500': FunnelSans_500Medium,
  'FunnelSans-600': FunnelSans_600SemiBold,
  'FunnelSans-700': FunnelSans_700Bold,
  'FunnelSans-800': FunnelSans_800ExtraBold,
  // Geist Mono 400 et 500 arrivent ici dès que le paquet @expo-google-fonts/geist-mono est
  // installé (pnpm refuse tout ajout tant qu'une version du verrou a moins de 7 jours) ; d'ici là,
  // monoFont garde la police à chasse fixe du système.
}

/** Police à chasse fixe (toutes les lettres ont la même largeur), pour les prompts et le code. */
export const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
})
