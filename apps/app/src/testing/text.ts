// Outils de test pour retrouver un texte de l'appli à l'écran (tranche 6d), quelle que soit la façon
// dont l'écran l'a découpé (un seul paragraphe, ou une ligne par phrase).
import type { Removal } from '@ruche/contracts'
import { createI18n } from '../i18n'

/** Les textes français de l'appli, tirés des mêmes traductions que les écrans. */
export const fr = createI18n('fr')

/**
 * Une expression qui trouve ce texte n'importe où dans un texte plus long. getByText remplace tous
 * les blancs du texte affiché (espaces insécables de « » et « : » comprises) par des espaces
 * simples : on fait de même avec le texte cherché, puis on neutralise les caractères spéciaux.
 */
export const containing = (text: string) =>
  new RegExp(text.replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

/**
 * Ce que l'auteur d'un contenu retiré doit lire (règle 13 de la relecture du plan 6d, article 17
 * du DSA), phrase par phrase : ce qui est retiré, que lui seul le voit encore, après un
 * signalement ou non (jamais de qui), qu'une personne a décidé, le fondement, l'explication, et
 * comment contester. Le titre « Retiré par la modération » n'en fait pas partie : chaque test le
 * cherche à sa façon (bandeau, notification).
 */
export const removalSentences = (removal: Removal): string[] => [
  fr.t('removal.onlyYou'),
  removal.afterReport ? fr.t('removal.afterReport') : fr.t('removal.direct'),
  fr.t(`removal.grounds.${removal.ground}`),
  fr.t('removal.explanation', { explanation: removal.explanation }),
  fr.t('removal.contest'),
]

/**
 * Les phrases qu'on ne lit nulle part à l'écran (ou dans la partie donnée par `within`) : un test
 * attend une liste vide, et l'échec dit lesquelles manquent.
 */
export const missingSentences = (
  sentences: string[],
  where: { queryAllByText: (text: RegExp) => unknown[] },
): string[] =>
  sentences.filter((sentence) => where.queryAllByText(containing(sentence)).length === 0)
