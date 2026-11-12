// Les petites images du récap du dimanche (R8, planche R8-Recap, décision A5) : jointes à l'e-mail
// « en ligne » et montrées par `cid:`, jamais chargées à distance (aucune messagerie ne prévient
// ainsi le serveur qu'un e-mail a été ouvert, et rien ne dépend d'une adresse publique).
//
// - recapThumb : la photo d'un projet, relue dans le stockage, réduite et ré-encodée ;
// - categoryTile : la tuile miel d'une catégorie, une image fixe fabriquée une fois par
//   scripts/category-tiles.mts, pour un projet sans photo (ou signalé, voir jobs/weekly-recap.ts).
//
// Le nom du fichier et le `cid` sont provisoires ici (« thumb », « tile ») : la tâche du récap donne
// à chaque image son nom définitif et unique (thumb-1, projet-1.jpg). Aucun ne reprend la clé du
// stockage ni un texte de membre.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { type FileStorage, isValidKey } from '../media/storage'
import type { Attachment } from './templates'

/** Le plus grand côté d'une vignette, en pixels : deux fois sa taille dans l'e-mail. */
const THUMB_SIZE = 160
/** La qualité JPEG : une photo de 160 px pèse alors quelques kilo-octets. */
const THUMB_QUALITY = 80

/**
 * La vignette de la photo rangée sous `key`, ou null si elle manque ou ne se lit pas (le récap
 * prend alors la tuile de la catégorie). Jamais d'erreur : une photo abîmée ne doit pas empêcher
 * le récap de partir.
 *
 * sharp (la bibliothèque d'images de l'API) :
 * - `rotate()` sans argument redresse la photo selon son orientation enregistrée, avant que les
 *   métadonnées ne disparaissent ;
 * - `resize(…, { fit: 'inside' })` la fait tenir dans un carré de 160 px en gardant ses proportions
 *   (900 × 1600 devient 90 × 160), sans jamais l'agrandir ;
 * - `flatten` pose une image transparente sur du blanc : le JPEG n'a pas de transparence ;
 * - `jpeg()` ré-encode ; sharp n'écrit aucune métadonnée (EXIF, GPS, XMP, IPTC) sans
 *   `withMetadata()`, qu'on n'appelle jamais.
 */
export const recapThumb = async (storage: FileStorage, key: string): Promise<Attachment | null> => {
  // Une clé qui n'est pas du serveur ne lit rien (le stockage lèverait une erreur).
  if (!isValidKey(key)) return null
  try {
    const original = await storage.get(key)
    if (original === null) return null
    const content = await sharp(original)
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer()
    return {
      filename: 'thumb.jpg',
      contentType: 'image/jpeg',
      content: new Uint8Array(content),
      cid: 'thumb',
    }
  } catch {
    // Un fichier qui n'est pas une image (ou une image tronquée) : pas de vignette.
    return null
  }
}

/**
 * Le dossier des tuiles. Le code se lit à deux endroits : ses sources (apps/api/src/email, les
 * tests et le développement) et le fichier unique de la production (dist/index.js, dans l'image
 * Docker, où les tuiles sont copiées dans /app/assets : voir apps/api/Dockerfile). On prend le
 * premier dossier qui existe.
 */
const tilesFolder = () => {
  const candidates = ['../../assets/category-tiles/', '../assets/category-tiles/'].map((path) =>
    fileURLToPath(new URL(path, import.meta.url)),
  )
  const found = candidates.find((folder) => existsSync(folder))
  if (found === undefined) throw new Error('Category tiles not found')
  return found
}

/** Les tuiles déjà lues, par code : chaque fichier n'est lu qu'une fois par démarrage de l'API. */
const tiles = new Map<string, Uint8Array>()

/** Un code de catégorie bien formé (lettres minuscules, chiffres, tirets) : jamais un chemin. */
const SAFE_CODE = /^[a-z0-9-]+$/

/**
 * La tuile d'une catégorie (un PNG carré de 160 px). Une catégorie sans tuile (ajoutée plus tard par
 * un administrateur) prend celle d'« Autre ». Les octets sont toujours les mêmes pour un code.
 */
export const categoryTile = (code: string | null): Attachment => {
  const folder = tilesFolder()
  const file = (name: string) => `${folder}${name}.png`
  const name = code !== null && SAFE_CODE.test(code) && existsSync(file(code)) ? code : 'other'
  let content = tiles.get(name)
  if (content === undefined) {
    content = new Uint8Array(readFileSync(file(name)))
    tiles.set(name, content)
  }
  return { filename: 'tile.png', contentType: 'image/png', content, cid: 'tile' }
}
