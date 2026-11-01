// Page : la recherche par mots (« /search?q=carn »). L'écran lit lui-même `q` dans l'adresse.
import { SearchScreen } from '../src/screens/SearchScreen'

export default SearchScreen

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
