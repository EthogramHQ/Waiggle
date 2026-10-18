// Fabrique l'« étiquette » d'un outil : la forme qui sert à regrouper les projets faits avec lui,
// et qui apparaît dans l'adresse de sa page (/tags/claude-code). Partagée par l'API (qui range les
// projets) et l'appli (qui fait des outils favoris des liens). « Claude Code », « claude-code »
// et « CLAUDE code » donnent la même étiquette.

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
  if (slug) return slug
  // Un nom fait seulement de symboles (« 🤖 ») : on utilise leurs numéros Unicode (« u1f916 »).
  return Array.from(label.trim(), (char) => `u${char.codePointAt(0)?.toString(16)}`).join('-')
}
