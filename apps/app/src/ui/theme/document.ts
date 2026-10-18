// Ce que l'appli règle au niveau de la page web entière, hors des composants : la feuille de style
// écrite dans le squelette HTML (app/+html.tsx) et les réglages que le thème y ajoute ensuite.
// Elle vit ici, avec le thème, parce qu'elle lit les jetons de @ruche/brand (seuls les composants
// et le thème les lisent, pas les pages).
import { borders, palettes } from '@ruche/brand'
import { Platform } from 'react-native'

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
 * - L'anneau de focus : le même contour miel pour tous les éléments touchables, allumé seulement au
 *   clavier (:focus-visible), dans la couleur du thème choisi (--focus-ring, posée par le thème).
 *   Les éléments rangés dans un cadre qui rogne ce qui dépasse (lignes d'une liste, vignettes)
 *   dessinent l'anneau à l'intérieur (data-focus="inset", voir insetFocus) : un cadre posé
 *   par-dessus leur contenu (::after), sinon une photo le recouvrirait. Les champs de saisie
 *   montrent leur focus par leur cadre : pas d'anneau en plus.
 */
export const documentCss = `
html, body { background-color: ${palettes.day.background}; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: ${palettes.night.background}; }
  html:not([data-hydrated]) body > * { visibility: hidden; animation: reveal 0s 3s forwards; }
}
@keyframes reveal { to { visibility: visible; } }
:focus-visible {
  outline: ${borders.focus}px solid var(--focus-ring, ${palettes.day.focusRing});
  outline-offset: ${borders.focus}px;
}
[data-focus="inset"]:focus-visible { outline: none; }
[data-focus="inset"]:focus-visible::after {
  content: '';
  position: absolute;
  inset: ${borders.focus}px;
  border: ${borders.focus}px solid var(--focus-ring, ${palettes.day.focusRing});
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
}
:focus:not(:focus-visible), input:focus-visible, textarea:focus-visible { outline: none; }
`

/**
 * À étaler sur un élément touchable rangé dans un cadre qui rogne (`{...insetFocus}`) : sur le web,
 * il ajoute l'attribut data-focus="inset" (react-native-web transforme `dataSet` en attributs data-).
 * dataSet n'existe pas dans les types de React Native, d'où cet objet préparé une fois ici.
 */
export const insetFocus: object = Platform.OS === 'web' ? { dataSet: { focus: 'inset' } } : {}
