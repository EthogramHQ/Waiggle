// Page : la feuille « Ton retour » des Éclaireuses (« /scout-report?from=<chemin> », R20). Une
// feuille posée sur la page d'où l'on vient (`sheetRoutes`) : la Goutte l'ouvre avec le chemin de
// cette page (`from`), et « Répondre », sur la page des missions, avec la mission (`mission`). La
// feuille lit elle-même ces paramètres (src/scout/ScoutReportSheet).
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { lazyScreen } from '../src/navigation/lazyScreen'
import { ShowcaseScreen } from '../src/screens/ShowcaseScreen'

// La feuille ne s'ouvre qu'au toucher de la Goutte : elle se charge à ce moment-là, dans le morceau
// des Éclaireuses, pas avec l'accueil. Pendant son morceau, rien ne s'affiche à sa place et la page
// d'avant reste visible (`sheet`).
const ScoutReportSheet = lazyScreen(
  () => import('../src/navigation/chunks/scout').then((m) => m.ScoutReportSheet),
  { sheet: true },
)

export default function ScoutReportPage() {
  const router = useRouter()
  // Arrivée par un lien direct, sans page d'avant : rien n'est dessous la feuille transparente. La
  // page pose alors l'accueil, qui dit aussi au web que la page est hydratée (ui/Screen.tsx) ; sans
  // lui, la feuille, qui attend l'hydratation pour s'ouvrir, ne s'ouvrirait jamais (comme
  // app/report.tsx). Décidé une fois, à l'ouverture.
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <ShowcaseScreen /> : null}
      <ScoutReportSheet />
    </>
  )
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
