// Page : créer une ruche (« /hives/new », R10). La page est une feuille posée sur l'onglet Ruches
// (`sheetRoute` dans _layout.tsx) : la feuille « Créer une ruche » (src/screens/HiveCreateSheet). Le
// nom du fichier, `new`, passe avant `[id]` : Expo Router préfère une adresse fixe à une variable.
// Feuille et onglet Ruches se chargent à la demande, dans le même morceau (R18, chunks/hives.ts).
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { lazyScreen } from '../../src/navigation/lazyScreen'

// La feuille : rien ne s'affiche pendant son morceau, la page d'avant reste visible dessous.
const HiveCreateSheet = lazyScreen(
  () => import('../../src/navigation/chunks/hives').then((m) => m.HiveCreateSheet),
  { sheet: true },
)
// L'onglet Ruches, posé dessous seulement si l'on arrive par un lien direct.
const HivesScreen = lazyScreen(
  () => import('../../src/navigation/chunks/hives').then((m) => m.HivesScreen),
  { shape: 'list' },
)

export default function HiveCreatePage() {
  const router = useRouter()
  // Arrivée par un lien direct, sans page d'avant : rien n'est dessous la feuille transparente. La
  // page pose alors l'onglet Ruches (comme `/suspend` pose la page du membre). C'est aussi lui qui
  // dit au web que la page est hydratée (ui/Screen.tsx) : sans lui, la feuille, qui attend
  // l'hydratation pour s'ouvrir, ne s'ouvrirait jamais. Décidé une fois, à l'ouverture.
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <HivesScreen /> : null}
      <HiveCreateSheet />
    </>
  )
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
