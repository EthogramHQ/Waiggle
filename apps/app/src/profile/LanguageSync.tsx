// Composant invisible, placé une fois à la racine de l'appli : dès qu'un membre est connecté, il
// applique la langue enregistrée sur son compte. Ainsi, choisir l'anglais sur son téléphone suffit
// pour retrouver l'anglais sur l'ordinateur.
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMe } from './hooks'

export function LanguageSync() {
  const { i18n } = useTranslation()
  const { data: session } = useSession()
  // Pour un visiteur (pas de session), useMe ne fait aucune requête.
  const { data: me } = useMe(Boolean(session))
  const saved = me?.language

  // S'exécute quand la langue enregistrée arrive (ou change), pas à chaque affichage.
  useEffect(() => {
    if (saved && saved !== i18n.language) void i18n.changeLanguage(saved)
  }, [saved, i18n])

  return null // rien à afficher
}
