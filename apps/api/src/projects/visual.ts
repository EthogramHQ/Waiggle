// Une ligne de `project_media` transformée en photo telle que l'API la renvoie (contrat
// `ProjectVisual`). Ce petit fichier existe pour être lu par `projects/load.ts` (galerie,
// couverture) et par `updates/load.ts` (photos d'une mise à jour) sans que l'un importe l'autre :
// chacun a besoin de cette conversion, et deux fichiers qui s'importent mutuellement s'attendraient
// au chargement.
import { type ProjectVisual, Thumbhash } from '@ruche/contracts'
import type { schema } from '@ruche/db'
import { mediaUrl } from '../profile/me'

export type MediaRow = typeof schema.projectMedia.$inferSelect

/** Un média tel que l'API le renvoie (contrat `ProjectVisual`). */
export const toVisual = (media: MediaRow, publicApiUrl: string): ProjectVisual => ({
  id: media.id,
  kind: 'image',
  url: mediaUrl(publicApiUrl, media.storageKey),
  width: media.width,
  height: media.height,
  // Calculé par notre serveur ; vérifié quand même, comme tout ce qui sort de la base.
  thumbhash: Thumbhash.parse(media.thumbhash),
  // R6a : la description de la photo, null si l'auteur n'en a pas écrit.
  description: media.description,
})
