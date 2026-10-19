// Corrige la typographie française des textes d'un fichier de traductions (src/locales/fr.ts),
// selon les règles que vérifie src/typography.test.ts :
// - une espace fine insécable (U+202F) avant « ? », « ! » et « ; » ;
// - une espace insécable (U+00A0) avant « : » (sauf dans « https:// ») et à l'intérieur de « » ;
// - l'apostrophe typographique (’) à la place de l'apostrophe droite (').
// Seuls les textes sont touchés : jamais le code, les commentaires, les noms de clés, ni les
// paramètres {{…}} remplis à l'affichage. Le lanceur est scripts/typo-fix.mjs (pnpm typo:fix).
//
// Ce fichier ne fait que transformer une chaîne de caractères en une autre (une « fonction pure ») :
// il ne lit ni n'écrit aucun fichier, ce qui permet de le tester facilement.

// Les espaces qu'on remplace par la bonne : espace ordinaire, insécable, fine insécable.
const SPACES = '[ \\u00a0\\u202f]*'
// Écrites par leur numéro Unicode : dans le code, ces espaces seraient invisibles.
const NARROW = String.fromCodePoint(0x202f) // espace fine insécable
const NBSP = String.fromCodePoint(0x00a0) // espace insécable

// Chaque règle : ce qu'on cherche, et ce que doit devenir ce qu'on a trouvé. Une expression
// régulière (« regex ») décrit un motif de texte ; le drapeau g cherche toutes les occurrences.
const rules: { pattern: RegExp; fix: (found: string, ...groups: string[]) => string }[] = [
  { pattern: /'/g, fix: () => '’' },
  // [?!;] : un de ces trois signes. Ce qui le précède (espaces de toute sorte, ou rien) devient
  // une seule espace fine insécable.
  { pattern: new RegExp(`${SPACES}([?!;])`, 'g'), fix: (_, sign = '') => NARROW + sign },
  // :(?!\/\/) : un deux-points qui n'est pas suivi de « // » (les adresses https:// restent).
  { pattern: new RegExp(`${SPACES}:(?!//)`, 'g'), fix: () => `${NBSP}:` },
  { pattern: new RegExp(`«${SPACES}`, 'g'), fix: () => `«${NBSP}` },
  { pattern: new RegExp(`${SPACES}»`, 'g'), fix: () => `${NBSP}»` },
]

/** Corrige un texte (la valeur d'une chaîne, déjà lue) et compte les corrections. */
export const fixText = (text: string): { text: string; count: number } => {
  let count = 0
  // Les paramètres {{…}} sont mis de côté : split avec un groupe entre parenthèses garde les
  // morceaux trouvés, aux positions impaires du tableau.
  const parts = text.split(/(\{\{.*?\}\})/)
  const fixed = parts.map((part, i) => {
    if (i % 2 === 1) return part
    let result = part
    for (const { pattern, fix } of rules) {
      result = result.replace(pattern, (found: string, ...groups: string[]) => {
        const replacement = fix(found, ...groups)
        // Déjà correct : ce n'est pas une correction. C'est ce qui rend le script « idempotent » :
        // le relancer ne change plus rien.
        if (replacement !== found) count++
        return replacement
      })
    }
    return result
  })
  return { text: fixed.join(''), count }
}

// Lit le contenu d'une chaîne écrite dans le code ('…' ou "…") : « \' » devient « ' », « \n » un
// retour à la ligne, une séquence « \u » de 4 chiffres le caractère qu’elle désigne.
const decode = (raw: string): string =>
  raw.replace(
    /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g,
    (_, sequence: string) => {
      const simple: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        v: '\v',
        '0': '\0',
        '\n': '',
        '\r\n': '',
      }
      if (sequence in simple) return simple[sequence] ?? ''
      if (sequence.startsWith('u{'))
        return String.fromCodePoint(parseInt(sequence.slice(2, -1), 16))
      if (/^[ux]/.test(sequence) && sequence.length > 1) {
        return String.fromCharCode(parseInt(sequence.slice(1), 16))
      }
      return sequence // \' \" \\ et les autres : le caractère lui-même
    },
  )

// Réécrit un texte en chaîne entre apostrophes droites, le style du projet (Biome).
const encode = (text: string): string =>
  `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`

/**
 * Corrige tous les textes d'un fichier source. Le fichier est parcouru caractère par caractère, en
 * sachant à chaque instant si l'on est dans le code, un commentaire ou une chaîne : c'est ainsi
 * qu'on ne touche qu'aux textes. Renvoie le nouveau contenu, le nombre de corrections et les lignes
 * modifiées.
 *
 * Limites, sans conséquence pour fr.ts : une chaîne suivie de « : » est prise pour un nom de clé
 * (donc aussi dans « a ? 'oui' : 'non' ») ; un gabarit `…` contenant ${…} est laissé tel quel.
 */
export const fixSource = (source: string): { source: string; count: number; lines: number[] } => {
  let output = ''
  let count = 0
  const lines: number[] = []
  let i = 0
  const lineAt = (index: number) => source.slice(0, index).split('\n').length

  while (i < source.length) {
    const char = source.charAt(i)
    const next = source.charAt(i + 1)

    // Commentaire d'une ligne (// …) ou de plusieurs (/* … */) : recopié tel quel.
    if (char === '/' && (next === '/' || next === '*')) {
      const close = next === '/' ? '\n' : '*/'
      const found = source.indexOf(close, i + 2)
      // La fin de ligne reste dans le code ; « */ » fait partie du commentaire.
      const stop = found === -1 ? source.length : found + (next === '*' ? 2 : 0)
      output += source.slice(i, stop)
      i = stop
      continue
    }

    // Une chaîne : on cherche sa fin, en sautant les caractères échappés (\').
    if (char === "'" || char === '"' || char === '`') {
      let end = i + 1
      while (end < source.length && source.charAt(end) !== char) {
        end += source.charAt(end) === '\\' ? 2 : 1
      }
      const literal = source.slice(i, end + 1)
      const raw = literal.slice(1, -1)
      // Un nom de clé ('mon-nom': …) n'est pas un texte affiché.
      const isKey = /^\s*:/.test(source.slice(end + 1))
      const isTemplate = char === '`'
      const untouchable = isKey || (isTemplate && (raw.includes('${') || raw.includes('\\')))
      if (!untouchable) {
        const fixed = fixText(isTemplate ? raw : decode(raw))
        if (fixed.count > 0) {
          count += fixed.count
          lines.push(lineAt(i))
          output += isTemplate ? `\`${fixed.text}\`` : encode(fixed.text)
          i = end + 1
          continue
        }
      }
      output += literal
      i = end + 1
      continue
    }

    output += char
    i++
  }
  return { source: output, count, lines }
}
