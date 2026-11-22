// La ponctuation des textes des membres (R18) : l'espace que le membre a tapée devant « ? ! ; : » et
// à l'intérieur des guillemets « » devient insécable à l'affichage, pour qu'un signe ne parte jamais
// seul au début d'une ligne (règle typographique du français, comme dans nos propres textes).
//
// La fonction ne fait que remplacer une espace ordinaire (U+0020) par une autre espace : elle
// n'ajoute ni ne retire rien. La longueur du texte reste donc la même, et le surlignage d'une
// recherche (calculé sur le texte enregistré) tombe toujours au bon endroit. Elle est idempotente :
// une seconde passe ne trouve plus d'espace ordinaire à ces endroits.
//
// Pour l'affichage seulement : jamais sur ce qui est enregistré, envoyé à l'API, ni sur du code ou
// une adresse. Les espaces spéciales sont écrites par leur numéro : à l'œil, rien ne les distingue
// d'une espace ordinaire.

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)
/** L'espace insécable (U+00A0), devant : et à l'intérieur des guillemets. */
const NBSP = String.fromCodePoint(0x00a0)

/**
 * Rend insécable l'espace tapée devant ? ! ; : et après « / avant ». Une espace absente n'est pas
 * ajoutée (« 10:30 », une adresse) ; un retour à la ligne ou une tabulation ne sont pas touchés.
 */
export const keepPunctuation = (text: string): string =>
  text
    .replace(/ (?=[?!;])/g, NNBSP)
    .replace(/ (?=:)/g, NBSP)
    .replace(/(?<=«) /g, NBSP)
    .replace(/ (?=»)/g, NBSP)
