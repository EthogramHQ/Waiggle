// Point d'entrée du paquet @ruche/brand : l'identité de l'appli en un seul endroit.
// Le nom affiché et les « jetons de design » (couleurs, lettres, formes, ombres, mouvement) que
// l'appli, l'API (e-mails) et un futur site partagent. Ce paquet ne dépend de rien : il ne contient
// que des valeurs, pas de composants.
export {
  type ColorName,
  contrastPairs,
  honeyLight,
  type Palette,
  palettes,
  type Scheme,
  schemes,
} from './colors'
export { contrastRatio, parseColor } from './contrast'
export { type DurationName, durations, pressScale, type SpringName, springs } from './motion'
export { appName, sourceUrl } from './name'
export { type ShadowName, shadows } from './shadows'
export { borders, layout, type Radius, radii, type Space, space } from './shape'
export {
  type FontFamily,
  type FontWeight,
  fontFamilies,
  fontWeights,
  maxTextScale,
  readableWidth,
  type TextVariant,
  textStyles,
} from './typography'
