// La page affichée pour une adresse qui ne mène nulle part dans l'appli.
import { useTranslation } from 'react-i18next'
import { NotFoundState } from './states'

export function NotFoundScreen() {
  const { t } = useTranslation()
  return <NotFoundState title={t('states.notFoundTitle')} message={t('errors.notFound')} />
}
