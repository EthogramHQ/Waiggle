// Aucun lien venu d'un membre dans un e-mail (tranche 6c, relecture de sécurité S-B1). Gmail ou
// Outlook transforment d'eux-mêmes « waiggle-login.com » en lien cliquable, dans le texte comme
// dans le HTML : un e-mail signé par notre domaine qui pointerait vers un faux site serait un
// hameçonnage parfait. Toute adresse ou tout nom de domaine écrit par un membre (extrait d'un
// commentaire, titre de projet, nom) devient donc « [lien] » (dans la langue de l'e-mail) avant
// d'entrer dans un e-mail.
import { type Language, resources } from '@ruche/i18n'

/**
 * Ce qu'on reconnaît comme une adresse, en une seule expression régulière (un motif de texte) :
 * - avec un protocole (« https://… », « http://192.168.0.1/admin ») : tout jusqu'au prochain blanc.
 *   Sans « \b » (frontière de mot) devant : en JavaScript, \b ne connaît que les lettres et chiffres
 *   ASCII et « _ », si bien que « _http://192.168.0.1 » ou « 1http://… » n'étaient pas reconnus, et
 *   l'adresse IP restait entière (relecture de sécurité de e414e88, A2). Sans lui, la recherche
 *   prend la première lettre possible du protocole : « _http://… » donne « _[lien] » ;
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
  /[a-z][a-z0-9+.-]*:\/\/\S+|(?<![\p{L}\p{N}])(?:[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?\.)+\p{L}[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}](?:\/[^\s]*)?/giu

/**
 * Les extensions de fichier qui ne sont pas des domaines de premier niveau (audit de sécurité du
 * 25/10/2026, C13 ; liste blanche, décision de Louis) : sans elle, « Node.js », « Vue.js » ou
 * « fichier.txt » devenaient « [lien] » dans les e-mails. Chacune a été cherchée dans la liste
 * officielle des domaines de premier niveau de l'IANA
 * (https://data.iana.org/TLD/tlds-alpha-by-domain.txt, version 2026102500, lue le 25/10/2026) :
 * aucune n'y figure. Celles qui y figurent restent neutralisées, c'est voulu : « md » (Moldavie,
 * donc « README.md »), « py », « sh », « rs », « io », « net », « zip », « java ».
 * Avant d'ajouter une extension, la chercher dans cette liste ; l'ICANN ouvre de nouveaux domaines
 * par vagues (la dernière en 2026) : relire la liste à chaque vague.
 */
const FILE_EXTENSIONS = new Set([
  // JavaScript et TypeScript
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'vue',
  'svelte',
  // Données et configuration
  'txt',
  'json',
  'jsonl',
  'csv',
  'yml',
  'yaml',
  'toml',
  'xml',
  'sql',
  'ipynb',
  // Pages et styles
  'html',
  'htm',
  'css',
  'scss',
  // Documents, images et sons
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'mp3',
  'mp4',
  'wav',
])

/**
 * Vrai si le nom trouvé est un simple nom de fichier : un seul point, sans protocole, sans chemin,
 * sans « www. », et une extension de la liste blanche. Un seul point, parce que « evil.com.js » ou
 * « login.evil.json » contiennent peut-être un vrai domaine qu'une messagerie rendrait cliquable ;
 * « jquery.min.js » devient donc « [lien] » aussi, on préfère neutraliser un nom de trop. `found`
 * est le texte tel qu'un navigateur le lit (readAs) : « www․evil․js » y est déjà « www.evil.js ».
 */
const isFileName = (found: string) => {
  const parts = found.toLowerCase().split('.')
  const extension = parts[1]
  return (
    parts.length === 2 &&
    extension !== undefined &&
    !found.includes('/') &&
    parts[0] !== 'www' &&
    FILE_EXTENSIONS.has(extension)
  )
}

/** Les points que les navigateurs lisent comme « . » dans une adresse : 。 ． ｡ ․ */
const DOT_LOOKALIKES = /[。．｡․]/gu

/**
 * Les caractères invisibles de mise en forme (« \p{Cf} » : espace sans largeur, trait d'union
 * conditionnel, marques de sens d'écriture…). Un navigateur les ignore dans une adresse :
 * « evil<espace sans largeur>.com » mène à evil.com.
 */
const FORMAT = /\p{Cf}/u

/**
 * Ce qu'un navigateur efface d'un nom de domaine (la norme UTS 46) : les invisibles ci-dessus, et
 * aussi les caractères « à ignorer par défaut » (\p{Default_Ignorable_Code_Point}) qui ne sont pas
 * des \p{Cf} : le liant de graphèmes (U+034F), les sélecteurs de variante (U+FE00…, U+180B…,
 * U+E0100…). « evil.<U+034F>com » mène à evil.com (relecture de sécurité de e414e88, A1).
 * Seulement pour chercher : le texte rendu garde ces caractères (keep, plus bas), sinon « ❤️ »
 * perdrait son sélecteur U+FE0F, qui le dessine en couleur.
 */
const IGNORED_IN_ADDRESS = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u

/**
 * Les deux invisibles gardés dans le texte rendu : le liant (U+200D, qui assemble les émojis
 * « famille ») et l'anti-liant (U+200C, nécessaire au persan). Les autres disparaissent de l'e-mail.
 */
const KEPT_FORMAT = new Set(['‌', '‍'])

/**
 * Comment un navigateur lit un caractère dans une adresse. NFKC (une « normalisation » Unicode)
 * ramène les variantes d'une lettre à sa forme simple : « ｅ » (pleine chasse) ou « ⓔ » deviennent
 * « e », comme le fait un navigateur avec un nom de domaine. Les invisibles et les caractères à
 * ignorer disparaissent, et les points ressemblants deviennent « . ».
 */
const readAs = (char: string) =>
  IGNORED_IN_ADDRESS.test(char) ? '' : char.normalize('NFKC').replace(DOT_LOOKALIKES, '.')

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
    // Un nom de fichier (« Node.js ») reste tel qu'écrit : le reste du texte le reprendra (keep).
    if (isFileName(match[0])) continue
    // Un caractère écrit qui donne plusieurs caractères lus (« ㏂ » donne « a.m. ») est remplacé en
    // entier s'il touche une adresse ; une adresse qui commence dans ce même caractère est déjà
    // remplacée avec lui.
    if (start >= cursor) result += keep(cursor, start) + placeholder
    cursor = Math.max(cursor, end + 1)
  }
  return result + keep(cursor, written.length)
}
