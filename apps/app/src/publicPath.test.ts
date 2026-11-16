// Tests des adresses par langue des pages publiques (tranche R12, scénario « Les adresses par
// langue », choix 7 du plan) : l'accueil (`/fr/`, `/en/`), un projet public (`/fr/projects/<id>`), ses
// mises à jour, une page publique (`/fr/members/<id>`) et les quatre pages de R11, aux mêmes chemins
// qu'aujourd'hui précédés de la langue. Les liens d'un écran visiteur, le pied de page, le partage
// et l'aperçu passent par ces fonctions.
//
// L'interface attendue (plan R12, « API des modules partagés ») : `src/publicPath.ts`,
// - `publicPath(kind: 'home' | 'project' | 'updates' | 'member' | LegalPage, lang: 'fr' | 'en',
//   id?: string): string` ;
// - `languageOfPath(pathname): 'fr' | 'en' | null` ;
// - `otherLanguagePath(pathname)` : la même page dans l'autre langue, null hors d'une adresse à
//   langue (décision 16 : sur `/`, `LanguageLink` n'a pas d'autre adresse à proposer).
import { LEGAL_PAGES } from '@ruche/contracts'
import { languageOfPath, otherLanguagePath, publicPath } from './publicPath'

const projectId = 'd1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6'

describe('publicPath', () => {
  it('writes the home of each language with its final slash', () => {
    expect(publicPath('home', 'fr')).toBe('/fr/')
    expect(publicPath('home', 'en')).toBe('/en/')
  })

  it('writes a public project, its updates and a public page after the language', () => {
    expect(publicPath('project', 'fr', projectId)).toBe(`/fr/projects/${projectId}`)
    expect(publicPath('project', 'en', projectId)).toBe(`/en/projects/${projectId}`)
    expect(publicPath('updates', 'fr', projectId)).toBe(`/fr/projects/${projectId}/updates`)
    expect(publicPath('member', 'en', 'u-ines')).toBe('/en/members/u-ines')
  })

  it('writes the four pages of R11 at their paths of today, after the language', () => {
    for (const page of LEGAL_PAGES) {
      expect(publicPath(page, 'fr')).toBe(`/fr/${page}`)
      expect(publicPath(page, 'en')).toBe(`/en/${page}`)
    }
  })

  it('never lets an identifier change the path', () => {
    expect(publicPath('member', 'fr', '../out')).toBe('/fr/members/..%2Fout')
    expect(publicPath('project', 'fr', 'a?b#c')).toBe('/fr/projects/a%3Fb%23c')
  })
})

describe('languageOfPath', () => {
  it('reads the language at the start of a public address', () => {
    expect(languageOfPath('/fr/')).toBe('fr')
    expect(languageOfPath('/en')).toBe('en')
    expect(languageOfPath(`/fr/projects/${projectId}`)).toBe('fr')
    expect(languageOfPath('/en/members/u-ines')).toBe('en')
    expect(languageOfPath('/en/privacy')).toBe('en')
  })

  it('finds no language in a members address, nor in a lookalike', () => {
    for (const pathname of [
      '/',
      '/feed',
      '/projects/x',
      '/rules',
      '/de/',
      '/fra/',
      '/french',
      '/frx',
      '/FR/',
    ]) {
      expect(languageOfPath(pathname)).toBeNull()
    }
    // Témoin : une vraie adresse à langue.
    expect(languageOfPath('/fr/')).toBe('fr')
  })
})

describe('otherLanguagePath', () => {
  it('leads to the same page in the other language', () => {
    expect(otherLanguagePath('/fr/')).toBe('/en/')
    expect(otherLanguagePath('/en/')).toBe('/fr/')
    expect(otherLanguagePath(`/fr/projects/${projectId}`)).toBe(`/en/projects/${projectId}`)
    expect(otherLanguagePath(`/en/projects/${projectId}/updates`)).toBe(
      `/fr/projects/${projectId}/updates`,
    )
    expect(otherLanguagePath('/en/members/u-ines')).toBe('/fr/members/u-ines')
    expect(otherLanguagePath('/fr/accessibility')).toBe('/en/accessibility')
  })

  it('has no other address for a page without a language', () => {
    expect(otherLanguagePath('/')).toBeNull()
    expect(otherLanguagePath('/feed')).toBeNull()
    expect(otherLanguagePath('/projects/x')).toBeNull()
    // Témoin : une vraie adresse à langue a son autre langue.
    expect(otherLanguagePath('/fr/')).toBe('/en/')
  })
})
