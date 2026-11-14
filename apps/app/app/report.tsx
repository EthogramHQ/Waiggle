// Page : Signaler un contenu (« /report?kind=comment&id=… », tranche 7a). R9 : la page est une
// feuille posée sur la page d'où l'on vient (`sheetRoute` dans _layout.tsx), la feuille « Signaler »
// (src/screens/ReportSheet) ; la refermer revient à cette page. Ici, on lit seulement la sorte et
// l'identifiant de la cible dans l'adresse.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { firstParam } from '../src/navigation/params'
import { HomeScreen } from '../src/screens/HomeScreen'
import { ReportSheet } from '../src/screens/ReportSheet'

export default function ReportPage() {
  const { kind, id } = useLocalSearchParams<{ kind?: string | string[]; id?: string | string[] }>()
  const kindParam = firstParam(kind) ?? ''
  const idParam = firstParam(id) ?? ''
  const router = useRouter()
  // Arrivée par un lien direct, sans page d'avant : rien n'est dessous la feuille transparente. La
  // page pose alors l'accueil. C'est aussi lui qui dit au web que la page est hydratée
  // (ui/Screen.tsx) : sans lui, la feuille, qui attend l'hydratation pour s'ouvrir, ne s'ouvrirait
  // jamais (comme app/suspend.tsx). Toujours l'accueil, jamais la page du contenu : la page est
  // pré-rendue sans ses paramètres, et un projet posé dessous d'après l'adresse différait du HTML
  // pré-rendu (#418, vu dans les captures). « Fermer » mène ensuite au projet ou au profil.
  // Décidé une fois, à l'ouverture.
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <HomeScreen /> : null}
      <ReportSheet kind={kindParam} id={idParam} />
    </>
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
