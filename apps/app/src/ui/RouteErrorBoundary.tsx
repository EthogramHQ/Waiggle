// Écran de secours : si une page plante (un contenu inattendu, un bug), Expo Router affiche ceci à
// sa place au lieu d'un écran blanc, et le reste de l'appli continue de fonctionner.
// Usage dans une page : export { RouteErrorBoundary as ErrorBoundary } from '…/RouteErrorBoundary'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Notice } from './Notice'
import { Screen } from './Screen'

type Props = {
  error: Error
  /** Fournie par Expo Router : réaffiche la page. */
  retry: () => Promise<void>
}

export function RouteErrorBoundary({ retry }: Props) {
  const { t } = useTranslation()
  // On n'affiche pas le message de l'erreur : il n'aide pas le membre et peut révéler des détails.
  return (
    <Screen>
      <Notice message={t('common.crashed')} />
      <Button label={t('common.retry')} onPress={() => void retry()} />
    </Screen>
  )
}
