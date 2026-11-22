// Page : inviter dans une ruche (« /hives/<id>/invite », R10). La page est une feuille posée sur la
// page de la ruche (`sheetRoute` dans _layout.tsx) : la feuille « Inviter dans Famille »
// (src/screens/HiveInviteSheet). On y arrive par « Inviter », sur la page de la ruche. Feuille et
// page de la ruche se chargent à la demande, dans le même morceau (R18, chunks/hives.ts).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { lazyScreen } from '../../../src/navigation/lazyScreen'
import { firstParam } from '../../../src/navigation/params'

// La feuille : rien ne s'affiche pendant son morceau, la page d'avant reste visible dessous.
const HiveInviteSheet = lazyScreen(
  () => import('../../../src/navigation/chunks/hives').then((m) => m.HiveInviteSheet),
  { sheet: true },
)
// La page de la ruche, posée dessous seulement si l'on arrive par un lien direct.
const HiveScreen = lazyScreen(
  () => import('../../../src/navigation/chunks/hives').then((m) => m.HiveScreen),
  { shape: 'project' },
)

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

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
