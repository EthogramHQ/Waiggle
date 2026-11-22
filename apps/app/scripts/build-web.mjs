// La seule commande qui construit l'appli web (tranche R18, « Les finitions », choix 3 du plan) :
// la production (`pnpm --filter @ruche/app build`, puis infra/web/Dockerfile) et les captures
// (scripts/dist-shots.mjs) passent toutes deux par ici, pour construire le même code.
//
// Elle lance `expo export --platform web` avec l'élagage d'Expo (« tree shaking ») : à la
// construction, Metro retire les fonctions exportées par un module que personne n'importe, au lieu
// de livrer tout le module. Deux variables l'allument, lues par @expo/cli 57 :
// - EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH : Metro garde les `import` / `export` jusqu'au bout, pour
//   savoir ce qui sert ;
// - EXPO_UNSTABLE_TREE_SHAKING : il retire ce qui ne sert pas.
//
// Tout l'environnement reçu est transmis à Expo : les EXPO_PUBLIC_* (adresses de l'appli et de
// l'API, version, catalogue), qu'Expo écrit dans le code construit, et EXPO_NO_TELEMETRY. Une
// variable oubliée ici donnerait en silence un site qui appelle la mauvaise API.
//
// Usage : node apps/app/scripts/build-web.mjs [arguments d'expo export]
// Par exemple `--output-dir dist-shots --clear` ; sans argument, Expo écrit dans apps/app/dist.
// Le code de retour est celui d'Expo.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Les variables de l'élagage, ajoutées à l'environnement reçu (qui reste entier). */
const TREE_SHAKING_ENV = {
  EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1',
  EXPO_UNSTABLE_TREE_SHAKING: '1',
}

// On lance Expo avec Node directement (process.execPath), comme dist-shots.mjs le faisait : sous
// Windows, « pnpm exec expo » passe par un script (pnpm.cmd) que spawnSync ne sait pas lancer sans
// interpréteur de commandes. createRequire trouve le fichier d'un paquet installé (expo/bin/cli)
// comme le ferait un require() depuis l'appli.
const expo = createRequire(join(root, 'package.json')).resolve('expo/bin/cli')
const result = spawnSync(
  process.execPath,
  [expo, 'export', '--platform', 'web', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: { ...process.env, ...TREE_SHAKING_ENV } },
)
if (result.error) {
  console.error(`Impossible de lancer la construction (expo) : ${result.error.message}`)
  process.exit(1)
}
// Arrêté par un signal (Ctrl+C), Expo n'a pas de code : on rend 1, jamais un faux succès.
process.exit(result.status ?? 1)
