/**
 * @jest-environment node
 */
// Les réglages de Metro, le constructeur de l'appli (tranche R18, « Les finitions », choix 4 du
// plan). `metro.config.js` garde les réglages d'Expo et ajoute une seule règle de résolution :
// quand un fichier demande un module (`import … from '@ruche/i18n'`), Metro cherche le fichier à
// livrer ; la règle remplace deux de ces fichiers, pour alléger le premier chargement du site :
// - `@ruche/i18n` devient `packages/i18n/src/app.ts` dans le navigateur, qui n'a d'abord que le
//   français (l'anglais arrive à la demande) ; Jest et `tsc` gardent l'index, avec les deux langues ;
// - les 64 langues des messages de Zod (`zod/v4/locales/index.js`, du paquet zod seulement)
//   deviennent `src/zodLocales.ts`, l'anglais seul : l'appli lit le code d'une erreur, jamais son
//   message.
//
// Le test charge la configuration et appelle sa règle (`resolver.resolveRequest`) comme le ferait
// Metro : avec un contexte simulé, dont `resolveRequest` est la résolution par défaut. Celle-ci est
// remplacée ici par une fausse, qui connaît quelques demandes et rend le fichier qu'aurait trouvé
// Metro.
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

type Resolution = { type: string; filePath?: string }
type ResolutionContext = {
  originModulePath: string
  resolveRequest: (
    context: ResolutionContext,
    moduleName: string,
    platform: string | null,
  ) => Resolution
}
type ResolveRequest = (
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
) => Resolution
type MetroConfig = { resolver: { resolveRequest?: ResolveRequest; sourceExts?: string[] } }

const APP = __dirname
const REPO = resolve(APP, '../..')
const I18N_INDEX = join(REPO, 'packages/i18n/src/index.ts')
const I18N_APP = join(REPO, 'packages/i18n/src/app.ts')
const ZOD_LOCALES_SHIM = join(APP, 'src/zodLocales.ts')
// Le vrai paquet zod installé, et le fichier qui réexporte ses langues (`classic/external.js`).
const ZOD = dirname(require.resolve('zod/package.json'))
const ZOD_EXTERNAL = join(ZOD, 'v4/classic/external.js')
const ZOD_LOCALES = join(ZOD, 'v4/locales/index.js')
// Un autre paquet qui a lui aussi un fichier `v4/locales/index.js`.
const OTHER = join(REPO, 'node_modules/.pnpm/other-lib@1.0.0/node_modules/other-lib')
const OTHER_EXTERNAL = join(OTHER, 'v4/classic/external.js')
const OTHER_LOCALES = join(OTHER, 'v4/locales/index.js')
// Et un fichier de l'appli nommé `locales/index.js`.
const APP_LOCALES = join(APP, 'src/locales/index.js')
const REACT = join(REPO, 'node_modules/.pnpm/react@19.0.0/node_modules/react/index.js')

/** La résolution par défaut de Metro, simulée : le fichier qu'elle trouverait pour chaque demande. */
const defaultResolve = jest.fn<Resolution, [ResolutionContext, string, string | null]>(
  (context, moduleName) => {
    const file = (filePath: string): Resolution => ({ type: 'sourceFile', filePath })
    if (isAbsolute(moduleName)) return file(moduleName)
    if (moduleName === '@ruche/i18n') return file(I18N_INDEX)
    if (moduleName === 'react') return file(REACT)
    if (moduleName === '../locales/index.js') {
      if (context.originModulePath === ZOD_EXTERNAL) return file(ZOD_LOCALES)
      if (context.originModulePath === OTHER_EXTERNAL) return file(OTHER_LOCALES)
    }
    if (moduleName === './locales/index.js') return file(APP_LOCALES)
    throw new Error(`demande imprévue dans le test : ${moduleName}`)
  },
)

/** La configuration de l'appli, chargée comme Metro la charge. */
const loadConfig = (): MetroConfig => require('./metro.config.js') as MetroConfig

/** Demande `moduleName` depuis le fichier `origin`, pour une plateforme, par la règle de l'appli. */
const resolveFrom = (origin: string, moduleName: string, platform: string | null) => {
  const { resolveRequest } = loadConfig().resolver
  if (!resolveRequest) throw new Error('metro.config.js : resolver.resolveRequest manque')
  const context: ResolutionContext = { originModulePath: origin, resolveRequest: defaultResolve }
  return resolveRequest(context, moduleName, platform)
}

beforeEach(() => defaultResolve.mockClear())

describe('metro.config.js', () => {
  it('finds the real zod package of the test (its locales file exists)', () => {
    // Témoin du décor : le fichier des langues de zod existe bien là où le test le cherche.
    expect(existsSync(ZOD_LOCALES)).toBe(true)
  })

  it('resolves @ruche/i18n to packages/i18n/src/app.ts for the web', () => {
    const origin = join(APP, 'src/i18n.ts')
    expect(resolveFrom(origin, '@ruche/i18n', 'web')).toEqual({
      type: 'sourceFile',
      filePath: I18N_APP,
    })
  })

  it('resolves the locales file of the zod package to src/zodLocales.ts', () => {
    expect(resolveFrom(ZOD_EXTERNAL, '../locales/index.js', 'web')).toEqual({
      type: 'sourceFile',
      filePath: ZOD_LOCALES_SHIM,
    })
  })

  it('leaves alone another file named locales/index.js, in another package or in the app', () => {
    expect(resolveFrom(OTHER_EXTERNAL, '../locales/index.js', 'web')).toEqual({
      type: 'sourceFile',
      filePath: OTHER_LOCALES,
    })
    expect(resolveFrom(join(APP, 'src/i18n.ts'), './locales/index.js', 'web')).toEqual({
      type: 'sourceFile',
      filePath: APP_LOCALES,
    })
  })

  it('lets every other request through the default resolution', () => {
    const origin = join(APP, 'src/ui/Text.tsx')
    expect(resolveFrom(origin, 'react', 'web')).toEqual({ type: 'sourceFile', filePath: REACT })
    expect(defaultResolve).toHaveBeenCalledWith(
      expect.objectContaining({ originModulePath: origin }),
      'react',
      'web',
    )
  })

  it('keeps the default settings of Expo', () => {
    const { getDefaultConfig } = require('expo/metro-config') as {
      getDefaultConfig: (root: string) => MetroConfig
    }
    expect(loadConfig().resolver.sourceExts).toEqual(getDefaultConfig(APP).resolver.sourceExts)
  })
})
