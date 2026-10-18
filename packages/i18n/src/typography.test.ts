// Tests de la typographie française des textes (locales/fr.ts). Les espaces insécables ne se voient
// pas dans le code : ce test vérifie qu'aucun texte ne les oublie, et qu'aucune apostrophe droite
// n'a été tapée à la place de l'apostrophe typographique.
import { describe, expect, it } from 'vitest'
import { resources } from './index'

type Tree = { [key: string]: string | Tree }

// Tous les textes français, avec leur chemin (« home.greeting »).
const texts = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value] as [string, string]] : texts(value, path)
  })

const fr = texts(resources.fr.translation)

describe('French typography', () => {
  it('puts a narrow no-break space before ? ! and ;', () => {
    for (const [path, text] of fr) {
      expect(text, path).not.toMatch(/[  ][?!;]/)
      expect(text, path).not.toMatch(/[^\s ([{][?!;](\s|$)/)
    }
  })

  it('puts a no-break space before : and inside quotation marks', () => {
    for (const [path, text] of fr) {
      // Un deux-points collé ou précédé d'une espace ordinaire (sauf dans « https:// »).
      expect(text, path).not.toMatch(/ :|[^\s /s]:(\s|$)/)
      expect(text, path).not.toMatch(/«(?! )|(?<! )»/)
    }
  })

  it('uses the typographic apostrophe', () => {
    for (const [path, text] of fr) {
      expect(text, path).not.toContain("'")
    }
  })
})
