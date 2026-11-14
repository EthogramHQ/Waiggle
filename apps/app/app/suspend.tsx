// Page : Suspendre un compte, ou lever sa suspension (« /suspend?member=…&fromKind=…&fromId=… »,
// tranche 7c), réservée aux administrateurs. R9 : la page ouvre la fenêtre « Suspendre »
// (src/moderation/SuspendSheet) ; la refermer revient à la page d'où l'on vient (le membre par
// défaut). Ici, on lit seulement le membre visé et, si l'on vient d'une carte de la file, le
// signalement d'où l'on part, vérifié par le schéma du contrat avant d'être envoyé.
import { ReportTarget } from '@ruche/contracts'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { SuspendSheet } from '../src/moderation/SuspendSheet'
import { firstParam } from '../src/navigation/params'
import { useGoBack } from '../src/navigation/useGoBack'
import { useHydrated } from '../src/ui/theme/hydration'

export default function SuspendPage() {
  const { member, fromKind, fromId } = useLocalSearchParams<{
    member?: string | string[]
    fromKind?: string | string[]
    fromId?: string | string[]
  }>()
  const memberId = firstParam(member) ?? ''
  const back = useGoBack({ pathname: '/members/[id]', params: { id: memberId } })
  // Fermée, la fenêtre part d'abord (son fondu), puis la page revient en arrière.
  const [open, setOpen] = useState(true)
  // La page est pré-rendue sans connaître le visiteur ni l'adresse : la fenêtre ne s'ouvre qu'une
  // fois dans le navigateur, sinon React signale un écart avec le pré-rendu (#418).
  const hydrated = useHydrated()
  const parsed = ReportTarget.safeParse({ kind: firstParam(fromKind), id: firstParam(fromId) })
  return (
    <SuspendSheet
      memberId={memberId}
      open={open && hydrated}
      onClose={() => {
        setOpen(false)
        back()
      }}
      {...(parsed.success ? { fromReport: parsed.data } : null)}
    />
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
