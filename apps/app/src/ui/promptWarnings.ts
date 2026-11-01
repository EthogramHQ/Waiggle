// Les repères d'un prompt (tranche R5a, F-Pr10) : « À lire avant de l'utiliser », quand un prompt
// partagé contient une commande, un lien, un long bloc codé, ou parle d'un secret. Un prompt se
// copie pour être collé dans une IA, parfois dans un terminal : ces quatre familles sont celles qui
// peuvent faire agir la personne sans qu'elle s'en rende compte.
//
// Le repère dit ce qu'il a trouvé, jamais une intention (relecture juridique jur-7) : il prévient,
// il ne garantit rien. Un prompt sans repère n'est pas « sûr » ; c'est pourquoi la phrase de
// prudence s'affiche toujours, repère ou non (PromptBlock).
//
// Fonction pure, sans dépendance : rangée dans `src/ui`, à côté de son seul appelant, car un
// composant de `ui` n'importe aucun domaine (scripts/architecture.mjs).
//
// Comment on cherche (relecture de sécurité sec-B2) :
// - sur une copie « pliée » du texte : NFKC (les lettres de pleine chasse « ＣＵＲＬ » redeviennent
//   « CURL »), minuscules, accents retirés (« clé » → « cle »), apostrophes courbes rendues droites,
//   espaces regroupés ; ainsi « Clé d’API » et « cle d'api » se trouvent avec la même liste ;
// - un mot est borné par tout ce qui n'est pas une lettre, de n'importe quel alphabet (`\p{L}`) :
//   « _curl », « -sudo » et « 2:wget » sont des commandes, « curling » et « sudoku » n'en sont pas.
//   La borne `\b` des expressions régulières ne connaît que les lettres ASCII : « écurl » y serait
//   coupé après le « é ». On écrit la borne de gauche comme un groupe `(^|[^\p{L}])` plutôt qu'un
//   « regard en arrière » `(?<!…)`, mal connu de certains moteurs (comme mentions.ts du contrat) ;
// - chaque expression avance sans revenir en arrière sur de longues portions (pas de répétition
//   dans une répétition) : un texte écrit pour la ralentir reste lu en un passage (sec-B2 : 20
//   lectures de 4 000 caractères piégés en moins de 200 ms, promptWarnings.test.ts).

/** Les quatre familles de repères, dans l'ordre où elles s'affichent. */
export type PromptWarning = 'command' | 'link' | 'encoded' | 'secret'

const ORDER: readonly PromptWarning[] = ['command', 'link', 'encoded', 'secret']

// Les apostrophes courbes (‘ ’) et la lettre-apostrophe (ʼ), écrites par leur numéro : recopiées
// telles quelles, on ne les distinguerait pas de l'apostrophe droite en relisant le code.
const CURLY_APOSTROPHES = new RegExp(`[${String.fromCodePoint(0x2018, 0x2019, 0x02bc)}]`, 'g')

/**
 * Plie le texte pour la recherche : NFKC, minuscules, accents retirés, apostrophes droites, et les
 * espaces d'une même ligne regroupés en une seule (les retours à la ligne restent : une commande
 * se repère aussi au début d'une ligne).
 * NFD sépare une lettre accentuée en lettre + accent ; `\p{M}` (les « marques ») retire l'accent.
 */
const fold = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(CURLY_APOSTROPHES, "'")
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')

/**
 * Neutralise les caractères spéciaux d'une expression régulière (« . », « $ »…). Le tiret n'en est
 * pas un hors d'une classe `[…]`, et le drapeau `u` refuse `\-` à cet endroit : on le laisse.
 */
const escapeRegExp = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Une expression qui trouve l'un de ces mots (déjà pliés), bornés à gauche et à droite par ce qui
 * n'est pas une lettre. `(?=…)` regarde après le mot sans le consommer.
 */
const words = (list: readonly string[]) =>
  new RegExp(`(^|[^\\p{L}])(?:${list.map(escapeRegExp).join('|')})(?=[^\\p{L}]|$)`, 'u')

// Les commandes (sec-B3 compris) : les outils qui téléchargent, exécutent ou donnent des droits.
const COMMAND_WORDS = words([
  'curl',
  'wget',
  'sudo',
  'rm -rf',
  'rm -fr',
  'chmod',
  'powershell',
  'pwsh',
  'iex',
  'invoke-webrequest',
  'invoke-expression',
  'bash -c',
  'sh -c',
  'npx',
  'pip install',
  'python -c',
  'node -e',
  'base64 -d',
  'base64 --decode',
  'certutil',
  'mshta',
])
/** Un tube vers un interpréteur : « … | sh », « …|bash », « … | iex ». */
const COMMAND_PIPE = /\| ?(?:sh|bash|zsh|iex|pwsh|powershell)(?=[^\p{L}]|$)/u
/** Une ligne qui commence par l'invite d'un terminal : « $ » ou « > », suivis d'une espace. */
const COMMAND_PROMPT = /(?:^|\n) ?[$>] /

// Les liens : une adresse complète, un « www. », une donnée intégrée (« data:text/html,… »), ou un
// domaine nu suivi d'un chemin (« exemple.com/x »). Ce dernier se cherche sans répétition
// imbriquée : un caractère de nom, un point, au moins deux lettres, puis la barre oblique.
const LINK = /(?:^|[^\p{L}])(?:(?:https?|ftp):\/\/|www\.|data:\S)|[\p{L}\p{N}-]\.\p{L}{2,}\//u

// Un long bloc codé : 40 caractères base64 à la suite (alphabet ordinaire ou celui des adresses,
// avec « _ » et « - »). 64 hexadécimaux en font partie : l'hexadécimal est un sous-ensemble.
// On cherche sur le texte seulement passé par NFKC (sans retirer les accents : « ééé… » n'est pas
// du base64), et sans ses adresses : un long chemin d'adresse se lit, il a déjà son repère « lien ».
const ENCODED = /[A-Za-z0-9+/=_-]{40}/
const ADDRESSES = /(?:(?:https?|ftp):\/\/|www\.)\S*/gi

// Les secrets (sec-B3 compris) : ce qu'une IA n'a jamais besoin de connaître.
const SECRET_WORDS = words([
  'mot de passe',
  'mots de passe',
  'mdp',
  'password',
  'passwords',
  'passphrase',
  "cle d'api",
  "cles d'api",
  'cle api',
  'api key',
  'api keys',
  'apikey',
  'api_key',
  'token',
  'tokens',
  'jeton',
  'jetons',
  'code de verification',
  'codes de verification',
  'verification code',
  '2fa',
  'otp',
  'phrase de recuperation',
  'seed phrase',
  'recovery phrase',
  'identifiants',
  'identifiant de connexion',
  'credentials',
  'cookie',
  'cookies',
  'cle privee',
  'cles privees',
  'private key',
  '.env',
  'carte bancaire',
  'cartes bancaires',
  'numero de carte',
  'credit card',
  'iban',
])

/**
 * Les repères d'un prompt, chaque famille une fois au plus, toujours dans l'ordre commande, lien,
 * bloc codé, secret (l'ordre d'affichage ne suit pas le texte). Le prompt reçu doit être celui
 * qu'on affiche et qu'on copie, déjà nettoyé par `cleanPrompt` (sec-B1) : un espace sans largeur
 * glissé au milieu de « curl » en a été retiré.
 */
export function promptWarnings(text: string): PromptWarning[] {
  const lines = fold(text)
  // Pour les mots sur plusieurs lignes (« mot de\npasse ») : tous les blancs deviennent une espace.
  const flat = lines.replace(/\s+/g, ' ')
  const found: Record<PromptWarning, boolean> = {
    command: COMMAND_WORDS.test(flat) || COMMAND_PIPE.test(flat) || COMMAND_PROMPT.test(lines),
    link: LINK.test(flat),
    encoded: ENCODED.test(text.normalize('NFKC').replace(ADDRESSES, ' ')),
    secret: SECRET_WORDS.test(flat),
  }
  return ORDER.filter((warning) => found[warning])
}
