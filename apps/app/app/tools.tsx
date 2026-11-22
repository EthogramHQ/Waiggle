// Page : « Tous les outils » (« /tools », tranche R3) : les outils des projets publics, de A à Z.
// L'écran se charge quand on ouvre la page (R18, navigation/lazyScreen.tsx), avec un squelette de
// liste, au gabarit large de la page (relecture de design R18 : plus étroit, il faisait rétrécir la
// barre du haut sur ordinateur). L'attente propre de l'écran n'est pas reprise ici : elle est faite
// du catalogue lui-même (`Catalogue` de ToolsScreen), qui ramènerait presque tout l'écran dans le
// script de départ.
import { lazyScreen } from '../src/navigation/lazyScreen'

const ToolsScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.ToolsScreen),
  { shape: 'list', width: 'wide' },
)

export default function ToolsPage() {
  return <ToolsScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
