// Fabrique de fausses photos pour les tests, avec sharp.
// On ne stocke aucune vraie photo dans le dépôt : on les génère à la demande.
import { deflateSync } from 'node:zlib'
import sharp from 'sharp'

/**
 * Une photo JPEG 1200 × 800 qui contient des métadonnées EXIF, dont une position GPS,
 * comme celles que prend un téléphone. C'est exactement ce qu'on ne doit jamais republier.
 */
export const photoWithGps = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d9a441' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Phone', Model: 'Secret model', Copyright: 'Léa' },
      // IFD3 = la section GPS des métadonnées EXIF : latitude 48° 51' 24" N (Paris).
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' },
    })
    .toBuffer()

/** Une image PNG simple. */
export const pngImage = () =>
  sharp({ create: { width: 300, height: 600, channels: 4, background: '#3b6ea8' } })
    .png()
    .toBuffer()

/** Prépare un formulaire d'envoi de fichier (multipart/form-data) avec un champ "avatar". */
export const avatarForm = (bytes: Uint8Array, type = 'image/jpeg', filename = 'photo.jpg') => {
  const form = new FormData()
  form.append('avatar', new File([new Uint8Array(bytes)], filename, { type }))
  return form
}

/**
 * Prépare l'envoi d'un visuel de projet : le fichier (champ "visual") et, s'il est donné, son
 * emplacement (champ "slot" : la galerie ou la couverture verticale).
 */
export const visualForm = (
  bytes: Uint8Array,
  slot?: string,
  type = 'image/jpeg',
  filename = 'photo.jpg',
) => {
  const form = new FormData()
  form.append('visual', new File([new Uint8Array(bytes)], filename, { type }))
  if (slot !== undefined) form.append('slot', slot)
  return form
}

/** Une image JPEG unie, aux dimensions et à la couleur choisies. */
export const jpegImage = (width: number, height: number, background = '#7a9e3b') =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()

/**
 * Une « bombe de décompression » : un PNG noir de width × height pixels, valide, mais minuscule
 * une fois compressé (des millions de zéros se compressent très bien). Décodé, il occuperait
 * width × height octets en mémoire. On l'écrit octet par octet, sans passer par sharp.
 */
export const pngBomb = (width: number, height: number) => {
  // Un PNG est une suite de « morceaux » (chunks) : longueur, type, données, somme de contrôle.
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 8 bits par pixel
  header[9] = 0 // niveaux de gris
  // Chaque ligne : 1 octet de filtre (0) puis `width` pixels noirs (0).
  const pixels = deflateSync(Buffer.alloc((width + 1) * height), { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature PNG
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Somme de contrôle CRC-32 exigée par le format PNG.
const crc32 = (bytes: Buffer) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
