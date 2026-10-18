// Petits outils de navigation partagés par les pages.

/**
 * Un paramètre d'adresse (« /projects/[id] » → id) peut arriver seul ou en liste si l'adresse le
 * répète (?url=a&url=b). On ne garde que le premier : jamais de liste là où on attend un texte.
 */
export const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value
