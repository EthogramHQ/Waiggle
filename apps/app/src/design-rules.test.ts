/// <reference types="node" />
// Règles de design vérifiées automatiquement, pour que l'interface reste facile à modifier :
// - aucune couleur n'est écrite à la main dans l'appli : toutes viennent de @ruche/brand, et changer
//   une couleur là-bas la change partout ;
// - le nom affiché de l'appli vient lui aussi de @ruche/brand.
// (Une troisième règle est vérifiée par le linter Biome : un écran n'importe pas Text, View,
// StyleSheet… de React Native, il utilise les composants de src/ui. Voir biome.json.)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { appName } from '@ruche/brand'

const root = join(__dirname, '..')

/** Tous les fichiers de code de l'appli, sauf les tests et les fichiers fabriqués. */
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || name.endsWith('.generated.ts')) {
      return []
    }
    return [path]
  })

// Les commentaires peuvent parler de couleurs (« #FFC21A ») : on ne regarde que le code.
const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

const colorLiteral =
  /#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b|\b(?:rgba?|hsla?)\(|['"](?:white|black)['"]/gi

describe('design rules', () => {
  it('writes no color by hand: every color comes from @ruche/brand', () => {
    const offenders = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))]
      .map((file) => ({
        file: relative(root, file),
        found: withoutComments(readFileSync(file, 'utf8')).match(colorLiteral),
      }))
      .filter(({ found }) => found)
    // Le message d'échec liste chaque fichier et la couleur trouvée.
    expect(offenders).toEqual([])
  })

  it('shows the app name from @ruche/brand under the phone icon too', () => {
    const config = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'))
    expect(config.expo.name).toBe(appName)
  })
})
