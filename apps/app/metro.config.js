// Les réglages de Metro, le constructeur de l'appli (tranche R18, « Les finitions », choix 4 du
// plan) : ceux d'Expo par défaut, plus une seule règle de résolution, pour alléger le premier
// chargement du site.
//
// Résoudre, c'est trouver le fichier à livrer quand un fichier en demande un autre
// (`import … from 'zod'`). Metro appelle `resolver.resolveRequest` pour chaque demande ; la règle
// ci-dessous en change deux et passe toutes les autres à la résolution par défaut
// (`context.resolveRequest`, celle d'Expo puis de Metro).
// - `@ruche/i18n`, dans le navigateur seulement, devient `packages/i18n/src/app.ts`, qui n'a
//   d'abord que le français : l'anglais arrive à la demande. Les fichiers de l'appli qui importent
//   `@ruche/i18n` ne changent pas. iOS et Android gardent l'index (les deux langues, en synchrone),
//   comme Jest et `tsc`, qui ne passent pas par Metro.
// - Les 64 langues des messages de Zod (`zod/v4/locales/index.js`) deviennent `src/zodLocales.ts`,
//   l'anglais seul. Seul ce fichier du paquet zod est visé, reconnu par son chemin une fois résolu :
//   un autre paquet, ou un fichier de l'appli, nommé `locales/index.js` n'est pas touché.
//
// Ce fichier est en CommonJS (`require`, `module.exports`) : Expo le charge ainsi.
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

const I18N_APP = path.resolve(__dirname, '../../packages/i18n/src/app.ts')
const ZOD_LOCALES_SHIM = path.join(__dirname, 'src/zodLocales.ts')
// Le fichier des langues de zod, tel que Metro le trouve : dans le dossier du paquet zod (sous
// `node_modules/.pnpm/zod@<version>/node_modules/zod/` avec pnpm). Metro y arrive par
// `v4/classic/external.js` et par `v4/core/index.js`, et trouve `index.js`, la version des
// `import` (vu à la construction du 22/11/2026) ; `index.cjs`, celle des `require`, est visé aussi,
// pour le jour où un paquet demanderait zod par `require`. Les « [\\/] » acceptent les séparateurs
// de Windows comme ceux de Linux.
const ZOD_LOCALES = /[\\/]node_modules[\\/]zod[\\/]v4[\\/]locales[\\/]index\.c?js$/

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@ruche/i18n') {
    return { type: 'sourceFile', filePath: I18N_APP }
  }
  const resolution = context.resolveRequest(context, moduleName, platform)
  if (resolution.type === 'sourceFile' && ZOD_LOCALES.test(resolution.filePath)) {
    return { type: 'sourceFile', filePath: ZOD_LOCALES_SHIM }
  }
  return resolution
}

module.exports = config
