// Ce que l'appli règle au niveau de la page web entière, hors des composants : la feuille de style
// écrite dans le squelette HTML (app/+html.tsx) et les réglages que le thème y ajoute ensuite.
// Elle vit ici, avec le thème, parce qu'elle lit les jetons de @ruche/brand (seuls les composants
// et le thème les lisent, pas les pages).
import { borders, durations, easings, focusHaloOpacity, type Palette, palettes } from '@ruche/brand'
import { Platform } from 'react-native'

/**
 * L'attribut posé sur <html> pendant le fondu entre le jour et la nuit (voir ThemeProvider). Un
 * attribut plutôt qu'une classe : le thème pose déjà data-hydrated de la même façon.
 */
export const SCHEME_FADING = 'data-scheme-fading'

/**
 * Combien de temps l'attribut du fondu reste posé : la durée du fondu, plus une marge pour un
 * élément dont la transition partirait une image plus tard. Au-delà, plus rien ne fond : un survol
 * ou un appui change de couleur aussitôt, comme avant.
 */
export const SCHEME_FADE_MS = durations.scheme + durations.quick

// Le halo du focus : le miel du thème, à l'opacité du jeton `focusHaloOpacity` (packages/brand),
// sur 4 points autour du contour. En pourcentage, l'unité qu'attend `color-mix`.
const FOCUS_HALO_PERCENT = Math.round(focusHaloOpacity * 100)
const FOCUS_HALO_WIDTH = 2 * borders.focus

/**
 * La couleur du halo de focus d'un thème (`--focus-halo`) : son miel, rendu transparent. CSS
 * `color-mix` mélange le miel et le transparent (le jeton dit la part de miel) : la couleur reste
 * celle du jeton, sans code couleur écrit ici.
 */
export const focusHalo = (colors: Palette): string =>
  `color-mix(in srgb, ${colors.honey} ${FOCUS_HALO_PERCENT}%, transparent)`

// Le halo commence au bord de l'élément et dépasse le contour (décalé de 2, épais de 2) de 4 :
// il entoure l'anneau au lieu de se cacher dessous.
const haloSpread = 2 * borders.focus + FOCUS_HALO_WIDTH

/**
 * La feuille de style fixe de la page (n'y mettre que des jetons de @ruche/brand, jamais une donnée
 * venue d'ailleurs : elle est écrite telle quelle dans le HTML).
 *
 * - Le fond de la page avant que l'appli ne démarre, de jour ou de nuit selon l'appareil.
 * - De nuit, la page pré-rendue (dessinée de jour, sans connaître le visiteur) reste cachée tant que
 *   l'appli n'a pas démarré : on voit le fond de nuit, puis la page déjà dans le bon thème, sans
 *   éclair blanc. L'attribut data-hydrated est posé par le thème (ThemeProvider) au démarrage.
 *   Filet en CSS seul : si le JavaScript ne se charge jamais, la page se montre quand même au bout
 *   de 3 secondes (une animation qui la rend visible, sans script).
 * - Le fondu entre le jour et la nuit : pendant que <html> porte data-scheme-fading (posé par le
 *   thème pour la durée du fondu seulement), les fonds, les bordures et les ombres de tous les
 *   éléments passent d'une couleur à l'autre en 600 ms (`--d-scheme`). **La couleur du texte n'en
 *   fait pas partie** : à mi-course, un texte gris moyen sur un fond gris moyen ne se lirait plus
 *   (contraste proche de 1:1). Le texte bascule d'un coup ; pour qu'il reste lisible, le fond part
 *   vite et ralentit ensuite (la courbe « exit ») : à 300 ms, il est déjà presque arrivé.
 *   Le sélecteur `html[…] *` (un attribut et deux éléments) l'emporte sur les classes de
 *   react-native-web, sans `!important`.
 * - L'anneau de focus : le même contour miel pour tous les éléments touchables, allumé seulement au
 *   clavier (:focus-visible), dans la couleur du thème choisi (--focus-ring, posée par le thème), et
 *   entouré d'un halo de miel transparent (--focus-halo, une ombre sans flou). Pendant le focus, le
 *   halo remplace l'ombre propre de l'élément : `!important`, car l'ombre du bouton miel est écrite
 *   sur l'élément lui-même (mesuré dans le navigateur : sans lui, le bouton miel n'avait pas de
 *   halo), et une règle de feuille de style ne passe pas devant un style posé sur l'élément.
 *   Les éléments rangés dans un cadre qui rogne ce qui dépasse (lignes d'une liste, vignettes)
 *   dessinent l'anneau à l'intérieur (data-focus="inset", voir insetFocus) : un cadre posé
 *   par-dessus leur contenu (::after), sinon une photo le recouvrirait ; leur halo est à l'intérieur
 *   de l'anneau. Les champs de saisie montrent leur focus par leur cadre : ni anneau ni halo.
 */
export const documentCss = `
html { --d-scheme: ${durations.scheme}ms; }
html, body { background-color: ${palettes.day.background}; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: ${palettes.night.background}; }
  html:not([data-hydrated]) body > * { visibility: hidden; animation: reveal 0s 3s forwards; }
}
@keyframes reveal { to { visibility: visible; } }
html[${SCHEME_FADING}], html[${SCHEME_FADING}] body, html[${SCHEME_FADING}] body * {
  transition-property: background-color, border-color, box-shadow;
  transition-duration: var(--d-scheme);
  transition-timing-function: cubic-bezier(${easings.exit.join(', ')});
}
:focus-visible {
  outline: ${borders.focus}px solid var(--focus-ring, ${palettes.day.focusRing});
  outline-offset: ${borders.focus}px;
}
html :focus-visible:not(input, textarea, [data-focus="inset"]) {
  box-shadow: 0 0 0 ${haloSpread}px var(--focus-halo, ${focusHalo(palettes.day)}) !important;
}
[data-focus="inset"]:focus-visible { outline: none; }
[data-focus="inset"]:focus-visible::after {
  content: '';
  position: absolute;
  inset: ${borders.focus}px;
  border: ${borders.focus}px solid var(--focus-ring, ${palettes.day.focusRing});
  border-radius: inherit;
  box-shadow: inset 0 0 0 ${FOCUS_HALO_WIDTH}px var(--focus-halo, ${focusHalo(palettes.day)});
  pointer-events: none;
  z-index: 1;
}
:focus:not(:focus-visible), input:focus-visible, textarea:focus-visible { outline: none; }
@media (forced-colors: active) { [data-wordmark="copy"] { display: none; } }
`

/**
 * Le mot-symbole (`Wordmark`) en contraste élevé de Windows (`forced-colors: active`) : le
 * navigateur y impose ses couleurs, et le vrai mot, transparent pour laisser voir la copie au point
 * miel, redevient visible. Avec la copie par-dessus, on lirait le mot deux fois, décalé : la règle
 * de `documentCss` cache alors la copie (marquée par cet attribut), et seul le vrai mot reste, dans
 * la couleur du système. À étaler sur la copie (`{...wordmarkCopy}`).
 */
export const wordmarkCopy: object = Platform.OS === 'web' ? { dataSet: { wordmark: 'copy' } } : {}

/**
 * À étaler sur un élément touchable rangé dans un cadre qui rogne (`{...insetFocus}`) : sur le web,
 * il ajoute l'attribut data-focus="inset" (react-native-web transforme `dataSet` en attributs data-).
 * dataSet n'existe pas dans les types de React Native, d'où cet objet préparé une fois ici.
 */
export const insetFocus: object = Platform.OS === 'web' ? { dataSet: { focus: 'inset' } } : {}
