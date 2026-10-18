// Changer de langue : d'abord l'écran, tout de suite, puis le compte du membre connecté (pour qu'il
// la retrouve sur ses autres appareils et dans ses e-mails). Partagé par le sélecteur de langue de
// l'accueil et par les réglages.
import type { Language } from '@ruche/i18n'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { updateProfile } from './api'
import { useSetMe } from './hooks'

export const useChooseLanguage = () => {
  const { i18n } = useTranslation()
  const { data: session } = useSession()
  const setMe = useSetMe()

  const choose = async (language: Language) => {
    // D'abord l'écran, immédiatement : le membre voit le résultat sans attendre le réseau.
    await i18n.changeLanguage(language)
    if (!session) return
    // Puis le compte. Si l'enregistrement échoue (réseau coupé…), l'écran reste dans la langue
    // choisie : seul le souvenir sur les autres appareils est perdu, inutile d'inquiéter le membre.
    const result = await updateProfile({ language })
    if (result.ok) setMe(result.data)
  }
  return { current: i18n.language as Language, choose }
}
