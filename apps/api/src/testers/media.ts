// Une image du coin des testeurs (photo d'appel ou capture) telle que l'API la renvoie : ce petit
// fichier existe pour être lu par les appels (routes/tester-calls.ts) et par l'envoi des images
// (routes/tester-media.ts) sans que l'un importe l'autre.
import { type TesterMedia, Thumbhash } from '@ruche/contracts'
import type { schema } from '@ruche/db'
import { mediaUrl } from '../profile/me'

export type TesterMediaRow = typeof schema.testerMedia.$inferSelect

/**
 * Une ligne de `tester_media` en `TesterMedia` (contrat). L'adresse ne s'ouvre que pour ceux qui
 * voient l'appel ou le message (routes/media.ts). Le résumé flou est calculé par notre serveur,
 * vérifié quand même comme tout ce qui sort de la base.
 */
export const toTesterMedia = (media: TesterMediaRow, publicApiUrl: string): TesterMedia => ({
  id: media.id,
  url: mediaUrl(publicApiUrl, media.storageKey),
  width: media.width,
  height: media.height,
  thumbhash: Thumbhash.parse(media.thumbhash),
  description: media.description,
})
