// Changer de langue : d'abord l'écran, puis le compte du membre connecté (pour qu'il la retrouve sur
// ses autres appareils et dans ses e-mails). Partagé par le sélecteur de langue de l'accueil et par
// les réglages.
//
// R18 (« Le premier chargement plus léger ») : dans le navigateur, l'anglais n'est plus dans le
// script de départ ; il arrive à la demande, par `ensureLanguage` de `@ruche/i18n`. Le choix touché
// est donc « en cours » le temps que ses textes arrivent (le contrôle l'annonce occupé), et la
// langue ne change qu'ensuite : jamais un écran à moitié traduit. Si les textes n'arrivent pas
// (réseau coupé, nouvelle version en ligne), la langue reste celle d'avant, le compte n'est pas
// touché, et l'écran dit ce qui s'est passé, avec « Réessayer ».
import { ensureLanguage, type Language } from '@ruche/i18n'
import { useContext, useRef, useState } from 'react'
import { I18nContext, useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { updateProfile } from './api'
import { useSetMe } from './hooks'

/** Ce qu'un contrôle de langue reçoit : la langue affichée, le choix en cours, l'échec. */
export type LanguageChoice = {
  /** La langue de l'écran, cochée dans le contrôle. */
  current: Language
  /** Passer à une langue : ses textes d'abord, puis l'écran. Ignoré si un choix est en cours. */
  choose: (language: Language) => Promise<void>
  /** La langue touchée dont les textes sont en route (le contrôle l'annonce occupée). */
  loading: Language | undefined
  /** La langue dont les textes ne sont pas arrivés : l'écran pose son message et « Réessayer ». */
  failed: Language | undefined
  /** Relance le même choix, après un échec. */
  retry: () => Promise<void>
}

/**
 * Hook : changer la langue de l'écran une fois ses textes arrivés, sans rien enregistrer. Le choix
 * d'un visiteur (connexion, inscription) s'arrête là ; `afterSwitch` reçoit la langue adoptée, pour
 * que le membre connecté l'enregistre sur son compte (`useChooseLanguage`).
 */
export const useSwitchLanguage = (
  afterSwitch?: (language: Language) => Promise<void>,
): LanguageChoice => {
  // `useTranslation` redessine le composant quand la langue change ; l'instance elle-même vient du
  // fournisseur (react-i18next en rend un relais, voir PageLanguage) : c'est elle qui doit recevoir
  // les textes anglais (`addResourceBundle`) avant d'y passer.
  const { i18n: relay } = useTranslation()
  const i18n = useContext(I18nContext)?.i18n ?? relay
  const [loading, setLoading] = useState<Language | undefined>(undefined)
  const [failed, setFailed] = useState<Language | undefined>(undefined)
  // Le choix en cours, lu à l'instant du geste : un second toucher, avant que React ait redessiné le
  // contrôle occupé, lirait encore l'ancien état (`loading`) et lancerait un second chargement.
  const busy = useRef(false)

  const choose = async (language: Language) => {
    if (busy.current) return
    setFailed(undefined)
    // La langue déjà affichée : rien à charger ni à enregistrer (toucher « Français » efface
    // seulement le message d'un essai raté vers l'anglais).
    if (language === i18n.language) return
    busy.current = true
    setLoading(language)
    try {
      await ensureLanguage(i18n, language)
    } catch {
      busy.current = false
      setLoading(undefined)
      setFailed(language)
      return
    }
    try {
      await i18n.changeLanguage(language)
    } finally {
      // Le contrôle se libère dans tous les cas : jamais un choix figé pour toute la visite.
      busy.current = false
      setLoading(undefined)
    }
    await afterSwitch?.(language)
  }

  const retry = async () => {
    if (failed) await choose(failed)
  }

  return { current: i18n.language as Language, choose, loading, failed, retry }
}

/** Hook : le choix de la langue, enregistré aussi sur le compte du membre connecté. */
export const useChooseLanguage = (): LanguageChoice => {
  const { data: session } = useSession()
  const setMe = useSetMe()
  return useSwitchLanguage(async (language) => {
    if (!session) return
    // Le compte, une fois l'écran passé à la langue choisie. Si l'enregistrement échoue (réseau
    // coupé…), l'écran reste dans cette langue : seul le souvenir sur les autres appareils est
    // perdu, inutile d'inquiéter le membre.
    const result = await updateProfile({ language })
    if (result.ok) setMe(result.data)
  })
}
