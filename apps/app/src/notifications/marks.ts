// Découpe le texte d'une notification en morceaux de style : les phrases des traductions marquent
// leurs noms et titres par <b>…</b> (gras) et une version par <v>…</v>. Une fonction pure, sans
// React ni i18next : l'écran reçoit des « parties » (`{ text, style? }`) et choisit leur
// habillage ; il n'écrit jamais de HTML.
//
// Pourquoi découper AVANT de remplir les {{…}} : un titre de projet écrit par un membre peut
// contenir « <b> ». Si on le mettait dans la phrase puis qu'on découpait, il changerait le style
// du reste de la ligne. En découpant le modèle (« <b>{{title}}</b> a une mise à jour »), puis en
// remplaçant {{title}} dans chaque morceau, le texte du membre reste du texte, quoi qu'il contienne.

/** Un morceau de phrase : son texte, et son style (absent : le texte courant). */
export type Part = { text: string; style?: 'strong' | 'version' }

/** Les balises connues, et le style qu'elles donnent. Toute autre balise reste du texte. */
const STYLES = { b: 'strong', v: 'version' } as const

/** `<b>…</b>` ou `<v>…</v>` : le contenu s'arrête à la première balise fermante de la même lettre. */
const MARKED = /<([bv])>([\s\S]*?)<\/\1>/g

/**
 * Découpe un modèle de phrase en morceaux. Les marques ne s'imbriquent pas ; une balise ouverte
 * sans fermeture, ou inconnue, reste dans le texte tel quel. Les morceaux vides disparaissent.
 */
export const splitMarks = (template: string): Part[] => {
  const parts: Part[] = []
  let from = 0
  for (const match of template.matchAll(MARKED)) {
    const [whole, letter, inside] = match
    if (match.index > from) parts.push({ text: template.slice(from, match.index) })
    if (inside) parts.push({ text: inside, style: STYLES[letter as keyof typeof STYLES] })
    from = match.index + whole.length
  }
  if (from < template.length) parts.push({ text: template.slice(from) })
  return parts
}

/**
 * Remplit les {{nom}} de chaque morceau. Un seul passage, morceau par morceau : une valeur qui
 * contient « {{autre}} » ou « <b> » n'est jamais relue. Un nom absent des valeurs reste écrit tel
 * quel (le test des textes le verrait aussitôt).
 */
export const fillParts = (parts: Part[], values: Record<string, string | number>): Part[] =>
  parts.map((part) => ({
    ...part,
    text: part.text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
      name in values ? String(values[name]) : whole,
    ),
  }))
