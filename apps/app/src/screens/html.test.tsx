// Ce qu'un aperçu de lien peut lire d'une page web de l'appli (tranche R5a, relecture juridique
// jur-12). Les messageries (WhatsApp, Messages…) fabriquent l'aperçu d'un lien partagé en lisant le
// HTML servi, sans lancer le JavaScript : ni balise « og: » ni titre de projet ne doivent s'y
// trouver, sans quoi un lien partagé montrerait le titre d'un projet à qui n'est pas membre.
// Le titre de l'onglet, lui, est écrit par le JavaScript une fois la page lue (ui/Screen.tsx).
// Ce fichier vit dans src/ et non à côté de app/+html.tsx : Expo Router prend pour une page tout
// fichier de app/ (sauf +html.tsx lui-même), un test compris.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { ReactElement } from 'react'
import Root from '../../app/+html'

// react-dom/server fabrique le HTML d'un composant, comme la construction du site web. Ses types
// ne sont pas installés : le « as » décrit seulement la fonction dont on se sert.
const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string
}

/** Le dossier de l'appli (apps/app). */
const appDir = join(__dirname, '..', '..')

/** Les fichiers de code de ce dossier et de ses sous-dossiers, tests exclus. */
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })

const appSources = [...sources(join(appDir, 'app')), ...sources(join(appDir, 'src'))]
const read = (path: string) => readFileSync(path, 'utf8')
const nameOf = (path: string) => relative(appDir, path).replaceAll('\\', '/')

describe('the HTML served for every page', () => {
  it('has no « og: » tag and no title of its own in its shell', () => {
    const html = renderToStaticMarkup(<Root>{null}</Root>)

    // Témoin : le squelette est bien rendu, avec son icône.
    expect(html).toContain('/favicon.svg')
    expect(html).not.toMatch(/og:/)
    expect(html).not.toMatch(/twitter:/)
    expect(html).not.toMatch(/<title/)
  })

  it('gets no « og: » tag from any page or component', () => {
    // Témoin : le parcours lit bien les sources (Screen écrit le titre de l'onglet par Head).
    expect(appSources.map(nameOf)).toContain('src/ui/Screen.tsx')
    const withOpenGraph = appSources
      .filter((path) => /['"`]og:|property=["']og:|name=["']twitter:/.test(read(path)))
      .map(nameOf)
    expect(withOpenGraph).toEqual([])
  })

  it('prepares no page per project in advance, which would write its title in the HTML', () => {
    // generateStaticParams demanderait à Expo Router une page HTML par projet, titre compris.
    expect(appSources.map(nameOf)).toContain('app/projects/[id]/index.tsx') // témoin
    const prepared = appSources
      .filter((path) => read(path).includes('generateStaticParams'))
      .map(nameOf)
    expect(prepared).toEqual([])
  })
})
