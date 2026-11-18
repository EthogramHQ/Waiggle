// Les polices livrées avec l'appli. Chaque graisse est un fichier séparé, enregistré sous un nom
// à nous (« FunnelSans-600 ») : c'est ce nom que le composant Text donne à React Native.
// On importe chaque graisse par son propre chemin, pour n'embarquer que celles qu'on utilise.
// Le hook useAppFonts, plus bas, les charge : toutes d'emblée sur téléphone ; sur le web, Funnel
// dans la page pré-rendue et Geist Mono après l'hydratation (R13, « Le premier chargement »).

import { FunnelDisplay_700Bold } from '@expo-google-fonts/funnel-display/700Bold'
import { FunnelSans_400Regular } from '@expo-google-fonts/funnel-sans/400Regular'
import { FunnelSans_500Medium } from '@expo-google-fonts/funnel-sans/500Medium'
import { FunnelSans_600SemiBold } from '@expo-google-fonts/funnel-sans/600SemiBold'
import { FunnelSans_700Bold } from '@expo-google-fonts/funnel-sans/700Bold'
import { FunnelSans_800ExtraBold } from '@expo-google-fonts/funnel-sans/800ExtraBold'
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular'
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium'
import type { FontFamily, FontWeight } from '@ruche/brand'
import { fontWeights } from '@ruche/brand'
import { type FontDisplay, loadAsync, useFonts } from 'expo-font'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useHydrated } from './hydration'

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

/**
 * Un fichier de police, et la façon de l'afficher sur le web. `font-display: swap` (R13) : le
 * navigateur écrit le texte tout de suite dans une police du système, puis le redessine dans la
 * police de la marque dès qu'elle est arrivée. Sans cela (`auto`), il pouvait cacher le texte
 * jusqu'à trois secondes. expo-font lit `display` sur le web et l'ignore sur téléphone ; `uri` est
 * le numéro que Metro donne au fichier importé.
 *
 * La valeur de `FontDisplay.SWAP` est écrite en toutes lettres (le typage vérifie qu'elle est la
 * même) : ce module ne lit ainsi d'expo-font que ses deux fonctions de chargement, et les tests qui
 * remplacent expo-font par un simple `useFonts` le chargent encore.
 */
const SWAP = 'swap' satisfies `${FontDisplay.SWAP}` as FontDisplay
const swap = (uri: number) => ({ uri, display: SWAP })

/** Les fichiers des polices, par nom. Chargés par useAppFonts, ci-dessous. */
export const fontFiles = {
  'FunnelDisplay-700': swap(FunnelDisplay_700Bold),
  'FunnelSans-400': swap(FunnelSans_400Regular),
  'FunnelSans-500': swap(FunnelSans_500Medium),
  'FunnelSans-600': swap(FunnelSans_600SemiBold),
  'FunnelSans-700': swap(FunnelSans_700Bold),
  'FunnelSans-800': swap(FunnelSans_800ExtraBold),
  // Geist Mono : seulement les deux graisses de l'échelle (400 pour le code, 500 pour les
  // étiquettes), pour ne pas alourdir l'appli.
  'GeistMono-400': swap(GeistMono_400Regular),
  'GeistMono-500': swap(GeistMono_500Medium),
}

type FontKey = keyof typeof fontFiles
const pick = (keep: (name: FontKey) => boolean) =>
  Object.fromEntries(
    (Object.keys(fontFiles) as FontKey[]).filter(keep).map((name) => [name, fontFiles[name]]),
  )
// Funnel, la police du premier écran (titres et texte), et Geist Mono, la chasse fixe (~200 Ko
// pour ses deux graisses, autant que les six de Funnel réunies).
const brandFiles = pick((name) => !name.startsWith(prefixes.mono))
const monoFiles = pick((name) => name.startsWith(prefixes.mono))

/**
 * Hook : charge les polices de l'appli, et dit si celles du lancement sont prêtes.
 *
 * - **Sur téléphone**, les huit polices d'emblée : rien n'est pré-rendu, l'écran du lancement les
 *   attend toutes (app/_layout.tsx), pour qu'aucune étiquette ne change de police sous les yeux.
 * - **Sur le web**, la page est pré-rendue : chaque police demandée pendant ce rendu y est déclarée
 *   (`@font-face`) et préchargée (`<link rel="preload">`, que le navigateur télécharge avant tout).
 *   On n'y demande que Funnel. Geist Mono ne se demande qu'une fois la page hydratée, dans un
 *   effet (useEffect ne tourne jamais au pré-rendu) : ni déclarée ni préchargée dans le HTML, elle
 *   ne retarde pas le premier écran ; d'ici là, ses textes s'écrivent en `monospace` (fontStack).
 *
 * Le web n'attend rien de ce hook (sa valeur ne sert qu'au téléphone).
 */
export function useAppFonts(): boolean {
  // Lu à chaque appel, pas une fois au chargement du module : les tests changent la plateforme.
  const isWeb = Platform.OS === 'web'
  const hydrated = useHydrated()
  // useFonts ne lit sa liste qu'au premier rendu : elle ne change jamais pour un même appareil.
  const [loaded] = useFonts(isWeb ? brandFiles : fontFiles)
  useEffect(() => {
    if (!isWeb || !hydrated) return
    // Une police qui n'arrive pas (réseau coupé, douze secondes dépassées) n'est pas une panne :
    // le texte reste dans la chasse fixe du système. Tout échec, même immédiat (lancé avant toute
    // promesse), finit donc dans le `catch`, jamais en erreur qui ferait tomber la page.
    Promise.resolve()
      .then(() => loadAsync(monoFiles))
      .catch(() => {})
  }, [isWeb, hydrated])
  return loaded
}

// Sur le web, en dernier, la famille du système qui remplace la police de la marque tant qu'elle
// n'est pas arrivée, si même sa police de secours calibrée manque (R13) : sans empattement pour
// Funnel, à chasse fixe pour Geist Mono. Sans elle, le navigateur prendrait sa police par défaut,
// souvent à empattements (Times).
const genericFamilies: Record<FontFamily, string> = {
  display: 'sans-serif',
  text: 'sans-serif',
  mono: 'monospace',
}

/**
 * La valeur de `fontFamily` d'un texte : sur le web,
 * `'FunnelSans-600, FunnelSans-600-fallback, sans-serif'` ; sur téléphone, le nom seul,
 * `'FunnelSans-600'` (une liste n'y veut rien dire et casserait la police). `name` est le nom
 * d'une police livrée (fontName).
 *
 * Sur le web, la liste se lit dans l'ordre (R16, « La page ne bouge plus en arrivant ») : la police
 * de la marque si elle est arrivée ; sinon sa police de secours calibrée, une police du système
 * réglée à sa largeur et à ses hauteurs (ui/theme/fontFallback.ts, posée par app/+html.tsx), pour
 * que rien ne bouge quand la marque arrive ; sinon la famille du système, seule.
 */
export const fontStack = (family: FontFamily, name: string): string =>
  Platform.OS === 'web' ? `${name}, ${name}-fallback, ${genericFamilies[family]}` : name

/**
 * Police à chasse fixe (toutes les lettres ont la même largeur), pour les prompts et le code
 * (le Markdown des membres) : Geist Mono, comme les rôles `mono` et `code` de Text. Une valeur de
 * `fontFamily`, donc suivie de `monospace` sur le web (Geist Mono y arrive après l'hydratation).
 */
export const monoFont = fontStack('mono', fontName('mono', 400))
