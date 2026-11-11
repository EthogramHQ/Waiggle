// La logique de la feuille « Nouvelle mise à jour » (R7a, scénario « Publier une mise à jour ») :
// les valeurs du formulaire (titre, version, lignes de « Ce qui a changé », interrupteur « Avant /
// après ») et ce qu'on envoie à l'API. Ce fichier n'importe ni React ni l'API : des fonctions pures,
// que l'écran appelle et que les tests vérifient seules (un test d'écran qui remplace `updates/api`
// ne les perd pas).
//
// « Pures » : elles ne changent jamais les valeurs qu'on leur donne, elles en rendent de nouvelles.
// React voit ainsi qu'il y a du neuf (un nouvel objet), et l'ancien état reste intact pour comparer
// (`isDirty`).
import {
  type NewProjectUpdate,
  UPDATE_LINE_MAX,
  UPDATE_LINES_MAX,
  UPDATE_PHOTOS_MAX,
  type UpdateFamily,
} from '@ruche/contracts'
import type { UpdateLineValue } from '../ui/UpdateLinesField'

/** Le formulaire de la feuille, tel que l'écran le tient. */
export type UpdateFormValues = {
  title: string
  version: string
  lines: UpdateLineValue[]
  beforeAfter: boolean
  /**
   * R7b : les retours de testeurs cochés dans « Retours réglés », que la mise à jour règle (leurs
   * identifiants, dans l'ordre où l'auteur les a cochés). Absent : aucun (une feuille sans la
   * partie, ou un formulaire écrit avant R7b).
   */
  settledIds?: string[]
}

/**
 * Une photo de la feuille, vue par le formulaire : `id` est celui de la photo « en attente » que le
 * serveur a rendu, null tant que son envoi n'est pas fini (`uploading`).
 */
export type UpdateFormPhoto = { id: string | null; description: string | null; uploading: boolean }

/** Ce que `toPayload` rend : de quoi publier, ou pourquoi on ne peut pas encore. */
export type UpdatePayloadResult =
  | { ok: true; payload: NewProjectUpdate }
  | { ok: false; error: 'required' | 'uploading' }
  // Une ligne dépasse la limite du contrat : `lineId` nomme la première, pour la marquer.
  | { ok: false; error: 'lineTooLong'; lineId: string }

// Un compteur du module : chaque ligne reçoit un identifiant neuf, jamais son rang. React range
// chaque champ sous cette clé ; retirer la deuxième ligne ne fait pas glisser la troisième dans sa
// place (son texte, sa famille, son focus restent les siens).
let lineCount = 0

/** Une ligne vide, de la famille « Nouveau » par défaut, avec un identifiant neuf. */
export const emptyLine = (family: UpdateFamily = 'new'): UpdateLineValue => {
  lineCount += 1
  return { id: `line-${lineCount}`, family, text: '' }
}

/** Une ligne vide de plus, à la fin ; rien au-delà de cinq. */
export const addLine = (values: UpdateFormValues): UpdateFormValues =>
  values.lines.length >= UPDATE_LINES_MAX
    ? values
    : { ...values, lines: [...values.lines, emptyLine()] }

/** Retire la ligne `id` ; jamais la dernière qui reste (la feuille a toujours une ligne). */
export const removeLine = (values: UpdateFormValues, id: string): UpdateFormValues =>
  values.lines.length <= 1
    ? values
    : { ...values, lines: values.lines.filter((line) => line.id !== id) }

/** Change une seule ligne ; les autres restent les mêmes objets. */
const patchLine = (
  values: UpdateFormValues,
  id: string,
  patch: Partial<Omit<UpdateLineValue, 'id'>>,
): UpdateFormValues => ({
  ...values,
  lines: values.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
})

/** La famille choisie dans le menu de la pastille d'une ligne. */
export const setFamily = (
  values: UpdateFormValues,
  id: string,
  family: UpdateFamily,
): UpdateFormValues => patchLine(values, id, { family })

/** Le texte tapé dans une ligne. */
export const setText = (values: UpdateFormValues, id: string, text: string): UpdateFormValues =>
  patchLine(values, id, { text })

/** Les retours cochés, tels quels ; absents : aucun. */
const settledOf = (values: UpdateFormValues): string[] => values.settledIds ?? []

/** Deux listes de retours cochés sont-elles les mêmes, dans n'importe quel ordre ? */
const sameSettled = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id))

/**
 * Vrai si fermer la feuille perdrait quelque chose : un champ, une ligne ou une famille différents
 * des valeurs d'ouverture, une photo ajoutée (même en cours d'envoi : elle est déjà, ou bientôt,
 * sur le serveur), ou un retour coché dans « Retours réglés » (R7b). On compare aux valeurs
 * d'ouverture, pas à une feuille vide : une feuille préremplie par le changement de statut se ferme
 * sans question. Les lignes se comparent par leur contenu, pas par leur identifiant : une ligne
 * ajoutée puis retirée ne compte pas ; une case cochée puis décochée non plus.
 */
export const isDirty = (
  initial: UpdateFormValues,
  current: UpdateFormValues,
  photos: UpdateFormPhoto[],
): boolean =>
  photos.length > 0 ||
  !sameSettled(settledOf(initial), settledOf(current)) ||
  initial.title !== current.title ||
  initial.version !== current.version ||
  initial.beforeAfter !== current.beforeAfter ||
  initial.lines.length !== current.lines.length ||
  initial.lines.some((line, index) => {
    const now = current.lines[index]
    return !now || now.family !== line.family || now.text !== line.text
  })

/** Un texte facultatif : sans les blancs autour, et null s'il ne reste rien. */
const optional = (text: string): string | null => {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Ce qu'on envoie à `POST …/updates`, ou pourquoi on ne peut pas encore :
 * - `required` : aucune ligne écrite (les lignes vides, ou faites d'espaces, sont ignorées) ;
 * - `lineTooLong` : une ligne dépasse `UPDATE_LINE_MAX` (le champ laisse taper plus : le texte d'un
 *   collage se voit en entier ; l'API refuserait avec un 400 que la feuille ne saurait pas expliquer) ;
 * - `uploading` : une photo s'envoie encore (son identifiant n'est pas connu).
 * Le titre et la version vides valent null ; « Avant / après » est coupé sous deux photos (le
 * contrat le refuserait, et l'API répondrait 400). Les retours cochés partent en
 * `settledFeedbackIds` (R7b), chacun une fois ; sans case cochée, le champ n'est pas envoyé (le
 * contrat dit alors « aucun »).
 */
export const toPayload = (
  values: UpdateFormValues,
  photos: UpdateFormPhoto[],
): UpdatePayloadResult => {
  const lines = values.lines.flatMap((line) => {
    const text = line.text.trim()
    return text === '' ? [] : [{ id: line.id, family: line.family, text }]
  })
  if (lines.length === 0) return { ok: false, error: 'required' }
  // `length` compte en unités UTF-16, comme le `max` de Zod côté API : la même ligne passe ou
  // échoue des deux côtés.
  const tooLong = lines.find((line) => line.text.length > UPDATE_LINE_MAX)
  if (tooLong) return { ok: false, error: 'lineTooLong', lineId: tooLong.id }
  if (photos.some((photo) => photo.uploading || photo.id === null)) {
    return { ok: false, error: 'uploading' }
  }
  const sent = photos
    .slice(0, UPDATE_PHOTOS_MAX)
    .map((photo) => ({ id: photo.id as string, description: photo.description }))
  // Un Set retire un doublon (une double tape qui aurait coché deux fois) : le contrat refuse un
  // retour envoyé deux fois.
  const settled = [...new Set(settledOf(values))]
  return {
    ok: true,
    payload: {
      title: optional(values.title),
      version: optional(values.version),
      // Sans l'`id` du formulaire : le contrat d'une ligne est strict (famille et texte seulement).
      lines: lines.map(({ family, text }) => ({ family, text })),
      photos: sent,
      beforeAfter: values.beforeAfter && sent.length >= 2,
      ...(settled.length > 0 ? { settledFeedbackIds: settled } : null),
    },
  }
}
