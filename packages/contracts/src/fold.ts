// Le repli des textes pour comparer sans accents ni majuscules (tranche R3, sorti de search.ts en
// R6b pour que tools.ts s'en serve sans import circulaire : search.ts lit projects.ts, qui lit
// tools.ts). search.ts le réexporte : rien ne change pour ceux qui l'importaient de là.

/**
 * La table de repli : chaque caractère accentué latin, majuscule ou minuscule, devient sa lettre
 * simple en minuscule ; l'apostrophe typographique devient l'apostrophe droite ; « œ », « æ » et
 * « ß » deviennent deux lettres. C'est l'unique source : l'API en tire son `translate` (les
 * entrées à une lettre) et ses `replace` (les entrées à deux lettres), l'appli `foldForSearch`.
 * Les majuscules y sont, même si `foldForSearch` met d'abord en minuscules : en SQL, `lower()`
 * ne touche que l'ASCII quand la base est en locale « C » (PGlite), et c'est `translate` qui
 * replie « É » (sec-A2).
 */
export const SEARCH_FOLD: Readonly<Record<string, string>> = {
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  å: 'a',
  ç: 'c',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ñ: 'n',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ø: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ü: 'u',
  ý: 'y',
  ÿ: 'y',
  À: 'a',
  Á: 'a',
  Â: 'a',
  Ã: 'a',
  Ä: 'a',
  Å: 'a',
  Ç: 'c',
  È: 'e',
  É: 'e',
  Ê: 'e',
  Ë: 'e',
  Ì: 'i',
  Í: 'i',
  Î: 'i',
  Ï: 'i',
  Ñ: 'n',
  Ò: 'o',
  Ó: 'o',
  Ô: 'o',
  Õ: 'o',
  Ö: 'o',
  Ø: 'o',
  Ù: 'u',
  Ú: 'u',
  Û: 'u',
  Ü: 'u',
  Ý: 'y',
  Ÿ: 'y',
  '’': "'",
  œ: 'oe',
  Œ: 'oe',
  æ: 'ae',
  Æ: 'ae',
  ß: 'ss',
  ẞ: 'ss',
}

/**
 * Replie un texte pour la recherche : minuscules d'abord (`toLowerCase` connaît tous les
 * alphabets), puis la table. « L’Élève » devient « l'eleve », « ŒUVRE » devient « oeuvre ».
 */
export const foldForSearch = (text: string): string => {
  let folded = ''
  for (const char of text.toLowerCase()) folded += SEARCH_FOLD[char] ?? char
  return folded
}

/**
 * Le repli avec la correspondance des positions, pour surligner dans le texte d'origine ce qui a
 * été trouvé dans le texte replié. `map[i]` est la position (en unités UTF-16, celles de `slice`)
 * dans le texte d'origine du caractère qui a donné `folded[i]` ; `map[folded.length]` vaut
 * `text.length`, pour que la fin d'une correspondance `[start, end)` se lise `map[end]`.
 * Un « œ » donne deux caractères repliés qui pointent tous deux vers lui.
 */
export const foldWithMap = (text: string): { folded: string; map: number[] } => {
  let folded = ''
  const map: number[] = []
  let offset = 0
  // for…of avance caractère par caractère, emoji compris (deux unités UTF-16 pour un seul).
  for (const char of text) {
    for (const lowered of char.toLowerCase()) {
      const replaced = SEARCH_FOLD[lowered] ?? lowered
      // Une entrée par unité UTF-16 (et non par caractère) : `folded` se lit avec `slice`, qui
      // compte en unités ; un emoji en vaut deux (défaut trouvé par les tests de R3).
      for (let unit = 0; unit < replaced.length; unit++) map.push(offset)
      folded += replaced
    }
    offset += char.length
  }
  map.push(text.length)
  return { folded, map }
}
