// Choisir une photo sur l'appareil et la préparer avant l'envoi : recadrée si besoin, réduite,
// enregistrée en JPEG. Le serveur la ré-encode ensuite de toute façon (sans métadonnées) ; préparer
// ici évite surtout d'envoyer une photo de 8 Mo pour rien.
// Trois usages : l'avatar (carré), une photo de galerie (proportions gardées) et la couverture
// verticale d'un projet (format téléphone).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'

/** Une image choisie sur l'appareil, prête à être envoyée. */
export type PickedImage = { uri: string; width: number; height: number }

export type PickShape = 'square' | 'free' | 'portrait'

// Le plus grand côté de l'image préparée. Le serveur réduit ensuite l'avatar à 512 px et les photos
// de projet à 1 600 px : on envoie un peu plus, jamais beaucoup plus.
const MAX_SIDE: Record<PickShape, number> = { square: 1024, free: 2048, portrait: 2048 }
// Le format d'un écran de téléphone tenu droit : 9 de large pour 16 de haut.
const PORTRAIT = { width: 9, height: 16 }

/**
 * Ouvre la galerie de photos et prépare l'image choisie. Renvoie null si le membre annule.
 * `onChosen` est appelé dès qu'une photo est choisie, avant sa préparation (quelques instants) :
 * l'écran peut ainsi montrer qu'elle arrive. Il n'est jamais appelé si le membre annule.
 * - square : recadrée en carré au centre (sur mobile, le membre choisit lui-même le cadrage) ;
 * - free : telle quelle, réduite ;
 * - portrait : recadrage proposé en 9:16 sur mobile ; sur le web (la galerie n'y sait pas
 *   recadrer), une photo plus large que haute est recadrée au centre en 9:16.
 */
export const pickImage = async (
  shape: PickShape,
  onChosen?: () => void,
): Promise<PickedImage | null> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // iOS et Android proposent alors de recadrer, au format demandé.
    allowsEditing: shape !== 'free',
    ...(shape === 'square' ? { aspect: [1, 1] as [number, number] } : null),
    ...(shape === 'portrait'
      ? { aspect: [PORTRAIT.width, PORTRAIT.height] as [number, number] }
      : null),
    quality: 1, // pas de compression ici : on compresse une seule fois, juste après
  })
  const asset = result.canceled ? undefined : result.assets[0]
  if (!asset) return null
  onChosen?.()

  const context = ImageManipulator.manipulate(asset.uri)
  let { width, height } = asset
  const crop = cropFor(shape, width, height)
  if (crop) {
    context.crop(crop)
    width = crop.width
    height = crop.height
  }
  // Réduction (sans jamais agrandir une petite image), en gardant les proportions.
  const max = MAX_SIDE[shape]
  const scale = Math.min(1, max / Math.max(width, height))
  if (scale < 1) {
    width = Math.round(width * scale)
    height = Math.round(height * scale)
    context.resize({ width, height })
  }
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
  return { uri: saved.uri, width, height }
}

/** Le recadrage au centre à appliquer, s'il en faut un. */
const cropFor = (shape: PickShape, width: number, height: number) => {
  if (shape === 'square' && width !== height) {
    const side = Math.min(width, height)
    return {
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    }
  }
  // Une couverture verticale plus large que haute (possible sur le web, où l'on ne recadre pas
  // en choisissant) : on garde une bande verticale au centre, au format 9:16.
  if (shape === 'portrait' && width > height) {
    const cropWidth = Math.floor((height * PORTRAIT.width) / PORTRAIT.height)
    return { originX: Math.floor((width - cropWidth) / 2), originY: 0, width: cropWidth, height }
  }
  return null
}

/**
 * Ajoute l'image à un formulaire d'envoi (multipart), sous le nom de champ donné.
 * - Sur le web, l'image est une adresse « blob: » ou « data: » : on récupère son contenu.
 * - Sur mobile, React Native sait lire le fichier lui-même à partir de son adresse locale. Le
 *   « as unknown as Blob » est nécessaire : les types du web ne connaissent pas cette forme.
 */
export const appendImage = async (form: FormData, field: string, image: { uri: string }) => {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(image.uri)).blob()
    form.append(field, blob, `${field}.jpg`)
  } else {
    form.append(field, {
      uri: image.uri,
      name: `${field}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob)
  }
}
