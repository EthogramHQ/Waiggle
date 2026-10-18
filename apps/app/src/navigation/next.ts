// « Où aller après la connexion ? » Une page réservée aux membres envoie le visiteur vers
// /sign-in?next=/members/abc ; une fois connecté, il revient sur cette page plutôt qu'à l'accueil.
//
// Ce paramètre vient de l'adresse, que n'importe qui peut fabriquer : un lien piégé pourrait y
// mettre un autre site (?next=https://faux-waiggle.example) pour y emmener le membre juste après sa
// connexion, en toute confiance (« redirection ouverte »). On n'accepte donc qu'un chemin de l'appli.

/** Longueur maximale d'un chemin accepté : bien au-delà des adresses de l'appli. */
const MAX_LENGTH = 512

/** Le chemin interne où revenir après la connexion, ou null s'il n'est pas sûr. */
export const safeNext = (value: string | undefined): string | null => {
  if (!value || value.length > MAX_LENGTH) return null
  // Un chemin de l'appli commence par une seule barre oblique. « //site » et « /\site » sont lus
  // par les navigateurs comme une adresse vers un autre site.
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  // Aucun caractère de contrôle (retour à la ligne, tabulation…), qui peut tromper un navigateur.
  if ([...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return null
  // Revenir sur la connexion ou l'inscription après s'être connecté n'aurait pas de sens.
  if (/^\/(sign-in|sign-up)(\/|\?|$)/.test(value)) return null
  return value
}
