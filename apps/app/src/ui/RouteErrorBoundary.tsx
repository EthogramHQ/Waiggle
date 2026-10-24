// Écran de secours : si une page plante (un contenu inattendu, un bug), Expo Router affiche ceci à
// sa place au lieu d'un écran blanc, et le reste de l'appli continue de fonctionner.
// Usage dans une page : export { RouteErrorBoundary as ErrorBoundary } from '…/RouteErrorBoundary'
import { useTranslation } from 'react-i18next'
import { Screen } from './Screen'
import { StateMessage } from './StateMessage'

type Props = {
  error: Error
  /** Fournie par Expo Router : réaffiche la page. */
  retry: () => Promise<void>
}

export function RouteErrorBoundary({ retry }: Props) {
  const { t } = useTranslation()
  // On n'affiche pas le message de l'erreur : il n'aide pas le membre et peut révéler des détails.
  // L'état remplace toute la page : son titre est celui de la page (niveau 1), comme les autres
  // pages d'état (screens/states.tsx), et le message reste une alerte, lue dès qu'il paraît.
  return (
    <Screen pageTitle={t('common.crashedTitle')}>
      <StateMessage
        kind="error"
        level={1}
        title={t('common.crashedTitle')}
        message={t('common.crashed')}
        actions={[{ label: t('common.retry'), onPress: () => void retry() }]}
      />
    </Screen>
  )
}
