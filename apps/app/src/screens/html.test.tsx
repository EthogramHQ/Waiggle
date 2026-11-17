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
import Root, { HEAD_MARKER, LANG_TEMPLATE } from '../../app/+html'
import { type CssRule, compareSpecificity, parseCss, specificity } from '../testing/css'
import { documentCss } from '../ui/theme/document'

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
    // Depuis R12 (relecture du plan, B1, décision 8), une seule exception : la mise en page des
    // adresses par langue prépare chaque page en français et en anglais, rien de plus (ses valeurs
    // sont vérifiées par src/i18n/pageLanguage.test.tsx : `fr` et `en`, jamais un identifiant).
    expect(appSources.map(nameOf)).toContain('app/projects/[id]/index.tsx') // témoin
    const prepared = appSources
      .filter((path) => read(path).includes('generateStaticParams'))
      .map(nameOf)
    expect(prepared).toEqual(['app/[lang]/_layout.tsx'])
  })
})

// R12 (plan, choix 5 ; relecture de sécurité du plan, B1) : les instructions que Caddy exécute sur
// les pages publiques (infra/Caddyfile, « templates »). Sans Caddy, elles doivent rester sans effet.
describe('the Caddy instructions of the HTML shell', () => {
  const html = renderToStaticMarkup(<Root>{null}</Root>)
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))

  it('keeps the head marker a single inert comment without Caddy, in a template element of the head', () => {
    const start = head.indexOf('<template><!--')
    expect(start).toBeGreaterThan(-1)
    // Le commentaire se ferme une seule fois, à la fin du marqueur, avec l'élément : rien ne
    // s'affiche ni ne s'applique en dehors.
    const end = head.indexOf('-->', start)
    expect(head.slice(end, end + '--></template>'.length)).toBe('--></template>')
    expect(head.slice(start, end)).toContain('[[waiggle httpInclude (print "/v1/public/head?lang="')
    expect(head.slice(start + '<template><!--'.length, end)).not.toContain('<!--')
    // Aucune autre instruction dans la tête, et aucun script : le contenu d'un <script> ou d'un
    // <noscript> se lit autrement qu'un commentaire.
    expect(head.slice(0, start) + head.slice(end)).not.toContain('[[waiggle')
    expect(head).not.toMatch(/<(no)?script/)
  })

  it('says French in <html lang> without Caddy, after the attribute Caddy fills on English pages', () => {
    const tag = html.match(/<html[^>]*>/)?.[0] ?? ''
    // Le premier « lang » est celui que lit le navigateur : sans Caddy, c'est « fr ».
    expect(tag.match(/\slang="([^"]*)"/)?.[1]).toBe('fr')
    expect(tag.indexOf('data-waiggle-lang="[[waiggle if hasPrefix `/en/`')).toBeGreaterThan(-1)
    expect(tag.indexOf('data-waiggle-lang=')).toBeLessThan(tag.indexOf(' lang='))
  })

  it('writes no value of the request in the page: the address only chooses a text or goes encoded to the API', () => {
    const instructions = [...html.matchAll(/\[\[waiggle ([^\]]*)\]\]/g)].map(
      (match) => match[1] ?? '',
    )
    expect(instructions.length).toBeGreaterThan(4) // témoin : les instructions sont bien lues
    // Les deux seules façons permises de lire l'adresse : un choix, ou un paramètre encodé.
    const allowed = [
      /hasPrefix (`\/en\/`|"\/en\/") \.OriginalReq\.URL\.Path/g,
      /\(urlquery \.OriginalReq\.URL\.Path\)/g,
    ]
    const rest = instructions.map((text) =>
      allowed.reduce((left, rule) => left.replace(rule, ''), text),
    )
    // Rien d'autre de la demande (.Req, .OriginalReq, .Host, .Cookie…), ni d'un réglage du serveur.
    for (const text of rest) {
      expect(text).not.toMatch(
        /\.(Req|OriginalReq|Host|RemoteIP|Cookie|ClientIP)\b|placeholder|env\b/,
      )
    }
  })

  // R13 (relecture de sécurité du plan, point 2) : tout le squelette d'une page publique est un
  // gabarit pour Caddy, le balisage neuf (abeille d'attente, <noscript>, feuille de style) compris.
  it('contains no Caddy instruction outside the lang attribute and the head marker', () => {
    const count = (text: string) => text.split('[[waiggle').length - 1
    const expected = count(LANG_TEMPLATE) + count(HEAD_MARKER)
    expect(expected).toBeGreaterThan(4) // témoin : les deux gabarits sont bien comptés
    expect(count(html)).toBe(expected)
  })
})

// R13 « Le premier chargement » (docs/scenarios/refonte.md ; plan, décisions 6 et 7 ; relecture du
// plan, décisions 5 et 6). Avant le démarrage de l'appli, sur ordinateur et en mode sombre, la page
// reste cachée et une abeille décorative attend au centre (src/ui/theme/document.ts). Sans
// JavaScript, un <noscript> du corps montre la page tout de suite et cache l'abeille.
describe('the wait bee and the page without JavaScript', () => {
  const html = renderToStaticMarkup(
    <Root>
      {/* La page, telle qu'Expo Router la pose dans le corps (sans texte ici : le lint de React
          Native refuse un texte hors de <Text>, même dans un test du HTML). */}
      <main id="page" />
    </Root>,
  )
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'))

  /** La balise ouvrante de l'élément d'attente (`data-wait`), et sa place dans le corps. */
  const waitTag = body.match(/<([a-z]+)\b[^>]*\sdata-wait(="[^"]*")?[\s>/][^>]*>?/)
  const waitStart = waitTag?.index ?? -1

  /** L'élément d'attente entier, de sa balise ouvrante à celle qui la ferme. */
  const waitElement = (): string => {
    const tag = waitTag?.[1]
    if (!tag || waitStart === -1) return ''
    const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
    pattern.lastIndex = waitStart
    let depth = 0
    for (let match = pattern.exec(body); match; match = pattern.exec(body)) {
      depth += match[1] === '/' ? -1 : 1
      if (depth === 0) return body.slice(waitStart, match.index + match[0].length)
    }
    return body.slice(waitStart)
  }

  /** La feuille de style du <noscript> du corps. */
  const noscriptCss = (): string =>
    body.match(/<noscript>\s*<style[^>]*>([\s\S]*?)<\/style>\s*<\/noscript>/)?.[1] ?? ''

  it('puts a decorative wait element in the body, before the page, with nothing to read', () => {
    expect(body).toContain('<main id="page">') // témoin : la page est rendue
    expect(waitStart).toBeGreaterThan(-1)
    expect(waitStart).toBeLessThan(body.indexOf('<main'))
    // Décorative : cachée aux lecteurs d'écran, sans texte, dessinée (l'abeille du lancement).
    expect(waitTag?.[0]).toContain('aria-hidden="true"')
    expect(waitElement()).toContain('<svg')
    // Aucun texte entre deux balises : après chaque « > », seuls des blancs ou une autre balise.
    // (Pas de `replace` des balises : l'analyse de sécurité y lit un nettoyage de HTML incomplet.)
    expect(waitElement()).not.toMatch(/>\s*[^<\s]/)
  })

  it('shows the page without JavaScript from a noscript in the body, never in the head', () => {
    // Le <noscript> est dans le corps, avant la page, et ne contient qu'une feuille de style.
    const noscript = body.match(/<noscript>([\s\S]*?)<\/noscript>/)
    expect(noscript).not.toBeNull()
    expect(noscript?.index ?? -1).toBeLessThan(body.indexOf('<main'))
    expect(noscript?.[1]?.trim()).toMatch(/^<style[^>]*>[^<]*<\/style>$/)
    // La tête n'a toujours ni <script> ni <noscript> (garde de R12 : le marqueur de Caddy).
    expect(head).not.toMatch(/<(no)?script/)
  })

  it('hides the wait bee and shows the page without JavaScript', () => {
    const page = parseCss(documentCss)
    const fallback = parseCss(noscriptCss())
    // Après la feuille de la page dans le document : à poids égal, la dernière règle gagne.
    expect(html.indexOf('<noscript>')).toBeGreaterThan(html.indexOf(documentCss.slice(0, 40)))

    /** Vrai si `rule` l'emporte sur chacune des règles `others` pour `property`. */
    const beats = (rule: CssRule, others: CssRule[], property: string) =>
      rule.important.includes(property) ||
      others.every(
        (other) =>
          !other.important.includes(property) &&
          other.selectors.every(
            (theirs) =>
              compareSpecificity(
                specificity(rule.selectors.find(aimsAt(theirs)) ?? rule.selectors[0] ?? ''),
                specificity(theirs),
              ) >= 0,
          ),
      )
    const aimsAt = (theirs: string) => (mine: string) =>
      (/body\s*>\s*\*/.test(theirs) && /body\s*>\s*\*/.test(mine)) ||
      (theirs.includes('[data-wait]') && mine.includes('[data-wait]'))

    // La page : visible, plus forte que chaque règle de la page qui la cache.
    const hiding = page.rules.filter(
      (rule) =>
        rule.declarations.visibility === 'hidden' &&
        rule.selectors.some((selector) => /body\s*>\s*\*/.test(selector)),
    )
    expect(hiding).not.toEqual([]) // témoin
    const showing = fallback.rules.filter(
      (rule) =>
        rule.declarations.visibility === 'visible' &&
        rule.selectors.some((selector) => /body\s*>\s*\*/.test(selector)),
    )
    expect(showing.some((rule) => beats(rule, hiding, 'visibility'))).toBe(true)

    // L'abeille : cachée, plus forte que chaque règle de la page qui la montre.
    const beeShown = page.rules.filter(
      (rule) =>
        rule.selectors.some((selector) => selector.includes('[data-wait]')) &&
        rule.declarations.display !== undefined &&
        rule.declarations.display !== 'none',
    )
    expect(beeShown).not.toEqual([]) // témoin : l'abeille se montre avec JavaScript
    const beeHidden = fallback.rules.filter(
      (rule) =>
        rule.declarations.display === 'none' &&
        rule.selectors.some((selector) => selector.includes('[data-wait]')),
    )
    expect(beeHidden.some((rule) => beats(rule, beeShown, 'display'))).toBe(true)
  })

  it('writes no colour in the wait bee markup', () => {
    const markup = waitElement()
    expect(markup).toContain('<path') // témoin : le dessin est bien là
    // Les couleurs viennent de la feuille de la page (documentCss), par rôle, de jour et de nuit.
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/)
    for (const [, value] of markup.matchAll(/\s(?:fill|stroke|color|stop-color)="([^"]*)"/g)) {
      expect(value).toMatch(/^(none|currentColor|var\(--[\w-]+\))$/)
    }
    expect(markup).not.toMatch(/style="[^"]*(color|fill|stroke)/)
  })

  it('adds no inline script to the page shell', () => {
    // La CSP n'admet que le script d'Expo (infra/Caddyfile) : l'abeille et le <noscript> sont du
    // balisage et du style, jamais un script.
    expect(html).toContain('data-wait') // témoin : le balisage neuf est bien rendu
    expect(html).not.toMatch(/<script/)
  })
})
