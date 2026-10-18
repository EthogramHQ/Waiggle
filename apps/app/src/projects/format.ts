// Petites mises en forme pour afficher un projet.

/**
 * Une date courte dans la langue de l'écran : « 12 oct. » cette année, « 12 oct. 2025 » sinon.
 * Intl.DateTimeFormat est l'outil des navigateurs et téléphones pour écrire les dates à la façon
 * de chaque langue.
 */
export const shortDate = (iso: string, language: string, now = new Date()): string => {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? null : { year: 'numeric' }),
  }).format(date)
}

/** Le nom du site d'une adresse : « https://carnet.example.com/demo » → « carnet.example.com ». */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
