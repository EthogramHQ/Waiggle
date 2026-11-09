// Le mois où un projet a commencé (R6a, « Commencé en »), écrit dans la langue de l'appli :
// « septembre 2026 », « September 2026 ». Le contrat le donne sous la forme « AAAA-MM » ; c'est un
// mois du calendrier, pas un instant : il se lit en temps universel (UTC), sinon un fuseau à l'ouest
// de Greenwich ferait du 1er septembre à minuit le 31 août, et « août 2026 ».
// Une fonction pure, dans un fichier sans dépendance : les tests d'écran qui remplacent
// `projects/api` la gardent (charte du pôle code, « Fonctions pures à part »).

/** « 2026-09 » : quatre chiffres, un trait d'union, un mois de 01 à 12. */
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

/**
 * Le mois `value` (« 2026-09 ») écrit dans la langue `language` (« fr », « en »), le nom du mois en
 * toutes lettres puis l'année. Null si la valeur n'est pas un mois : l'API la rend souple en sortie
 * (relecture du plan, sec-M1), la page n'écrit alors rien plutôt qu'une date fausse.
 */
export const startedMonth = (value: string, language: string): string | null => {
  const match = MONTH.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  // Intl.DateTimeFormat : la mise en forme des dates propre à chaque langue (le nom du mois, l'ordre).
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
