// Ce que tous les traitements d'images (avatars, visuels de projet) ont en commun : une seule file
// d'attente, et les mêmes garde-fous avant de décoder quoi que ce soit.
// Ils utilisent sharp, une bibliothèque de traitement d'images très rapide.
import sharp, { type Sharp } from 'sharp'
import { createQueue, QueueFullError } from './queue'

// Formats d'origine acceptés, tels que sharp les détecte en lisant le contenu du fichier
// (et non d'après son nom ou ce que le navigateur prétend : ça, n'importe qui peut le falsifier).
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])

// Garde-fous contre les images piégées, qui feraient exploser la mémoire du serveur :
// - les « bombes de décompression » : un petit fichier qui annonce une image immense
//   (une fois décodée, elle prendrait des gigaoctets). 4096 × 4096 pixels au plus : une photo de
//   téléphone (12 mégapixels) passe, et l'appli réduit de toute façon les images avant l'envoi ;
// - les images très allongées (65 000 × 600…) : sharp ne sait pas les réduire pendant la lecture,
//   elles coûtent bien plus cher que leur nombre de pixels ne le laisse croire.
const MAX_INPUT_PIXELS = 4096 * 4096
const MAX_ASPECT_RATIO = 4

// Deux traitements au plus en même temps, huit au plus en attente (au-delà : « réessaie dans un
// instant »). Dix envois simultanés attendent leur tour au lieu de se partager (et d'épuiser) la
// mémoire. Une seule file pour les avatars et les visuels : c'est la mémoire du serveur entier
// qu'elle protège. sharp n'utilise qu'un fil de calcul par image, et ne garde rien en cache.
sharp.concurrency(1)
sharp.cache(false)
const queue = createQueue(2, 8)

export type ImageFailure = { ok: false; reason: 'unsupported' | 'busy' }

/** Ce que l'en-tête d'une image acceptée nous apprend, avant tout décodage. */
export type CheckedImage = { image: Sharp; width: number; height: number }

/**
 * Lit l'en-tête de l'image (rapide, sans la décoder) et vérifie qu'elle est acceptable.
 * null : pas une image acceptée (format, profondeur, proportions, ou fichier illisible).
 */
const check = async (input: Uint8Array): Promise<CheckedImage | null> => {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    const { format, width, height, depth, orientation } = await image.metadata()
    if (!format || !ACCEPTED_FORMATS.has(format)) return null
    // 8 bits par couleur (« uchar ») seulement : une image 16 bits coûte deux fois plus de mémoire
    // à décoder, pour une différence invisible.
    if (depth !== 'uchar') return null
    if (Math.max(width, height) > MAX_ASPECT_RATIO * Math.min(width, height)) return null
    // Une photo de téléphone tenue de côté est enregistrée « couchée » avec une orientation EXIF
    // de 5 à 8 : une fois redressée, sa largeur et sa hauteur s'échangent.
    const turned = orientation !== undefined && orientation >= 5
    return { image, width: turned ? height : width, height: turned ? width : height }
  } catch {
    // sharp n'arrive même pas à lire l'en-tête : ce n'est pas une image valide.
    return null
  }
}

/**
 * Passe un traitement par la file d'attente, après les garde-fous communs.
 * `work` reçoit l'image vérifiée ; s'il lève une erreur (image corrompue au décodage), la réponse
 * est « pas une image acceptée ».
 */
// <Success extends { ok: true }> : un type « à compléter » (générique). Chaque traitement dit ce
// qu'il renvoie en cas de réussite (un avatar : ses octets ; un visuel : ses octets, sa taille…).
export const processImage = async <Success extends { ok: true }>(
  input: Uint8Array,
  work: (checked: CheckedImage) => Promise<Success | ImageFailure>,
): Promise<Success | ImageFailure> => {
  try {
    return await queue(async () => {
      const checked = await check(input)
      if (!checked) return { ok: false, reason: 'unsupported' } as const
      try {
        return await work(checked)
      } catch {
        return { ok: false, reason: 'unsupported' } as const
      }
    })
  } catch (error) {
    if (error instanceof QueueFullError) return { ok: false, reason: 'busy' }
    throw error
  }
}
