// Test statique de R12 (relecture juridique, décision 19) : l'adresse e-mail d'un visiteur qui signale
// (`content_report.reporter_email`, avec sa langue) n'est nommée que par les fichiers qui en ont
// besoin. Il lit les sources de l'API (sans rien lancer) et refuse tout autre fichier qui cite la
// colonne : ainsi la file de modération, l'historique, l'export, les journaux et l'assistant de
// code ne peuvent pas la lire par mégarde (une requête qui la sélectionne devrait d'abord paraître
// ici, donc en relecture).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/**
 * Les seuls fichiers qui nomment la colonne, avec pourquoi :
 * - routes/public-reports.ts : l'écrit à l'envoi du visiteur (et lit l'adresse pour l'accusé) ;
 * - reports/visitor.ts : la lit, l'efface et rend de quoi écrire la décision, à toute clôture (la
 *   décision de la modération l'appelle par routes/moderation.ts, sans nommer la colonne) ;
 * - moderation/inputs.ts : le registre des entrées, qui dit que la colonne n'est ni exportée ni montrée.
 */
const ALLOWED = ['routes/public-reports.ts', 'reports/visitor.ts', 'moderation/inputs.ts'].map(
  (path) => path.split('/').join(sep),
)

const NAMES = /reporterEmail|reporter_email|reporterLanguage|reporter_language/

/** Tous les fichiers .ts d'un dossier, sous-dossiers compris, sans les tests. */
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })

/**
 * Le code sans ses commentaires : un nom cité dans une phrase d'explication n'est pas une lecture
 * (charte, « un test statique trouve aussi le nom dans un commentaire »). `/* … *\/` d'abord, puis
 * `// …` jusqu'à la fin de la ligne, sans toucher aux `://` des adresses.
 */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('who names the e-mail address of a visitor who reported', () => {
  it('is only the visitor routes, their closing and the registry of inputs', () => {
    const files = sources(SRC)
    // Un dossier mal trouvé ferait passer le test à vide : on vérifie qu'on lit bien le code.
    expect(files.length).toBeGreaterThan(100)
    const naming = files
      .filter((file) => NAMES.test(withoutComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file))
      .sort()
    expect(naming).toEqual([...ALLOWED].sort())
  })

  it('does not count a name cited only in a comment', () => {
    expect(NAMES.test(withoutComments('// la colonne reporter_email\nconst a = 1'))).toBe(false)
    expect(NAMES.test(withoutComments('/* reporterEmail */ const a = 1'))).toBe(false)
    expect(NAMES.test(withoutComments('const a = row.reporterEmail'))).toBe(true)
  })
})
