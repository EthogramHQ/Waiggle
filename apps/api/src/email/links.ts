// Aucun lien venu d'un membre dans un e-mail (tranche 6c, relecture de sécurité S-B1). Gmail ou
// Outlook transforment d'eux-mêmes « waiggle-login.com » en lien cliquable, dans le texte comme
// dans le HTML : un e-mail signé par notre domaine qui pointerait vers un faux site serait un
// hameçonnage parfait. Toute adresse ou tout nom de domaine écrit par un membre (extrait d'un
// commentaire, titre de projet, nom) devient donc « [lien] » (dans la langue de l'e-mail) avant
// d'entrer dans un e-mail.
import { type Language, resources } from '@ruche/i18n'

/**
 * Ce qu'on reconnaît comme une adresse, en une seule expression régulière (un motif de texte) :
 * - avec un protocole (« https://… », « http://192.168.0.1/admin ») : tout jusqu'au prochain blanc ;
 * - sinon un nom de domaine : des mots de lettres, chiffres ou tirets séparés par des points, dont
 *   le dernier (l'extension : « com », « example ») a au moins deux lettres, suivi éventuellement
 *   d'un chemin (« /login »). « xn--… » (les domaines accentués encodés) en fait partie.
 *
 * « (?<![\p{L}\p{N}]) » (un « regard en arrière ») : le domaine ne commence pas au milieu d'un mot.
 * Seulement après une lettre ou un chiffre : après « - », « _ » ou « : », un domaine commence bien
 * (« Support -waiggle-login.com » ; relecture de sécurité B1). Exclure aussi ces signes laissait
 * passer le domaine entier, que la messagerie, elle, rend cliquable.
 *
 * « \p{M} » (les accents posés sur une lettre, les signes des écritures indiennes) compte dans un
 * mot, comme les lettres : « उदाहरण.भारत » est un domaine.
 *
 * Les nombres (« 2.0 », « 14.30 », « 3.14 ») ne sont pas touchés : leur dernière partie n'a pas de
 * lettre. Une adresse e-mail perd son domaine (« support@[lien] »).
 * Drapeaux : g (toutes les adresses du texte, pas seulement la première), i (majuscules comprises),
 * u (lettres accentuées : « \p{L} » veut dire « une lettre de n'importe quelle langue »).
 */
const ADDRESS =
  /\b[a-z][a-z0-9+.-]*:\/\/\S+|(?<![\p{L}\p{N}])(?:[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?\.)+\p{L}[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}](?:\/[^\s]*)?/giu

/** Les points que les navigateurs lisent comme « . » dans une adresse : 。 ． ｡ ․ */
const DOT_LOOKALIKES = /[。．｡․]/gu

/**
 * Les caractères invisibles de mise en forme (« \p{Cf} » : espace sans largeur, trait d'union
 * conditionnel, marques de sens d'écriture…). Un navigateur les ignore dans une adresse :
 * « evil<espace sans largeur>.com » mène à evil.com.
 */
const FORMAT = /\p{Cf}/u

/**
 * Les deux invisibles gardés dans le texte rendu : le liant (U+200D, qui assemble les émojis
 * « famille ») et l'anti-liant (U+200C, nécessaire au persan). Les autres disparaissent de l'e-mail.
 */
const KEPT_FORMAT = new Set(['‌', '‍'])

/**
 * Comment un navigateur lit un caractère dans une adresse. NFKC (une « normalisation » Unicode)
 * ramène les variantes d'une lettre à sa forme simple : « ｅ » (pleine chasse) ou « ⓔ » deviennent
 * « e », comme le fait un navigateur avec un nom de domaine. Les invisibles disparaissent, et les
 * points ressemblants deviennent « . ».
 */
const readAs = (char: string) =>
  FORMAT.test(char) ? '' : char.normalize('NFKC').replace(DOT_LOOKALIKES, '.')

/** Le texte de « [lien] » dans une langue (« [link] » en anglais). */
export const linkPlaceholder = (language: Language) => resources[language].translation.email.link

/**
 * Remplace chaque adresse ou nom de domaine du texte par `placeholder` (« [lien] » par défaut, le
 * français étant la langue de référence ; un e-mail passe celui de sa langue).
 *
 * On cherche les adresses dans le texte tel qu'un navigateur le lirait (readAs), mais on rend le
 * texte du membre tel qu'il l'a écrit : « … » reste « … » (NFKC en ferait « ... »), « ﬁ » reste
 * « ﬁ ». Pour cela, chaque caractère lu garde le rang du caractère écrit dont il vient (owner), et
 * c'est le morceau écrit correspondant qui est remplacé.
 */
export const defangLinks = (text: string, placeholder: string = linkPlaceholder('fr')): string => {
  // NFC (la normalisation « canonique ») ne change pas l'apparence : elle réunit seulement une
  // lettre et son accent écrits à part (« e » + « ́ ») en un seul caractère (« é »).
  const written = [...text.normalize('NFC')]
  let read = ''
  const owner: number[] = []
  written.forEach((char, index) => {
    const seen = readAs(char)
    // Une position par unité de code (ce que compte `match.index`), pas par caractère.
    for (let unit = 0; unit < seen.length; unit++) owner.push(index)
    read += seen
  })
  /** Le morceau écrit [from, to), sans les invisibles qu'on ne garde pas. */
  const keep = (from: number, to: number) =>
    written
      .slice(from, to)
      .filter((char) => !FORMAT.test(char) || KEPT_FORMAT.has(char))
      .join('')

  let result = ''
  let cursor = 0
  for (const match of read.matchAll(ADDRESS)) {
    const start = owner[match.index]
    const end = owner[match.index + match[0].length - 1]
    if (start === undefined || end === undefined) continue
    // Un caractère écrit qui donne plusieurs caractères lus (« ㏂ » donne « a.m. ») est remplacé en
    // entier s'il touche une adresse ; une adresse qui commence dans ce même caractère est déjà
    // remplacée avec lui.
    if (start >= cursor) result += keep(cursor, start) + placeholder
    cursor = Math.max(cursor, end + 1)
  }
  return result + keep(cursor, written.length)
}
