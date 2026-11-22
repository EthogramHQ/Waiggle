// Tests de l'entrée du paquet pour le navigateur (R18, « Le premier chargement plus léger » ; plan,
// choix 5) : `app.ts` donne à l'appli web les mêmes noms que l'index, mais seulement le français au
// départ. L'anglais arrive à la demande par `ensureLanguage(i18n, language)`, qui le charge, l'ajoute
// aux textes partagés (`resources`) et à l'instance i18next, une seule fois.
//
// Pourquoi ces tests :
// - l'appli importe `@ruche/i18n` dans 23 fichiers ; la construction du navigateur le remplace par
//   `app.ts` (metro.config.js) : il manquerait un nom, une page planterait seulement en ligne ;
// - le poids : si `app.ts` (ou un module qu'il importe) importait `locales/en` en tête de fichier,
//   l'anglais repartirait dans le script de départ, et la page /fr/ le téléchargerait encore.
//
// Le pré-rendu tourne dans Node (sans `window`) : il garde les deux langues tout de suite. La page
// du navigateur, elle, a un `window` ; on en pose un faux avant de charger le module pour voir ce
// que reçoit le navigateur.
import { afterEach, describe, expect, it, vi } from 'vitest'

// Le paquet n'a pas les types de Node (`@types/node`) : la lecture d'un fichier se décrit ici, et
// le module `node:fs` se charge par un import dynamique (le nom passé en variable, que TypeScript
// ne cherche pas à résoudre). Vitest tourne depuis le dossier du paquet : les chemins partent de là.
type FileSystem = { readFileSync: (path: string, encoding: 'utf8') => string }
const fsModule: string = 'node:fs'
const loadFs = async () => (await import(/* @vite-ignore */ fsModule)) as FileSystem

/** Le chemin `target` (« ./locales/fr », « ../x ») vu depuis le dossier `dir` (« src »). */
const join = (dir: string, target: string) => {
  const parts = dir.split('/')
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

type Ensure = typeof import('./app')['ensureLanguage']

/**
 * Une fausse instance i18next : le paquet ne dépend pas d'i18next (c'est l'appli qui l'installe).
 * Elle garde les textes qu'on lui ajoute, par langue, comme le fait la vraie
 * (`addResourceBundle`, `hasResourceBundle`, `getResourceBundle`).
 */
const fakeInstance = () => {
  const bundles = new Map<string, unknown>()
  const instance = {
    addResourceBundle: vi.fn((language: string, namespace: string, texts: unknown) => {
      bundles.set(`${language}/${namespace}`, texts)
      return instance
    }),
    hasResourceBundle: (language: string, namespace: string) =>
      bundles.has(`${language}/${namespace}`),
    getResourceBundle: (language: string, namespace: string) =>
      bundles.get(`${language}/${namespace}`),
  }
  return instance
}
const asI18n = (instance: ReturnType<typeof fakeInstance>) =>
  instance as unknown as Parameters<Ensure>[0]

// Les deux entrées, chargées neuves à chaque test : `vi.resetModules()` vide le cache des modules,
// pour que la branche « navigateur » ou « Node » se décide de nouveau au chargement.
const loadApp = async () => import('./app')
const loadIndex = async () => import('./index')

/** Charge `app.ts` comme le ferait la page du navigateur : avec un `window` global. */
const loadAppInBrowser = async () => {
  vi.resetModules()
  vi.stubGlobal('window', {})
  return loadApp()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/**
 * Les modules qu'un fichier du paquet importe « en tête » (import … from, export … from, import
 * '…'), relatifs, de proche en proche. Les `import type` disparaissent à la compilation : ignorés.
 * Un `import('…')` (à la demande) ou un `require` dans une branche ne sont pas des imports de tête :
 * ignorés aussi, ce sont eux qui gardent l'anglais hors du script de départ.
 */
const staticImports = async (entry: string): Promise<string[]> => {
  const { readFileSync } = await loadFs()
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    // `^` avec le drapeau m : le début de chaque ligne. `[^;]*?` : la liste des noms importés, sur
    // une ou plusieurs lignes, jusqu'au `from` le plus proche.
    const pattern = /^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm
    for (const match of source.matchAll(pattern)) {
      const target = match[1] ?? ''
      if (!target.startsWith('.')) continue
      visit(join(dirOf(file), target.endsWith('.ts') ? target : `${target}.ts`))
    }
  }
  visit(entry)
  return [...seen]
}

describe('the browser entry of @ruche/i18n (app.ts)', () => {
  it('exports the same names as the index', async () => {
    const app = await loadAppInBrowser()
    const index = await loadIndex()

    expect(Object.keys(app).sort()).toEqual(Object.keys(index).sort())
    // Les deux donnent `ensureLanguage`, que l'appli appelle avant de changer de langue.
    expect(typeof app.ensureLanguage).toBe('function')
    expect(typeof index.ensureLanguage).toBe('function')
  })

  it('does not import the English texts at the top of any of its modules', async () => {
    const modules = await staticImports('src/app.ts')

    // Témoin : le parcours voit bien les textes français, importés en tête.
    expect(modules).toContain('src/locales/fr.ts')
    expect(modules).not.toContain('src/locales/en.ts')
  })

  it('starts with French only in the browser', async () => {
    const { resources } = await loadAppInBrowser()

    expect(Object.keys(resources)).toEqual(['fr'])
  })

  it('keeps both languages at once for the prerender, outside the browser', async () => {
    vi.resetModules()
    const { resources } = await loadApp()

    expect(Object.keys(resources).sort()).toEqual(['en', 'fr'])
  })

  it('adds English to the shared texts and to the instance, once', async () => {
    const { ensureLanguage, resources } = await loadAppInBrowser()
    const shared = resources as Record<string, { translation: unknown } | undefined>
    const instance = fakeInstance()

    await ensureLanguage(asI18n(instance), 'en')
    const english = shared.en
    await ensureLanguage(asI18n(instance), 'en')

    // Les textes anglais, ceux de `locales/en`, sont maintenant dans les textes partagés (une
    // instance créée ensuite les a dès sa création) et dans l'instance déjà là.
    const { en } = await import('./locales/en')
    expect(english?.translation).toEqual(en)
    expect(instance.hasResourceBundle('en', 'translation')).toBe(true)
    expect(instance.getResourceBundle('en', 'translation')).toEqual(en)
    // Le second appel ne recharge ni ne rajoute rien : les mêmes textes, un seul ajout.
    expect(shared.en).toBe(english)
    expect(instance.addResourceBundle).toHaveBeenCalledTimes(1)
  })

  it('has nothing to load for French', async () => {
    const { ensureLanguage, resources } = await loadAppInBrowser()
    const instance = fakeInstance()

    await expect(ensureLanguage(asI18n(instance), 'fr')).resolves.toBeUndefined()
    expect(Object.keys(resources)).toEqual(['fr'])
    expect(instance.addResourceBundle).not.toHaveBeenCalled()
  })
})

describe('ensureLanguage from the index', () => {
  it('resolves at once: the index already has both languages', async () => {
    const { ensureLanguage, resources } = await loadIndex()
    const instance = fakeInstance()

    await expect(ensureLanguage(asI18n(instance), 'en')).resolves.toBeUndefined()
    expect(Object.keys(resources).sort()).toEqual(['en', 'fr'])
  })
})
