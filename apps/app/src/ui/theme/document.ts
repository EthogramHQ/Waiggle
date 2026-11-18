// Ce que l'appli règle au niveau de la page web entière, hors des composants : la feuille de style
// écrite dans le squelette HTML (app/+html.tsx) et les réglages que le thème y ajoute ensuite.
// Elle vit ici, avec le thème, parce qu'elle lit les jetons de @ruche/brand (seuls les composants
// et le thème les lisent, pas les pages).
import {
  borders,
  durations,
  easings,
  focusHaloOpacity,
  layout,
  type Palette,
  palettes,
  radii,
  space,
  springs,
} from '@ruche/brand'
import { Platform } from 'react-native'
import { bee, beeViewBox } from '../logo.generated'
import { springEasing } from './springEasing'

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
 * Le filet sans script (R13) : au bout de ce délai, la page pré-rendue se montre et l'abeille
 * d'attente s'en va, même si le JavaScript ne s'est jamais chargé. Le même délai que le filet du
 * thème (ThemeProvider), qui pose `data-hydrated` si l'appli ne l'a pas fait. 10 s et non plus 3 :
 * à 3 s, un téléphone modeste voyait la page de jour en mode sombre (l'appli y démarrait à 8,5 s).
 */
export const REVEAL_NET_MS = 10_000

// La condition « avant le démarrage de l'appli » : `data-hydrated` n'est pas encore posé sur <html>.
const WAITING = 'html:not([data-hydrated])'
// Les enfants directs de <body> (la page d'Expo Router, `#root`), sauf l'abeille d'attente : la
// règle qui cache la page ne doit pas la cacher aussi.
const PAGE = `${WAITING} body > *:not([data-wait])`
// L'abeille d'attente avant le démarrage.
const WAITING_BEE = `${WAITING} [data-wait]`
// Le filet : une animation qui ne dure rien, part au bout de 10 s et garde son état final.
const AFTER_NET = `0s ${REVEAL_NET_MS / 1000}s forwards`

// L'abeille d'attente, de la taille de l'abeille du lancement sur téléphone (LoadingLogo, ~42
// points), un peu plus grande : seule au milieu d'un écran d'ordinateur, sans le « w ».
const WAIT_BEE_SIZE = 56
// Son vol : elle monte et descend doucement sur place, un aller-retour par vol du lancement.
const WAIT_BEE_LIFT = 8

/**
 * Le dessin de l'abeille d'attente (R13 ; plan, décision 6) : l'abeille du lancement, seule, sans le
 * « w » ni aucun mot (rien à lire, rien à traduire). app/+html.tsx la pose dans <body>, avant la
 * page, dans un élément `data-wait` caché aux lecteurs d'écran.
 *
 * Aucune couleur dans le balisage : chaque couche porte une classe, que `documentCss` peint avec
 * les rôles du logo (ui/Logo.tsx), de jour et de nuit : l'encre `text`, le miel `honey`, les ailes
 * `surface`. Dans l'ordre du logo : le miel, les ailes, puis l'encre par-dessus.
 * `focusable="false"` : sans lui, un ancien navigateur donnait le focus du clavier à un SVG.
 */
export const waitBeeMarkup = [
  `<svg viewBox="${beeViewBox}" focusable="false">`,
  `<path class="wait-honey" d="${bee.honey}"/>`,
  `<path class="wait-wing" d="${bee.wing}"/>`,
  `<path class="wait-ink" d="${bee.ink}"/>`,
  '</svg>',
].join('')

/** Les couleurs des trois couches de l'abeille d'attente, pour un thème. */
const waitBeeColours = (colors: Palette) => `
  [data-wait] .wait-honey { fill: ${colors.honey}; }
  [data-wait] .wait-wing { fill: ${colors.surface}; }
  [data-wait] .wait-ink { fill: ${colors.text}; }`

/**
 * Ce qui se passe avant le démarrage (sur ordinateur, et sur tout appareil en mode sombre) : la page
 * pré-rendue est cachée, l'abeille montrée au centre ; le filet de 10 s fait l'inverse, sans script.
 */
const whileWaiting = `
  ${PAGE} { visibility: hidden; animation: reveal ${AFTER_NET}; }
  ${WAITING_BEE} { display: flex; animation: wait-leave ${AFTER_NET}; }`

/**
 * La feuille du `<noscript>` de app/+html.tsx : un navigateur sans JavaScript montre la page tout de
 * suite, sans abeille (rien ne la ferait partir avant le filet). Les mêmes sélecteurs que les règles
 * qu'elle contredit : à poids égal, la dernière écrite gagne, et le `<noscript>` du corps vient
 * après cette feuille, posée dans la tête.
 */
export const noscriptCss = `${PAGE} { visibility: visible; } ${WAITING_BEE} { display: none; }`

/**
 * L'attribut de la lueur des squelettes (R16, ui/Skeleton.tsx), et l'objet qui le pose (à étaler sur
 * la bande de lumière, sur le web seulement : `{...skeletonGlowMark}`). react-native-web transforme
 * `dataSet` en attributs data- ; `dataSet` n'existe pas dans les types de React Native, d'où cet
 * objet préparé une fois ici. Il ne dépend pas de la plateforme : seule la lueur du web le pose.
 */
const SKELETON_GLOW = 'data-skeleton-glow'
export const skeletonGlowMark: object = { dataSet: { skeletonGlow: 'on' } }

/**
 * Les calques d'un passage de page (R17), marqués par un attribut data- que lisent les règles plus
 * bas : le contenu de la page (`Screen`), la barre du haut (`ScreenTopBar`, la barre fixe), la barre
 * d'onglets du téléphone (`TabBarHost`) et l'hôte des toasts. À étaler sur la vue (`{...passagePage}`) ;
 * rien hors du web. Les noms de passage (`view-transition-name`) ne sont posés que pendant un passage
 * (`html[data-passage]`) : hors de lui, le navigateur n'a rien à photographier à part.
 */
const passageMark = (key: string): object =>
  Platform.OS === 'web' ? { dataSet: { [key]: 'on' } } : {}
export const passagePageMark = passageMark('passagePage')
export const passageBarMark = passageMark('passageBar')
export const passageTabBarMark = passageMark('passageTabbar')
export const passageToastMark = passageMark('passageToast')

const exitCurve = `cubic-bezier(${easings.exit.join(', ')})`
// Les calques qui restent par-dessus la page pendant un passage : ils ne bougent pas.
const STILL_LAYERS = ['wg-bar', 'wg-tabbar', 'wg-toast']
// Leurs marques, posées sur les vues (le verre de ces vues prend un fond plein pendant le passage).
const STILL_MARKS = ['[data-passage-bar]', '[data-passage-tabbar]', '[data-passage-toast]']
const group = (name: string) => `::view-transition-group(${name})`
const oldImage = (name: string) => `::view-transition-old(${name})`
const newImage = (name: string) => `::view-transition-new(${name})`

/** Une animation de passage, en propriétés séparées (son nom reste lisible seul). */
const passageAnimation = (name: string, duration: number) =>
  `animation-name: ${name}; animation-duration: ${duration}ms; animation-timing-function: ${exitCurve}; animation-fill-mode: both;`

/**
 * Les passages de page (R17, View Transitions ; le moteur : ui/pageTransition.web.ts). Pendant un
 * passage, `<html>` porte `data-passage="deeper|back|sibling"` :
 * - la racine (la lumière d'ambiance, le fond) n'est pas animée : la nouvelle image couvre l'ancienne ;
 * - le contenu de la page (`wg-page`) : l'ancien s'efface en `quick` (160 ms) en montant de la moitié
 *   de `space.md`, le nouveau apparaît en `base` (320 ms) en montant de `space.md` (12 points), sur
 *   la courbe `exit` (le prototype B validé) ; au retour, l'inverse (l'ancien descend, le nouveau
 *   descend depuis −12) ; entre deux onglets, un fondu de `page` (180 ms), sans direction ;
 * - la barre du haut, la barre d'onglets et les toasts restent par-dessus (`z-index: 2`), sans
 *   animation : leur ancienne image est cachée, la nouvelle est là tout de suite ;
 * - la photo partagée (`wg-cover`) vole en `medium` (420 ms) sur la courbe du ressort `open`
 *   (`springEasing`), au-dessus de tout (`z-index: 3`), rognée comme la tuile (`radii.tile`) ;
 * - seule (rien ne l'accueille : la carte d'arrivée se voit trop peu), l'ancienne photo s'efface
 *   en `quick`, comme la page, au lieu de rester 420 ms au-dessus de tout (relecture du design,
 *   N1, 18/11/2026) ;
 * - la carte autour de la photo, sans elle (`wg-card-panel`, nommée par le moteur) : son auteur,
 *   son titre et « Tester » restent au-dessus de la photo qui vole (`z-index: 4`), comme sur la
 *   carte au repos ; l'ancienne s'efface en `quick`, la nouvelle (au retour) apparaît en `base`,
 *   sans bouger (relecture du design, C2, 18/11/2026 : la carte revenait vide pendant le vol) ;
 * - le verre des barres et des toasts : une vue nommée est photographiée seule, son verre n'a donc
 *   plus rien à flouter, et on lisait la page à travers la barre pendant tout le passage (relecture
 *   du design, C1, 18/11/2026). Pendant le passage, la couche de flou de leurs surfaces
 *   (`[data-surface-blur]`, ui/Surface.tsx) prend la couleur du fond de la page (`--passage-fill`,
 *   le rôle `background`, posé par le thème) : la couleur du verre se pose sur un fond plein, comme
 *   s'il était posé sur la page (couples « verre sur le fond » de `contrastPairs`) ;
 * - sous « Réduire les animations », chaque passage est un fondu de 180 ms, sans déplacement.
 * Jamais `pointer-events: none` sur ces calques (relecture de sécurité S3).
 */
const passagesCss = `
html[data-passage] [data-passage-page] { view-transition-name: wg-page; }
html[data-passage] [data-passage-bar] { view-transition-name: wg-bar; }
html[data-passage] [data-passage-tabbar] { view-transition-name: wg-tabbar; }
html[data-passage] [data-passage-toast] { view-transition-name: wg-toast; }
${STILL_MARKS.map((mark) => `html[data-passage] ${mark} [data-surface-blur]`).join(', ')} {
  background-color: var(--passage-fill, ${palettes.day.background});
}
${oldImage('root')}, ${newImage('root')} { animation: none; }
${STILL_LAYERS.map(group).join(', ')} { z-index: 2; animation: none; }
${STILL_LAYERS.map(oldImage).join(', ')} { display: none; }
${STILL_LAYERS.map(newImage).join(', ')} { animation: none; }
${group('wg-page')} { animation: none; }
${oldImage('wg-page')} { ${passageAnimation('wg-out', durations.quick)} }
${newImage('wg-page')} { ${passageAnimation('wg-in', durations.base)} }
html[data-passage="back"]${oldImage('wg-page')} { ${passageAnimation('wg-out-back', durations.quick)} }
html[data-passage="back"]${newImage('wg-page')} { ${passageAnimation('wg-in-back', durations.base)} }
html[data-passage="sibling"]${oldImage('wg-page')} { ${passageAnimation('wg-fade-out', durations.page)} }
html[data-passage="sibling"]${newImage('wg-page')} { ${passageAnimation('wg-fade-in', durations.page)} }
${group('wg-cover')} {
  animation-duration: ${durations.medium}ms;
  animation-timing-function: ${springEasing(springs.open, durations.medium)};
  z-index: 3;
}
::view-transition-image-pair(wg-cover) { overflow: clip; border-radius: ${radii.tile}px; }
${oldImage('wg-cover')}, ${newImage('wg-cover')} {
  animation-duration: ${durations.medium}ms;
  height: 100%;
  object-fit: cover;
}
${oldImage('wg-cover')}:only-child { ${passageAnimation('wg-fade-out', durations.quick)} }
${group('wg-card-panel')} { z-index: 4; animation: none; }
${oldImage('wg-card-panel')} { ${passageAnimation('wg-fade-out', durations.quick)} }
${newImage('wg-card-panel')} { ${passageAnimation('wg-fade-in', durations.base)} }
@keyframes wg-out { to { opacity: 0; transform: translateY(-${space.md / 2}px); } }
@keyframes wg-in { from { opacity: 0; transform: translateY(${space.md}px); } }
@keyframes wg-out-back { to { opacity: 0; transform: translateY(${space.md / 2}px); } }
@keyframes wg-in-back { from { opacity: 0; transform: translateY(-${space.md}px); } }
@keyframes wg-fade-out { to { opacity: 0; } }
@keyframes wg-fade-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  html[data-passage]${oldImage('wg-page')} { ${passageAnimation('wg-fade-out', durations.page)} }
  html[data-passage]${newImage('wg-page')} { ${passageAnimation('wg-fade-in', durations.page)} }
}
`

/**
 * La feuille de style fixe de la page (n'y mettre que des jetons de @ruche/brand, jamais une donnée
 * venue d'ailleurs : elle est écrite telle quelle dans le HTML).
 *
 * - Le fond de la page avant que l'appli ne démarre, de jour ou de nuit selon l'appareil.
 * - La page pré-rendue est dessinée sans connaître le visiteur : de jour, et en mise en page de
 *   téléphone (`useLayout` ne connaît pas la fenêtre avant l'hydratation). Elle reste donc cachée
 *   tant que l'appli n'a pas démarré là où elle serait fausse : de nuit (sinon, un éclair blanc), et
 *   au-dessus de `layout.breakpoints.medium` (700 points), de jour comme de nuit (sinon, la mise en
 *   page de téléphone, puis celle d'ordinateur). Sur un téléphone de jour, elle est juste : elle se
 *   montre tout de suite. L'attribut data-hydrated est posé par le thème (ThemeProvider) au
 *   démarrage. 700 se compare à la même largeur que `useLayout` (barre de défilement comprise).
 * - Pendant cette attente, l'abeille d'attente (`[data-wait]`, voir `waitBeeMarkup`) se pose au
 *   centre, sur le fond du thème, par-dessus la page (fixe, sans prendre aucun clic). Elle vole
 *   doucement sur place ; avec « Réduire les animations », elle reste immobile (seul son vol
 *   s'arrête : sa sortie et le filet jouent toujours). Partout ailleurs, et dès le démarrage, elle
 *   est cachée.
 * - Filet en CSS seul : si le JavaScript ne se charge jamais, la page se montre et l'abeille part au
 *   bout de 10 secondes (`REVEAL_NET_MS` : des animations qui ne durent rien et attendent 10 s,
 *   sans script). Sans JavaScript du tout, le `<noscript>` (`noscriptCss`) montre la page aussitôt.
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
 * - La lueur des squelettes (R16) : sur le web, une animation CSS qui part dès la page pré-rendue,
 *   avant que l'appli démarre ; `useCalmMotion` ne pourrait donc pas l'arrêter à temps. Sous
 *   « Réduire les animations », cette feuille l'arrête (`animation-name: none`), avant comme après
 *   l'hydratation ; la bande reste alors à sa place de repos, hors de la carte. `html […]` pèse
 *   plus lourd que la classe de react-native-web qui porte l'animation : sans `!important`.
 */
export const documentCss = `
html { --d-scheme: ${durations.scheme}ms; }
html, body { background-color: ${palettes.day.background}; }
[data-wait] {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
[data-wait] svg {
  width: ${WAIT_BEE_SIZE}px;
  height: ${WAIT_BEE_SIZE}px;
  animation: wait-fly ${durations.loadingLoop / 2}ms ease-in-out infinite alternate;
}
${waitBeeColours(palettes.day)}
@media (min-width: ${layout.breakpoints.medium}px) {${whileWaiting}
}
@media (prefers-color-scheme: dark) {
  html, body { background-color: ${palettes.night.background}; }${whileWaiting}
${waitBeeColours(palettes.night)}
}
@media (prefers-reduced-motion: reduce) { [data-wait] svg { animation: none; } }
@media (prefers-reduced-motion: reduce) { html [${SKELETON_GLOW}] { animation-name: none; } }
@keyframes reveal { to { visibility: visible; } }
@keyframes wait-leave { to { visibility: hidden; } }
@keyframes wait-fly { to { transform: translateY(-${WAIT_BEE_LIFT}px); } }
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
@media (forced-colors: active) { [data-placeholder="copy"] { display: none; } }
${passagesCss}`

/**
 * Le mot-symbole (`Wordmark`) en contraste élevé de Windows (`forced-colors: active`) : le
 * navigateur y impose ses couleurs, et le vrai mot, transparent pour laisser voir la copie au point
 * miel, redevient visible. Avec la copie par-dessus, on lirait le mot deux fois, décalé : la règle
 * de `documentCss` cache alors la copie (marquée par cet attribut), et seul le vrai mot reste, dans
 * la couleur du système. À étaler sur la copie (`{...wordmarkCopy}`).
 */
export const wordmarkCopy: object = Platform.OS === 'web' ? { dataSet: { wordmark: 'copy' } } : {}

/**
 * Le texte d'attente d'un champ (`SearchField`) dessiné par l'appli, qui passe à la ligne là où celui
 * du navigateur est coupé : en contraste élevé de Windows, le navigateur impose la couleur de son
 * propre texte d'attente (qui n'est plus transparent) ; la copie est alors cachée, pour ne pas le
 * lire deux fois l'un sur l'autre. À étaler sur la copie (`{...placeholderCopy}`).
 */
export const placeholderCopy: object =
  Platform.OS === 'web' ? { dataSet: { placeholder: 'copy' } } : {}

/**
 * À étaler sur un élément touchable rangé dans un cadre qui rogne (`{...insetFocus}`) : sur le web,
 * il ajoute l'attribut data-focus="inset" (react-native-web transforme `dataSet` en attributs data-).
 * dataSet n'existe pas dans les types de React Native, d'où cet objet préparé une fois ici.
 */
export const insetFocus: object = Platform.OS === 'web' ? { dataSet: { focus: 'inset' } } : {}
