// Le garde de la forme du dépôt, lancé par `pnpm check` et par la CI (tâche « Lint, types,
// tests, build ») : seuls les fichiers et dossiers prévus entrent dans le dépôt public.
//
// Pourquoi : le dépôt est public, et chacun garde sur son PC des fichiers qui n'ont rien à y faire
// (réglages de son éditeur ou de son assistant de code, notes, essais). Ils sont exclus par
// `.git/info/exclude`, propre à chaque PC, donc rien ne les arrête si cette exclusion manque un
// jour (nouveau PC, copie de travail, `git add -f`). Ce script le vérifie à chaque pull request.
//
// Trois règles, sur la liste des fichiers suivis (`git ls-files`) :
// 1. à la racine, seulement les entrées de ROOT_ENTRIES ;
// 2. aucun dossier caché (nom qui commence par un point) ailleurs que dans HIDDEN_FOLDERS ;
// 3. un fichier Markdown nommé en capitales (comme README.md) seulement à la racine.
//
// Un fichier nouveau et voulu à la racine (un réglage d'outil partagé par tous, par exemple) :
// l'ajouter à ROOT_ENTRIES dans la même pull request, pour que la relecture le voie.
//
// Usage : node scripts/repo-layout.mjs. Tests : scripts/repo-layout.test.mjs.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Ce qui a sa place à la racine du dépôt (fichiers et dossiers).
export const ROOT_ENTRIES = new Set([
  '.dockerignore',
  '.editorconfig',
  '.gitattributes',
  '.github',
  '.gitignore',
  '.gitleaksignore',
  '.nvmrc',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.en.md',
  'README.md',
  'SECURITY.md',
  'apps',
  'biome.json',
  'docs',
  'infra',
  'package.json',
  'packages',
  'patches',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'renovate.json',
  'scripts',
  'tsconfig.base.json',
  'turbo.json',
])

// Les dossiers cachés permis, par leur chemin complet : seulement les réglages de GitHub.
export const HIDDEN_FOLDERS = new Set(['.github'])

// Un nom de fichier Markdown en capitales : README.md, SECURITY.md, NOTES.local.md…
const CAPITAL_MARKDOWN = /^[A-Z][A-Z0-9_-]+(\.[^/]*)?\.md$/

// La liste des problèmes, un par chemin fautif (vide si tout va bien). `paths` : les chemins
// suivis, séparés par des « / » comme les écrit Git.
export const layoutProblems = (paths) => {
  const problems = []
  for (const path of paths) {
    const parts = path.split('/')
    if (!ROOT_ENTRIES.has(parts[0])) {
      problems.push(`${path} : « ${parts[0]} » n'est pas prévu à la racine (ROOT_ENTRIES)`)
      continue
    }
    // Les dossiers du chemin (tout sauf le dernier morceau, qui est le fichier).
    const hidden = parts
      .slice(0, -1)
      .findIndex(
        (part, i) => part.startsWith('.') && !HIDDEN_FOLDERS.has(parts.slice(0, i + 1).join('/')),
      )
    if (hidden !== -1) {
      problems.push(`${path} : dossier caché « ${parts[hidden]} » non prévu (HIDDEN_FOLDERS)`)
      continue
    }
    const name = parts.at(-1)
    if (parts.length > 1 && CAPITAL_MARKDOWN.test(name)) {
      problems.push(`${path} : un fichier « ${name} » n'est prévu qu'à la racine`)
    }
  }
  return problems
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // `-z` sépare les chemins par un caractère nul : un nom avec un espace ou un accent reste entier.
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  const problems = layoutProblems(output.split('\0').filter(Boolean))
  if (problems.length === 0) {
    console.log('Forme du dépôt : rien d’inattendu.')
  } else {
    console.error(`Forme du dépôt : ${problems.length} fichier(s) inattendu(s).`)
    for (const problem of problems) console.error(`- ${problem}`)
    console.error(
      'Un fichier personnel se retire du suivi (git rm --cached) et s’exclut dans .git/info/exclude ; un fichier voulu s’ajoute à la liste de scripts/repo-layout.mjs.',
    )
    process.exitCode = 1
  }
}
