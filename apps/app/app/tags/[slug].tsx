// Page : une étiquette (« /tags/claude-code »), les projets publics faits avec cet outil.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../src/navigation/params'
import { TagScreen } from '../../src/screens/TagScreen'

export default function TagPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <TagScreen slug={firstParam(slug) ?? ''} />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
