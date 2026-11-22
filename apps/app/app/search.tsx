// Page : la recherche par mots (« /search?q=carn »). L'écran lit lui-même `q` dans l'adresse ; il se
// charge quand on ouvre la page (R18, navigation/lazyScreen.tsx), avec un squelette de liste.
import { lazyScreen } from '../src/navigation/lazyScreen'

const SearchScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.SearchScreen),
  { shape: 'list', width: 'page' },
)

export default function SearchPage() {
  return <SearchScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
