// Page : Suspendre un compte, ou lever sa suspension (« /suspend?member=…&fromKind=…&fromId=… »,
// tranche 7c), réservée aux administrateurs. R9 : la page est une feuille posée sur la page d'où
// l'on vient (`sheetRoute` dans _layout.tsx), la fenêtre « Suspendre » (src/moderation/SuspendSheet) ;
// la refermer revient à cette page (le membre par défaut). Ici, on lit le membre visé, ce que la
// file sait de lui (le sous-titre de la fenêtre) et, si l'on vient d'une carte de la file, le
// signalement d'où l'on part, vérifié par le schéma du contrat avant d'être envoyé.
import { ReportTarget } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useMemberSession } from '../src/accounts/session'
import { useQueueAuthor } from '../src/moderation/api'
import { lazyScreen } from '../src/navigation/lazyScreen'
import { firstParam } from '../src/navigation/params'
import { useRouteSheet } from '../src/navigation/useRouteSheet'
import { MemberScreen } from '../src/screens/MemberScreen'
import { useHydrated } from '../src/ui/theme/hydration'

// La fenêtre « Suspendre », réservée aux administrateurs, se charge quand on l'ouvre, pas avec
// l'accueil (R13, navigation/lazyScreen.tsx). Elle n'est posée qu'une fois la page hydratée (elle
// ne s'ouvre pas avant, `useRouteSheet`) : pendant son morceau, rien ne s'affiche à sa place, et la
// page d'en dessous (celle d'avant, ou celle du membre) reste visible.
const SuspendSheet = lazyScreen(
  () => import('../src/navigation/chunks/moderation').then((m) => m.SuspendSheet),
  { sheet: true },
)

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
  // Le sous-titre de la fenêtre (« @sam · inscription le … · déjà décidé : … ») vient de ce que la
  // file sait du membre : la file déjà lue en dessous, ou lue pour la fenêtre (lien direct, page du
  // membre), dans le navigateur et avec une session seulement (R9, C10). Sans carte qui le vise, la
  // fenêtre montre son pseudo seul.
  const { session } = useMemberSession()
  const hydrated = useHydrated()
  const author = useQueueAuthor(memberId, hydrated && Boolean(session))
  return (
    <>
      {alone ? <MemberScreen id={memberId} /> : null}
      {hydrated ? (
        <SuspendSheet
          memberId={memberId}
          open={sheet.open}
          onClose={sheet.close}
          {...(parsed.success ? { fromReport: parsed.data } : null)}
          {...(author ? { author } : null)}
        />
      ) : null}
    </>
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
