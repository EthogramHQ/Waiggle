// Mise en place des traductions dans l'appli, avec la bibliothèque i18next.
// Les textes eux-mêmes viennent du paquet partagé @ruche/i18n. Sur le web, ce paquet n'a d'abord
// que le français (R18) : l'anglais se charge à la demande, par `ensureLanguage`, avant tout
// changement de langue, et avant l'hydratation d'une page anglaise (`preparePageLanguage`).
import {
  defaultLanguage,
  ensureLanguage,
  type Language,
  resolveLanguage,
  resources,
  supportedLanguages,
  textVariables,
} from '@ruche/i18n'
import { getLocales } from 'expo-localization'
import i18next, { type i18n } from 'i18next'
import { useContext, useEffect } from 'react'
import { I18nContext, initReactI18next, useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { reloadOnce } from './chunkReload'
import { languageOfPath } from './publicPath'

// La plateforme, lue une fois au chargement du module : `preparePageLanguage` sert au démarrage,
// juste après ce chargement (l'entrée de l'appli). Les tests chargent ce module neuf pour une
// « page du navigateur », plateforme web comprise, et l'appellent ensuite.
const webAtLoad = Platform.OS === 'web'

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

// R12 (« La langue de la page ») : les instances dont la langue est celle de l'adresse (`/en/…`),
// créées par `createPageI18n`. La langue du navigateur ne les touche jamais. Un `WeakSet` est un
// ensemble qui ne retient pas ses éléments : une instance oubliée par la page part avec elle.
const addressLanguage = new WeakSet<i18n>()

/**
 * Une instance i18next dans la langue d'une adresse publique (`/fr/…`, `/en/…`), pour un visiteur :
 * la page s'affiche dans cette langue dès son premier rendu, HTML pré-rendu compris, quel que soit
 * le réglage du navigateur (voir navigation/PageLanguage.tsx).
 */
export const createPageI18n = (language: Language): i18n => {
  const instance = createI18n(language)
  addressLanguage.add(instance)
  return instance
}

/**
 * R12 : un visiteur arrivé sur une adresse à langue garde cette langue pour toute sa visite, dans
 * l'appli entière (les feuilles de la racine, comme « Signaler », et `<html lang>`, que la racine
 * écrit à chaque changement) : la langue du navigateur n'est plus adoptée ensuite, elle ne doit pas
 * défaire le choix porté par l'adresse.
 */
export const keepAddressLanguage = (appI18n: i18n, language: Language): Promise<void> => {
  browserLanguageAdopted = true
  if (appI18n.language === language) return Promise.resolve()
  return switchWhenReady(appI18n, language)
}

/**
 * Passe une instance à une langue une fois ses textes arrivés (R18) : jamais de texte anglais
 * manquant à l'écran, remplacé par le français en attendant. Si l'anglais n'arrive pas (réseau
 * coupé, nouvelle version en ligne), l'instance garde sa langue : la promesse se termine sans
 * erreur, la page reste lisible.
 */
const switchWhenReady = (instance: i18n, language: Language): Promise<void> =>
  ensureLanguage(instance, language).then(
    async () => {
      await instance.changeLanguage(language)
    },
    () => {
      // La langue affichée reste : rien à défaire.
    },
  )

/**
 * La langue dans laquelle la page va s'hydrater, préparée avant (R18 ; appelée par l'entrée de
 * l'appli, `index.ts`, avant Expo Router) : celle de l'adresse (`/fr/…`, `/en/…`), sinon celle du
 * navigateur. Une page en français n'a rien à charger. Pour l'anglais, on attend son morceau : le
 * premier rendu du client trouve alors le texte du HTML pré-rendu, sans écart.
 *
 * Si le morceau manque (une mise en ligne entre-temps : son nom a changé), la page se recharge une
 * fois, avec la mémoire de `reloadOnce` (une clé par adresse, partagée avec `lazyScreen`), et la
 * promesse ne se termine pas : la page s'en va. S'il manque encore après, ou si la page ne peut pas
 * se recharger (hors ligne, stockage refusé), elle s'hydrate en français (relecture de sécurité du
 * plan, S3) : jamais de boucle, jamais de page blanche.
 */
export const preparePageLanguage = async (): Promise<Language> => {
  if (!webAtLoad) return detectLanguage()
  const { location } = globalThis as { location?: { pathname: string } }
  const language = languageOfPath(location?.pathname ?? '/') ?? detectLanguage()
  if (language === defaultLanguage) return language
  try {
    // L'instance de l'appli n'existe pas encore (la racine la crée au premier rendu, avec les
    // textes partagés que l'anglais vient de rejoindre) : une instance à part reçoit le morceau.
    await ensureLanguage(createI18n(defaultLanguage), language)
    return language
  } catch {
    // Une promesse jamais tenue : la page se recharge, rien ne doit s'hydrater d'ici là.
    if (reloadOnce(webAtLoad)) return new Promise<Language>(() => {})
    return defaultLanguage
  }
}

/**
 * Sur le web, les pages sont préparées en français sur le serveur. Ce hook passe à la langue du
 * navigateur une fois la page affichée. Il est appelé par chaque écran (voir ui/Screen.tsx) et non
 * par la mise en page racine : React finit d'« hydrater » le contenu d'une page après la racine.
 * Changer de langue avant ferait différer le texte du HTML préparé, et React devrait tout redessiner.
 * Sous une adresse à langue (`/en/…`, R12), pour un visiteur, il ne fait rien : la page garde la
 * langue de son adresse.
 */
export const useBrowserLanguage = () => {
  const { i18n } = useTranslation()
  // L'instance posée par le fournisseur le plus proche, telle quelle : `useTranslation` en rend un
  // relais (react-i18next 18 ; une copie avant), un autre objet qu'on ne retrouverait pas dans
  // `addressLanguage`.
  const provided = useContext(I18nContext)?.i18n
  useEffect(() => {
    // Sous une adresse à langue, pour un visiteur, la langue est celle de l'adresse (R12) : on
    // regarde l'instance avant le drapeau, pour ne pas consommer l'adoption sur une page qui
    // l'ignore.
    if (provided && addressLanguage.has(provided)) return
    if (Platform.OS !== 'web' || browserLanguageAdopted) return
    browserLanguageAdopted = true
    // L'instance elle-même (celle du fournisseur) reçoit l'anglais, s'il le faut, avant d'y passer.
    void switchWhenReady(provided ?? i18n, detectLanguage())
  }, [i18n, provided])
}
