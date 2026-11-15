// Page : inviter dans une ruche (« /hives/<id>/invite », R10). La page est une feuille posée sur la
// page de la ruche (`sheetRoute` dans _layout.tsx) : la feuille « Inviter dans Famille »
// (src/screens/HiveInviteSheet). On y arrive par « Inviter », sur la page de la ruche.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { firstParam } from '../../../src/navigation/params'
import { HiveInviteSheet } from '../../../src/screens/HiveInviteSheet'
import { HiveScreen } from '../../../src/screens/HiveScreen'

export default function HiveInvitePage() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const hiveId = firstParam(id) ?? ''
  // Arrivée par un lien direct, sans page d'avant : rien n'est dessous la feuille transparente. La
  // page pose alors la page de la ruche (comme `/hives/new` pose l'onglet Ruches). C'est aussi elle
  // qui dit au web que la page est hydratée (ui/Screen.tsx) : sans elle, la feuille, qui attend
  // l'hydratation pour s'ouvrir, ne s'ouvrirait jamais. Décidé une fois, à l'ouverture.
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <HiveScreen id={hiveId} /> : null}
      <HiveInviteSheet id={hiveId} />
    </>
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
