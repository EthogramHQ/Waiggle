// « Mes données » (tranche R11) : la forme commune du projet dans « Mes commentaires » et « Mes
// retours envoyés ». Fichier à part, qui ne lit que visuals.ts : le coin des testeurs (testers.ts)
// ne doit pas dépendre des projets (boucle d'imports), et les deux listes partagent ainsi une
// seule forme.
import { z } from 'zod'
import { ProjectVisual } from './visuals'

/** Ces deux listes se lisent 30 éléments par 30, du plus récent au plus ancien. */
export const MY_DATA_PAGE_SIZE = 30

/**
 * Le projet d'un commentaire ou d'un message, en version très courte : de quoi le reconnaître dans
 * la liste (titre, couverture, nom de son auteur). Les listes donnent `null` à la place quand le
 * membre ne voit plus le projet (devenu privé, retiré, réservé à une ruche qu'il a quittée, ou un
 * blocage) : son titre, sa couverture et son auteur appartiennent à un autre, et l'appli écrit
 * alors une phrase qui ne nomme personne. Jamais le pseudo ni la photo de l'auteur.
 */
export const MyDataProject = z
  .object({
    id: z.uuid(),
    title: z.string(),
    /** La couverture (la première photo) ; null pour un projet sans photo. */
    cover: ProjectVisual.nullable(),
    author: z.object({ name: z.string() }),
  })
  .meta({ id: 'MyDataProject' })
export type MyDataProject = z.infer<typeof MyDataProject>
