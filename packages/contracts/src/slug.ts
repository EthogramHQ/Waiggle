// Fabrique l'« étiquette » d'un outil : la forme qui sert à regrouper les projets faits avec lui,
// et qui apparaît dans l'adresse de sa page (/tags/claude-code). Partagée par l'API (qui range les
// projets) et l'appli (qui fait des outils favoris des liens). « Claude Code », « claude-code »
// et « CLAUDE code » donnent la même étiquette.

/**
 * La longueur maximale d'une étiquette, en caractères (relecture de sécurité sec-A1). Un nom court
 * (40 caractères) peut donner une étiquette bien plus longue : un emoji devient « u1f916- » (7
 * caractères), et NFKD déplie certaines ligatures en une phrase entière (« ﷺ » : 18 lettres). Sans
 * borne, l'étiquette dépassait les 200 caractères de `ToolSlug`, que l'API vérifie en sortie : la
 * page « À vérifier » tombait en erreur. 120 laisse la place d'un suffixe (« -2 » à « -51 »).
 * La migration 0016 applique la même borne en SQL (`pg_temp.r6b_bound`).
 */
export const TOOL_SLUG_MAX = 120

/**
 * Coupe une étiquette trop longue sur un tiret, pour ne jamais garder la moitié d'un mot ou d'un
 * numéro (« u1f9 »), et sans tiret final. Un seul mot plus long que la borne, sans tiret où couper,
 * est coupé net. On compte en points de code (`Array.from`), comme Zod : couper une chaîne avec
 * `slice` pourrait séparer les deux moitiés d'une lettre hors du plan de base (« 𠀀 »).
 */
const bound = (slug: string): string => {
  const chars = Array.from(slug)
  if (chars.length <= TOOL_SLUG_MAX) return slug
  // Un caractère de plus que la borne : si c'est un tiret, le mot qui le précède est entier.
  const head = chars.slice(0, TOOL_SLUG_MAX + 1)
  const dash = head.lastIndexOf('-')
  return (dash > 0 ? head.slice(0, dash) : head.slice(0, TOOL_SLUG_MAX)).join('')
}

export const toolSlug = (label: string): string => {
  const slug = label
    // NFKD sépare les lettres de leurs accents (« é » devient « e » + « ´ »)…
    .normalize('NFKD')
    // … puis on retire les accents (\p{M} : toutes les « marques » Unicode, dans toutes les langues).
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Tout ce qui n'est ni lettre (\p{L}) ni chiffre (\p{N}) devient un tiret, un seul à la suite.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') // pas de tiret au début ni à la fin
  if (slug) return bound(slug)
  // Un nom fait seulement de symboles (« 🤖 ») : on utilise leurs numéros Unicode (« u1f916 »).
  return bound(
    Array.from(label.trim(), (char) => `u${char.codePointAt(0)?.toString(16)}`).join('-'),
  )
}
