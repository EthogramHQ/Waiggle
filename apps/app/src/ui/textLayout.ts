// La mesure des lignes d'un texte sur téléphone, passée par le contexte (R5b, `ReadMore`).
// `onTextLayout` est une propriété du seul `Text` natif : il dit, après la mise en page, combien de
// lignes le texte occupe. `ReadMore` replie un texte qu'il ne dessine pas lui-même (il le reçoit par
// une fonction) : il ne peut pas poser cette propriété dessus. Il la met donc dans ce contexte, et
// le `Text` de l'appli (`Text.tsx`) la pose sur le texte natif le plus proche.
// Un contexte React : une valeur posée par un composant parent et lue par n'importe quel
// descendant, sans la passer de main en main.
import { createContext } from 'react'
import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native'

/** Ce que reçoit le parent qui mesure : l'évènement `onTextLayout` du texte natif. */
export type TextLayoutListener = (event: NativeSyntheticEvent<TextLayoutEventData>) => void

/**
 * `null` : personne ne mesure. Un `Text` remet `null` pour les textes imbriqués dans le sien (une
 * pastille de mention), qui ne sont pas des lignes à part.
 */
export const TextLayoutContext = createContext<TextLayoutListener | null>(null)
