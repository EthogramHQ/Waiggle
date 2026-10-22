// « Où aller après la connexion ? » Une page réservée aux membres envoie le visiteur vers
// /sign-in?next=/members/abc ; une fois connecté, il revient sur cette page plutôt qu'à l'accueil.
//
// Ce paramètre vient de l'adresse, que n'importe qui peut fabriquer : un lien piégé pourrait y
// mettre un autre site (?next=https://faux-waiggle.example) pour y emmener le membre juste après sa
// connexion, en toute confiance (« redirection ouverte »). On n'accepte donc qu'un chemin de l'appli.

/** Longueur maximale d'un chemin accepté : bien au-delà des adresses de l'appli. */
const MAX_LENGTH = 512

// Les seules pages où revenir : celles qu'un visiteur ouvre par un lien et qui demandent d'être
// connecté (dont « Mes notifications », là où mène le récap de la semaine, tranche 6c, et
// « Signaler », avec la sorte et l'identifiant de sa cible, quand la session expire à l'envoi,
// tranche 6d : la page relit sa cible auprès de l'API, rien n'est pris de l'adresse). Pas la page
// d'avertissement (/out), qui pourrait servir à pousser vers un faux site juste après la
// connexion, ni les pages de connexion elles-mêmes.
const RETURN_PAGES =
  /^\/(?:(?:members|projects|tags)\/|(?:account|profile|notifications|report)(?:[/?#]|$))/

// Les caractères permis dans un chemin d'adresse, en ASCII seulement : rien d'invisible, aucune
// barre oblique « pleine chasse » (／) ni caractère de contrôle qui pourrait tromper un navigateur.
const PATH_CHARACTERS = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?#%]*$/

/** Le chemin interne où revenir après la connexion, ou null s'il n'est pas sûr. */
export const safeNext = (value: string | undefined): string | null => {
  if (!value || value.length > MAX_LENGTH) return null
  if (!PATH_CHARACTERS.test(value)) return null
  // Un chemin de l'appli commence par une seule barre oblique. « //site » est lu par les
  // navigateurs comme une adresse vers un autre site.
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // Une barre oblique (%2F) ou une barre inverse (%5C) encodée pourrait redevenir « //site » si
  // l'adresse était décodée une fois de plus : on n'en accepte aucune.
  if (/%(?:2f|5c)/i.test(value)) return null
  return RETURN_PAGES.test(value) ? value : null
}
