// L'écriture courte d'un nombre de réactions (R5a, décision de Louis du 2/11) : sous 1 000, le nombre
// tel quel ; à partir de 1 000, « 1,2 k » en français (espace insécable avant le « k », pour que le
// « k » ne reste pas seul au bout d'une ligne), « 1.2K » en anglais ; « 1,2 M » / « 1.2M » à partir du
// million. Pourquoi : à 320 points et 200 % de texte, un nombre à quatre chiffres faisait déborder la
// capsule (360 points pour 288).
//
// Une fonction pure, écrite à la main plutôt qu'avec `Intl.NumberFormat` en notation compacte : le
// moteur JavaScript des téléphones (Hermes) ne la gère pas partout, et le résultat différerait d'un
// appareil à l'autre.
//
// Le nombre est tronqué à la décimale, jamais arrondi vers le haut : un compteur ne se gonfle pas, et
// 999 999 reste « 999,9 k » au lieu de devenir « 1000 k ». La décimale est retirée quand elle est
// nulle (« 2 k », pas « 2,0 k »).
//
// Seul l'affichage est court : le nom lu par les lecteurs d'écran garde le nombre entier
// (« Utile, 1234 »).

/** L'espace insécable, écrite par son code : un éditeur la confondrait avec une espace ordinaire. */
const NBSP = String.fromCharCode(0xa0)

const THOUSAND = 1000
const MILLION = 1_000_000

/**
 * Le nombre `count` en écriture courte, dans la langue donnée (`'fr'`, `'en'`, ou un code régional
 * comme `'fr-FR'`). Toute langue qui ne commence pas par « en » suit le français, la langue de
 * référence de l'appli.
 */
export function shortCount(count: number, language: string): string {
  if (count < THOUSAND) return String(count)
  const english = language.toLowerCase().startsWith('en')
  const million = count >= MILLION
  const unit = million ? MILLION : THOUSAND
  // En dixièmes entiers, par une division entière : pas de nombre à virgule, donc pas d'erreur
  // d'arrondi (1,2 ne s'écrit jamais 1,1999…).
  const tenths = Math.floor(count / (unit / 10))
  const whole = Math.floor(tenths / 10)
  const decimal = tenths % 10
  const separator = english ? '.' : ','
  const number = decimal === 0 ? String(whole) : `${whole}${separator}${decimal}`
  const letter = million ? 'M' : english ? 'K' : 'k'
  return english ? `${number}${letter}` : `${number}${NBSP}${letter}`
}
