// Tests de la typographie française des textes (locales/fr.ts). Les espaces insécables ne se voient
// pas dans le code : ce test vérifie qu'aucun texte ne les oublie, et qu'aucune apostrophe droite
// n'a été tapée à la place de l'apostrophe typographique.
// Dans les expressions ci-dessous, \u202f est l'espace fine insécable et \u00a0 l'espace insécable.
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
      // Chaque ? ! ; est précédé d'une espace fine insécable, et de rien d'autre.
      expect(text, path).not.toMatch(/(?<!\u202f)[?!;]/)
    }
  })

  it('puts a no-break space before : and inside quotation marks', () => {
    for (const [path, text] of fr) {
      // Chaque deux-points est précédé d'une espace insécable (sauf dans « https:// »).
      expect(text, path).not.toMatch(/(?<!\u00a0):(?!\/\/)/)
      expect(text, path).not.toMatch(/«(?!\u00a0)|(?<!\u00a0)»/)
    }
  })

  it('uses the typographic apostrophe', () => {
    for (const [path, text] of fr) {
      expect(text, path).not.toContain("'")
    }
  })

  it('catches the usual mistakes', () => {
    // Le test se vérifie lui-même : ces fautes doivent être repérées.
    const question = /(?<!\u202f)[?!;]/
    const colon = /(?<!\u00a0):(?!\/\/)/
    expect('Où en est-il ?').toMatch(question)
    expect('Où en est-il?)').toMatch(question)
    expect('Outils: facultatif').toMatch(colon)
    expect('Privé\u202f: visible').toMatch(colon)
    expect('https://monprojet.vercel.app').not.toMatch(colon)
  })
})
