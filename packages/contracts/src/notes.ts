// Les notes d'un projet (tranche 4b) : de courtes nouvelles que l'auteur publie (« v2 : mode hors
// ligne »). Elles forment le journal du projet, et arrivent dans le fil des membres qui le suivent.
// Modifier le projet lui-même (corriger une faute) ne fait rien remonter : seule une note le fait.
import { z } from 'zod'
import { VisibleFreeText } from './text'

/** Une note fait au plus 1 000 caractères : quelques phrases, pas un article. */
export const PROJECT_NOTE_MAX = 1_000
/** La page d'un projet montre ses 20 notes les plus récentes. */
export const PROJECT_NOTES_SHOWN = 20

/** L'identifiant d'une note dans une adresse. */
export const ProjectNoteId = z.uuid()

/**
 * Le texte d'une note : du texte brut, affiché tel quel (pas de Markdown), sur plusieurs lignes
 * si besoin, sans caractères interdits, et jamais vide ni fait seulement de caractères qui ne se
 * voient pas.
 */
export const NoteText = VisibleFreeText(PROJECT_NOTE_MAX)

/** Ce que l'appli envoie pour publier une note (POST /v1/projects/{id}/notes). */
export const NewProjectNote = z.object({ body: NoteText }).meta({ id: 'NewProjectNote' })
export type NewProjectNote = z.infer<typeof NewProjectNote>

/** Une note publiée. */
export const ProjectNote = z
  .object({
    id: ProjectNoteId,
    body: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ProjectNote' })
export type ProjectNote = z.infer<typeof ProjectNote>
