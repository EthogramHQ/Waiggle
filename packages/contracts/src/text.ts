// Règles communes à tous les textes écrits par les membres (nom, bio, outils…).
// Certains caractères sont invisibles à l'écran mais pas pour les programmes :
// - le caractère « nul » (U+0000) : PostgreSQL refuse de l'enregistrer, la requête planterait ;
// - les caractères de contrôle (retour chariot, échappement…) : ils peuvent abîmer un affichage ;
// - les caractères invisibles et ceux qui inversent le sens d'écriture (U+202E…) : ils
//   permettent de fabriquer un nom qui paraît vide, ou qui se lit comme celui de quelqu'un d'autre.
// On les refuse dès la vérification des données, avant qu'ils n'atteignent la base.
import { z } from 'zod'

export const NAME_MAX_LENGTH = 80

// Les caractères refusés, par leur numéro Unicode (« code point »), écrits en hexadécimal.
// Chaque paire [début, fin] est une plage de numéros.
const FORBIDDEN_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f], // caractères de contrôle (nul, échappement…)
  [0x007f, 0x009f], // autres caractères de contrôle
  // Caractères de mise en forme invisibles (catégorie Unicode « Cf ») :
  [0x00ad, 0x00ad], // trait d'union conditionnel
  [0x0600, 0x0605],
  [0x061c, 0x061c], // marque de lettre arabe (sens d'écriture)
  [0x06dd, 0x06dd],
  [0x070f, 0x070f],
  [0x0890, 0x0891],
  [0x08e2, 0x08e2],
  [0x180e, 0x180e], // séparateur de voyelles mongol
  [0x200b, 0x200b], // espace de largeur nulle
  [0x200e, 0x200f], // marques gauche-à-droite et droite-à-gauche
  [0x2028, 0x2029], // séparateurs de ligne et de paragraphe
  [0x202a, 0x202e], // forçage du sens d'écriture (U+202E retourne le texte)
  [0x2060, 0x2064],
  [0x2066, 0x206f], // isolements du sens d'écriture, et autres
  [0xfeff, 0xfeff], // espace insécable de largeur nulle
  [0xfff9, 0xfffb],
  [0x110bd, 0x110bd],
  [0x110cd, 0x110cd],
  [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  // Caractères « tag », invisibles : ils peuvent cacher un texte entier, qu'un modèle d'IA lirait
  // (injection de consignes). Ils servent aussi aux drapeaux d'Écosse ou du pays de Galles :
  // ces drapeaux-là ne sont donc pas acceptés.
  [0xe0001, 0xe0001],
  [0xe0020, 0xe007f],
  // Lettres « vides » : elles occupent une place mais ne dessinent rien.
  [0x115f, 0x1160],
  [0x2800, 0x2800], // braille vide
  [0x3164, 0x3164], // remplissage hangûl
  [0xffa0, 0xffa0],
  // Moitiés de caractère isolées (texte mal formé).
  [0xd800, 0xdfff],
]
// Remarque : U+200C et U+200D (« liants ») restent autorisés : le second assemble 👩 et 💻 en
// 👩‍💻, le premier sert à l'intérieur de mots persans.

const LINE_BREAKS = new Set([0x09, 0x0a, 0x0d]) // tabulation, \n et \r (texte libre seulement)

const isForbidden = (code: number) =>
  FORBIDDEN_RANGES.some(([start, end]) => code >= start && code <= end)

// Caractères qui ne dessinent rien à eux seuls : espaces, liants, variantes d'emoji, sélecteurs
// mongols, et les « marques » (\p{M} : accents et signes qui se posent sur la lettre d'avant, comme
// U+0301 ; seuls, ils ne montrent rien de lisible). U+FFFC est l'emplacement d'un objet absent.
// Enfin, \p{Default_Ignorable_Code_Point} : les numéros qu'Unicode demande de ne pas dessiner,
// y compris ceux qui n'ont pas encore de caractère (U+2065, U+FFF0…) ; sans eux, un nom fait de ces
// seuls numéros paraissait vide (audit de sécurité du 25/10/2026, C11). Ils restent permis à côté
// d'un caractère qui se voit ; ceux qui trompent vraiment (sens d'écriture…) sont refusés plus haut.
const isInvisible = (char: string, code: number) =>
  /\s/.test(char) ||
  /\p{M}/u.test(char) ||
  /\p{Default_Ignorable_Code_Point}/u.test(char) ||
  code === 0x200c ||
  code === 0x200d ||
  code === 0xfffc ||
  code === 0x1d159 || // « tête de note vide » (musique) : elle ne dessine rien
  (code >= 0x180b && code <= 0x180f) ||
  (code >= 0xfe00 && code <= 0xfe0f) ||
  (code >= 0xe0100 && code <= 0xe01ef)

/**
 * Vrai si le texte ne contient que des caractères autorisés (et, si `needsVisible`, au moins un
 * caractère qui se voit : un nom fait uniquement d'espaces exotiques paraîtrait vide).
 */
export const isClean = (
  text: string,
  { lineBreaks, needsVisible }: { lineBreaks: boolean; needsVisible: boolean },
) => {
  // Un texte vide est le problème d'une autre règle (min(1)) : pas de second message pour lui.
  if (text.length === 0) return true
  let visible = false
  // for…of parcourt le texte caractère par caractère (y compris les emoji, faits de 2 « unités »).
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (lineBreaks && LINE_BREAKS.has(code)) continue
    if (isForbidden(code)) return false
    if (!isInvisible(char, code)) visible = true
  }
  return visible || !needsVisible
}

/** Vrai si le texte ne contient aucun caractère interdit (pour une adresse, par exemple). */
export const isCleanText = (text: string, { lineBreaks = false }: { lineBreaks?: boolean } = {}) =>
  isClean(text, { lineBreaks, needsVisible: false })

/**
 * Retire les caractères interdits d'un texte destiné à être affiché. Sert pour ce qui n'a pas pu
 * être vérifié à l'enregistrement : par exemple « &#x202E; » dans du Markdown, une écriture
 * détournée du caractère qui retourne le texte, que l'affichage retransforme en vrai caractère.
 */
export const removeForbiddenCharacters = (text: string) =>
  Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return LINE_BREAKS.has(code) || !isForbidden(code)
    })
    .join('')

const message = 'contains forbidden characters'

/** Un nom affiché : 1 à 80 caractères, sur une ligne. */
export const DisplayName = z
  .string()
  .trim()
  .min(1)
  .max(NAME_MAX_LENGTH)
  // refine ajoute une règle maison : la fonction renvoie true si la valeur est acceptable.
  .refine((text) => isClean(text, { lineBreaks: false, needsVisible: true }), { message })

/** Un texte libre (une bio…) : les retours à la ligne sont permis. */
export const FreeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((text) => isClean(text, { lineBreaks: true, needsVisible: false }), { message })

/**
 * Un texte libre qui doit montrer quelque chose (une note) : 1 à `max` caractères, retours à la
 * ligne permis, et au moins un caractère qui se voit (sinon la note paraîtrait vide dans le fil).
 */
export const VisibleFreeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => isClean(text, { lineBreaks: true, needsVisible: true }), { message })

/** Une courte étiquette (un nom d'outil…) : non vide, sur une ligne. */
export const ShortLabel = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => isClean(text, { lineBreaks: false, needsVisible: true }), { message })

/** Retire les doublons sans tenir compte des majuscules : ['Claude', 'claude'] → ['Claude']. */
export const uniqueIgnoringCase = (items: string[]) =>
  items.filter(
    (item, index) =>
      items.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index,
  )
