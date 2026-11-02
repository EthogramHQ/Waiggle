// L'hôte de la lumière d'ambiance (tranche RF, le web) : posé une seule fois, autour de la pile des
// pages (app/_layout.tsx), il dessine **une** lumière derrière toutes les pages, sur le fond de
// l'appli. Elle ne s'éteint plus et ne repart plus de zéro d'une page à l'autre : elle glisse vers
// la source de la page affichée (theme/ambient.tsx, le registre des écrans).
//
// Pourquoi sur le web seulement : sur iOS et Android, la pile native fait glisser la nouvelle page
// par-dessus l'ancienne ; avec des pages transparentes, on verrait l'une à travers l'autre pendant
// le glissement. Là-bas, chaque écran garde sa propre lumière (ui/Screen.tsx).
//
// Même idée que TabBarHost (ui/TabBar.tsx) : un cadre posé une fois, qui rend un service aux écrans
// par un contexte, et un hook pour savoir s'il est là (useHasAmbientHost).
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { AmbientLight } from './AmbientLight'
import { AmbientHostProvider } from './theme/ambient'
import { useTheme } from './theme/ThemeProvider'

/**
 * Le style des pages de la pile autour de l'hôte (`contentStyle` du `Stack` d'Expo Router) :
 * transparent, pour que la lumière posée dessous se voie à travers. C'est l'hôte qui pose le fond
 * de l'appli (ui-15 : la mise en page n'écrit aucune couleur).
 */
export const ambientStackStyle = { backgroundColor: 'transparent' } as const

/**
 * L'hôte : le fond de l'appli (`colors.background`), la lumière commune par-dessus, puis la pile.
 * La lumière lit la source de l'écran retenu par le registre (useAmbientSource) ; aucun écran
 * affiché ne veut de lumière (le miel) : elle reçoit `null` et `lit` faux, et s'efface.
 */
export function AmbientHost({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <AmbientHostProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* La lumière se place elle-même sur tout le cadre (StyleSheet.absoluteFill), muette pour
            les lecteurs d'écran, et laisse passer les touchers. Posée avant la pile, elle est
            peinte dessous. */}
        <AmbientLight />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </AmbientHostProvider>
  )
}
