// Nettoyage des avatars. On ne republie JAMAIS le fichier envoyé tel quel : on en fabrique un nouveau.
// - Les métadonnées disparaissent (position GPS, modèle du téléphone, date…).
// - Un fichier piégé qui se ferait passer pour une image est rejeté au décodage.
// - Tous les avatars ont le même format et la même taille, ce qui est léger à afficher.
// La file d'attente et les garde-fous communs à toutes les images sont dans image.ts.
import { type ImageFailure, processImage } from './image'

export const AVATAR_SIZE = 512

type AvatarSuccess = { ok: true; data: Uint8Array }
export type AvatarResult = AvatarSuccess | ImageFailure

export const processAvatar = (input: Uint8Array): Promise<AvatarResult> =>
  processImage<AvatarSuccess>(input, async ({ image }) => {
    const data = await image
      .rotate() // redresse la photo selon son orientation EXIF, avant que l'EXIF ne disparaisse
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' }) // carré, recadré au centre
      .webp({ quality: 82 })
      // sharp n'écrit aucune métadonnée par défaut : rien n'est recopié de l'original.
      .toBuffer()
    return { ok: true, data: new Uint8Array(data) }
  })
