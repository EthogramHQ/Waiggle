// Outils des tests qui lisent une feuille de style écrite en texte : celle de la page web
// (`documentCss`, src/ui/theme/document.ts) et celle que le squelette HTML pose pour un navigateur
// sans JavaScript (app/+html.tsx). Jest ne dessine rien : on lit donc les règles elles-mêmes, une à
// une, avec les blocs `@media` qui les entourent (tranche R13, « Le premier chargement »).

/** Une règle CSS : ses sélecteurs, ses déclarations, et les conditions `@media` qui l'entourent. */
export type CssRule = {
  /** Les conditions des blocs `@media` autour d'elle, du plus large au plus proche, sans « @media ». */
  media: string[]
  /** Les sélecteurs de la règle (`a, b` en donne deux), sans blancs autour. */
  selectors: string[]
  /** Les déclarations, propriété en minuscules → valeur (sans « !important »). */
  declarations: Record<string, string>
  /** Les propriétés déclarées avec « !important ». */
  important: string[]
  /** Sa place dans la feuille (0 pour la première) : de deux règles de même poids, la dernière gagne. */
  order: number
}

export type CssSheet = {
  rules: CssRule[]
  /** Le corps de chaque `@keyframes`, par nom. */
  keyframes: Record<string, string>
}

/** L'indice de la parenthèse ou de l'accolade qui ferme celle ouverte en `start`. */
const closing = (text: string, start: number): number => {
  const open = text[start]
  const close = open === '(' ? ')' : '}'
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`Unclosed « ${open} » in: ${text.slice(start, start + 60)}`)
}

/** Coupe aux virgules qui ne sont dans aucune parenthèse (`:not(a, b), c` donne deux morceaux). */
export const splitTopLevel = (text: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(from, i).trim())
      from = i + 1
    }
  }
  parts.push(text.slice(from).trim())
  return parts.filter((part) => part !== '')
}

/** Lit une feuille de style : ses règles (dans l'ordre) et ses animations (`@keyframes`). */
export const parseCss = (css: string): CssSheet => {
  const sheet: CssSheet = { rules: [], keyframes: {} }
  const walk = (text: string, media: string[]) => {
    let from = 0
    for (;;) {
      const brace = text.indexOf('{', from)
      if (brace === -1) return
      const prelude = text.slice(from, brace).trim()
      const end = closing(text, brace)
      const body = text.slice(brace + 1, end)
      from = end + 1
      if (prelude.startsWith('@media')) {
        walk(body, [...media, prelude.slice('@media'.length).trim()])
      } else if (prelude.startsWith('@keyframes')) {
        sheet.keyframes[prelude.slice('@keyframes'.length).trim()] = body.trim()
      } else if (!prelude.startsWith('@')) {
        const declarations: Record<string, string> = {}
        const important: string[] = []
        for (const line of body.split(';')) {
          const colon = line.indexOf(':')
          if (colon === -1) continue
          const property = line.slice(0, colon).trim().toLowerCase()
          let value = line.slice(colon + 1).trim()
          if (/!important$/.test(value)) {
            important.push(property)
            value = value.replace(/\s*!important$/, '')
          }
          declarations[property] = value
        }
        sheet.rules.push({
          media,
          selectors: splitTopLevel(prelude),
          declarations,
          important,
          order: sheet.rules.length,
        })
      }
    }
  }
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), [])
  return sheet
}

/** Une condition `@media` sans aucun blanc, pour comparer `(min-width: 700px)` et `(min-width:700px)`. */
export const compactMedia = (condition: string): string =>
  condition.replace(/\s+/g, '').toLowerCase()

/** Vrai si la règle est sous une condition `@media` qui contient `condition` (écrite sans blancs ou non). */
export const underMedia = (rule: CssRule, condition: string): boolean =>
  rule.media.some((media) => compactMedia(media).includes(compactMedia(condition)))

/** Une valeur sans blancs superflus, pour comparer `visibility:visible` et `visibility: visible`. */
export const compactValue = (text: string): string => text.replace(/\s+/g, '').toLowerCase()

/**
 * Le poids d'un sélecteur (sa « spécificité »), `[identifiants, classes et attributs et
 * pseudo-classes, éléments]` : de deux règles qui se contredisent, la plus lourde gagne ; à poids
 * égal, la dernière écrite. `:not(…)`, `:is(…)` et `:has(…)` pèsent ce que pèse leur argument le plus
 * lourd, `:where(…)` rien.
 */
export const specificity = (selector: string): [number, number, number] => {
  const total: [number, number, number] = [0, 0, 0]
  const add = (other: [number, number, number]) => {
    total[0] += other[0]
    total[1] += other[1]
    total[2] += other[2]
  }
  const identEnd = (from: number) => {
    let i = from
    while (i < selector.length && /[\w-]/.test(selector[i] ?? '')) i++
    return i
  }
  let i = 0
  while (i < selector.length) {
    const char = selector[i] ?? ''
    if (char === '#') {
      total[0]++
      i = identEnd(i + 1)
    } else if (char === '.') {
      total[1]++
      i = identEnd(i + 1)
    } else if (char === '[') {
      total[1]++
      i = selector.indexOf(']', i) + 1
    } else if (char === ':' && selector[i + 1] === ':') {
      total[2]++
      i = identEnd(i + 2)
      if (selector[i] === '(') i = closing(selector, i) + 1
    } else if (char === ':') {
      const start = i + 1
      i = identEnd(start)
      const name = selector.slice(start, i)
      if (selector[i] === '(') {
        const end = closing(selector, i)
        const inner = selector.slice(i + 1, end)
        i = end + 1
        if (name === 'not' || name === 'is' || name === 'has') {
          add(splitTopLevel(inner).map(specificity).sort(compareSpecificity).at(-1) ?? [0, 0, 0])
        } else if (name !== 'where') total[1]++
      } else total[1]++
    } else if (/[a-zA-Z]/.test(char)) {
      total[2]++
      i = identEnd(i)
    } else i++
  }
  return total
}

/** Compare deux poids : négatif si `a` pèse moins que `b`, 0 s'ils sont égaux. */
export const compareSpecificity = (
  a: [number, number, number],
  b: [number, number, number],
): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * R16 (plan, choix 6) : la lueur d'un squelette porte sur le web un attribut `data-…` (par `dataSet`,
 * que react-native-web écrit en attribut), visé par une règle `@media (prefers-reduced-motion)` de
 * `documentCss` qui l'arrête avant même l'hydratation. Le nom exact de l'attribut est laissé au
 * code : on reconnaît celui dont le nom ou la valeur parle de la lueur ou du squelette
 * (`data-skeleton-glow`, `data-skeleton="glow"`…). Rend, pour un sélecteur, chaque attribut trouvé :
 * son nom tel que l'écrit `dataSet` (`skeletonGlow`) et la valeur exigée, s'il y en a une.
 */
export const glowAttributesIn = (selector: string): { key: string; value: string | null }[] =>
  [...selector.matchAll(/\[data-([a-z0-9-]+)(?:\s*=\s*["']?([^"'\]]*)["']?)?\]/gi)]
    .filter(([, name = '', value = '']) => /glow|skeleton/i.test(`${name} ${value}`))
    .map(([, name = '', value]) => ({
      key: name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()),
      value: value ?? null,
    }))
