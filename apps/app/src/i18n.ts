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

/*
 * Les valeurs passées à t() viennent souvent des membres : t(($) => $.common.remove, { item: outil }).
 * i18next les insère dans le texte, puis continue de chercher les {{…}} dans ce même texte. Il
 * saute bien la valeur qu'il vient d'insérer (option `skipOnVariables`, active par défaut), mais
 * pour remplir la variable suivante il remplace la *première* occurrence de `{{nom}}` trouvée, qui
 * peut être dans le texte du membre (constaté avec i18next 26.4.3). Avec '{{host}}, un site hors de
 * {{appName}}' et un site nommé « {{appName}} », on obtenait « Waiggle, un site hors de {{appName}} ».
 *
 * La parade, pour toutes les valeurs d'un coup : avant l'insertion, chaque `{{` d'une valeur devient
 * un caractère réservé (BRACES), qu'i18next ne reconnaît pas ; une fois le texte terminé, on remet
 * les `{{`. Le membre voit exactement ce qu'il a tapé. (Un `$t(…)` tapé par un membre n'est jamais
 * lu comme une traduction : i18next le détecte déjà lui-même, un test le vérifie.)
 */
// U+E000 est un caractère « à usage privé » : il n'a aucune signification et n'apparaît dans aucun
// texte normal.
const BRACES = ''
const neutralizeBraces = (value: string) => value.replaceAll('{{', BRACES)
const restoreBraces = 'restoreBraces'

/**
 * Crée une instance i18next prête à l'emploi (une pour l'appli, une par test).
 * Une instance neuve à chaque fois évite qu'un test change la langue d'un autre test.
 */
export const createI18n = (language: Language = detectLanguage()): i18n => {
  const instance = i18next.createInstance()
  // `void` indique qu'on ignore volontairement la promesse renvoyée par init :
  // avec initAsync: false et des textes déjà chargés, l'initialisation est immédiate.
  void instance
    .use(initReactI18next)
    // Un « post-processeur » retouche le texte une fois qu'i18next a fini : ici, il remet les `{{`.
    .use({
      type: 'postProcessor',
      name: restoreBraces,
      process: (text: string) => text.replaceAll(BRACES, '{{'),
    })
    .init({
      resources,
      lng: language,
      fallbackLng: defaultLanguage, // texte manquant dans une langue → on affiche le français
      supportedLngs: [...supportedLanguages],
      interpolation: {
        // `escape` transforme chaque valeur avant son insertion. Par défaut, il écrit le HTML
        // autrement (« < » devient « &lt; ») : inutile ici, React protège déjà l'affichage. On
        // le remplace donc par la seule neutralisation des `{{`, et on l'active pour toutes les
        // valeurs avec escapeValue: true.
        escapeValue: true,
        escape: neutralizeBraces,
        defaultVariables: textVariables, // {{appName}} rempli partout, sans avoir à le passer
      },
      postProcess: [restoreBraces],
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
