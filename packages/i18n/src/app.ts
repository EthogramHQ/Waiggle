// L'entrée du paquet @ruche/i18n pour le navigateur (R18, « Le premier chargement plus léger ») :
// les mêmes noms que l'index (`index.ts`), mais seulement le français au départ. La construction du
// site web remplace `@ruche/i18n` par ce fichier (metro.config.js) : la page /fr/ ne télécharge plus
// les textes anglais. L'anglais arrive à la demande, par `ensureLanguage(i18n, 'en')`, dans un
// morceau à part que le navigateur va chercher seulement quand il en a besoin.
import type { Language, LanguageHost } from './core'
import { fr } from './locales/fr'
import type { Translation } from './types'

export * from './core'
export type { Translation } from './types'

/** Les langues chargées à la demande : toutes, sauf le français, toujours là. */
type LazyLanguage = Exclude<Language, 'fr'>

/**
 * Le pré-rendu des pages (le serveur de construction, dans Node) prépare aussi les pages /en/ : il
 * lui faut l'anglais tout de suite, en synchrone. On le reconnaît à l'absence de `window` (pris sur
 * `globalThis` : le paquet n'a ni les types de Node ni ceux du navigateur).
 *
 * Pourquoi aussi `process.env.EXPO_SERVER` : à la construction, Expo remplace cette expression par
 * `true` dans le code du serveur et par `false` dans celui du navigateur, puis efface la branche
 * jamais prise. Dans le navigateur, la condition devient donc `false`, le `require` disparaît avant
 * que Metro ne cherche les modules à embarquer, et l'anglais ne rejoint pas le script de départ.
 * `typeof globalThis.window`, seul, n'est pas remplacé pour le navigateur (Expo 57) : il garderait
 * le `require`, donc l'anglais. Hors de la construction (Vitest, Node), `process.env.EXPO_SERVER`
 * n'existe pas : `??` passe alors à la présence de `window`.
 *
 * Sous Vitest, ce `require` est celui de Node, qui ne devine pas l'extension : elle est écrite.
 */
const prerenderEnglish: Translation | undefined =
  (process.env.EXPO_SERVER ?? typeof (globalThis as { window?: unknown }).window === 'undefined')
    ? (require('./locales/en.ts') as typeof import('./locales/en')).en
    : undefined

/**
 * Les textes, dans la forme attendue par la bibliothèque i18next. Un objet qu'on complète : une
 * instance créée après l'arrivée de l'anglais le reçoit dès sa création (`createI18n` de l'appli).
 */
export const resources: { fr: { translation: Translation } } & {
  [language in LazyLanguage]?: { translation: Translation }
} = prerenderEnglish
  ? { fr: { translation: fr }, en: { translation: prerenderEnglish } }
  : { fr: { translation: fr } }

/**
 * Où trouver chaque langue à la demande. `import()` (un import « dynamique ») renvoie une promesse
 * du module : Metro en fait un morceau séparé, téléchargé au premier appel seulement.
 */
const loaders: Record<LazyLanguage, () => Promise<Translation>> = {
  en: () => import('./locales/en').then((module) => module.en),
}

// Le chargement en cours de chaque langue : deux appels rapprochés attendent le même, au lieu de
// télécharger deux fois. Un échec l'efface, pour que « Réessayer » puisse recommencer.
const loading = new Map<LazyLanguage, Promise<void>>()

const load = (language: LazyLanguage): Promise<void> => {
  const pending =
    loading.get(language) ??
    loaders[language]().then(
      (translation) => {
        resources[language] = { translation }
      },
      (error: unknown) => {
        loading.delete(language)
        throw error
      },
    )
  loading.set(language, pending)
  return pending
}

/**
 * Prépare une langue avant de l'afficher : charge ses textes s'ils ne sont pas encore là, les ajoute
 * aux textes partagés (`resources`) et à l'instance `i18n` (`addResourceBundle`), une seule fois.
 * Le français, langue de départ, n'a rien à charger : toute instance l'a dès sa création. La promesse
 * échoue si le morceau n'arrive pas (réseau coupé, nouvelle version en ligne) : l'appelant garde
 * alors la langue affichée.
 */
export const ensureLanguage = async (i18n: LanguageHost, language: Language): Promise<void> => {
  if (language === 'fr') return
  if (!resources[language]) await load(language)
  const texts = resources[language]
  if (texts && !i18n.hasResourceBundle(language, 'translation')) {
    i18n.addResourceBundle(language, 'translation', texts.translation)
  }
}
