// Page : Suspendre un compte, ou lever sa suspension (« /suspend?member=…&fromKind=…&fromId=… »,
// tranche 7c), réservée aux administrateurs. R9 : la page est une feuille posée sur la page d'où
// l'on vient (`sheetRoute` dans _layout.tsx), la fenêtre « Suspendre » (src/moderation/SuspendSheet) ;
// la refermer revient à cette page (le membre par défaut). Ici, on lit seulement le membre visé et,
// si l'on vient d'une carte de la file, le signalement d'où l'on part, vérifié par le schéma du
// contrat avant d'être envoyé.
import { ReportTarget } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { SuspendSheet } from '../src/moderation/SuspendSheet'
import { firstParam } from '../src/navigation/params'
import { useRouteSheet } from '../src/navigation/useRouteSheet'
import { MemberScreen } from '../src/screens/MemberScreen'

export default function SuspendPage() {
  const { member, fromKind, fromId } = useLocalSearchParams<{
    member?: string | string[]
    fromKind?: string | string[]
    fromId?: string | string[]
  }>()
  const memberId = firstParam(member) ?? ''
  const router = useRouter()
  // Arrivée par un lien direct, sans page d'avant : rien n'est dessous la fenêtre transparente. La
  // page pose alors celle du membre (comme la feuille « Nouvelle mise à jour » pose son projet).
  // C'est aussi elle qui dit au web que la page est hydratée (ui/Screen.tsx) : sans elle, la
  // feuille, qui attend l'hydratation pour s'ouvrir, ne s'ouvrait jamais (page vide, R9).
  const [alone] = useState(() => !router.canGoBack())
  // Ouverte une fois la page hydratée et tant que l'adresse est la sienne ; fermée, elle revient à
  // la page d'avant, ou à celle du membre.
  const sheet = useRouteSheet({ pathname: '/members/[id]', params: { id: memberId } })
  const parsed = ReportTarget.safeParse({ kind: firstParam(fromKind), id: firstParam(fromId) })
  return (
    <>
      {alone ? <MemberScreen id={memberId} /> : null}
      <SuspendSheet
        memberId={memberId}
        open={sheet.open}
        onClose={sheet.close}
        {...(parsed.success ? { fromReport: parsed.data } : null)}
      />
    </>
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
