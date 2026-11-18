// La forme de la vague de miel à l'entrée dans l'appli (R17, prototype animé du 28/10) : le tracé
// SVG de la vague à l'instant `t` (de 0 à 1). Une fonction pure, partagée par le web
// (ui/HoneyWave.web.tsx) et le téléphone (ui/HoneyWave.tsx).

/** Le point d'où part la vague : le centre du bouton touché, en points depuis le haut de l'écran. */
export type WaveOrigin = { y: number }

/**
 * Le tracé (attribut `d` d'un `<path>`) de la vague à l'instant `t`, pour un écran de `width` sur
 * `height` points. Son bord avant monte depuis le bouton ; son bord arrière suit et découvre le Fil.
 */
export const wavePath = (
  _t: number,
  _width: number,
  _height: number,
  _origin: WaveOrigin,
): string => ''
