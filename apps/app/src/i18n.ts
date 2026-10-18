// Mise en place des traductions dans l'appli, avec la bibliothèque i18next.
// Les textes eux-mêmes viennent du paquet partagé @ruche/i18n.
import {
  defaultLanguage,
  type Language,
  resolveLanguage,
  resources,
  supportedLanguages,
  textVariables,
} from '@ruche/i18n'
import { getLocales } from 'expo-localization'
import i18next, { type i18n } from 'i18next'
import { useEffect } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

/** Langue de l'appareil si on la gère, le français sinon. */
export const detectLanguage = (): Language =>
  // getLocales() renvoie les langues réglées sur le téléphone ou le navigateur, préférée en premier.
  resolveLanguage(getLocales().map((locale) => locale.languageTag))

/**
 * Crée une instance i18next prête à l'emploi (une pour l'appli, une par test).
 * Une instance neuve à chaque fois évite qu'un test change la langue d'un autre test.
 */
export const createI18n = (language: Language = detectLanguage()): i18n => {
  const instance = i18next.createInstance()
  // `void` indique qu'on ignore volontairement la promesse renvoyée par init :
  // avec initAsync: false et des textes déjà chargés, l'initialisation est immédiate.
  void instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: defaultLanguage, // texte manquant dans une langue → on affiche le français
    supportedLngs: [...supportedLanguages],
    interpolation: {
      escapeValue: false, // React protège déjà l'affichage, pas besoin d'échapper deux fois
      defaultVariables: textVariables, // {{appName}} rempli partout, sans avoir à le passer
    },
    initAsync: false,
  })
  return instance
}

// Vrai une fois la langue du navigateur adoptée : on ne le fait qu'une fois par visite, pour ne
// jamais revenir dessus si le membre choisit ensuite une autre langue.
let browserLanguageAdopted = false

/**
 * Sur le web, les pages sont préparées en français sur le serveur. Ce hook passe à la langue du
 * navigateur une fois la page affichée. Il est appelé par chaque écran (voir ui/Screen.tsx) et non
 * par la mise en page racine : React finit d'« hydrater » le contenu d'une page après la racine.
 * Changer de langue avant ferait différer le texte du HTML préparé, et React devrait tout redessiner.
 */
export const useBrowserLanguage = () => {
  const { i18n } = useTranslation()
  useEffect(() => {
    if (Platform.OS !== 'web' || browserLanguageAdopted) return
    browserLanguageAdopted = true
    void i18n.changeLanguage(detectLanguage())
  }, [i18n])
}
