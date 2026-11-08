// Repère les clés d'API collées dans un prompt (R6a), pour prévenir l'auteur avant qu'il ne les
// publie. Module pur, sans dépendance : l'appli s'en sert à l'écriture (encadré « Clé : … ») comme à
// la lecture (avertissement « secret »). L'API ne lit pas les prompts pour les annoncer.
//
// Une expression régulière (« regex ») décrit la forme d'un texte : `[A-Za-z0-9]{20,300}` veut dire
// « de 20 à 300 lettres ou chiffres ». Chaque motif ci-dessous :
// - commence par `(^|[^A-Za-z0-9])` : la clé est au début du texte ou suit un caractère qui n'est ni
//   une lettre ni un chiffre, pour ne jamais en voir une au milieu d'un mot (« task-manager ») ;
// - a des répétitions bornées ({20,300} plutôt que +) : une regex mal écrite peut mettre des minutes
//   sur un texte piégé (« retour arrière catastrophique ») ; bornées, elles restent rapides.
// À appeler sur le texte déjà nettoyé par `cleanPrompt` (les invisibles retirés), comme l'appli
// l'affiche.

/** Une clé trouvée : où elle est, sa forme masquée (affichée), et son texte exact (jamais affiché). */
export type ApiKeyMatch = {
  /** Position du premier caractère de la clé dans le texte. */
  start: number
  /** Position juste après le dernier caractère. */
  end: number
  /** Les 7 premiers caractères, « … », les 4 derniers : « sk-proj…9xQz ». */
  masked: string
  /** La clé telle qu'écrite : sert seulement à vérifier qu'elle est encore là avant de la retirer. */
  raw: string
}

// Chaque motif : (début ou séparateur)(préfixe qui ne fait pas partie de la clé)(la clé).
// Le préfixe n'existe que pour « Bearer » : la clé est le jeton qui suit, pas le mot.
const BOUNDARY = '(^|[^A-Za-z0-9])'
const KEY_PATTERNS: RegExp[] = [
  // Les clés des fournisseurs d'IA (« sk-… », « sk-proj-… », « sk-ant-… ») : au moins 20 caractères,
  // dont un chiffre (les mots composés comme « sk-manager-and-planner » n'en ont pas).
  /()(sk-(?=[A-Za-z0-9_-]{0,300}?[0-9])[A-Za-z0-9_-]{20,300})/,
  // Amazon Web Services : « AKIA » et 16 majuscules ou chiffres.
  /()(AKIA[0-9A-Z]{16})/,
  // GitHub : jetons personnels et d'application, et les jetons fins (« github_pat_ »).
  /()(gh[po]_[A-Za-z0-9]{30,255})/,
  /()(github_pat_[A-Za-z0-9_]{22,255})/,
  // Slack : jetons de robot, d'application, d'utilisateur, de rafraîchissement.
  /()(xox[abpr]-[A-Za-z0-9-]{10,255})/,
  // Google : « AIza » et 35 caractères.
  /()(AIza[0-9A-Za-z_-]{35})/,
  // GitLab et Hugging Face.
  /()(glpat-[A-Za-z0-9_-]{20,255})/,
  /()(hf_[A-Za-z0-9]{30,255})/,
  // Un jeton envoyé dans un en-tête « Authorization: Bearer … » : 20 caractères au moins.
  /(Bearer[ \t]{1,10})([A-Za-z0-9._~+/=-]{20,2000})/,
  // Un JWT : trois parties en base64 séparées par des points, les deux premières commençant par
  // « eyJ » (le début de « {" » encodé).
  /()(eyJ[A-Za-z0-9_-]{1,2000}\.eyJ[A-Za-z0-9_-]{1,2000}\.[A-Za-z0-9_-]{1,2000})/,
].map((pattern) => new RegExp(`${BOUNDARY}${pattern.source}`, 'g'))

/** La forme affichée d'une clé : assez pour la reconnaître, jamais assez pour s'en servir. */
const mask = (key: string) => `${key.slice(0, 7)}…${key.slice(-4)}`

/**
 * Les clés d'API trouvées dans un texte, dans l'ordre du texte, sans chevauchement (un JWT après
 * « Bearer » n'est compté qu'une fois).
 */
export const findApiKeys = (text: string): ApiKeyMatch[] => {
  const found: ApiKeyMatch[] = []
  for (const pattern of KEY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const [, boundary = '', lead = '', key = ''] = match
      const start = (match.index ?? 0) + boundary.length + lead.length
      found.push({ start, end: start + key.length, masked: mask(key), raw: key })
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  // Deux motifs qui voient le même endroit : on garde le premier (le plus long à début égal).
  const kept: ApiKeyMatch[] = []
  for (const match of found) {
    const previous = kept.at(-1)
    if (previous && match.start < previous.end) continue
    kept.push(match)
  }
  return kept
}

/**
 * Remplace une clé par `placeholder` (« [clé retirée] »). Si le texte a changé depuis la recherche
 * et que la clé n'est plus exactement à sa place, le texte revient intact : on ne coupe jamais au
 * mauvais endroit. Après un retrait, les positions des clés suivantes ont bougé : relancer
 * `findApiKeys` avant d'en retirer une autre.
 */
export const removeApiKey = (text: string, match: ApiKeyMatch, placeholder: string): string =>
  text.slice(match.start, match.end) === match.raw
    ? `${text.slice(0, match.start)}${placeholder}${text.slice(match.end)}`
    : text
