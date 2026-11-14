// L'objet de l'e-mail de « Contester » pour une partie retirée seule (R9, 7d, relecture juridique
// J12) : « Contestation : retrait de la photo 2 de « Décollage ! » du 12 novembre ». L'objet nomme
// la décision et sa date, pour que la personne qui lit la boîte de contact retrouve la bonne sans
// échange de plus. Une fonction pure, sans hook : les composants (`UpdateEntry`, `CallCard`) et les
// écrans (`TesterThreadView`) lui donnent leur `t` et leur langue.
import type { useTranslation } from 'react-i18next'
import { parisDateTime } from './parisTime'

type Translate = ReturnType<typeof useTranslation>['t']

type PartSubject = {
  /** La partie, en minuscules, déjà traduite (« la photo 2 », « la capture »). */
  part: string
  /** Le contenu qui la porte (titre de la mise à jour, du projet), écrit entre guillemets. */
  title: string
  /** La date de la décision (`Removal.at`), écrite en entier à l'heure de Paris. */
  at: string
}

/**
 * L'objet de « Contester » d'une partie retirée. La date est celle que l'encadré écrit (« Retiré le
 * 12 novembre ») : le membre lit la même aux deux endroits.
 */
export const partContestSubject = (
  t: Translate,
  language: string,
  { part, title, at }: PartSubject,
): string =>
  contestSubjectOf(
    t,
    language,
    t(($) => $.removal.contestDecision.part, { part, title }),
    at,
  )

/**
 * L'objet de « Contester », partout le même (décision du 14/11/2026) : « Contestation : <décision>
 * du 12 novembre ». La date est toujours la longue, à l'heure de Paris, jamais « 12 nov. » : une
 * seule fonction l'écrit, pour que la boîte de contact lise le même format quelle que soit la page.
 * `decision` est la phrase déjà traduite (`removal.contestDecision.*`).
 */
export const contestSubjectOf = (
  t: Translate,
  language: string,
  decision: string,
  at: string,
): string =>
  t(($) => $.removal.contestSubject, { decision, date: parisDateTime(at, language).date })
