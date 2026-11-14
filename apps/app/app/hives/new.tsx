// Page : créer une ruche (« /hives/new », R10). La page est une feuille posée sur l'onglet Ruches
// (`sheetRoute` dans _layout.tsx) : la feuille « Créer une ruche » (src/screens/HiveCreateSheet). Le
// nom du fichier, `new`, passe avant `[id]` : Expo Router préfère une adresse fixe à une variable.
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { HiveCreateSheet } from '../../src/screens/HiveCreateSheet'
import { HivesScreen } from '../../src/screens/HivesScreen'

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

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
