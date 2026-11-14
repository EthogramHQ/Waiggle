// Page : Signaler un contenu (« /report?kind=comment&id=… », tranche 7a). R9 : la page est une
// feuille posée sur la page d'où l'on vient (`sheetRoute` dans _layout.tsx), la feuille « Signaler »
// (src/screens/ReportSheet) ; la refermer revient à cette page. Ici, on lit seulement la sorte et
// l'identifiant de la cible dans l'adresse.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { firstParam } from '../src/navigation/params'
import { HomeScreen } from '../src/screens/HomeScreen'
import { MemberScreen } from '../src/screens/MemberScreen'
import { ProjectScreen } from '../src/screens/ProjectScreen'
import { ReportSheet } from '../src/screens/ReportSheet'

export default function ReportPage() {
  const { kind, id } = useLocalSearchParams<{ kind?: string | string[]; id?: string | string[] }>()
  const kindParam = firstParam(kind) ?? ''
  const idParam = firstParam(id) ?? ''
  const router = useRouter()
  // Arrivée par un lien direct, sans page d'avant : rien n'est dessous la feuille transparente. La
  // page pose alors celle du contenu quand l'adresse la nomme (un projet, un profil), sinon
  // l'accueil. C'est aussi elle qui dit au web que la page est hydratée (ui/Screen.tsx) : sans
  // elle, la feuille, qui attend l'hydratation pour s'ouvrir, ne s'ouvrirait jamais (comme
  // app/suspend.tsx). Décidé une fois, à l'ouverture.
  const [alone] = useState(() => !router.canGoBack())
  const below = !alone ? null : kindParam === 'project' ? (
    <ProjectScreen id={idParam} />
  ) : kindParam === 'member' ? (
    <MemberScreen id={idParam} />
  ) : (
    <HomeScreen />
  )
  return (
    <>
      {below}
      <ReportSheet kind={kindParam} id={idParam} />
    </>
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
