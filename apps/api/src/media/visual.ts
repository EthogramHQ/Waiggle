// Nettoyage des visuels de projet (tranche 3b-1), sur le modèle des avatars : on fabrique toujours
// une nouvelle image, sans métadonnées, et on calcule son « ThumbHash ».
// Le ThumbHash est un résumé flou de l'image en une vingtaine d'octets : il colore la lumière
// d'ambiance et s'affiche le temps que la vraie photo arrive.
import type { VisualSlot } from '@ruche/contracts'
import { rgbaToThumbHash } from 'thumbhash'
import { type ImageFailure, processImage } from './image'

/** Le plus grand côté d'un visuel, en pixels : assez pour un écran d'ordinateur, sans excès. */
export const VISUAL_MAX_SIDE = 1600
// Le format ThumbHash est prévu pour une image d'au plus 100 × 100 pixels.
const THUMBHASH_SIDE = 100

type VisualSuccess = {
  ok: true
  data: Uint8Array
  width: number
  height: number
  thumbhash: string
}
export type VisualResult = VisualSuccess | ImageFailure

export const processVisual = (input: Uint8Array, slot: VisualSlot): Promise<VisualResult> =>
  processImage<VisualSuccess>(input, async ({ image, width, height }) => {
    // La couverture verticale s'affiche sur téléphone : une photo plus large que haute n'en est
    // pas une. (Les dimensions tiennent déjà compte de l'orientation de la photo.)
    if (slot === 'portrait' && width > height) return { ok: false, reason: 'unsupported' }

    // rotate() redresse la photo selon son orientation EXIF, avant que l'EXIF ne disparaisse.
    // « inside » : le plus grand côté passe à 1 600 px, sans déformer ni recadrer ;
    // withoutEnlargement : une petite photo n'est jamais agrandie (elle deviendrait floue).
    const resized = image
      .rotate()
      .resize(VISUAL_MAX_SIDE, VISUAL_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    // clone() : deux sorties à partir de la même image décodée, la photo et sa miniature.
    const { data, info } = await resized
      .clone()
      .webp({ quality: 82 })
      // sharp n'écrit aucune métadonnée par défaut : rien n'est recopié de l'original.
      .toBuffer({ resolveWithObject: true })

    // Pour le ThumbHash : une miniature de 100 px au plus, en pixels bruts RGBA (4 octets par pixel).
    const thumb = await resized
      .clone()
      .resize(THUMBHASH_SIDE, THUMBHASH_SIDE, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const hash = rgbaToThumbHash(thumb.info.width, thumb.info.height, thumb.data)

    return {
      ok: true,
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
      thumbhash: Buffer.from(hash).toString('base64'),
    }
  })
