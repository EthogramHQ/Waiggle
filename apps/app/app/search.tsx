// Page : la recherche par mots (« /search?q=carn »). L'écran lit lui-même `q` dans l'adresse ; il se
// charge quand on ouvre la page (R18, navigation/lazyScreen.tsx), avec l'attente de la page elle-même
// (`SearchWaiting`, un module léger) : dès 1 280 points, le gabarit large, sans quoi la barre du haut
// rétrécissait (relecture de design R18).
import { lazyScreen } from '../src/navigation/lazyScreen'
import { SearchWaiting } from '../src/screens/SearchWaiting'

const SearchScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.SearchScreen),
  { loading: SearchWaiting },
)

export default function SearchPage() {
  return <SearchScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
